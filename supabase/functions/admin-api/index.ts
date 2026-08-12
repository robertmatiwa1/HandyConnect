import { createClient } from "@supabase/supabase-js";
const PASSWORD_HASH =
  "1ecebee07403f6e3b9ee6e73f7202767f8a86856a115a072e7e9e74729e24ab3";
const enc = new TextEncoder(),
  ORIGIN = "https://robertmatiwa1.github.io";
function serviceKey() {
  const raw = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (raw) {
    try {
      const p = JSON.parse(raw);
      if (typeof p.default === "string" && p.default) return p.default;
    } catch {}
  }
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
}
async function hexSha256(s: string) {
  return [
    ...new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(s))),
  ]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
function headers() {
  return {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "access-control-allow-origin": ORIGIN,
    "access-control-allow-headers": "content-type,x-admin-password",
    "access-control-allow-methods": "POST,OPTIONS",
    vary: "Origin",
  };
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: headers() });
function b64(bytes: Uint8Array) {
  let out = "";
  for (let i = 0; i < bytes.length; i += 0x8000)
    out += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(out);
}
function safeFileName(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-90) ||
    "verification-document";
}
async function sha256Bytes(bytes: Uint8Array) {
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
Deno.serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, { status: 204, headers: headers() });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const origin = req.headers.get("origin") ?? "";
  if (origin && origin !== ORIGIN)
    return json({ error: "origin_not_allowed" }, 403);
  const pw = req.headers.get("x-admin-password") ?? "";
  if (!pw || (await hexSha256(pw)) !== PASSWORD_HASH)
    return json({ error: "unauthorized" }, 401);
  const key = serviceKey(),
    url = Deno.env.get("SUPABASE_URL") ?? "";
  if (!key || !url) return json({ error: "service_unavailable" }, 503);
  let input: any = {};
  try {
    input = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }
  if (input.action === "ping") return json({ ok: true });
  const s = createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  try {
    const action = String(input?.action ?? "summary");
    if (action === "summary") {
      const now = new Date().toISOString();
      const Q = await Promise.all([
        s.from("jobs").select("id", { count: "exact", head: true }),
        s
          .from("jobs")
          .select("id", { count: "exact", head: true })
          .in("status", ["open", "matching"]),
        s
          .from("jobs")
          .select("id", { count: "exact", head: true })
          .in("status", ["assigned", "in_progress"]),
        s.from("handymen").select("id", { count: "exact", head: true }),
        s
          .from("handymen")
          .select("id", { count: "exact", head: true })
          .eq("availability_status", "available")
          .gt("available_until", now),
        s
          .from("user_reports")
          .select("id", { count: "exact", head: true })
          .in("status", ["open", "reviewing"]),
        s
          .from("handyman_verification_documents")
          .select("id", { count: "exact", head: true })
          .eq("status", "pending"),
        s
          .from("jobs")
          .select(
            "id,description,suburb,city,status,created_at,customers(full_name,phone),skills!jobs_skill_id_fkey(name)",
          )
          .order("created_at", { ascending: false })
          .limit(50),
        s
          .from("handymen")
          .select(
            "id,full_name,phone,status,availability_status,verification_status,average_rating,completed_jobs,created_at",
          )
          .order("created_at", { ascending: false })
          .limit(100),
        s
          .from("handyman_verification_documents")
          .select(
            "id,handyman_id,document_type,file_name,mime_type,status,submitted_at,review_notes,handymen(full_name,phone,verification_status)",
          )
          .order("submitted_at", { ascending: false })
          .limit(50),
        s
          .from("user_reports")
          .select(
            "id,job_id,reporter_phone,reason,details,status,created_at,jobs(description)",
          )
          .in("status", ["open", "reviewing"])
          .order("created_at", { ascending: false })
          .limit(50),
        s
          .from("payments")
          .select(
            "id,purpose,amount_cents,currency,provider,status,created_at,handymen(full_name,phone)",
          )
          .order("created_at", { ascending: false })
          .limit(50),
        s
          .from("notification_outbox")
          .select(
            "id,recipient_phone,kind,status,attempts,last_error,created_at",
          )
          .order("created_at", { ascending: false })
          .limit(75),
        s.from("admin_marketplace_economics").select("*").single(),
        s.from("admin_handyman_access").select("*").limit(200),
        s.from("admin_job_history").select("*").limit(100),
      ]);
      for (const q of Q) if (q.error) throw q.error;
      const [
        jc,
        se,
        ac,
        hc,
        av,
        or,
        pv,
        jobs,
        handymen,
        verifications,
        reports,
        payments,
        notifications,
        economics,
        access,
        history,
      ] = Q;
      return json({
        ok: true,
        stats: {
          jobs: jc.count ?? 0,
          searching: se.count ?? 0,
          active_jobs: ac.count ?? 0,
          handymen: hc.count ?? 0,
          available: av.count ?? 0,
          open_reports: or.count ?? 0,
          pending_verifications: pv.count ?? 0,
        },
        economics: economics.data ?? {},
        access: access.data ?? [],
        history: history.data ?? [],
        jobs: (jobs.data ?? []).map((j: any) => ({
          ...j,
          customer_name: j.customers?.full_name,
          customer_phone: j.customers?.phone,
          skill: j.skills?.name,
        })),
        handymen: handymen.data ?? [],
        verifications: (verifications.data ?? []).map((v: any) => ({
          ...v,
          handyman_name: v.handymen?.full_name,
          handyman_phone: v.handymen?.phone,
          handyman_verification_status: v.handymen?.verification_status,
        })),
        reports: (reports.data ?? []).map((r: any) => ({
          ...r,
          job_description: r.jobs?.description,
        })),
        payments: (payments.data ?? []).map((p: any) => ({
          ...p,
          handyman_name: p.handymen?.full_name,
          handyman_phone: p.handymen?.phone,
        })),
        notifications: notifications.data ?? [],
      });
    }
    const id = String(input?.id ?? "");
    if (!id) return json({ error: "id_required" }, 400);
    if (action === "get_verification_document") {
      const d = await s
        .from("handyman_verification_documents")
        .select("handyman_id,media_id,mime_type,file_name,storage_path")
        .eq("id", id)
        .single();
      if (d.error) throw d.error;
      if (d.data.storage_path) {
        const stored = await s.storage
          .from("provider-verification")
          .download(d.data.storage_path);
        if (stored.error) throw stored.error;
        const bytes = new Uint8Array(await stored.data.arrayBuffer());
        return json({
          ok: true,
          mime_type:
            stored.data.type || d.data.mime_type || "application/octet-stream",
          file_name: d.data.file_name || "verification-document",
          data_base64: b64(bytes),
        });
      }
      const token = Deno.env.get("WHATSAPP_ACCESS_TOKEN") ?? "",
        version = Deno.env.get("WHATSAPP_GRAPH_VERSION") ?? "v26.0";
      if (!token) return json({ error: "whatsapp_media_unavailable" }, 503);
      const meta = await fetch(
        `https://graph.facebook.com/${version}/${d.data.media_id}`,
        { headers: { authorization: `Bearer ${token}` } },
      );
      if (!meta.ok) return json({ error: "media_metadata_failed" }, 502);
      const m = await meta.json(),
        file = await fetch(m.url, {
          headers: { authorization: `Bearer ${token}` },
        });
      if (!file.ok) return json({ error: "media_download_failed" }, 502);
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (!bytes.length || bytes.length > 8 * 1024 * 1024)
        return json({ error: "document_too_large" }, 413);
      const mime = (
        file.headers.get("content-type") || d.data.mime_type || ""
      ).split(";")[0].toLowerCase();
      if (!["image/jpeg", "image/png", "application/pdf"].includes(mime)) {
        return json({ error: "unsupported_document_type" }, 415);
      }
      const extension = mime === "application/pdf"
        ? "pdf"
        : mime === "image/png"
        ? "png"
        : "jpg";
      const path = `${d.data.handyman_id}/${crypto.randomUUID()}-${
        safeFileName(d.data.file_name || `verification-document.${extension}`)
      }`;
      const archived = await s.storage.from("provider-verification").upload(
        path,
        bytes,
        { contentType: mime, upsert: false },
      );
      if (archived.error) throw archived.error;
      const saved = await s.from("handyman_verification_documents").update({
        storage_path: path,
        mime_type: mime,
        sha256: await sha256Bytes(bytes),
        byte_size: bytes.length,
        archived_at: new Date().toISOString(),
      }).eq("id", id).is("storage_path", null);
      if (saved.error) {
        await s.storage.from("provider-verification").remove([path]);
        throw saved.error;
      }
      return json({
        ok: true,
        mime_type: mime,
        file_name: d.data.file_name || "verification-document",
        data_base64: b64(bytes),
      });
    }
    if (action === "approve_verification" || action === "reject_verification") {
      const d = await s
        .from("handyman_verification_documents")
        .select("id,handyman_id,status,handymen(phone)")
        .eq("id", id)
        .single();
      if (d.error) throw d.error;
      if (d.data.status !== "pending")
        return json({ error: "verification_already_reviewed" }, 409);
      const approved = action === "approve_verification",
        notes =
          String(input?.notes ?? "")
            .trim()
            .slice(0, 1000) || null,
        now = new Date().toISOString();
      if (!approved && !notes)
        return json({ error: "rejection_reason_required" }, 400);
      const ud = await s
        .from("handyman_verification_documents")
        .update({
          status: approved ? "approved" : "rejected",
          review_notes: notes,
          reviewed_at: now,
        })
        .eq("id", id)
        .eq("status", "pending");
      if (ud.error) throw ud.error;
      const uh = await s
        .from("handymen")
        .update(
          approved
            ? {
                verification_status: "verified",
                verified_at: now,
                verification_notes: notes,
                updated_at: now,
              }
            : {
                verification_status: "rejected",
                verified_at: null,
                verification_notes: notes,
                availability_status: "offline",
                available_until: null,
                updated_at: now,
              },
        )
        .eq("id", d.data.handyman_id);
      if (uh.error) throw uh.error;
      if (approved) {
        const badge = await s
          .from("entitlements")
          .insert({
            handyman_id: d.data.handyman_id,
            entitlement_type: "verified_badge",
            source_type: "admin",
            source_id: id,
            status: "active",
          });
        if (badge.error && badge.error.code !== "23505") throw badge.error;
      }
      const provider = d.data.handymen as any,
        phone = Array.isArray(provider) ? provider[0]?.phone : provider?.phone;
      if (phone) {
        const body = approved
          ? "Your HandyConnect identity verification has been approved. You can now set your availability and receive matching job opportunities."
          : `Your HandyConnect identity verification needs attention. Please open Provider profile → Verification and submit a new document.${notes ? ` Reason: ${notes}` : ""}`;
        const notice = await s
          .from("notification_outbox")
          .insert({
            recipient_phone: phone,
            kind: approved ? "verification_approved" : "verification_rejected",
            body,
            payload: { verification_document_id: id },
            dedupe_key: `verification-review:${id}:${approved ? "approved" : "rejected"}`,
          });
        if (notice.error && notice.error.code !== "23505") throw notice.error;
      }
      return json({ ok: true, status: approved ? "verified" : "rejected" });
    }
    if (action === "verify") {
      const q = await s
        .from("handymen")
        .update({
          verification_status: "verified",
          verified_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);
      if (q.error) throw q.error;
      return json({ ok: true });
    }
    if (action === "suspend") {
      const q = await s
        .from("handymen")
        .update({
          status: "suspended",
          availability_status: "offline",
          available_until: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);
      if (q.error) throw q.error;
      return json({ ok: true });
    }
    if (action === "activate") {
      const q = await s
        .from("handymen")
        .update({ status: "active", updated_at: new Date().toISOString() })
        .eq("id", id);
      if (q.error) throw q.error;
      return json({ ok: true });
    }
    if (action === "resolve_report" || action === "dismiss_report") {
      const q = await s.rpc("resolve_user_report", {
        p_report_id: id,
        p_status: action === "resolve_report" ? "resolved" : "dismissed",
        p_resolution_notes: "Updated from operations dashboard",
        p_resolved_by: "dashboard",
      });
      if (q.error) throw q.error;
      return json({ ok: true });
    }
    return json({ error: "unknown_action" }, 400);
  } catch (e) {
    console.error(e);
    return json({ error: "admin_api_failed" }, 500);
  }
});
