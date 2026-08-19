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
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8" } });

function key() {
  const raw = Deno.env.get("SUPABASE_SECRET_KEYS") ?? "";
  if (raw) {
    try { const parsed = JSON.parse(raw); if (typeof parsed.default === "string") return parsed.default; } catch {}
  }
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
}

async function callLegacy(url: string, secret: string, input: Incoming) {
  return await fetch(`${url}/functions/v1/job-intake-router-legacy`, {
    method: "POST",
    headers: { apikey: secret, "content-type": "application/json" },
    body: JSON.stringify(input),
  });
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const secret = key();
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  if (!secret || !url || request.headers.get("apikey") !== secret) return json({ error: "unauthorized" }, 401);

  let input: Incoming;
  try { input = await request.json(); } catch { return json({ error: "invalid_json" }, 400); }

  const phone = input.external_user_id?.trim();
  const message = input.message?.trim() ?? "";
  let forwarded: Incoming = input;
  let state: string | null = null;

  if (phone && message) {
    const supabase = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
    const session = await supabase.from("conversation_sessions").select("state").eq("channel", input.channel ?? "whatsapp").eq("external_user_id", phone).maybeSingle();
    state = !session.error ? session.data?.state ?? null : null;

    if (state === "ji_location") {
      const location = parseHumanLocation(message);
      if (location && !location.needsCity && location.city) {
        forwarded = { ...input, message: [location.suburb, location.city, location.province].filter(Boolean).join(", ") };
      }
    }
  }

  let legacy = await callLegacy(url, secret, forwarded);

  // For a fresh request, timing is the last service-detail question. Photo and
  // review are optional friction, so skip both and proceed directly to the
  // existing consent/readiness boundary. Existing customers can therefore go
  // live immediately; new customers see terms/name only once before publish.
  const timingCompleted =
    (state === "ji_urgency" && ["JI_URGENT", "JI_FLEXIBLE"].includes(message)) ||
    (state === "ji_time" && ["JI_TIME_MORNING", "JI_TIME_AFTERNOON", "JI_TIME_EVENING", "JI_TIME_ANY"].includes(message));

  if (timingCompleted && legacy.ok) {
    legacy = await callLegacy(url, secret, { ...input, message: "JI_SKIP_PHOTO" });
    if (legacy.ok) legacy = await callLegacy(url, secret, { ...input, message: "JI_SUBMIT" });
  }

  return new Response(await legacy.text(), { status: legacy.status, headers: { "content-type": "application/json; charset=utf-8" } });
});
