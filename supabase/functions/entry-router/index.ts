import { createClient } from "@supabase/supabase-js";
import { type AccountState, decideEntry } from "../_shared/entry-contract.ts";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8" } });

function secretKey() {
  const raw = Deno.env.get("SUPABASE_SECRET_KEYS") ?? "";
  try { const parsed = JSON.parse(raw); if (typeof parsed.default === "string") return parsed.default; } catch { /* legacy fallback */ }
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
}

function pilotEnabled(id: string) {
  const pilots = (Deno.env.get("ENTRY_ROUTER_PILOT_IDS") ?? "").split(",").map((value) => value.trim()).filter(Boolean);
  return pilots.includes("*") || pilots.includes(id);
}

async function call(url: string, key: string, target: string, input: unknown) {
  const response = await fetch(`${url}/functions/v1/${target}`, { method: "POST", headers: { apikey: key, "content-type": "application/json" }, body: JSON.stringify(input) });
  return { status: response.status, body: await response.json().catch(() => ({ handled: false })) };
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return json({ handled: false }, 405);
  const key = secretKey();
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  if (!key || !url || request.headers.get("apikey") !== key) return json({ handled: false }, 401);
  const input = await request.json().catch(() => null);
  const id = String(input?.external_user_id ?? "").trim();
  const message = String(input?.message ?? "").trim();
  if (!id || !message || !pilotEnabled(id)) return json({ handled: false, pilot: false });

  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const [customer, provider, preference, session] = await Promise.all([
    supabase.from("customers").select("id,registration_status,terms_accepted_at").eq("phone", id).maybeSingle(),
    supabase.from("handymen").select("id,status,registration_status,terms_accepted_at,verification_status").eq("phone", id).maybeSingle(),
    supabase.from("whatsapp_role_preferences").select("active_role").eq("external_user_id", id).maybeSingle(),
    supabase.from("conversation_sessions").select("flow,state").eq("channel", input.channel ?? "whatsapp").eq("external_user_id", id).maybeSingle(),
  ]);
  for (const result of [customer, provider, preference, session]) if (result.error) throw result.error;

  const customerState = customer.data?.registration_status === "active" && customer.data?.terms_accepted_at ? "active" : customer.data ? "onboarding" : "none";
  const providerState = provider.data?.verification_status === "verified" ? "verified" : provider.data?.registration_status === "active" && provider.data?.terms_accepted_at ? "active" : provider.data ? "onboarding" : "none";
  const state: AccountState = {
    restricted: provider.data?.status === "suspended",
    customer: customerState,
    provider: providerState,
    activeRole: preference.data?.active_role ?? null,
    sessionFlow: session.data?.flow ?? null,
    sessionState: session.data?.state ?? null,
  };
  const decision = decideEntry(state, message);

  if (decision.kind === "restricted") return json({ handled: true, reply: "This account is restricted. Contact HandyConnect support for review." });
  if (decision.kind === "guest_home") return json({ handled: true, reply: "Welcome to HandyConnect 👋\nExplore services freely. You only confirm your details when you submit a request.", ui: { type: "list", body: "What would you like to do?", button: "Explore", rows: [
    { id: "CUSTOMER:REQUEST", title: "Request a handyman", description: "Describe a job without registering first" },
    { id: "NAV:SERVICES", title: "Browse services", description: "See the home services available" },
    { id: "ROLE:PROVIDER", title: "Offer services", description: "Apply as a service provider" },
    { id: "NAV:HELP", title: "How it works", description: "Learn how matching works" },
  ] } });

  if (message === "NAV:SERVICES") {
    const skills = await supabase.from("skills").select("name").eq("active", true).order("name").limit(20);
    if (skills.error) throw skills.error;
    const names: string[] = (skills.data ?? []).map((item: { name: string }) => item.name);
    return json({ handled: true, reply: names.length ? `HandyConnect currently supports:\n\n${names.map((name) => `• ${name}`).join("\n")}\n\nYou can explore without registering. We’ll ask for your name and consent only when you submit a request.` : "Service browsing is temporarily unavailable. You can still describe the home repair you need.", ui: { type: "buttons", body: "Ready when you are", buttons: [
      { id: "CUSTOMER:REQUEST", title: "Request handyman" }, { id: "NAV:HELP", title: "How it works" }, { id: "NAV:HOME", title: "Home" },
    ] } });
  }
  if (decision.kind === "help") return json({ handled: true, reply: "HandyConnect helps customers find suitable, verified local handymen. Providers can apply, verify their identity and receive relevant work.", ui: { type: "buttons", body: "What would you like to do?", buttons: [
    { id: "ROLE:CUSTOMER", title: "Find a handyman" }, { id: "ROLE:PROVIDER", title: "Offer services" }, { id: "NAV:HOME", title: "Home" },
  ] } });
  if (decision.kind === "acknowledgement") return json({ handled: true, reply: "👍" });

  // Once job intake owns a session, preserve the user's exact message and let
  // that router advance its state. Never restart or reinterpret the draft.
  if (decision.kind === "resume_job_intake") {
    const delegated = await call(url, key, "job-intake-router", input);
    return json({ ...delegated.body, handled: true, entry_decision: decision.kind }, delegated.status);
  }

  if (decision.kind === "customer_request" && message !== "REQUEST_HELP" && message !== "CUSTOMER:REQUEST" && message !== "ROLE:CUSTOMER") {
    const started = await call(url, key, "job-intake-router", { ...input, message: "REQUEST_HELP" });
    if (started.status >= 300) return json({ ...started.body, handled: true }, started.status);
    const continued = await call(url, key, "job-intake-router", { ...input, message });
    return json({ ...continued.body, handled: true, entry_decision: decision.kind }, continued.status);
  }

  const roleMessage = decision.kind === "customer_home" ? "HOME"
    : decision.kind === "provider_home" ? "HANDYMAN_HOME"
    : decision.kind === "customer_request" ? "REQUEST_HELP"
    : decision.kind === "provider_application" ? "ROLE_USE_HANDYMAN"
    : decision.kind === "resume_onboarding" && decision.role !== "handyman" ? "ROLE_USE_CUSTOMER"
    : message;
  const target = decision.kind === "customer_home" ? "customer-home-router"
    : decision.kind === "provider_home" ? "handyman-router"
    : decision.kind === "customer_request" ? "job-intake-router"
    : decision.kind === "resume_onboarding" && decision.role === "handyman" ? "conversation-engine"
    : ["provider_application", "resume_onboarding"].includes(decision.kind) ? "role-router"
    : "marketplace-router";
  const delegated = await call(url, key, target, { ...input, message: roleMessage });
  return json({ ...delegated.body, handled: true, entry_decision: decision.kind }, delegated.status);
});
