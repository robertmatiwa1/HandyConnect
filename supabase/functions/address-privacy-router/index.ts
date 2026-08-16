import { createClient } from "@supabase/supabase-js";

type Incoming = {
  channel?: string;
  external_user_id?: string;
  external_message_id?: string;
  message?: string;
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });

function secretKey() {
  const raw = Deno.env.get("SUPABASE_SECRET_KEYS") ?? "";
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (typeof parsed.default === "string") return parsed.default;
    } catch {}
  }
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
}

const title = (s: string) => s.trim().replace(/\s+/g, " ").replace(/\b\w/g, c => c.toUpperCase());
function parseLocation(text: string) {
  const raw = text.trim().replace(/\s+/g, " ");
  if (!raw) return null;
  const comma = raw.split(",").map(x => x.trim()).filter(Boolean);
  if (comma.length >= 2) return { suburb: title(comma[0]), city: title(comma[1].replace(/^capetown$/i,"Cape Town")), province: comma[2] ? title(comma[2]) : null };

  const normalized = raw.toLowerCase().replace(/capetown/g, "cape town");
  const cities = ["cape town","johannesburg","pretoria","durban","gqeberha","port elizabeth","east london","bloemfontein","polokwane","mbombela","kimberley","potchefstroom","stellenbosch","paarl"];
  for (const city of cities.sort((a,b)=>b.length-a.length)) {
    if (normalized === city) return null;
    if (normalized.endsWith(" " + city)) {
      const suburb = normalized.slice(0, -(city.length + 1)).trim();
      if (suburb.length >= 2) return { suburb: title(suburb), city: title(city), province: null };
    }
  }
  const capeTownSuburbs = new Set(["claremont","constantia","langa","bellville","pinelands","rondebosch","newlands","observatory","woodstock","salt river","plumstead","wynberg","kenilworth","mitchells plain","khayelitsha","gugulethu","nyanga","parow","goodwood","brackenfell","durbanville","table view","milnerton","century city","sea point","green point","camps bay","hout bay","muizenberg","fish hoek","somerset west","strand"]);
  if (capeTownSuburbs.has(normalized)) return { suburb: title(normalized), city: "Cape Town", province: "Western Cape" };
  return null;
}

const urgencyUi = {
  type: "buttons",
  body: "When do you need help?",
  buttons: [
    { id: "JI_URGENT", title: "As soon as possible" },
    { id: "JI_TODAY", title: "Today" },
    { id: "JI_FLEXIBLE", title: "I'm flexible" },
  ],
};

async function call(url: string, key: string, target: string, input: Incoming) {
  const response = await fetch(`${url}/functions/v1/${target}`, {
    method: "POST",
    headers: { apikey: key, "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) return { handled: false };
  return await response.json();
}

async function updateSession(supabase: any, id: string, values: Record<string, unknown>) {
  const result = await supabase.from("conversation_sessions").update(values).eq("id", id);
  if (result.error) throw result.error;
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const key = secretKey();
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  if (!key || !url || request.headers.get("apikey") !== key) return json({ error: "unauthorized" }, 401);
  let input: Incoming;
  try { input = await request.json(); } catch { return json({ error: "invalid_json" }, 400); }
  const phone = input.external_user_id?.trim();
  const message = input.message?.trim() ?? "";
  const channel = input.channel ?? "whatsapp";
  if (!phone) return json({ handled: false });
  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  try {
    if (input.external_message_id) {
      const claim = await supabase.from("whatsapp_inbound_events").insert({ message_id: input.external_message_id });
      if (claim.error) {
        if (claim.error.code === "23505") return json({ handled: true, duplicate: true });
        throw claim.error;
      }
    }
    const roleResult = await call(url, key, "role-router", input);
    if (roleResult?.handled) {
      if (roleResult.delegate) {
        const delegated = await call(url, key, roleResult.delegate, { ...input, message: roleResult.delegate_message ?? input.message });
        return json({ ...delegated, handled: true });
      }
      return json(roleResult);
    }
    const sessionResult = await supabase.from("conversation_sessions").select("id,state,context").eq("channel", channel).eq("external_user_id", phone).maybeSingle();
    if (sessionResult.error) throw sessionResult.error;
    const session = sessionResult.data;
    const state = String(session?.state ?? "");
    const customerNavigation = ["MY_JOBS","CUSTOMER_JOBS","CUST_MORE","CUST_PROFILE","CUST_ADDRESSES","CUST_HELP"].includes(message) || message.startsWith("CJOB:") || message.startsWith("CSTALE:");
    if (customerNavigation) {
      if (session?.id && state !== "ready") {
        const cleared = await supabase.from("conversation_sessions").update({ flow: "ready", state: "ready", context: {}, status: "active", updated_at: new Date().toISOString() }).eq("id", session.id);
        if (cleared.error) throw cleared.error;
      }
      const customerHome = await call(url, key, "customer-home-router", input);
      if (customerHome?.handled) return json(customerHome);
    }
    if (message === "REQUEST_HELP" || message === "NEW_REQUEST") {
      if (session?.id && state !== "ready") {
        const cleared = await supabase.from("conversation_sessions").update({ flow: "ready", state: "ready", context: {}, status: "active", updated_at: new Date().toISOString() }).eq("id", session.id);
        if (cleared.error) throw cleared.error;
      }
      return json(await call(url, key, "duplicate-job-router", { ...input, message: "REQUEST_HELP" }));
    }
    if (state.startsWith("duplicate_")) return json(await call(url, key, "duplicate-job-router", input));
    if (["ji_description","ji_service_confirm","ji_urgency","ji_time","ji_photo_choice","ji_photo","ji_photo_confirm","ji_review","ji_edit","ji_post_photo","ji_consent","ji_customer_name"].includes(state)) {
      return json(await call(url, key, "job-intake-router", input));
    }
    if (state === "ji_location") {
      const location = parseLocation(message);
      if (!location) return json({ handled: true, reply: "Tell me the suburb and city. You can type it naturally, for example ‘Claremont Cape Town’ or ‘Langa, Cape Town’." });
      const context = { ...(session.context ?? {}), ...location };
      if (context.editing === "location") {
        const reviewed = { ...context, editing: null };
        await updateSession(supabase, session.id, { state: "ji_review", context: reviewed });
        return json(await call(url, key, "job-intake-router", { ...input, message: "JI_SHOW_REVIEW" }));
      }
      await updateSession(supabase, session.id, { state: "ji_urgency", context });
      return json({ handled: true, reply: urgencyUi.body, ui: urgencyUi });
    }
    if (message === "H_JOBS" || message.startsWith("HJOBV:")) {
      const handymanJobs = await call(url, key, "handyman-job-history-router", input);
      if (handymanJobs?.handled) return json(handymanJobs);
    }
    const customerCommand = ["HOME","MY_JOBS","CUSTOMER_JOBS","CUST_MORE","CUST_PROFILE","CUST_ADDRESSES","CUST_HELP"].includes(message) || message.startsWith("CJOB:") || message.startsWith("CSTALE:") || message.startsWith("EDIT_JOB:") || message.startsWith("EDITLOC:") || message.startsWith("EDITSVC:") || message.startsWith("ESVCPAGE:") || message.startsWith("ESKILL:") || state === "customer_name" || state === "router_edit_location";
    if (customerCommand) {
      const customerHome = await call(url, key, "customer-home-router", input);
      if (customerHome?.handled) return json(customerHome);
    }
    return json({ handled: false });
  } catch (error) {
    console.error(error);
    return json({ error: "address_privacy_router_failed" }, 500);
  }
});
