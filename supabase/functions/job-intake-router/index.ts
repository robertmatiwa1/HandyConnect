import { createClient } from "@supabase/supabase-js";
import { parseHumanLocation } from "../_shared/location-input.ts";

type Incoming = {
  channel?: string;
  external_user_id?: string;
  external_message_id?: string;
  message_type?: string;
  message_timestamp?: number;
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
    } catch {}
  }
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
}

async function callLegacy(url: string, secret: string, input: Incoming) {
  const response = await fetch(`${url}/functions/v1/job-intake-router-legacy`, {
    method: "POST",
    headers: { apikey: secret, "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  const text = await response.text();
  let body: any = {};
  try { body = JSON.parse(text); } catch { body = { error: "invalid_legacy_response" }; }
  return { response, body };
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
  let forwarded: Incoming = input;
  let sessionState = "";
  let customerHasName = false;

  if (phone && message) {
    const supabase = createClient(url, secret, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });

    const [session, customer] = await Promise.all([
      supabase
        .from("conversation_sessions")
        .select("state")
        .eq("channel", input.channel ?? "whatsapp")
        .eq("external_user_id", phone)
        .maybeSingle(),
      supabase
        .from("customers")
        .select("full_name")
        .eq("phone", phone)
        .maybeSingle(),
    ]);

    if (!session.error) sessionState = String(session.data?.state ?? "");
    if (!customer.error) customerHasName = Boolean(customer.data?.full_name);

    if (sessionState === "ji_location") {
      const location = parseHumanLocation(message);
      if (location && !location.needsCity && location.city) {
        forwarded = {
          ...input,
          message: [location.suburb, location.city, location.province]
            .filter(Boolean)
            .join(", "),
        };
      }
    }

    // First-time customers can now provide their name as the explicit consent
    // action. The router performs the legacy Accept + name sequence internally,
    // reducing two user actions to one while retaining affirmative consent.
    if (
      sessionState === "ji_consent" &&
      !customerHasName &&
      !message.startsWith("JI_") &&
      message.replace(/\s+/g, " ").trim().length >= 2 &&
      message.replace(/\s+/g, " ").trim().length <= 80
    ) {
      const accepted = await callLegacy(url, secret, {
        ...input,
        external_message_id: undefined,
        message: "JI_ACCEPT_TERMS",
      });
      if (!accepted.response.ok) {
        return new Response(JSON.stringify(accepted.body), {
          status: accepted.response.status,
          headers: { "content-type": "application/json; charset=utf-8" },
        });
      }
      const completed = await callLegacy(url, secret, input);
      return new Response(JSON.stringify(completed.body), {
        status: completed.response.status,
        headers: { "content-type": "application/json; charset=utf-8" },
      });
    }
  }

  const legacy = await callLegacy(url, secret, forwarded);

  // If a first-time customer reaches consent, present a single clear action:
  // replying with their name both accepts the published Terms/Privacy notice
  // and submits the request. Existing customers keep the one-tap consent button.
  if (
    !customerHasName &&
    legacy.body?.ui?.buttons?.some((button: any) => button?.id === "JI_ACCEPT_TERMS")
  ) {
    const body = [
      "Before we send your request",
      "HandyConnect connects you with independent service providers. Agree the work, price and timing before work starts.",
      "",
      "Terms: https://robertmatiwa1.github.io/HandyConnect/terms/",
      "Privacy: https://robertmatiwa1.github.io/HandyConnect/privacy/",
      "",
      "To accept these Terms and submit your request, reply with your name (for example: Robert).",
    ].join("\n");
    legacy.body.reply = body;
    legacy.body.ui = {
      type: "buttons",
      body,
      buttons: [{ id: "JI_TERMS_NOT_NOW", title: "Not now" }],
    };
  }

  return new Response(JSON.stringify(legacy.body), {
    status: legacy.response.status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
});
