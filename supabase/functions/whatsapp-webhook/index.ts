function env(name: string) { return Deno.env.get(name)?.trim() ?? ""; }

function supabaseSecretKey() {
  const raw = env("SUPABASE_SECRET_KEYS");
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (typeof parsed.default === "string" && parsed.default) return parsed.default;
    } catch (_) {}
  }
  return env("SUPABASE_SERVICE_ROLE_KEY");
}

function hex(bytes: ArrayBuffer) {
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function equalConstantTime(a: string, b: string) {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
}

async function validMetaSignature(rawBody: string, signatureHeader: string | null) {
  const appSecret = env("META_APP_SECRET");
  if (!appSecret || !signatureHeader?.startsWith("sha256=")) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(appSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
  return equalConstantTime(`sha256=${hex(digest)}`, signatureHeader);
}

function extractInbound(payload: any) {
  const value = payload?.entry?.[0]?.changes?.[0]?.value;
  const message = value?.messages?.[0];
  if (!message?.from || !message?.id) return null;

  let text = "";
  if (message.type === "text") text = message.text?.body ?? "";
  else if (message.type === "button") text = message.button?.text ?? message.button?.payload ?? "";
  else if (message.type === "interactive") {
    text = message.interactive?.button_reply?.title ??
      message.interactive?.button_reply?.id ??
      message.interactive?.list_reply?.title ??
      message.interactive?.list_reply?.id ?? "";
  }
  if (!text.trim()) return null;
  return { from: message.from, messageId: message.id, text: text.trim() };
}

async function sendText(to: string, body: string) {
  const token = env("WHATSAPP_ACCESS_TOKEN");
  const phoneNumberId = env("WHATSAPP_PHONE_NUMBER_ID");
  const graphVersion = env("WHATSAPP_GRAPH_VERSION");
  if (!token || !phoneNumberId || !graphVersion) {
    console.error("WhatsApp outbound secrets are not fully configured");
    return;
  }
  const response = await fetch(`https://graph.facebook.com/${graphVersion}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: { "authorization": `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", to, type: "text", text: { body } }),
  });
  if (!response.ok) console.error("WhatsApp send failed", response.status, await response.text());
}

Deno.serve(async (req) => {
  if (req.method === "GET") {
    const url = new URL(req.url);
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge") ?? "";
    if (mode === "subscribe" && token && token === env("WHATSAPP_VERIFY_TOKEN")) {
      return new Response(challenge, { status: 200 });
    }
    return new Response("Forbidden", { status: 403 });
  }

  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  const rawBody = await req.text();
  if (!(await validMetaSignature(rawBody, req.headers.get("x-hub-signature-256")))) {
    return new Response("Invalid signature", { status: 401 });
  }

  let payload: any;
  try { payload = JSON.parse(rawBody); }
  catch { return new Response("Bad Request", { status: 400 }); }

  const inbound = extractInbound(payload);
  if (!inbound) return new Response("EVENT_RECEIVED", { status: 200 });

  const secret = supabaseSecretKey();
  const supabaseUrl = env("SUPABASE_URL");
  if (!secret || !supabaseUrl) return new Response("Server configuration error", { status: 500 });

  const engine = await fetch(`${supabaseUrl}/functions/v1/conversation-engine`, {
    method: "POST",
    headers: { "apikey": secret, "content-type": "application/json" },
    body: JSON.stringify({
      channel: "whatsapp",
      external_user_id: inbound.from,
      external_message_id: inbound.messageId,
      message: inbound.text,
    }),
  });

  if (!engine.ok) {
    console.error("Conversation engine failed", engine.status, await engine.text());
    return new Response("EVENT_RECEIVED", { status: 200 });
  }

  const result = await engine.json();
  if (result?.reply && !result?.duplicate) await sendText(inbound.from, result.reply);
  return new Response("EVENT_RECEIVED", { status: 200 });
});
