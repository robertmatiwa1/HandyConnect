function env(name: string) {
  return Deno.env.get(name)?.trim() ?? "";
}

function supabaseSecretKey() {
  const raw = env("SUPABASE_SECRET_KEYS");
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (typeof parsed.default === "string" && parsed.default) {
        return parsed.default;
      }
    } catch {
      // Fall back to the legacy service-role key below.
    }
  }
  return env("SUPABASE_SERVICE_ROLE_KEY");
}

function entryPilotEnabled(id: string) {
  const pilots = env("ENTRY_ROUTER_PILOT_IDS")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return pilots.includes("*") || pilots.includes(id);
}

function hex(bytes: ArrayBuffer) {
  return [...new Uint8Array(bytes)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function equalConstantTime(left: string, right: string) {
  if (left.length !== right.length) return false;
  let result = 0;
  for (let index = 0; index < left.length; index++) {
    result |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return result === 0;
}

async function validMetaSignature(
  rawBody: string,
  signatureHeader: string | null,
) {
  const appSecret = env("META_APP_SECRET");
  if (!appSecret || !signatureHeader?.startsWith("sha256=")) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(appSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(rawBody),
  );
  return equalConstantTime(`sha256=${hex(digest)}`, signatureHeader);
}

type Destination = { type: "phone" | "bsuid"; value: string };

function extractUserIdUpdate(payload: any) {
  const value = payload?.entry?.[0]?.changes?.[0]?.value;
  const update = value?.user_id_update?.[0];
  if (!update?.user_id?.current) return null;

  return {
    phone: update.wa_id ?? value?.contacts?.[0]?.wa_id ?? null,
    previous_bsuid: update.user_id.previous ?? null,
    bsuid: update.user_id.current,
    parent_bsuid:
      update.parent_user_id?.current ??
      value?.contacts?.[0]?.parent_user_id ??
      null,
    profile_name: value?.contacts?.[0]?.profile?.name ?? null,
  };
}

function extractInbound(payload: any) {
  const value = payload?.entry?.[0]?.changes?.[0]?.value;
  const message = value?.messages?.[0];
  if (!message?.id) return null;

  const contact = value?.contacts?.[0] ?? {};
  const phone = message.from ?? contact.wa_id ?? null;
  const bsuid = message.from_user_id ?? contact.user_id ?? null;
  const parentBsuid =
    message.from_parent_user_id ?? contact.parent_user_id ?? null;
  const username = contact.profile?.username ?? null;
  const profileName = contact.profile?.name ?? null;
  if (!phone && !bsuid) return null;

  let text = "";
  let media: any = null;
  let sharedPhone: string | null = null;

  if (message.type === "text") {
    text = message.text?.body ?? "";
  } else if (message.type === "button") {
    text = message.button?.payload ?? message.button?.text ?? "";
  } else if (message.type === "interactive") {
    text =
      message.interactive?.button_reply?.id ??
      message.interactive?.button_reply?.title ??
      message.interactive?.list_reply?.id ??
      message.interactive?.list_reply?.title ??
      "";
  } else if (message.type === "image" && message.image?.id) {
    text = message.image.caption?.trim() || "H_MEDIA_UPLOAD";
    media = {
      id: message.image.id,
      type: "image",
      mime_type: message.image.mime_type,
    };
  } else if (message.type === "document" && message.document?.id) {
    text = message.document.caption?.trim() || "H_MEDIA_UPLOAD";
    media = {
      id: message.document.id,
      type: "document",
      mime_type: message.document.mime_type,
      filename: message.document.filename,
    };
  } else if (message.type === "contacts") {
    sharedPhone =
      message.contacts?.[0]?.phones?.[0]?.wa_id ??
      message.contacts?.[0]?.phones?.[0]?.phone ??
      null;
    text = "HOME";
  }

  if (!text.trim()) return null;
  return {
    phone,
    bsuid,
    parentBsuid,
    username,
    profileName,
    sharedPhone,
    messageId: message.id,
    messageType: message.type,
    messageTimestamp: Number(message.timestamp || 0),
    text: text.trim(),
    media,
  };
}

async function graphSend(destination: Destination, body: any) {
  const token = env("WHATSAPP_ACCESS_TOKEN");
  const phoneNumberId = env("WHATSAPP_PHONE_NUMBER_ID");
  const graphVersion = env("WHATSAPP_GRAPH_VERSION");
  if (!token || !phoneNumberId || !graphVersion) return false;

  const recipient =
    destination.type === "phone"
      ? { to: destination.value }
      : { recipient: destination.value };
  const response = await fetch(
    `https://graph.facebook.com/${graphVersion}/${phoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        ...recipient,
        ...body,
      }),
    },
  );

  if (!response.ok) {
    console.error(
      "WhatsApp send failed",
      response.status,
      await response.text(),
    );
    return false;
  }
  return true;
}

async function requestContact(destination: Destination) {
  return graphSend(destination, {
    type: "interactive",
    interactive: {
      type: "request_contact_info",
      body: {
        text: "Share the WhatsApp phone number for this account so we can keep your jobs and provider profile connected.",
      },
      action: { name: "request_contact_info" },
    },
  });
}

async function sendPayload(destination: Destination, reply: string, ui?: any) {
  const full = String(reply ?? "").trim();
  const prompt = String(ui?.body ?? "").trim();

  if (
    ui?.type === "buttons" &&
    Array.isArray(ui.buttons) &&
    ui.buttons.length
  ) {
    if (full && prompt && full !== prompt) {
      await graphSend(destination, { type: "text", text: { body: full } });
    }
    const bodyText = prompt || full;
    return graphSend(destination, {
      type: "interactive",
      interactive: {
        type: "button",
        body: { text: bodyText },
        action: {
          buttons: ui.buttons.slice(0, 3).map((button: any) => ({
            type: "reply",
            reply: {
              id: String(button.id).slice(0, 256),
              title: String(button.title).slice(0, 20),
            },
          })),
        },
      },
    });
  }

  if (ui?.type === "list" && Array.isArray(ui.rows) && ui.rows.length) {
    if (full && prompt && full !== prompt) {
      await graphSend(destination, { type: "text", text: { body: full } });
    }
    const bodyText = prompt || full;
    return graphSend(destination, {
      type: "interactive",
      interactive: {
        type: "list",
        body: { text: bodyText },
        action: {
          button: String(ui.button || "Choose").slice(0, 20),
          sections: [
            {
              title: "Options",
              rows: ui.rows.slice(0, 10).map((row: any) => ({
                id: String(row.id).slice(0, 200),
                title: String(row.title).slice(0, 24),
                description: row.description
                  ? String(row.description).slice(0, 72)
                  : undefined,
              })),
            },
          ],
        },
      },
    });
  }

  if (!full) return false;
  return graphSend(destination, { type: "text", text: { body: full } });
}

async function sendMedia(destination: Destination, media: any) {
  if (
    !media ||
    !["image", "document"].includes(media.type) ||
    (!media.id && !media.link)
  )
    return false;

  const source = media.id
    ? { id: String(media.id) }
    : { link: String(media.link) };
  if (media.type === "image") {
    return graphSend(destination, {
      type: "image",
      image: {
        ...source,
        caption: String(media.caption || "Customer job photo").slice(0, 1024),
      },
    });
  }
  return graphSend(destination, {
    type: "document",
    document: {
      ...source,
      filename: media.file_name
        ? String(media.file_name).slice(0, 240)
        : "job-attachment",
    },
  });
}

async function rawCall(url: string, secret: string, target: string, body: any) {
  const response = await fetch(`${url}/functions/v1/${target}`, {
    method: "POST",
    headers: { apikey: secret, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    console.error(`${target} failed`, response.status, await response.text());
    return null;
  }
  return await response.json();
}

async function callRouter(
  url: string,
  secret: string,
  target: string,
  inbound: any,
) {
  return rawCall(url, secret, target, {
    channel: "whatsapp",
    external_user_id: inbound.from,
    external_message_id: inbound.messageId,
    message_type: inbound.message_type,
    message_timestamp: inbound.message_timestamp,
    message: inbound.text,
    media: inbound.media,
  });
}

async function deliver(inbound: any, result: any) {
  if (result?.reply && !result?.duplicate) {
    if (result.media) {
      await sendPayload(inbound.destination, result.reply);
      await sendMedia(inbound.destination, result.media);
      if (result.ui) {
        await sendPayload(
          inbound.destination,
          result.ui.body || "Choose an option.",
          result.ui,
        );
      }
    } else {
      await sendPayload(inbound.destination, result.reply, result.ui);
    }
  }

  if (Array.isArray(result?.outbound)) {
    for (const item of result.outbound) {
      if (!item?.reply) continue;
      const destination: Destination | null = item.bsuid
        ? { type: "bsuid", value: String(item.bsuid) }
        : item.to
          ? { type: "phone", value: String(item.to) }
          : null;
      if (!destination) continue;

      if (item.media) {
        await sendPayload(destination, item.reply);
        await sendMedia(destination, item.media);
        if (item.ui) {
          await sendPayload(
            destination,
            item.ui.body || "Choose an option.",
            item.ui,
          );
        }
      } else {
        await sendPayload(destination, item.reply, item.ui);
      }
    }
  }
}

Deno.serve(async (request) => {
  if (request.method === "GET") {
    const url = new URL(request.url);
    if (
      url.searchParams.get("hub.mode") === "subscribe" &&
      url.searchParams.get("hub.verify_token") === env("WHATSAPP_VERIFY_TOKEN")
    ) {
      return new Response(url.searchParams.get("hub.challenge") ?? "", {
        status: 200,
      });
    }
    return new Response("Forbidden", { status: 403 });
  }

  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const rawBody = await request.text();
  if (
    !(await validMetaSignature(
      rawBody,
      request.headers.get("x-hub-signature-256"),
    ))
  ) {
    return new Response("Invalid signature", { status: 401 });
  }

  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new Response("Bad Request", { status: 400 });
  }

  const secret = supabaseSecretKey();
  const supabaseUrl = env("SUPABASE_URL");
  if (!secret || !supabaseUrl) {
    return new Response("Server configuration error", { status: 500 });
  }

  const rotated = extractUserIdUpdate(payload);
  if (rotated) {
    await rawCall(supabaseUrl, secret, "whatsapp-identity-router", rotated);
    return new Response("EVENT_RECEIVED", { status: 200 });
  }

  const raw = extractInbound(payload);
  if (!raw) return new Response("EVENT_RECEIVED", { status: 200 });

  const identity = await rawCall(
    supabaseUrl,
    secret,
    "whatsapp-identity-router",
    {
      phone: raw.phone,
      bsuid: raw.bsuid,
      parent_bsuid: raw.parentBsuid,
      username: raw.username,
      profile_name: raw.profileName,
      shared_phone: raw.sharedPhone,
    },
  );
  if (!identity?.ok) {
    return new Response("Identity resolution failed", { status: 500 });
  }

  const destination: Destination = identity.destination;
  if (identity.requires_contact && !raw.sharedPhone) {
    await requestContact(destination);
    return new Response("EVENT_RECEIVED", { status: 200 });
  }

  const inbound = {
    from: identity.effective_user_id,
    destination,
    messageId: raw.messageId,
    message_type: raw.messageType,
    message_timestamp: raw.messageTimestamp,
    text: raw.text,
    media: raw.media,
    bsuid: identity.bsuid,
  };

  // The canonical front door is enabled per identity. When it declines the
  // message, the existing production path remains unchanged.
  if (entryPilotEnabled(inbound.from)) {
    const entry = await callRouter(
      supabaseUrl,
      secret,
      "entry-router",
      inbound,
    );
    if (entry?.handled) {
      await deliver(inbound, entry);
      return new Response("EVENT_RECEIVED", { status: 200 });
    }
  }

  const address = await callRouter(
    supabaseUrl,
    secret,
    "address-privacy-router",
    inbound,
  );
  if (address?.handled) {
    await deliver(inbound, address);
    return new Response("EVENT_RECEIVED", { status: 200 });
  }

  const intake = await callRouter(
    supabaseUrl,
    secret,
    "job-intake-router",
    inbound,
  );
  if (intake?.handled) {
    await deliver(inbound, intake);
    return new Response("EVENT_RECEIVED", { status: 200 });
  }

  if (inbound.text.startsWith("EVIDENCE_") || inbound.media) {
    const evidence = await callRouter(
      supabaseUrl,
      secret,
      "evidence-router",
      inbound,
    );
    if (evidence?.handled) {
      await deliver(inbound, evidence);
      return new Response("EVENT_RECEIVED", { status: 200 });
    }
  }

  if (!inbound.media) {
    const profile = await callRouter(
      supabaseUrl,
      secret,
      "profile-router",
      inbound,
    );
    if (profile?.reply) {
      await deliver(inbound, profile);
      return new Response("EVENT_RECEIVED", { status: 200 });
    }
  }

  const target = inbound.text.startsWith("ETA:")
    ? "eta-router"
    : inbound.text.startsWith("LATE_REPLACE:")
      ? "late-arrival-router"
      : "marketplace-router";
  const result = await callRouter(supabaseUrl, secret, target, inbound);
  if (result) await deliver(inbound, result);

  return new Response("EVENT_RECEIVED", { status: 200 });
});
