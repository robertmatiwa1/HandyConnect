import { createClient } from "@supabase/supabase-js";

type Incoming = {
  channel?: string;
  external_user_id?: string;
  message?: string;
};
type Role = "customer" | "handyman";

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

const isGreeting = (message: string) =>
  ["hi", "hello", "hey", "menu", "start", "home"].includes(
    message.toLowerCase(),
  ) || message === "HOME";

const chooseRoleUi = {
  type: "buttons",
  body: "How are you using HandyConnect?",
  buttons: [
    { id: "ROLE_USE_CUSTOMER", title: "I need a handyman" },
    { id: "ROLE_USE_HANDYMAN", title: "I provide services" },
  ],
};

function customerUi() {
  return {
    type: "buttons",
    body: "What do you need?",
    buttons: [
      { id: "REQUEST_HELP", title: "Request handyman" },
      { id: "MY_JOBS", title: "My jobs" },
      { id: "CUST_MORE", title: "More" },
    ],
  };
}

function customerMoreUi(canSwitch: boolean) {
  return {
    type: "list",
    body: "More options",
    button: "Choose",
    rows: [
      { id: "CUST_PROFILE", title: "My profile" },
      { id: "CUST_HELP", title: "How it works" },
      ...(canSwitch
        ? [{ id: "SWITCH_HANDYMAN", title: "Switch to provider" }]
        : []),
      { id: "HOME", title: "Home" },
    ],
  };
}

function handymanUi(canSwitch: boolean) {
  return {
    type: "list",
    body: "Provider dashboard",
    button: "Open menu",
    rows: [
      { id: "GO_AVAILABLE", title: "I'm available" },
      { id: "H_JOBS", title: "My jobs & offers" },
      { id: "MY_PROFILE", title: "My profile" },
      ...(canSwitch
        ? [{ id: "SWITCH_CUSTOMER", title: "Switch to customer" }]
        : []),
    ],
  };
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return json({ handled: false });

  const key = secretKey();
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  if (!key || !url || request.headers.get("apikey") !== key) {
    return json({ handled: false });
  }

  let input: Incoming;
  try {
    input = await request.json();
  } catch {
    return json({ handled: false });
  }

  const phone = input.external_user_id?.trim();
  const message = input.message?.trim() ?? "";
  if (!phone) return json({ handled: false });

  const supabase = createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  const [customer, handyman, preference] = await Promise.all([
    supabase.from("customers").select("id,full_name,preferred_name").eq(
      "phone",
      phone,
    ).maybeSingle(),
    supabase.from("handymen").select("id,full_name").eq("phone", phone)
      .maybeSingle(),
    supabase.from("whatsapp_role_preferences").select("active_role").eq(
      "external_user_id",
      phone,
    ).maybeSingle(),
  ]);

  const hasCustomer = Boolean(customer.data);
  const hasHandyman = Boolean(handyman.data);
  const dualRole = hasCustomer && hasHandyman;

  async function setRole(role: Role) {
    await supabase.from("whatsapp_role_preferences").upsert(
      {
        external_user_id: phone,
        active_role: role,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "external_user_id" },
    );
  }

  if (message === "ROLE_USE_CUSTOMER" || message === "SWITCH_CUSTOMER") {
    if (!hasCustomer) await supabase.from("customers").insert({ phone });
    await setRole("customer");
    return json({
      handled: true,
      reply: message === "SWITCH_CUSTOMER"
        ? "Switched to customer mode."
        : "What needs fixing?",
      ui: customerUi(),
    });
  }

  if (message === "ROLE_USE_HANDYMAN" || message === "SWITCH_HANDYMAN") {
    await setRole("handyman");
    if (!hasHandyman) {
      return json({
        handled: true,
        delegate: "conversation-engine",
        delegate_message: "ROLE_HANDYMAN",
      });
    }
    return json({
      handled: true,
      reply: message === "SWITCH_HANDYMAN"
        ? "Switched to provider mode."
        : "Provider mode selected.",
      ui: handymanUi(hasCustomer),
    });
  }

  let activeRole = preference.data?.active_role as Role | null;
  if (!activeRole) {
    if (hasCustomer && !hasHandyman) activeRole = "customer";
    else if (hasHandyman && !hasCustomer) activeRole = "handyman";
    else if (dualRole) activeRole = "customer";
    if (activeRole) await setRole(activeRole);
  }

  if (message === "CUST_MORE" && activeRole === "customer") {
    return json({
      handled: true,
      reply: "More options",
      ui: customerMoreUi(hasHandyman),
    });
  }

  if (!isGreeting(message)) {
    return json({ handled: false, active_role: activeRole });
  }

  if (!hasCustomer && !hasHandyman) {
    return json({
      handled: true,
      reply: "Welcome to HandyConnect.",
      ui: chooseRoleUi,
    });
  }

  if (activeRole === "handyman") {
    const firstName = handyman.data?.full_name?.split(" ")[0];
    return json({
      handled: true,
      reply: firstName ? `Hi ${firstName} 👋` : "Hi 👋",
      ui: handymanUi(hasCustomer),
    });
  }

  return json({
    handled: true,
    delegate: "customer-home-router",
    delegate_message: message,
  });
});
