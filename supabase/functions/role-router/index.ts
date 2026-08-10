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

const TERMS_VERSION = "2026-08-10";

function registrationUi(role: Role) {
  const provider = role === "handyman";
  return {
    type: "buttons",
    body: provider
      ? "Create your provider profile? By continuing, you accept HandyConnect’s Terms and acknowledge the Privacy Notice. Provider access still requires verification."
      : "Create your customer profile? By continuing, you accept HandyConnect’s Terms and acknowledge the Privacy Notice.",
    buttons: [
      {
        id: provider ? "PROV_REG_ACCEPT" : "CUST_REG_ACCEPT",
        title: "Continue",
      },
      { id: "REG_NOT_NOW", title: "Not now" },
    ],
  };
}

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
    supabase.from("customers").select(
      "id,full_name,preferred_name,registration_status,terms_accepted_at",
    ).eq(
      "phone",
      phone,
    ).maybeSingle(),
    supabase.from("handymen").select(
      "id,full_name,registration_status,terms_accepted_at,verification_status",
    ).eq("phone", phone)
      .maybeSingle(),
    supabase.from("whatsapp_role_preferences").select("active_role").eq(
      "external_user_id",
      phone,
    ).maybeSingle(),
  ]);

  const hasCustomer = Boolean(customer.data);
  const hasHandyman = Boolean(handyman.data);
  const dualRole = hasCustomer && hasHandyman;
  const customerReady = hasCustomer &&
    customer.data.registration_status === "active" &&
    Boolean(customer.data.terms_accepted_at);
  const handymanReady = hasHandyman &&
    handyman.data.registration_status === "active" &&
    Boolean(handyman.data.terms_accepted_at);

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
    if (!hasCustomer) {
      const created = await supabase.from("customers").insert({
        phone,
        registration_status: "onboarding",
      });
      if (created.error) throw created.error;
    }
    await setRole("customer");
    if (!customerReady) {
      return json({
        handled: true,
        reply: "Registration is required before requesting or managing jobs.",
        ui: registrationUi("customer"),
      });
    }
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
    if (!handymanReady) {
      return json({
        handled: true,
        reply:
          "Provider registration and verification are required before receiving jobs.",
        ui: registrationUi("handyman"),
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

  if (message === "REG_NOT_NOW") {
    return json({
      handled: true,
      reply: "No profile was activated. Send Hi whenever you’re ready.",
      ui: chooseRoleUi,
    });
  }

  if (message === "CUST_REG_ACCEPT") {
    if (customerReady) {
      await setRole("customer");
      return json({
        handled: true,
        reply: "Your customer profile is already active.",
        ui: customerUi(),
      });
    }

    const acceptedAt = new Date().toISOString();
    const saved = await supabase.from("customers").upsert({
      phone,
      registration_status: customer.data?.full_name ? "active" : "onboarding",
      terms_accepted_at: acceptedAt,
      terms_version: TERMS_VERSION,
      updated_at: acceptedAt,
    }, { onConflict: "phone" }).select("id,full_name,preferred_name").single();
    if (saved.error) throw saved.error;
    await setRole("customer");
    if (saved.data.full_name) {
      const cleared = await supabase.from("conversation_sessions").update({
        flow: "ready",
        state: "ready",
        context: {},
        status: "active",
        updated_at: acceptedAt,
      }).eq("channel", input.channel ?? "whatsapp").eq(
        "external_user_id",
        phone,
      );
      if (cleared.error) throw cleared.error;

      const firstName = saved.data.preferred_name ||
        String(saved.data.full_name).split(" ")[0];
      return json({
        handled: true,
        reply:
          `Registration complete. Welcome, ${firstName} 👋\n\nYou can now request a handyman or open My jobs to view existing requests.`,
        ui: customerUi(),
      });
    }
    const session = await supabase.from("conversation_sessions").upsert({
      channel: input.channel ?? "whatsapp",
      external_user_id: phone,
      flow: "customer_onboarding",
      state: "customer_name",
      context: {},
      status: "active",
    }, { onConflict: "channel,external_user_id" });
    if (session.error) throw session.error;
    return json({ handled: true, reply: "What name should I call you?" });
  }

  if (message === "PROV_REG_ACCEPT") {
    await setRole("handyman");
    if (handymanReady) {
      return json({
        handled: true,
        reply:
          "Your provider profile is already active. Verification is still required before receiving jobs.",
        ui: handymanUi(hasCustomer),
      });
    }
    if (hasHandyman) {
      const acceptedAt = new Date().toISOString();
      const saved = await supabase.from("handymen").update({
        registration_status: "active",
        terms_accepted_at: acceptedAt,
        terms_version: TERMS_VERSION,
        updated_at: acceptedAt,
      }).eq("id", handyman.data.id);
      if (saved.error) throw saved.error;
      return json({
        handled: true,
        reply:
          "Provider profile activated. Verification is still required before receiving jobs.",
        ui: handymanUi(hasCustomer),
      });
    }
    return json({
      handled: true,
      delegate: "conversation-engine",
      delegate_message: "ROLE_HANDYMAN_TERMS_ACCEPTED",
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
    if (activeRole === "customer" && !customerReady) {
      return json({
        handled: true,
        reply: "Please finish customer registration first.",
        ui: registrationUi("customer"),
      });
    }
    if (activeRole === "handyman" && !handymanReady) {
      return json({
        handled: true,
        reply: "Please finish provider registration first.",
        ui: registrationUi("handyman"),
      });
    }
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
    if (!handymanReady) {
      return json({
        handled: true,
        reply: "Finish provider registration to use the provider dashboard.",
        ui: registrationUi("handyman"),
      });
    }
    const firstName = handyman.data?.full_name?.split(" ")[0];
    return json({
      handled: true,
      reply: firstName ? `Hi ${firstName} 👋` : "Hi 👋",
      ui: handymanUi(hasCustomer),
    });
  }

  if (!customerReady) {
    return json({
      handled: true,
      reply: "Finish customer registration to request or manage jobs.",
      ui: registrationUi("customer"),
    });
  }

  return json({
    handled: true,
    delegate: "customer-home-router",
    delegate_message: message,
  });
});
