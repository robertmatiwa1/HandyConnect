import { decideEntry } from "./entry-contract.ts";

function assertEquals(actual: unknown, expected: unknown) {
  const left = JSON.stringify(actual);
  const right = JSON.stringify(expected);
  if (left !== right) throw new Error(`Expected ${right}, received ${left}`);
}

const guest = {
  restricted: false,
  customer: "none",
  provider: "none",
  activeRole: null,
  sessionFlow: null,
  sessionState: null,
} as const;

Deno.test("unknown Hi stays a guest", () => {
  assertEquals(decideEntry(guest, "Hi").kind, "guest_home");
});

Deno.test("unknown customer intent starts a draft-capable request", () => {
  assertEquals(decideEntry(guest, "I need a plumber"), {
    kind: "customer_request",
    role: "customer",
  });
});

Deno.test("guest can start a customer draft without registering", () => {
  assertEquals(decideEntry(guest, "ROLE:CUSTOMER"), {
    kind: "customer_request",
    role: "customer",
    clearSession: true,
  });
});

Deno.test("unknown provider intent starts provider application", () => {
  assertEquals(decideEntry(guest, "I am an electrician looking for work"), {
    kind: "provider_application",
    role: "handyman",
  });
});

Deno.test("returning customer Hi opens home and never a job", () => {
  assertEquals(
    decideEntry({ ...guest, customer: "active", activeRole: "customer" }, "Hi")
      .kind,
    "customer_home",
  );
});

Deno.test("Home has global precedence over stale flow", () => {
  assertEquals(
    decideEntry({
      ...guest,
      customer: "active",
      activeRole: "customer",
      sessionState: "job_location",
    }, "HOME"),
    {
      kind: "customer_home",
      role: "customer",
      clearSession: true,
    },
  );
});

Deno.test("incomplete onboarding resumes on greeting", () => {
  assertEquals(
    decideEntry({
      ...guest,
      customer: "onboarding",
      activeRole: "customer",
      sessionState: "customer_name",
    }, "hello").kind,
    "resume_onboarding",
  );
});

Deno.test("provider name answer resumes the active onboarding conversation", () => {
  assertEquals(
    decideEntry({
      ...guest,
      provider: "onboarding",
      activeRole: "handyman",
      sessionFlow: "handyman_onboarding",
      sessionState: "capture_name",
    }, "Robert Matiwa"),
    { kind: "resume_onboarding", role: "handyman" },
  );
});

Deno.test("provider skill button resumes the active onboarding conversation", () => {
  assertEquals(
    decideEntry({
      ...guest,
      provider: "onboarding",
      activeRole: "handyman",
      sessionFlow: "handyman_onboarding",
      sessionState: "capture_skills",
    }, "HSKILL:plumbing"),
    { kind: "resume_onboarding", role: "handyman" },
  );
});

Deno.test("provider name resumes before a handyman row exists", () => {
  assertEquals(
    decideEntry({
      ...guest,
      provider: "none",
      activeRole: "handyman",
      sessionFlow: "handyman_onboarding",
      sessionState: "capture_name",
    }, "Robert Matiwa"),
    { kind: "resume_onboarding", role: "handyman" },
  );
});

Deno.test("restricted identity cannot bypass with an old button", () => {
  assertEquals(
    decideEntry({ ...guest, restricted: true }, "JOB:VIEW:old-id").kind,
    "restricted",
  );
});

Deno.test("legacy interactive IDs remain compatible", () => {
  assertEquals(
    decideEntry(
      { ...guest, customer: "active", activeRole: "customer" },
      "REQUEST_HELP",
    ).kind,
    "customer_request",
  );
});

Deno.test("dual-profile greeting respects the last-used provider role", () => {
  assertEquals(
    decideEntry({
      ...guest,
      customer: "active",
      provider: "verified",
      activeRole: "handyman",
    }, "Hi").kind,
    "provider_home",
  );
});

Deno.test("customer request command pre-empts an unfinished flow", () => {
  assertEquals(
    decideEntry({
      ...guest,
      customer: "active",
      activeRole: "customer",
      sessionState: "job_location",
    }, "CUSTOMER:REQUEST"),
    { kind: "customer_request", role: "customer", clearSession: true },
  );
});

Deno.test("ordinary uppercase text cannot forge a namespaced command", () => {
  assertEquals(decideEntry(guest, "NAV HOME").kind, "delegate");
});

Deno.test("provider suspension wins over Home navigation", () => {
  assertEquals(
    decideEntry({
      ...guest,
      provider: "verified",
      activeRole: "handyman",
      restricted: true,
    }, "NAV:HOME").kind,
    "restricted",
  );
});

Deno.test("neutral acknowledgement does not reset a returning customer", () => {
  assertEquals(
    decideEntry(
      { ...guest, customer: "active", activeRole: "customer", sessionState: "ready" },
      "cool",
    ).kind,
    "acknowledgement",
  );
});
