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

  if (phone && message) {
    const supabase = createClient(url, secret, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const session = await supabase
      .from("conversation_sessions")
      .select("state")
      .eq("channel", input.channel ?? "whatsapp")
      .eq("external_user_id", phone)
      .maybeSingle();

    if (!session.error && session.data?.state === "ji_location") {
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
  }

  const legacy = await fetch(`${url}/functions/v1/job-intake-router-legacy`, {
    method: "POST",
    headers: { apikey: secret, "content-type": "application/json" },
    body: JSON.stringify(forwarded),
  });

  return new Response(await legacy.text(), {
    status: legacy.status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
});
