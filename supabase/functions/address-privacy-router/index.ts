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

function addressUi(rows: any[]) {
  return {
    type: "list",
    body: "Use a saved address?",
    button: "Choose address",
    rows: [
      ...rows.map((address: any) => ({
        id: `JI_ADDR:${address.id}`,
        title: String(address.label || "Saved address").slice(0, 24),
        description: `${address.street_address}, ${address.suburb}, ${address.city}`.slice(0, 72),
      })),
      {
        id: "JI_ADDR_NEW",
        title: "Use another address",
        description: "Enter a different service address",
      },
    ],
  };
}

async function call(url: string, key: string, target: string, input: Incoming) {
  const response = await fetch(`${url}/functions/v1/${target}`, {
    method: "POST",
    headers: { apikey: key, "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) return { handled: false };
  return await response.json();
}

async function updateSession(supabase: any, id: string, values: Record<string, unknown>) {
  const result = await supabase.from("conversation_sessions").update(values).eq("id", id);
  if (result.error) throw result.error;
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);

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
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  try {
    // This is the single idempotency gate for an inbound WhatsApp message.
    if (input.external_message_id) {
      const claim = await supabase.from("whatsapp_inbound_events").insert({
        message_id: input.external_message_id,
      });
      if (claim.error) {
        if (claim.error.code === "23505") return json({ handled: true, duplicate: true });
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

    if (["ji_description", "ji_urgency", "ji_time", "ji_photo"].includes(state)) {
      return json(await call(url, key, "job-intake-router", input));
    }

    const customerResult = await supabase
      .from("customers")
      .select("id,full_name,preferred_name")
      .eq("phone", phone)
      .maybeSingle();
    if (customerResult.error) throw customerResult.error;
    const customer = customerResult.data;

    if (state === "ji_location") {
      const location = parseLocation(message);
      if (!location) {
        return json({
          handled: true,
          reply: "Send suburb and city, separated by a comma. Example: Langa, Cape Town",
        });
      }

      const context = { ...(session.context ?? {}), ...location };
      if (customer?.id) {
        const addresses = await supabase
          .from("customer_addresses")
          .select("id,label,street_address,suburb,city,province")
          .eq("customer_id", customer.id)
          .order("is_default", { ascending: false })
          .order("last_used_at", { ascending: false })
          .limit(5);
        if (addresses.error) throw addresses.error;

        if ((addresses.data ?? []).length) {
          await updateSession(supabase, session.id, {
            state: "ji_saved_address",
            context,
          });
          return json({
            handled: true,
            reply: addressUi(addresses.data ?? []).body,
            ui: addressUi(addresses.data ?? []),
          });
        }
      }

      await updateSession(supabase, session.id, {
        state: "ji_address",
        context,
      });
      return json({
        handled: true,
        reply: "What is the street address? It stays private and is shared only with the handyman who accepts.",
      });
    }

    if (state === "ji_saved_address") {
      if (message === "JI_ADDR_NEW") {
        await updateSession(supabase, session.id, { state: "ji_address" });
        return json({
          handled: true,
          reply: "What is the street address? It stays private and is shared only with the handyman who accepts.",
        });
      }

      if (message.startsWith("JI_ADDR:") && customer?.id) {
        const addressId = message.slice(8);
        const address = await supabase
          .from("customer_addresses")
          .select("id,street_address,suburb,city,province")
          .eq("id", addressId)
          .eq("customer_id", customer.id)
          .maybeSingle();
        if (address.error) throw address.error;

        if (!address.data) {
          return json({
            handled: true,
            reply: "That saved address is no longer available.",
            ui: {
              type: "buttons",
              body: "Enter another address",
              buttons: [{ id: "JI_ADDR_NEW", title: "New address" }],
            },
          });
        }

        const touched = await supabase
          .from("customer_addresses")
          .update({ last_used_at: new Date().toISOString() })
          .eq("id", address.data.id);
        if (touched.error) throw touched.error;

        await updateSession(supabase, session.id, {
          state: "ji_urgency",
          context: {
            ...(session.context ?? {}),
            street_address: address.data.street_address,
            suburb: address.data.suburb,
            city: address.data.city,
            province: address.data.province,
          },
        });
        return json({ handled: true, reply: urgencyUi.body, ui: urgencyUi });
      }

      return json({
        handled: true,
        reply: "Choose a saved address or use another one.",
      });
    }

    if (state === "ji_address") {
      if (message.length < 5) {
        return json({ handled: true, reply: "Send the street number and street name." });
      }
      await updateSession(supabase, session.id, {
        state: "ji_urgency",
        context: { ...(session.context ?? {}), street_address: message },
      });
      return json({ handled: true, reply: urgencyUi.body, ui: urgencyUi });
    }

    if (message === "REQUEST_HELP" || message === "NEW_REQUEST") {
      return json(await call(url, key, "duplicate-job-router", {
        ...input,
        message: "REQUEST_HELP",
      }));
    }

    if (message === "H_JOBS" || message.startsWith("HJOBV:")) {
      const handymanJobs = await call(url, key, "handyman-job-history-router", input);
      if (handymanJobs?.handled) return json(handymanJobs);
    }

    const customerCommand =
      [
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
