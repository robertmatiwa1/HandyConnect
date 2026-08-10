import { createClient } from "@supabase/supabase-js";

type Incoming = {
  channel?: string;
  external_user_id?: string;
  external_message_id?: string;
  message?: string;
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });

function secretKey() {
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

function parseLocation(text: string) {
  const parts = text.split(",").map((part) => part.trim()).filter(Boolean);
  return parts.length < 2
    ? null
    : { suburb: parts[0], city: parts[1], province: parts[2] ?? null };
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

async function call(url: string, key: string, target: string, input: Incoming) {
  const response = await fetch(`${url}/functions/v1/${target}`, {
    method: "POST",
    headers: { apikey: key, "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) return { handled: false };
  return await response.json();
}

async function updateSession(
  supabase: any,
  id: string,
  values: Record<string, unknown>,
) {
  const result = await supabase.from("conversation_sessions").update(values).eq(
    "id",
    id,
  );
  if (result.error) throw result.error;
}

Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405);
  }

  const key = secretKey();
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  if (!key || !url || request.headers.get("apikey") !== key) {
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
  const channel = input.channel ?? "whatsapp";
  if (!phone) return json({ handled: false });

  const supabase = createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  try {
    // This is the single idempotency gate for an inbound WhatsApp message.
    if (input.external_message_id) {
      const claim = await supabase.from("whatsapp_inbound_events").insert({
        message_id: input.external_message_id,
      });
      if (claim.error) {
        if (claim.error.code === "23505") {
          return json({ handled: true, duplicate: true });
        }
        throw claim.error;
      }
    }

    const roleResult = await call(url, key, "role-router", input);
    if (roleResult?.handled) {
      if (roleResult.delegate) {
        const delegated = await call(url, key, roleResult.delegate, {
          ...input,
          message: roleResult.delegate_message ?? input.message,
        });
        return json({ ...delegated, handled: true });
      }
      return json(roleResult);
    }

    const sessionResult = await supabase
      .from("conversation_sessions")
      .select("id,state,context")
      .eq("channel", channel)
      .eq("external_user_id", phone)
      .maybeSingle();
    if (sessionResult.error) throw sessionResult.error;

    const session = sessionResult.data;
    const state = String(session?.state ?? "");

    // An active flow always wins over generic menus and the legacy engine.
    if (state.startsWith("duplicate_")) {
      return json(await call(url, key, "duplicate-job-router", input));
    }

    if (
      ["ji_description", "ji_urgency", "ji_time", "ji_photo", "ji_post_photo"]
        .includes(state)
    ) {
      return json(await call(url, key, "job-intake-router", input));
    }

    if (state === "ji_location") {
      const location = parseLocation(message);
      if (!location) {
        return json({
          handled: true,
          reply:
            "Send suburb and city, separated by a comma. Example: Langa, Cape Town",
        });
      }

      const context = { ...(session.context ?? {}), ...location };
      await updateSession(supabase, session.id, {
        state: "ji_urgency",
        context,
      });
      return json({ handled: true, reply: urgencyUi.body, ui: urgencyUi });
    }

    if (message === "REQUEST_HELP" || message === "NEW_REQUEST") {
      return json(
        await call(url, key, "duplicate-job-router", {
          ...input,
          message: "REQUEST_HELP",
        }),
      );
    }

    if (message === "H_JOBS" || message.startsWith("HJOBV:")) {
      const handymanJobs = await call(
        url,
        key,
        "handyman-job-history-router",
        input,
      );
      if (handymanJobs?.handled) return json(handymanJobs);
    }

    const customerCommand = [
      "HOME",
      "MY_JOBS",
      "CUSTOMER_JOBS",
      "CUST_MORE",
      "CUST_PROFILE",
      "CUST_ADDRESSES",
      "CUST_HELP",
    ].includes(message) ||
      message.startsWith("CJOB:") ||
      message.startsWith("CSTALE:") ||
      message.startsWith("EDIT_JOB:") ||
      message.startsWith("EDITLOC:") ||
      message.startsWith("EDITSVC:") ||
      message.startsWith("ESVCPAGE:") ||
      message.startsWith("ESKILL:") ||
      state === "customer_name" ||
      state === "router_edit_location";

    if (customerCommand) {
      const customerHome = await call(url, key, "customer-home-router", input);
      if (customerHome?.handled) return json(customerHome);
    }

    return json({ handled: false });
  } catch (error) {
    console.error(error);
    return json({ error: "address_privacy_router_failed" }, 500);
  }
});
