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

function availabilityUi() {
  return {
    type: "list",
    body: "Verification approved. How long are you available for new jobs?",
    button: "Set availability",
    rows: [
      { id: "H_AVAIL:2", title: "Available 2 hours" },
      { id: "H_AVAIL:4", title: "Available 4 hours" },
      { id: "H_AVAIL:8", title: "Available 8 hours" },
      { id: "H_AVAIL:12", title: "Available today" },
      { id: "H_OFFLINE", title: "Stay offline" },
    ],
  };
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
  const s = createClient(url, secret, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  let verificationSubmission = false;
  let handymanId: string | null = null;

  if (phone && input.media?.id) {
    const [session, handyman] = await Promise.all([
      s.from("conversation_sessions")
        .select("state")
        .eq("channel", input.channel ?? "whatsapp")
        .eq("external_user_id", phone)
        .maybeSingle(),
      s.from("handymen")
        .select("id,verification_status")
        .eq("phone", phone)
        .maybeSingle(),
    ]);

    if (!session.error && !handyman.error && handyman.data?.id) {
      handymanId = handyman.data.id;
      verificationSubmission =
        session.data?.state === "handyman_router_verification_document" &&
        handyman.data.verification_status !== "verified";
    }
  }

  const upstream = await fetch(`${url}/functions/v1/handyman-router-legacy`, {
    method: "POST",
    headers: { apikey: secret, "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  const text = await upstream.text();

  if (!upstream.ok || !verificationSubmission || !handymanId || !input.media?.id) {
    return new Response(text, {
      status: upstream.status,
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  }

  try {
    const doc = await s.from("handyman_verification_documents")
      .select("id,status,storage_path,sha256,byte_size,mime_type")
      .eq("handyman_id", handymanId)
      .eq("media_id", input.media.id)
      .order("submitted_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (doc.error) throw doc.error;

    // Auto-approval is allowed only after the legacy upload path has already
    // archived a non-empty supported document and recorded its evidence hash.
    if (
      doc.data?.id &&
      doc.data.status === "pending" &&
      doc.data.storage_path &&
      doc.data.sha256 &&
      Number(doc.data.byte_size ?? 0) > 0 &&
      ["image/jpeg", "image/png", "application/pdf"].includes(String(doc.data.mime_type ?? ""))
    ) {
      const now = new Date().toISOString();
      const approved = await s.from("handyman_verification_documents")
        .update({
          status: "approved",
          reviewed_at: now,
          review_notes:
            "Auto-approved after secure document archive, supported MIME/size validation and SHA-256 evidence capture. No manual authenticity review performed.",
        })
        .eq("id", doc.data.id)
        .eq("status", "pending");
      if (approved.error) throw approved.error;

      return json({
        ok: true,
        verification_method: "automatic_document_acceptance",
        reply:
          "Document received securely. Verification approved ✅ You can now set your availability and receive matching job opportunities.",
        ui: availabilityUi(),
      });
    }
  } catch (error) {
    console.error("automatic verification approval failed", error);
  }

  // If automation cannot prove the evidence preconditions, keep the safer
  // pending response from the established verification flow.
  return new Response(text, {
    status: upstream.status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
});
