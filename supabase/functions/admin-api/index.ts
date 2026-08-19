const ORIGIN = "https://robertmatiwa1.github.io";

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: headers() });
  }
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const origin = req.headers.get("origin") ?? "";
  if (origin && origin !== ORIGIN) return json({ error: "origin_not_allowed" }, 403);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  if (String(body?.action ?? "") === "verify") {
    return json({
      error: "verification_bypass_removed",
      message: "Handymen can only become verified from an approved verification document.",
    }, 410);
  }

  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const key = (() => {
    const raw = Deno.env.get("SUPABASE_SECRET_KEYS") ?? "";
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (typeof parsed.default === "string") return parsed.default;
      } catch {}
    }
    return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  })();

  if (!url || !key) return json({ error: "service_unavailable" }, 503);

  const upstream = await fetch(`${url}/functions/v1/admin-api-legacy`, {
    method: "POST",
    headers: {
      apikey: key,
      "content-type": "application/json",
      "x-admin-password": req.headers.get("x-admin-password") ?? "",
      ...(origin ? { origin } : {}),
    },
    body: JSON.stringify(body),
  });

  return new Response(await upstream.text(), {
    status: upstream.status,
    headers: headers(),
  });
});
