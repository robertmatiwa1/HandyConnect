import { createClient } from "@supabase/supabase-js";
import {
  classifyService,
  serviceConfirmationReply,
  unclearServiceReply,
  unsupportedServiceReply,
} from "../_shared/service-scope.ts";
import { serviceRequestLabel } from "../_shared/job-label.ts";

type Incoming = {
  channel?: string;
  external_user_id?: string;
  external_message_id?: string;
  message_type?: string;
  message_timestamp?: number;
  message?: string;
  media?: { id: string; type: string; mime_type?: string; filename?: string };
};

const TERMS_VERSION = "2026-08-11";
const TERMS_URL = "https://robertmatiwa1.github.io/HandyConnect/terms/";
const PRIVACY_URL = "https://robertmatiwa1.github.io/HandyConnect/privacy/";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });

function key() {
  const raw = Deno.env.get("SUPABASE_SECRET_KEYS") ?? "";
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (typeof parsed.default === "string") return parsed.default;
    } catch {
      // Fall back to the legacy service-role key below.
    }
  }
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
}

function safe(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-90) || "job-media";
}

function hex(buffer: ArrayBuffer) {
  return [...new Uint8Array(buffer)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

const urgencyUi = {
  type: "buttons",
  body: "When do you need help?",
  buttons: [
    { id: "JI_URGENT", title: "As soon as possible" },
    { id: "JI_TODAY", title: "Today" },
    { id: "JI_FLEXIBLE", title: "I'm flexible" },
  ],
};

const timeUi = {
  type: "list",
  body: "What time today works best?",
  button: "Choose time",
  rows: [
    { id: "JI_TIME_MORNING", title: "Morning" },
    { id: "JI_TIME_AFTERNOON", title: "Afternoon" },
    { id: "JI_TIME_EVENING", title: "Evening" },
    { id: "JI_TIME_ANY", title: "Any time" },
  ],
};

function postPhotoUi(jobId: string) {
  return {
    type: "buttons",
    body: "Send one clear photo of the problem, or choose Not now.",
    buttons: [{ id: `JI_CANCEL_PHOTO:${jobId}`, title: "Not now" }],
  };
}

const draftPhotoUi = {
  type: "buttons",
  body:
    "Would you like to add a photo? A clear photo helps the handyman prepare.",
  buttons: [
    { id: "JI_ADD_DRAFT_PHOTO", title: "Add photo" },
    { id: "JI_SKIP_PHOTO", title: "Not now" },
  ],
};

function reviewText(context: any) {
  return [
    "Review your request",
    context.description,
    `📍 ${context.suburb}, ${context.city}`,
    `🕒 ${timingLabel(context)}`,
    context.photo ? "📷 Photo selected" : "📷 No photo",
    "",
    "Ready to send this request to verified handymen?",
  ].join("\n");
}

function reviewUi(context: any) {
  const body = reviewText(context);
  return {
    type: "buttons",
    body,
    buttons: [
      { id: "JI_SUBMIT", title: "Submit request" },
      { id: "JI_EDIT", title: "Edit" },
      { id: "JI_CANCEL", title: "Cancel" },
    ],
  };
}

const editUi = {
  type: "list",
  body: "What would you like to change?",
  button: "Choose field",
  rows: [
    { id: "JI_EDIT_DESCRIPTION", title: "Problem" },
    { id: "JI_EDIT_LOCATION", title: "Location" },
    { id: "JI_EDIT_TIMING", title: "Timing" },
    { id: "JI_EDIT_PHOTO", title: "Photo" },
    { id: "JI_BACK_REVIEW", title: "Back to review" },
  ],
};

async function updateSession(
  supabase: any,
  id: string,
  values: Record<string, unknown>,
) {
  const result = await supabase
    .from("conversation_sessions")
    .update(values)
    .eq("id", id);
  if (result.error) throw result.error;
}

async function fetchMedia(media: NonNullable<Incoming["media"]>) {
  const token = Deno.env.get("WHATSAPP_ACCESS_TOKEN") ?? "";
  const version = Deno.env.get("WHATSAPP_GRAPH_VERSION") ?? "v26.0";
  if (!token) throw new Error("whatsapp_media_unavailable");

  const metadataResponse = await fetch(
    `https://graph.facebook.com/${version}/${media.id}`,
    { headers: { authorization: `Bearer ${token}` } },
  );
  if (!metadataResponse.ok) {
    throw new Error(`media_metadata_${metadataResponse.status}`);
  }

  const metadata = await metadataResponse.json();
  const fileResponse = await fetch(metadata.url, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!fileResponse.ok) {
    throw new Error(`media_download_${fileResponse.status}`);
  }

  const buffer = await fileResponse.arrayBuffer();
  const mime = (
    fileResponse.headers.get("content-type") ||
    media.mime_type ||
    "application/octet-stream"
  ).split(";")[0];

  if (buffer.byteLength > 10 * 1024 * 1024) {
    throw new Error("job_media_too_large");
  }
  if (
    !["image/jpeg", "image/png", "image/webp", "application/pdf"].includes(mime)
  ) {
    throw new Error("unsupported_job_media");
  }
  return { buffer, mime };
}

async function archiveMedia(
  supabase: any,
  jobId: string,
  customerId: string,
  media: NonNullable<Incoming["media"]>,
) {
  const file = await fetchMedia(media);
  const hash = hex(await crypto.subtle.digest("SHA-256", file.buffer));
  const extension = file.mime === "application/pdf"
    ? "pdf"
    : file.mime === "image/png"
    ? "png"
    : file.mime === "image/webp"
    ? "webp"
    : "jpg";
  const path = `${jobId}/${crypto.randomUUID()}-${
    safe(
      media.filename || `job-photo.${extension}`,
    )
  }`;

  const upload = await supabase.storage
    .from("job-media")
    .upload(path, file.buffer, {
      contentType: file.mime,
      upsert: false,
    });
  if (upload.error) throw upload.error;

  const insert = await supabase.from("job_attachments").insert({
    job_id: jobId,
    customer_id: customerId,
    media_id: media.id,
    media_type: media.type,
    mime_type: file.mime,
    file_name: media.filename ?? null,
    storage_path: path,
    sha256: hash,
    byte_size: file.buffer.byteLength,
    archived_at: new Date().toISOString(),
  });
  if (insert.error) {
    await supabase.storage.from("job-media").remove([path]);
    throw insert.error;
  }
}

async function durableMedia(supabase: any, jobId: string) {
  const attachment = await supabase
    .from("job_attachments")
    .select("storage_path,media_type,mime_type,file_name")
    .eq("job_id", jobId)
    .not("storage_path", "is", null)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!attachment.data?.storage_path) return undefined;
  const signed = await supabase.storage
    .from("job-media")
    .createSignedUrl(attachment.data.storage_path, 600);
  if (signed.error || !signed.data?.signedUrl) return undefined;

  return {
    link: signed.data.signedUrl,
    type: attachment.data.media_type || "image",
    mime_type: attachment.data.mime_type,
    file_name: attachment.data.file_name,
  };
}

function timingLabel(job: any) {
  if (job.urgency === "urgent") return "As soon as possible";
  if (job.urgency === "today") {
    const window = String(job.appointment_window || "any_time").replaceAll(
      "_",
      " ",
    );
    return `Today · ${window}`;
  }
  return "Flexible";
}

async function offer(supabase: any, job: any, skillName: string) {
  const candidates = await supabase.rpc("find_job_candidates", {
    p_job_id: job.id,
    p_limit: 5,
  });
  if (candidates.error) throw candidates.error;
  const rows = candidates.data ?? [];
  if (!rows.length) return [];

  const inserted = await supabase
    .from("job_matches")
    .insert(
      rows.map((candidate: any) => ({
        job_id: job.id,
        handyman_id: candidate.handyman_id,
        match_score: candidate.score,
        status: "offered",
      })),
    )
    .select("id,handyman_id");
  if (inserted.error) throw inserted.error;

  const handymen = await supabase
    .from("handymen")
    .select("id,phone")
    .in(
      "id",
      (inserted.data ?? []).map((match: any) => match.handyman_id),
    );
  if (handymen.error) throw handymen.error;

  const media = await durableMedia(supabase, job.id);
  return (inserted.data ?? [])
    .map((match: any) => {
      const handyman = (handymen.data ?? []).find(
        (row: any) => row.id === match.handyman_id,
      );
      return {
        to: handyman?.phone,
        reply: [
          `New ${skillName} request`,
          job.description,
          `📍 ${job.suburb}, ${job.city}`,
          `🕒 ${timingLabel(job)}`,
          media ? "📷 Photo attached" : null,
        ]
          .filter(Boolean)
          .join("\n"),
        media,
        ui: {
          type: "buttons",
          body: "Are you available?",
          buttons: [
            { id: `ACCEPT:${match.id}`, title: "Accept" },
            { id: `DECLINE:${match.id}`, title: "Decline" },
            { id: "MY_JOBS", title: "My jobs" },
          ],
        },
      };
    })
    .filter((item: any) => item.to);
}

async function staleAction(supabase: any, phone: string) {
  const customer = await supabase
    .from("customers")
    .select("id")
    .eq("phone", phone)
    .maybeSingle();
  if (customer.error) throw customer.error;

  let job: any = null;
  if (customer.data?.id) {
    const latest = await supabase
      .from("jobs")
      .select("id,description,status,suburb,city")
      .eq("customer_id", customer.data.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (latest.error) throw latest.error;
    job = latest.data;
  }

  const active = job &&
    ["open", "matching", "assigned", "in_progress"].includes(job.status);
  return {
    handled: true,
    reply: active
      ? `That button is from an earlier step. Your request “${job.description}” is still active.`
      : "That button has expired. Start a new request when you need another handyman.",
    ui: {
      type: "buttons",
      body: active ? "View your current request" : "What would you like to do?",
      buttons: active
        ? [
          { id: `CJOB:${job.id}`, title: "View request" },
          { id: "MY_JOBS", title: "My jobs" },
          { id: "HOME", title: "Home" },
        ]
        : [
          { id: "REQUEST_HELP", title: "New request" },
          { id: "MY_JOBS", title: "My jobs" },
          { id: "HOME", title: "Home" },
        ],
    },
  };
}

async function finishRequest(
  supabase: any,
  session: any,
  phone: string,
  context: any,
) {
  // Publication is a separate trust boundary. Never rely only on an earlier
  // conversation step or on generic keyword inference.
  const classification = classifyService(String(context.description ?? ""));
  if (
    classification.scope !== "supported" ||
    context.service_confirmed !== true ||
    context.service_name !== classification.candidate.name
  ) {
    await updateSession(supabase, session.id, {
      state: "ji_description",
      context: {},
    });
    return {
      handled: true,
      reply:
        "I couldn’t verify this as a supported home service, so nothing was sent. Please describe the household item and problem again.",
    };
  }

  const skill = await supabase.from("skills")
    .select("id,name")
    .eq("name", classification.candidate.name)
    .eq("active", true)
    .maybeSingle();
  if (skill.error) throw skill.error;
  if (!skill.data?.id) {
    return {
      handled: true,
      reply:
        "That service is not currently available, so nothing was sent. Please choose another supported service.",
    };
  }

  const customer = await supabase
    .from("customers")
    .upsert({ phone }, { onConflict: "phone" })
    .select("id")
    .single();
  if (customer.error) throw customer.error;

  const job = await supabase
    .from("jobs")
    .insert({
      customer_id: customer.data.id,
      skill_id: skill.data.id,
      confirmed_skill_id: skill.data.id,
      service_confirmed_at: new Date().toISOString(),
      description: context.description,
      suburb: context.suburb,
      city: context.city,
      province: context.province,
      urgency: context.urgency,
      appointment_window: context.appointment_window,
      materials_status: null,
      street_address: null,
      status: "matching",
      match_attempt_count: 1,
      last_match_attempt_at: new Date().toISOString(),
    })
    .select("id,description,suburb,city,urgency,appointment_window")
    .single();
  if (job.error) throw job.error;

  let photoSaved = true;
  if (context.photo) {
    try {
      await archiveMedia(
        supabase,
        job.data.id,
        customer.data.id,
        context.photo,
      );
    } catch (error) {
      console.error("job media archive failed", error);
      photoSaved = false;
    }
  }

  const outbound = await offer(
    supabase,
    job.data,
    skill.data.name,
  );
  await updateSession(supabase, session.id, {
    flow: "ready",
    state: "ready",
    context: {},
  });

  const progress = outbound.length
    ? `I’ve contacted ${outbound.length} suitable, verified ${
      outbound.length === 1 ? "handyman" : "handymen"
    }.`
    : "Your request is live. We’ll notify you when a verified handyman accepts.";
  const summary = [
    "Request live ✅",
    job.data.description,
    `📍 ${job.data.suburb}, ${job.data.city}`,
    `🕒 ${timingLabel(job.data)}`,
    "",
    progress,
    "You don’t need to keep checking—I’ll message you as soon as someone accepts.",
    !photoSaved
      ? "The photo didn’t upload, but your request is active. You can add it again below."
      : null,
  ]
    .filter((line) => line !== null)
    .join("\n");

  return {
    handled: true,
    job_id: job.data.id,
    reply: summary,
    ui: {
      type: "buttons",
      body: summary,
      buttons: [
        { id: `CJOB:${job.data.id}`, title: "View request" },
        { id: "MY_JOBS", title: "My jobs" },
        { id: "HOME", title: "Home" },
      ],
    },
    outbound,
  };
}

function consentPrompt() {
  const body = [
    "Before we send your request",
    "HandyConnect connects you with independent service providers. Agree the work, price and timing before work starts. We use your contact and job details only as explained in our Privacy Notice.",
    "",
    `Terms: ${TERMS_URL}`,
    `Privacy: ${PRIVACY_URL}`,
  ].join("\n");
  return {
    handled: true,
    reply: body,
    ui: {
      type: "buttons",
      body,
      buttons: [
        { id: "JI_ACCEPT_TERMS", title: "Accept & submit" },
        { id: "JI_TERMS_NOT_NOW", title: "Not now" },
      ],
    },
  };
}

async function customerReadiness(supabase: any, phone: string) {
  const result = await supabase.from("customers").select(
    "id,full_name,preferred_name,registration_status,terms_accepted_at,terms_version",
  ).eq("phone", phone).maybeSingle();
  if (result.error) throw result.error;
  return result.data;
}

Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405);
  }

  const secret = key();
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  if (!secret || !url || request.headers.get("apikey") !== secret) {
    return json({ error: "unauthorized" }, 401);
  }

  let input: Incoming;
  try {
    input = await request.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const phone = input.external_user_id?.trim();
  const message = input.message?.trim() ?? "";
  if (!phone) return json({ handled: false });

  const supabase = createClient(url, secret, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  try {
    const sessionResult = await supabase
      .from("conversation_sessions")
      .select("id,state,context")
      .eq("channel", input.channel ?? "whatsapp")
      .eq("external_user_id", phone)
      .maybeSingle();
    if (sessionResult.error) throw sessionResult.error;
    let session = sessionResult.data;

    if (message === "REQUEST_HELP") {
      if (!session) {
        const inserted = await supabase
          .from("conversation_sessions")
          .insert({
            channel: input.channel ?? "whatsapp",
            external_user_id: phone,
            flow: "job_intake",
            state: "ji_description",
            context: {},
          })
          .select("id,state,context")
          .single();
        if (inserted.error) throw inserted.error;
        session = inserted.data;
      } else {
        await updateSession(supabase, session.id, {
          flow: "job_intake",
          state: "ji_description",
          context: {},
        });
      }
      return json({
        handled: true,
        reply: "What needs fixing? Describe the problem in one sentence.",
      });
    }

    if (message.startsWith("ADD_PHOTO:")) {
      const jobId = message.slice(10);
      const customer = await supabase
        .from("customers")
        .select("id")
        .eq("phone", phone)
        .maybeSingle();
      if (customer.error) throw customer.error;
      const job = customer.data?.id
        ? await supabase
          .from("jobs")
          .select("id")
          .eq("id", jobId)
          .eq("customer_id", customer.data.id)
          .in("status", ["open", "matching", "assigned", "in_progress"])
          .maybeSingle()
        : { data: null, error: null };
      if (job.error) throw job.error;
      if (!job.data) return json(await staleAction(supabase, phone));

      if (!session) {
        const inserted = await supabase
          .from("conversation_sessions")
          .insert({
            channel: input.channel ?? "whatsapp",
            external_user_id: phone,
            flow: "job_intake",
            state: "ji_post_photo",
            context: { job_id: jobId },
          })
          .select("id,state,context")
          .single();
        if (inserted.error) throw inserted.error;
        session = inserted.data;
      } else {
        await updateSession(supabase, session.id, {
          flow: "job_intake",
          state: "ji_post_photo",
          context: { job_id: jobId },
        });
        session = {
          ...session,
          state: "ji_post_photo",
          context: { job_id: jobId },
        };
      }
      const ui = postPhotoUi(jobId);
      return json({ handled: true, reply: ui.body, ui });
    }

    const active = session && String(session.state).startsWith("ji_");
    if (!active && message.startsWith("JI_")) {
      return json(await staleAction(supabase, phone));
    }
    if (!active) return json({ handled: false });

    let context: any = session.context ?? {};

    if (message === "JI_CANCEL") {
      await updateSession(supabase, session.id, {
        flow: "ready",
        state: "ready",
        context: {},
      });
      return json({
        handled: true,
        reply: "Request cancelled. Nothing was sent to handymen.",
        ui: {
          type: "buttons",
          body: "What would you like to do?",
          buttons: [
            { id: "REQUEST_HELP", title: "New request" },
            { id: "MY_JOBS", title: "My jobs" },
            { id: "HOME", title: "Home" },
          ],
        },
      });
    }

    if (session.state === "ji_description") {
      if (input.media?.id && message === "H_MEDIA_UPLOAD") {
        return json({
          handled: true,
          reply:
            "First tell me what needs fixing in one sentence. I’ll ask for an optional photo after the service is confirmed.",
        });
      }
      if (message.length < 3 || message === "H_MEDIA_UPLOAD") {
        return json({
          handled: true,
          reply: "Please describe the problem in a few words.",
        });
      }
      const classification = classifyService(message);
      if (classification.scope === "unsupported") {
        return json(unsupportedServiceReply);
      }
      if (classification.scope === "unclear") return json(unclearServiceReply);
      context = {
        description: message,
        ...(context.editing ? { ...context, description: message } : {}),
        service_key: classification.candidate.key,
        service_name: classification.candidate.name,
        service_confirmed: false,
        photo: null,
      };
      await updateSession(supabase, session.id, {
        state: "ji_service_confirm",
        context,
      });
      return json(serviceConfirmationReply(classification.candidate));
    }

    if (session.state === "ji_service_confirm") {
      if (message === "CHANGE_SERVICE") {
        await updateSession(supabase, session.id, {
          state: "ji_description",
          context: {},
        });
        return json({
          handled: true,
          reply:
            "Describe the household item and what is wrong—for example, ‘leaking toilet’ or ‘broken socket’.",
        });
      }
      if (message !== "CONFIRM_SERVICE") {
        return json(
          serviceConfirmationReply({
            key: context.service_key,
            name: context.service_name,
          }),
        );
      }
      context = { ...context, service_confirmed: true };
      if (context.editing === "description") {
        context = { ...context, editing: null };
        await updateSession(supabase, session.id, {
          state: "ji_review",
          context,
        });
        const ui = reviewUi(context);
        return json({ handled: true, reply: ui.body, ui });
      }
      await updateSession(supabase, session.id, {
        state: "ji_location",
        context,
      });
      return json({
        handled: true,
        reply:
          "Which area is the job in? Send suburb and city. Example: Langa, Cape Town",
      });
    }

    if (session.state === "ji_urgency") {
      const timing: Record<
        string,
        { urgency: string; appointment_window: string | null }
      > = {
        JI_URGENT: { urgency: "urgent", appointment_window: "any_time" },
        JI_TODAY: { urgency: "today", appointment_window: null },
        JI_FLEXIBLE: { urgency: "flexible", appointment_window: "any_time" },
      };
      const selected = timing[message];
      if (!selected) {
        return json({ handled: true, reply: urgencyUi.body, ui: urgencyUi });
      }

      context = { ...context, urgency: selected.urgency };
      if (message === "JI_TODAY") {
        await updateSession(supabase, session.id, {
          state: "ji_time",
          context,
        });
        return json({ handled: true, reply: timeUi.body, ui: timeUi });
      }

      context = { ...context, appointment_window: selected.appointment_window };
      if (context.editing) {
        context = { ...context, editing: null };
        await updateSession(supabase, session.id, {
          state: "ji_review",
          context,
        });
        const ui = reviewUi(context);
        return json({ handled: true, reply: ui.body, ui });
      }
      await updateSession(supabase, session.id, {
        state: "ji_photo_choice",
        context,
      });
      return json({
        handled: true,
        reply: draftPhotoUi.body,
        ui: draftPhotoUi,
      });
    }

    if (session.state === "ji_time") {
      const windows: Record<string, string> = {
        JI_TIME_MORNING: "morning",
        JI_TIME_AFTERNOON: "afternoon",
        JI_TIME_EVENING: "evening",
        JI_TIME_ANY: "any_time",
      };
      if (!windows[message]) {
        return json({ handled: true, reply: timeUi.body, ui: timeUi });
      }

      context = { ...context, appointment_window: windows[message] };
      if (context.editing) {
        context = { ...context, editing: null };
        await updateSession(supabase, session.id, {
          state: "ji_review",
          context,
        });
        const ui = reviewUi(context);
        return json({ handled: true, reply: ui.body, ui });
      }
      await updateSession(supabase, session.id, {
        state: "ji_photo_choice",
        context,
      });
      return json({
        handled: true,
        reply: draftPhotoUi.body,
        ui: draftPhotoUi,
      });
    }

    if (session.state === "ji_photo_choice") {
      if (message === "JI_SKIP_PHOTO") {
        context = { ...context, photo: null };
        await updateSession(supabase, session.id, {
          state: "ji_review",
          context,
        });
        const ui = reviewUi(context);
        return json({ handled: true, reply: ui.body, ui });
      }
      if (message === "JI_ADD_DRAFT_PHOTO") {
        context = {
          ...context,
          awaiting_photo_after_message_id: input.external_message_id ?? null,
          awaiting_photo_after_timestamp: Number(input.message_timestamp || 0),
        };
        await updateSession(supabase, session.id, {
          state: "ji_photo",
          context,
        });
        const prompt =
          "Send one clear JPG, PNG or WebP photo, or choose Not now.";
        return json({
          handled: true,
          reply: prompt,
          ui: {
            type: "buttons",
            body: prompt,
            buttons: [{ id: "JI_SKIP_PHOTO", title: "Not now" }],
          },
        });
      }
      return json({
        handled: true,
        reply: draftPhotoUi.body,
        ui: draftPhotoUi,
      });
    }

    if (session.state === "ji_review") {
      if (message === "JI_SUBMIT") {
        const customer = await customerReadiness(supabase, phone);
        if (
          customer?.registration_status === "active" && customer.full_name &&
          customer.terms_accepted_at && customer.terms_version === TERMS_VERSION
        ) {
          return json(await finishRequest(supabase, session, phone, context));
        }
        await updateSession(supabase, session.id, {
          state: "ji_consent",
          context,
        });
        return json(consentPrompt());
      }
      if (message === "JI_EDIT") {
        await updateSession(supabase, session.id, { state: "ji_edit" });
        return json({ handled: true, reply: editUi.body, ui: editUi });
      }
      const ui = reviewUi(context);
      return json({ handled: true, reply: ui.body, ui });
    }

    if (session.state === "ji_consent") {
      if (message === "JI_TERMS_NOT_NOW") {
        await updateSession(supabase, session.id, { state: "ji_review", context });
        return json({
          handled: true,
          reply: "Nothing was submitted. Your draft is still here when you’re ready.",
          ui: reviewUi(context),
        });
      }
      if (message !== "JI_ACCEPT_TERMS") return json(consentPrompt());

      const now = new Date().toISOString();
      const existing = await customerReadiness(supabase, phone);
      const saved = await supabase.from("customers").upsert({
        phone,
        registration_status: existing?.full_name ? "active" : "onboarding",
        terms_accepted_at: now,
        terms_version: TERMS_VERSION,
        updated_at: now,
      }, { onConflict: "phone" }).select("id,full_name").single();
      if (saved.error) throw saved.error;

      if (!saved.data.full_name) {
        await updateSession(supabase, session.id, {
          state: "ji_customer_name",
          context,
        });
        return json({ handled: true, reply: "What name should I use for this request?" });
      }
      return json(await finishRequest(supabase, session, phone, context));
    }

    if (session.state === "ji_customer_name") {
      const name = message.replace(/\s+/g, " ").trim();
      if (name.length < 2 || name.length > 80 || message.startsWith("JI_")) {
        return json({ handled: true, reply: "Please enter your name (2–80 characters)." });
      }
      const now = new Date().toISOString();
      const updated = await supabase.from("customers").update({
        full_name: name,
        preferred_name: name.split(" ")[0],
        registration_status: "active",
        onboarding_completed_at: now,
        updated_at: now,
      }).eq("phone", phone).eq("terms_version", TERMS_VERSION)
        .not("terms_accepted_at", "is", null);
      if (updated.error) throw updated.error;
      return json(await finishRequest(supabase, session, phone, context));
    }

    if (session.state === "ji_edit") {
      if (message === "JI_BACK_REVIEW") {
        await updateSession(supabase, session.id, { state: "ji_review" });
        const ui = reviewUi(context);
        return json({ handled: true, reply: ui.body, ui });
      }
      if (message === "JI_EDIT_DESCRIPTION") {
        context = { ...context, editing: "description" };
        await updateSession(supabase, session.id, {
          state: "ji_description",
          context,
        });
        return json({ handled: true, reply: "Tell me the corrected problem." });
      }
      if (message === "JI_EDIT_LOCATION") {
        context = { ...context, editing: "location" };
        await updateSession(supabase, session.id, {
          state: "ji_location",
          context,
        });
        return json({
          handled: true,
          reply:
            "Send the corrected suburb and city. Example: Langa, Cape Town",
        });
      }
      if (message === "JI_EDIT_TIMING") {
        context = { ...context, editing: "timing" };
        await updateSession(supabase, session.id, {
          state: "ji_urgency",
          context,
        });
        return json({ handled: true, reply: urgencyUi.body, ui: urgencyUi });
      }
      if (message === "JI_EDIT_PHOTO") {
        await updateSession(supabase, session.id, {
          state: "ji_photo_choice",
          context,
        });
        return json({
          handled: true,
          reply: draftPhotoUi.body,
          ui: draftPhotoUi,
        });
      }
      return json({ handled: true, reply: editUi.body, ui: editUi });
    }

    if (session.state === "ji_post_photo") {
      const jobId = String(context.job_id ?? "");
      if (message === `JI_CANCEL_PHOTO:${jobId}`) {
        await updateSession(supabase, session.id, {
          flow: "ready",
          state: "ready",
          context: {},
        });
        return json({
          handled: true,
          reply: "No problem. Your request is still active.",
          ui: {
            type: "buttons",
            body: "What next?",
            buttons: [
              { id: `CJOB:${jobId}`, title: "View request" },
              { id: "MY_JOBS", title: "My jobs" },
            ],
          },
        });
      }
      if (!input.media?.id) {
        const ui = postPhotoUi(jobId);
        return json({ handled: true, reply: ui.body, ui });
      }

      const customer = await supabase
        .from("customers")
        .select("id")
        .eq("phone", phone)
        .single();
      if (customer.error) throw customer.error;
      const job = await supabase
        .from("jobs")
        .select("id")
        .eq("id", jobId)
        .eq("customer_id", customer.data.id)
        .maybeSingle();
      if (job.error) throw job.error;
      if (!job.data) return json(await staleAction(supabase, phone));

      try {
        await archiveMedia(supabase, jobId, customer.data.id, input.media);
      } catch (error) {
        console.error("job media archive failed", error);
        const ui = postPhotoUi(jobId);
        return json({
          handled: true,
          reply:
            "I couldn’t save that photo. Send a JPG, PNG or WebP under 10 MB, or choose Not now.",
          ui,
        });
      }

      await updateSession(supabase, session.id, {
        flow: "ready",
        state: "ready",
        context: {},
      });
      return json({
        handled: true,
        reply:
          "Photo added ✅ It will be included when the job is offered to handymen.",
        ui: {
          type: "buttons",
          body: "Your request is still active.",
          buttons: [
            { id: `CJOB:${jobId}`, title: "View request" },
            { id: "MY_JOBS", title: "My jobs" },
          ],
        },
      });
    }

    if (session.state === "ji_photo") {
      if (message === "JI_SKIP_PHOTO") {
        context = { ...context, photo: null };
      } else if (
        input.message_type === "image" &&
        input.media?.id &&
        input.media.type === "image" &&
        input.external_message_id !== context.awaiting_photo_after_message_id &&
        Number(input.message_timestamp || 0) >
          Number(context.awaiting_photo_after_timestamp || 0)
      ) {
        try {
          await fetchMedia(input.media);
        } catch (error) {
          console.error("draft job media validation failed", error);
          return json({
            handled: true,
            reply:
              "I couldn’t read that photo. Send a new JPG, PNG or WebP under 10 MB, or choose Not now.",
          });
        }
        context = {
          ...context,
          pending_photo: input.media,
          pending_photo_message_id: input.external_message_id,
        };
        await updateSession(supabase, session.id, {
          state: "ji_photo_confirm",
          context,
        });
        const serviceName = serviceRequestLabel(context);
        return json({
          handled: true,
          reply: "Here is the photo I received.",
          media: {
            id: input.media.id,
            type: "image",
            caption: `Preview for your ${serviceName} request`,
          },
          ui: {
            type: "buttons",
            body: `Use this photo for your ${serviceName} request?`,
            buttons: [
              { id: "JI_USE_PHOTO", title: "Use this photo" },
              { id: "JI_RETAKE_PHOTO", title: "Send another" },
              { id: "JI_SKIP_PHOTO", title: "Without photo" },
            ],
          },
        });
      } else {
        return json({
          handled: true,
          reply: "Please send one JPG, PNG or WebP photo, or choose Not now.",
        });
      }
      context = {
        ...context,
        awaiting_photo_after_message_id: null,
        awaiting_photo_after_timestamp: null,
      };
      await updateSession(supabase, session.id, {
        state: "ji_review",
        context,
      });
      const ui = reviewUi(context);
      return json({ handled: true, reply: ui.body, ui });
    }

    if (session.state === "ji_photo_confirm") {
      if (message === "JI_USE_PHOTO" && context.pending_photo?.id) {
        context = {
          ...context,
          photo: context.pending_photo,
          pending_photo: null,
          pending_photo_message_id: null,
          awaiting_photo_after_message_id: null,
          awaiting_photo_after_timestamp: null,
        };
        await updateSession(supabase, session.id, {
          state: "ji_review",
          context,
        });
        const ui = reviewUi(context);
        return json({ handled: true, reply: ui.body, ui });
      }
      if (message === "JI_RETAKE_PHOTO") {
        context = {
          ...context,
          pending_photo: null,
          pending_photo_message_id: null,
        };
        await updateSession(supabase, session.id, {
          state: "ji_photo",
          context,
        });
        return json({
          handled: true,
          reply: "Send a new JPG, PNG or WebP photo, or choose Not now.",
        });
      }
      if (message === "JI_SKIP_PHOTO") {
        context = {
          ...context,
          photo: null,
          pending_photo: null,
          pending_photo_message_id: null,
          awaiting_photo_after_message_id: null,
          awaiting_photo_after_timestamp: null,
        };
        await updateSession(supabase, session.id, {
          state: "ji_review",
          context,
        });
        const ui = reviewUi(context);
        return json({ handled: true, reply: ui.body, ui });
      }
      return json({
        handled: true,
        reply:
          "Choose Use this photo, Send another, or Continue without photo.",
      });
    }

    return json({ handled: false });
  } catch (error) {
    console.error(error);
    return json({ error: "job_intake_failed" }, 500);
  }
});
