export type AccountState = {
  restricted: boolean;
  customer: "none" | "onboarding" | "active";
  provider: "none" | "onboarding" | "active" | "verified";
  activeRole: "customer" | "handyman" | null;
  sessionFlow: string | null;
  sessionState: string | null;
};

export type EntryDecision = {
  kind:
    | "guest_home"
    | "customer_home"
    | "provider_home"
    | "customer_request"
    | "provider_application"
    | "resume_onboarding"
    | "resume_job_intake"
    | "help"
    | "acknowledgement"
    | "restricted"
    | "delegate";
  role?: "customer" | "handyman";
  clearSession?: boolean;
};

const normalized = (value: string) => value.trim().toLowerCase();

export function commandId(message: string): string | null {
  const raw = message.trim();
  if (["home", "dashboard", "menu"].includes(normalized(raw))) return "NAV:HOME";
  if (/^(NAV|ROLE|CUSTOMER|PROVIDER|ONBOARDING|JOB):/.test(raw)) return raw;
  const legacy: Record<string, string> = {
    HOME: "NAV:HOME",
    HANDYMAN_HOME: "NAV:HOME",
    MY_JOBS: "CUSTOMER:JOBS",
    CUSTOMER_JOBS: "CUSTOMER:JOBS",
    REQUEST_HELP: "CUSTOMER:REQUEST",
    NEW_REQUEST: "CUSTOMER:REQUEST",
    ROLE_USE_CUSTOMER: "ROLE:CUSTOMER",
    ROLE_USE_HANDYMAN: "ROLE:PROVIDER",
    SWITCH_CUSTOMER: "ROLE:CUSTOMER",
    SWITCH_HANDYMAN: "ROLE:PROVIDER",
    CUST_HELP: "NAV:HELP",
  };
  return legacy[raw] ?? null;
}

function naturalIntent(message: string) {
  const text = normalized(message);
  if (["hi", "hello", "hey", "menu", "start"].includes(text)) return "greeting";
  if (["cool", "ok", "okay", "thanks", "thank you", "got it", "great"].includes(text)) return "acknowledgement";
  if (["help", "how does it work", "how it works"].includes(text)) return "help";
  if (/\b(job|work|provider|handyman|electrician|plumber|carpenter)\b/.test(text) && /\b(offer|provide|looking for|need work|register|join)\b/.test(text)) return "provider";
  if (/\b(need|hire|find|fix|repair|broken|leak|leaking|install)\b/.test(text)) return "customer";
  return "unknown";
}

export function decideEntry(state: AccountState, message: string): EntryDecision {
  if (state.restricted) return { kind: "restricted" };

  const command = commandId(message);
  if (command === "NAV:HELP") return { kind: "help", role: state.activeRole ?? undefined };
  if (command === "ROLE:CUSTOMER") {
    return state.customer === "active"
      ? { kind: "customer_home", role: "customer", clearSession: true }
      : { kind: "customer_request", role: "customer", clearSession: true };
  }
  if (command === "ROLE:PROVIDER") {
    return ["active", "verified"].includes(state.provider)
      ? { kind: "provider_home", role: "handyman", clearSession: true }
      : { kind: "provider_application", role: "handyman", clearSession: true };
  }
  if (command === "CUSTOMER:REQUEST") return { kind: "customer_request", role: "customer", clearSession: true };
  if (command === "NAV:HOME") {
    if (state.activeRole === "handyman" && ["active", "verified"].includes(state.provider)) return { kind: "provider_home", role: "handyman", clearSession: true };
    if (state.customer === "active") return { kind: "customer_home", role: "customer", clearSession: true };
    if (state.provider === "onboarding") return { kind: "resume_onboarding", role: "handyman", clearSession: true };
    if (state.customer === "onboarding") return { kind: "resume_onboarding", role: "customer", clearSession: true };
    return { kind: "guest_home", clearSession: true };
  }

  // Active workflows own every answer until they complete or the user explicitly
  // navigates home/switches role. This prevents generic intent routing from
  // stealing location, timing, name, photo and consent answers.
  if (state.sessionFlow === "job_intake" && state.sessionState?.startsWith("ji_")) {
    return { kind: "resume_job_intake", role: "customer" };
  }
  if (state.sessionFlow === "handyman_onboarding" && state.sessionState && state.sessionState !== "ready") {
    return { kind: "resume_onboarding", role: "handyman" };
  }

  if (command || /^[A-Z][A-Z0-9_]+(?::.+)?$/.test(message.trim())) return { kind: "delegate", role: state.activeRole ?? undefined };

  const intent = naturalIntent(message);
  if (intent === "help") return { kind: "help", role: state.activeRole ?? undefined };
  if (intent === "acknowledgement") return { kind: "acknowledgement", role: state.activeRole ?? undefined };
  if (intent === "customer") return { kind: "customer_request", role: "customer" };
  if (intent === "provider") return { kind: "provider_application", role: "handyman" };
  if (intent === "greeting") {
    if (state.sessionFlow === "job_intake" && state.sessionState?.startsWith("ji_")) return { kind: "resume_job_intake", role: "customer" };
    if (state.sessionState && state.sessionState !== "ready") return { kind: "resume_onboarding", role: state.activeRole ?? undefined };
    if (state.activeRole === "handyman" && ["active", "verified"].includes(state.provider)) return { kind: "provider_home", role: "handyman" };
    if (state.customer === "active") return { kind: "customer_home", role: "customer" };
    if (state.provider === "onboarding") return { kind: "resume_onboarding", role: "handyman" };
    if (state.customer === "onboarding") return { kind: "resume_onboarding", role: "customer" };
    return { kind: "guest_home" };
  }
  return { kind: "delegate", role: state.activeRole ?? undefined };
}
