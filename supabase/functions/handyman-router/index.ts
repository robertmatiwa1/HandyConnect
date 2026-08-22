import { createClient } from "@supabase/supabase-js";

type Incoming = {
  channel?: "whatsapp" | "test" | "admin";
  external_user_id?: string;
  external_message_id?: string;
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

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const secret = key();
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  if (!secret || !url || req.headers.get("apikey") !== secret) {
    return json({ error: "unauthorized" }, 401);
  }

  let input: Incoming;
  try {
    input = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const phone = input.external_user_id?.trim() ?? "";
  const message = input.message?.trim() ?? "";

  // Explicit upload action emitted by the verification UI. Preserve all
  // existing onboarding/profile progress and only move the conversation into
  // the document-receipt state. Consent and verification decisions remain
  // entirely user/reviewer controlled.
  if (phone && message === "H_MEDIA_UPLOAD") {
    const s = createClient(url, secret, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });

    const handyman = await s
      .from("handymen")
      .select("id,verification_status")
      .eq("phone", phone)
      .maybeSingle();

    if (!handyman.error && handyman.data?.id && handyman.data.verification_status !== "verified") {
      const session = await s
        .from("conversation_sessions")
        .select("id")
        .eq("channel", input.channel ?? "whatsapp")
        .eq("external_user_id", phone)
        .maybeSingle();

      if (!session.error && session.data?.id) {
        const updated = await s
          .from("conversation_sessions")
          .update({ state: "handyman_router_verification_document" })
          .eq("id", session.data.id);

        if (!updated.error) {
          return json({
            ok: true,
            reply:
              "Please attach a clear photo or document of your South African ID, passport or valid permit. Do not type the number into chat.",
          });
        }
      }
    }
  }

  // Verification policy boundary: the legacy router securely archives identity
  // evidence and marks the provider pending. Approval must remain an explicit
  // review decision; this wrapper must never promote pending evidence to approved.
  const upstream = await fetch(`${url}/functions/v1/handyman-router-legacy`, {
    method: "POST",
    headers: { apikey: secret, "content-type": "application/json" },
    body: JSON.stringify(input),
  });

  return new Response(await upstream.text(), {
    status: upstream.status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
});
