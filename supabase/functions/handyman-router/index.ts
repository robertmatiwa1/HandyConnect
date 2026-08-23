import { createClient } from "@supabase/supabase-js";

type Incoming = {
  channel?: "whatsapp" | "test" | "admin";
  external_user_id?: string;
  external_message_id?: string;
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

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const secret = key();
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  if (!secret || !url || req.headers.get("apikey") !== secret) return json({ error: "unauthorized" }, 401);

  let input: Incoming;
  try { input = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }

  const phone = input.external_user_id?.trim() ?? "";
  const message = input.message?.trim() ?? "";
  const s = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });

  const handyman = phone ? await s.from("handymen")
    .select("id,status,registration_status,terms_accepted_at,profile_completed_at,verification_status,active_job_id,availability_status,availability_cooldown_until")
    .eq("phone", phone).maybeSingle() : { data: null, error: null } as any;
  const h = handyman.data;
  const betaEligible = !!h && h.status === "active" && h.registration_status === "active" && !!h.terms_accepted_at && !!h.profile_completed_at;

  if (phone && message === "H_MEDIA_UPLOAD" && h?.verification_status !== "verified") {
    const session = await s.from("conversation_sessions").select("id").eq("channel", input.channel ?? "whatsapp").eq("external_user_id", phone).maybeSingle();
    if (!session.error && session.data?.id) {
      await s.from("conversation_sessions").update({ state: "handyman_router_verification_document" }).eq("id", session.data.id);
      return json({ ok: true, reply: "ID verification is optional during the beta. If you want to verify now, attach a clear photo or PDF of your South African ID, passport or valid permit. Otherwise return to the dashboard and set your availability." });
    }
  }

  if (betaEligible && h.verification_status !== "verified" && message === "H_VERIFY") {
    return json({
      ok: true,
      reply: "Your ID is not yet verified. During the HandyConnect beta you can still receive jobs once you set yourself available. You may upload an ID, passport or valid permit now or do it later.",
      ui: { type: "buttons", body: "Beta access is active", buttons: [
        { id: "H_MEDIA_UPLOAD", title: "Upload ID" },
        { id: "H_AVAIL", title: "Set availability" },
        { id: "HANDYMAN_HOME", title: "Dashboard" }
      ] }
    });
  }

  if (betaEligible && h.verification_status !== "verified" && message.startsWith("H_AVAIL:")) {
    if (h.active_job_id || h.availability_status === "busy") return json({ ok: true, reply: "You cannot override Busy while Current job is active." });
    if (h.availability_cooldown_until && new Date(h.availability_cooldown_until) > new Date()) return json({ ok: true, reply: `Availability is temporarily locked until ${h.availability_cooldown_until}.` });
    const hours = Number(message.slice("H_AVAIL:".length));
    if (![2, 4, 8, 12].includes(hours)) return json({ error: "invalid_availability_window" }, 400);
    const until = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
    const updated = await s.from("handymen").update({ availability_status: "available", available_until: until }).eq("id", h.id);
    if (updated.error) throw updated.error;
    return json({ ok: true, reply: `You're available for the next ${hours} hours. Relevant jobs can now be offered automatically. Your profile will be shown as ID not yet verified until verification is completed.` });
  }

  const forwardedInput: Incoming = input.media?.id && !message ? { ...input, message: "H_MEDIA_UPLOAD" } : input;
  const upstream = await fetch(`${url}/functions/v1/handyman-router-legacy`, {
    method: "POST",
    headers: { apikey: secret, "content-type": "application/json" },
    body: JSON.stringify(forwardedInput),
  });

  const upstreamText = await upstream.text();
  if (!upstream.ok) return new Response(upstreamText, { status: upstream.status, headers: { "content-type": "application/json; charset=utf-8" } });

  if (phone) {
    try {
      const body = JSON.parse(upstreamText);
      const refreshed = await s.from("handymen")
        .select("status,registration_status,terms_accepted_at,profile_completed_at,verification_status")
        .eq("phone", phone).maybeSingle();
      const current = refreshed.data;
      const nowBetaEligible = !!current && current.status === "active" && current.registration_status === "active" && !!current.terms_accepted_at && !!current.profile_completed_at && current.verification_status !== "verified";
      if (nowBetaEligible && typeof body?.reply === "string" && body.reply.includes("verify your identity before you can receive jobs")) {
        body.reply = body.reply.replace(
          "One final step: verify your identity before you can receive jobs. Send a clear photo/PDF of your SA ID, passport or valid permit. We never ask you to type the document number into chat.",
          "ID verification is optional during the beta. You can receive jobs once you set yourself available. You may upload a clear photo/PDF of your SA ID, passport or valid permit now or do it later. We never ask you to type the document number into chat."
        );
        return json(body, upstream.status);
      }
    } catch {}
  }

  return new Response(upstreamText, { status: upstream.status, headers: { "content-type": "application/json; charset=utf-8" } });
});
