import { createClient } from "@supabase/supabase-js";

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
    } catch {
      // Fall back to the legacy service-role key below.
    }
  }
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
}

function homeText(name?: string) {
  return name
    ? `Hi ${name} 👋\nWhat can we help with?`
    : "What can we help with?";
}

function home(name?: string) {
  return {
    type: "buttons",
    body: homeText(name),
    buttons: [
      { id: "REQUEST_HELP", title: "Request handyman" },
      { id: "MY_JOBS", title: "My jobs" },
      { id: "CUST_MORE", title: "More" },
    ],
  };
}

function more() {
  return {
    type: "list",
    body: "More options",
    button: "Choose",
    rows: [
      { id: "CUST_PROFILE", title: "My profile" },
      { id: "CUST_HELP", title: "How it works" },
      { id: "HOME", title: "Home" },
    ],
  };
}

function activeHome(name: string | undefined, job: any) {
  const place = [job.suburb, job.city].filter(Boolean).join(", ");
  const status = ["matching", "open"].includes(job.status)
    ? "🔎 I’m finding a suitable, verified handyman for:"
    : job.status === "assigned"
    ? "✅ A handyman has accepted:"
    : "🛠️ Work is in progress for:";
  const reassurance = ["matching", "open"].includes(job.status)
    ? "You don’t need to keep checking—I’ll message you as soon as someone accepts."
    : "Open the request for the latest status and next action.";
  const body = [
    name ? `Hi ${name} 👋` : "Hi 👋",
    "",
    status,
    job.description,
    place ? `📍 ${place}` : null,
    "",
    reassurance,
  ].filter((line) => line !== null).join("\n");
  return {
    type: "buttons",
    body,
    buttons: [
      { id: `CJOB:${job.id}`, title: "View request" },
      { id: "REQUEST_HELP", title: "New request" },
      { id: "MY_JOBS", title: "My jobs" },
    ],
  };
}

async function call(
  url: string,
  secret: string,
  target: string,
  input: Incoming,
) {
  const response = await fetch(`${url}/functions/v1/${target}`, {
    method: "POST",
    headers: { apikey: secret, "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  return {
    status: response.status,
    body: await response.json().catch(() => ({ handled: false })),
  };
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
  if (handyman.error) throw handyman.error;
  if (handyman.data) return json({ handled: false });

  let customer: any = await supabase
    .from("customers")
    .select("id,full_name,preferred_name,email,onboarding_completed_at")
    .eq("phone", phone)
    .maybeSingle();
  if (customer.error) throw customer.error;

  const session = await supabase
    .from("conversation_sessions")
    .select("id,state,context")
    .eq("channel", input.channel ?? "whatsapp")
    .eq("external_user_id", phone)
    .maybeSingle();
  if (session.error) throw session.error;

  if (session.data?.state === "customer_name") {
    const name = message.replace(/\s+/g, " ").trim();
    if (name.length < 2 || name.length > 80) {
      return json({ handled: true, reply: "What name should I call you?" });
    }

    const updated = await supabase
      .from("customers")
      .update({
        full_name: name,
        preferred_name: name.split(" ")[0],
        onboarding_completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", customer.data.id);
    if (updated.error) throw updated.error;

    const sessionUpdated = await supabase
      .from("conversation_sessions")
      .update({ state: "ready", flow: "ready", context: {} })
      .eq("id", session.data.id);
    if (sessionUpdated.error) throw sessionUpdated.error;

    const firstName = name.split(" ")[0];
    return json({
      handled: true,
      reply: homeText(firstName),
      ui: home(firstName),
    });
  }

  const greeting = ["hi", "hello", "hey", "menu", "start", "home"].includes(
    message.toLowerCase(),
  ) || message === "HOME";

  if (greeting) {
    if (!customer.data) {
      const inserted = await supabase.from("customers").insert({ phone })
        .select("id").single();
      if (inserted.error) throw inserted.error;
      customer = { data: { id: inserted.data.id } };
    }

    if (!customer.data.full_name) {
      if (session.data?.id) {
        const updated = await supabase
          .from("conversation_sessions")
          .update({
            flow: "customer_onboarding",
            state: "customer_name",
            context: {},
          })
          .eq("id", session.data.id);
        if (updated.error) throw updated.error;
      } else {
        const inserted = await supabase.from("conversation_sessions").insert({
          channel: input.channel ?? "whatsapp",
          external_user_id: phone,
          flow: "customer_onboarding",
          state: "customer_name",
          context: {},
        });
        if (inserted.error) throw inserted.error;
      }
      return json({
        handled: true,
        reply: "Welcome to HandyConnect 👋\nWhat name should I call you?",
      });
    }

    const firstName = customer.data.preferred_name ||
      String(customer.data.full_name).split(" ")[0];
    const active = await supabase
      .from("jobs")
      .select("id,description,suburb,city,status,created_at")
      .eq("customer_id", customer.data.id)
      .in("status", ["open", "matching", "assigned", "in_progress"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (active.error) throw active.error;
    if (active.data) {
      const ui = activeHome(firstName, active.data);
      return json({ handled: true, reply: ui.body, ui });
    }
    return json({
      handled: true,
      reply: homeText(firstName),
      ui: home(firstName),
    });
  }

  if (
    message === "MY_JOBS" ||
    message === "CUSTOMER_JOBS" ||
    message.startsWith("CJOB:") ||
    message.startsWith("CSTALE:")
  ) {
    const result = await call(
      url,
      secret,
      "customer-job-history-router",
      input,
    );
    return json(result.body, result.status);
  }

  const editCommand = message.startsWith("EDIT_JOB:") ||
    message.startsWith("EDITLOC:") ||
    message.startsWith("EDITSVC:") ||
    message.startsWith("ESVCPAGE:") ||
    message.startsWith("ESKILL:") ||
    session.data?.state === "router_edit_location";

  if (editCommand) {
    const editingId = String(session.data?.context?.editing_job_id ?? "");
    const result = await call(url, secret, "customer-job-router", input);

    if (message.startsWith("EDIT_JOB:")) {
      return json({
        handled: true,
        reply: "What would you like to change?",
        ui: result.body?.ui,
      }, result.status);
    }
    if (message.startsWith("EDITLOC:")) {
      return json({
        handled: true,
        reply: "Send the new suburb and city. Example: Langa, Cape Town",
      }, result.status);
    }
    if (session.data?.state === "router_edit_location" && result.status < 300) {
      return json({
        handled: true,
        reply: "Location updated. We’ll continue looking for a handyman.",
        ui: {
          type: "buttons",
          body: "Request updated",
          buttons: [
            {
              id: editingId ? `CJOB:${editingId}` : "MY_JOBS",
              title: "View request",
            },
            { id: "MY_JOBS", title: "My jobs" },
            { id: "HOME", title: "Home" },
          ],
        },
        outbound: result.body?.outbound,
      }, result.status);
    }
    if (message.startsWith("ESKILL:") && result.status < 300) {
      return json({
        handled: true,
        reply: "Service updated. We’ll continue looking for a handyman.",
        ui: {
          type: "buttons",
          body: "Request updated",
          buttons: [
            { id: "MY_JOBS", title: "My jobs" },
            { id: "HOME", title: "Home" },
          ],
        },
        outbound: result.body?.outbound,
      }, result.status);
    }
    return json({ ...result.body, handled: true }, result.status);
  }

  if (message === "CUST_MORE") {
    return json({ handled: true, reply: more().body, ui: more() });
  }

  if (message === "CUST_PROFILE" && customer.data) {
    return json({
      handled: true,
      reply: [
        `Name: ${customer.data.full_name || "Not set"}`,
        `Phone: ${phone}`,
        `Email: ${customer.data.email || "Not set"}`,
      ].join("\n"),
      ui: {
        type: "buttons",
        body: "Profile",
        buttons: [{ id: "HOME", title: "Home" }],
      },
    });
  }

  if (message === "CUST_ADDRESSES" && customer.data) {
    const addresses = await supabase
      .from("customer_addresses")
      .select("label,street_address,suburb,city,is_default")
      .eq("customer_id", customer.data.id)
      .order("is_default", { ascending: false })
      .order("last_used_at", { ascending: false })
      .limit(10);
    if (addresses.error) throw addresses.error;

    return json({
      handled: true,
      reply: (addresses.data ?? []).length
        ? `Saved addresses\n${
          (addresses.data ?? []).map((address: any) =>
            `• ${address.label}${
              address.is_default ? " · default" : ""
            }: ${address.street_address}, ${address.suburb}, ${address.city}`
          ).join("\n")
        }`
        : "No saved addresses yet.",
      ui: {
        type: "buttons",
        body: "What next?",
        buttons: [
          { id: "REQUEST_HELP", title: "Request handyman" },
          { id: "HOME", title: "Home" },
        ],
      },
    });
  }

  if (message === "CUST_HELP") {
    return json({
      handled: true,
      reply:
        "Describe the problem, tell us the area and choose when you need help. HandyConnect then looks for a suitable, verified handyman. You approve the quote before work starts, and you only share your street address after a handyman accepts.",
      ui: {
        type: "buttons",
        body: "Ready to get help?",
        buttons: [
          { id: "REQUEST_HELP", title: "Request handyman" },
          { id: "HOME", title: "Home" },
        ],
      },
    });
  }

  return json({ handled: false });
});
