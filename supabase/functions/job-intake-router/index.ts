import { createClient } from "@supabase/supabase-js";

type Incoming = {
  channel?: string;
  external_user_id?: string;
  external_message_id?: string;
  message?: string;
  media?: { id: string; type: string; mime_type?: string; filename?: string };
};

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

const photoUi = {
  type: "buttons",
  body: "Add a photo? It can help handymen assess the job.",
  buttons: [{ id: "JI_SKIP_PHOTO", title: "Skip" }],
};

async function updateSession(supabase: any, id: string, values: Record<string, unknown>) {
  const result = await supabase.from("conversation_sessions").update(values).eq("id", id);
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
  if (!metadataResponse.ok) throw new Error(`media_metadata_${metadataResponse.status}`);

  const metadata = await metadataResponse.json();
  const fileResponse = await fetch(metadata.url, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!fileResponse.ok) throw new Error(`media_download_${fileResponse.status}`);

  const buffer = await fileResponse.arrayBuffer();
  const mime = (
    fileResponse.headers.get("content-type") ||
    media.mime_type ||
    "application/octet-stream"
  ).split(";")[0];

  if (buffer.byteLength > 10 * 1024 * 1024) throw new Error("job_media_too_large");
  if (!["image/jpeg", "image/png", "image/webp", "application/pdf"].includes(mime)) {
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
  const path = `${jobId}/${crypto.randomUUID()}-${safe(
    media.filename || `job-photo.${extension}`,
  )}`;

  const upload = await supabase.storage.from("job-media").upload(path, file.buffer, {
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
    const window = String(job.appointment_window || "any_time").replaceAll("_", " ");
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
    .insert(rows.map((candidate: any) => ({
      job_id: job.id,
      handyman_id: candidate.handyman_id,
      match_score: candidate.score,
      status: "offered",
    })))
    .select("id,handyman_id");
  if (inserted.error) throw inserted.error;

  const handymen = await supabase
    .from("handymen")
    .select("id,phone")
    .in("id", (inserted.data ?? []).map((match: any) => match.handyman_id));
  if (handymen.error) throw handymen.error;

  const media = await durableMedia(supabase, job.id);
  return (inserted.data ?? [])
    .map((match: any) => {
      const handyman = (handymen.data ?? []).find((row: any) => row.id === match.handyman_id);
      return {
        to: handyman?.phone,
        reply: [
          `New ${skillName} request`,
          job.description,
          `📍 ${job.suburb}, ${job.city}`,
          `🕒 ${timingLabel(job)}`,
          media ? "📷 Photo attached" : null,
        ].filter(Boolean).join("\n"),
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
  const customer = await supabase.from("customers").select("id").eq("phone", phone).maybeSingle();
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

  const active = job && ["open", "matching", "assigned", "in_progress"].includes(job.status);
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

Deno.serve(async (request) => {
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);

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
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
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
        reply: "What needs fixing? Describe the problem in a sentence. You can also attach a photo.",
      });
    }

    const active = session && String(session.state).startsWith("ji_");
    if (!active && message.startsWith("JI_")) {
      return json(await staleAction(supabase, phone));
    }
    if (!active) return json({ handled: false });

    let context: any = session.context ?? {};

    if (session.state === "ji_description") {
      if (input.media?.id && message === "H_MEDIA_UPLOAD") {
        await updateSession(supabase, session.id, {
          context: { ...context, photo: input.media },
        });
        return json({ handled: true, reply: "Photo received. Now tell me what needs fixing." });
      }
      if (message.length < 3 || message === "H_MEDIA_UPLOAD") {
        return json({ handled: true, reply: "Please describe the problem in a few words." });
      }
      context = {
        description: message,
        ...(input.media?.id ? { photo: input.media } : {}),
      };
      await updateSession(supabase, session.id, {
        state: "ji_location",
        context,
      });
      return json({
        handled: true,
        reply: "Which area is the job in? Send suburb and city. Example: Langa, Cape Town",
      });
    }

    if (session.state === "ji_urgency") {
      const timing: Record<string, { urgency: string; appointment_window: string | null }> = {
        JI_URGENT: { urgency: "urgent", appointment_window: "any_time" },
        JI_TODAY: { urgency: "today", appointment_window: null },
        JI_FLEXIBLE: { urgency: "flexible", appointment_window: "any_time" },
      };
      const selected = timing[message];
      if (!selected) return json({ handled: true, reply: urgencyUi.body, ui: urgencyUi });

      context = { ...context, urgency: selected.urgency };
      if (message === "JI_TODAY") {
        await updateSession(supabase, session.id, { state: "ji_time", context });
        return json({ handled: true, reply: timeUi.body, ui: timeUi });
      }

      context = { ...context, appointment_window: selected.appointment_window };
      await updateSession(supabase, session.id, { state: "ji_photo", context });
      return json({ handled: true, reply: photoUi.body, ui: photoUi });
    }

    if (session.state === "ji_time") {
      const windows: Record<string, string> = {
        JI_TIME_MORNING: "morning",
        JI_TIME_AFTERNOON: "afternoon",
        JI_TIME_EVENING: "evening",
        JI_TIME_ANY: "any_time",
      };
      if (!windows[message]) return json({ handled: true, reply: timeUi.body, ui: timeUi });

      context = { ...context, appointment_window: windows[message] };
      await updateSession(supabase, session.id, { state: "ji_photo", context });
      return json({ handled: true, reply: photoUi.body, ui: photoUi });
    }

    if (session.state === "ji_photo") {
      if (input.media?.id) context = { ...context, photo: input.media };
      else if (message !== "JI_SKIP_PHOTO") {
        return json({ handled: true, reply: "Send one photo, or tap Skip.", ui: photoUi });
      }

      const skill = await supabase.rpc("infer_skill_for_job", {
        p_description: context.description,
      });
      if (skill.error) throw skill.error;

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
          skill_id: skill.data?.skill_id,
          description: context.description,
          suburb: context.suburb,
          city: context.city,
          province: context.province,
          urgency: context.urgency,
          appointment_window: context.appointment_window,
          materials_status: null,
          status: "matching",
          match_attempt_count: 1,
          last_match_attempt_at: new Date().toISOString(),
        })
        .select("id,description,suburb,city,urgency,appointment_window")
        .single();
      if (job.error) throw job.error;

      if (context.photo) {
        try {
          await archiveMedia(supabase, job.data.id, customer.data.id, context.photo);
        } catch (error) {
          console.error("job media archive failed", error);
          await supabase.from("jobs").delete().eq("id", job.data.id);
          return json({
            handled: true,
            reply: "I could not save that file securely. Send a JPG, PNG, WebP or PDF under 10 MB, or tap Skip.",
            ui: photoUi,
          });
        }
      }

      const outbound = await offer(
        supabase,
        job.data,
        skill.data?.skill_name ?? "handyman",
      );
      await updateSession(supabase, session.id, {
        flow: "ready",
        state: "ready",
        context: {},
      });

      return json({
        handled: true,
        job_id: job.data.id,
        reply: outbound.length
          ? `Request sent ✅\n${job.data.description}\n📍 ${job.data.suburb}, ${job.data.city}\n\nWe’re contacting ${outbound.length} suitable handyman${outbound.length === 1 ? "" : "s"}. We’ll message you when one accepts.`
          : `Request received ✅\n${job.data.description}\n📍 ${job.data.suburb}, ${job.data.city}\n\nNo suitable handyman is available yet. We’ll keep looking and message you when that changes.`,
        ui: {
          type: "buttons",
          body: "Track or manage this request",
          buttons: [
            { id: `CJOB:${job.data.id}`, title: "View request" },
            { id: "MY_JOBS", title: "My jobs" },
            { id: "HOME", title: "Home" },
          ],
        },
        outbound,
      });
    }

    return json({ handled: false });
  } catch (error) {
    console.error(error);
    return json({ error: "job_intake_failed" }, 500);
  }
});
