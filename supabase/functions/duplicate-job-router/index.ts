import { createClient } from "@supabase/supabase-js";
import {
  classifyService,
  serviceConfirmationReply,
  unclearServiceReply,
  unsupportedServiceReply,
} from "../_shared/service-scope.ts";

type Incoming = {
  channel?: string;
  external_user_id?: string;
  message?: string;
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
    } catch { /* legacy fallback */ }
  }
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
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
  const handyman = await supabase.from("handymen").select("id").eq(
    "phone",
    phone,
  ).maybeSingle();
  if (handyman.data) return json({ handled: false });

  let session = await supabase.from("conversation_sessions")
    .select("id,state,context")
    .eq("channel", input.channel ?? "whatsapp")
    .eq("external_user_id", phone)
    .maybeSingle();

  if (message === "REQUEST_HELP") {
    if (session.data?.id) {
      await supabase.from("conversation_sessions").update({
        flow: "job_intake",
        state: "duplicate_description",
        context: {},
      }).eq("id", session.data.id);
    } else {
      const inserted = await supabase.from("conversation_sessions").insert({
        channel: input.channel ?? "whatsapp",
        external_user_id: phone,
        flow: "job_intake",
        state: "duplicate_description",
        context: {},
      }).select("id").single();
      session = { data: inserted.data } as typeof session;
    }
    return json({
      handled: true,
      reply: "Tell me what needs fixing. A short description is enough.",
    });
  }

  if (session.data?.state === "duplicate_description") {
    if (message.length < 3) {
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

    await supabase.from("conversation_sessions").update({
      state: "duplicate_service_confirm",
      context: {
        description: message,
        service_key: classification.candidate.key,
        service_name: classification.candidate.name,
        service_confirmed: false,
      },
    }).eq("id", session.data.id);
    return json(serviceConfirmationReply(classification.candidate));
  }

  if (session.data?.state === "duplicate_service_confirm") {
    if (message === "CHANGE_SERVICE") {
      await supabase.from("conversation_sessions").update({
        state: "duplicate_description",
        context: {},
      }).eq("id", session.data.id);
      return json({
        handled: true,
        reply:
          "Describe the household item and what is wrong—for example, ‘leaking toilet’ or ‘broken socket’.",
      });
    }
    if (message !== "CONFIRM_SERVICE") {
      return json(serviceConfirmationReply({
        key: session.data.context?.service_key ?? "",
        name: session.data.context?.service_name ?? "the selected service",
      }));
    }

    const description = String(session.data.context?.description ?? "");
    const serviceName = String(session.data.context?.service_name ?? "");
    if (!description || !serviceName) {
      await supabase.from("conversation_sessions").update({
        state: "duplicate_description",
        context: {},
      }).eq("id", session.data.id);
      return json(unclearServiceReply);
    }

    const customer = await supabase.from("customers").select("id").eq(
      "phone",
      phone,
    ).maybeSingle();
    if (customer.data?.id) {
      const duplicate = await supabase.rpc("find_similar_active_job", {
        p_customer_id: customer.data.id,
        p_description: description,
        p_suburb: null,
        p_city: null,
      });
      const hit = (duplicate.data ?? [])[0];
      if (hit && Number(hit.similarity_score) >= 100) {
        await supabase.from("conversation_sessions").update({
          state: "duplicate_confirm",
          context: {
            description,
            service_key: session.data.context?.service_key,
            service_name: serviceName,
            service_confirmed: true,
            duplicate_job_id: hit.job_id,
            duplicate_description: hit.description,
          },
        }).eq("id", session.data.id);
        return json({
          handled: true,
          reply:
            `You already have an active request for “${hit.description}”. Do you want to use that job or create another request?`,
          ui: {
            type: "buttons",
            body: "Possible duplicate",
            buttons: [
              { id: "DUP_USE_EXISTING", title: "Use existing" },
              { id: "DUP_CREATE_ANYWAY", title: "Create another" },
            ],
          },
        });
      }
    }
    await supabase.from("conversation_sessions").update({
      state: "ji_location",
      context: {
        description,
        service_key: session.data.context?.service_key,
        service_name: serviceName,
        service_confirmed: true,
      },
    }).eq("id", session.data.id);
    return json({
      handled: true,
      reply:
        "Where is the job? Send: Suburb, City, Province. Example: Langa, Cape Town, Western Cape",
    });
  }

  if (session.data?.state === "duplicate_confirm") {
    if (message === "DUP_USE_EXISTING") {
      await supabase.from("conversation_sessions").update({
        state: "ready",
        flow: "ready",
        context: {},
      }).eq("id", session.data.id);
      return json({
        handled: true,
        reply: "Okay — I’ll keep the existing request active.",
        ui: {
          type: "buttons",
          body: "Existing job",
          buttons: [{ id: "MY_JOBS", title: "View my jobs" }, {
            id: "HOME",
            title: "Home",
          }],
        },
      });
    }
    if (message === "DUP_CREATE_ANYWAY") {
      await supabase.from("conversation_sessions").update({
        state: "ji_location",
        context: {
          description: session.data.context?.description ?? "",
          service_key: session.data.context?.service_key,
          service_name: session.data.context?.service_name,
          service_confirmed: session.data.context?.service_confirmed === true,
        },
      }).eq("id", session.data.id);
      return json({
        handled: true,
        reply: "No problem. Where is this job? Send: Suburb, City, Province.",
      });
    }
    return json({
      handled: true,
      reply: "Choose Use existing or Create another.",
      ui: {
        type: "buttons",
        body: "Possible duplicate",
        buttons: [{ id: "DUP_USE_EXISTING", title: "Use existing" }, {
          id: "DUP_CREATE_ANYWAY",
          title: "Create another",
        }],
      },
    });
  }
  return json({ handled: false });
});
