const raw = await Deno.readTextFile(new URL("./scenarios.json", import.meta.url));
const scenarios = JSON.parse(raw);

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

Deno.test("conversation transcript fixtures are well formed", () => {
  assert(Array.isArray(scenarios) && scenarios.length >= 10, "expected at least 10 transcript scenarios");
  const names = new Set<string>();
  for (const scenario of scenarios) {
    assert(typeof scenario.name === "string" && scenario.name.length > 3, "scenario must have a name");
    assert(!names.has(scenario.name), `duplicate scenario name: ${scenario.name}`);
    names.add(scenario.name);
    assert(Array.isArray(scenario.messages) && scenario.messages.length > 0, `${scenario.name}: messages required`);
    assert(Array.isArray(scenario.assertions) && scenario.assertions.length > 0, `${scenario.name}: assertions required`);
  }
});

Deno.test("real beta incident coverage remains present", () => {
  const required = [
    "reuben_provider_location_and_terms_recovery",
    "john_provider_location_resume",
    "fridge_customer_resume",
    "unsupported_request_blocked",
    "mixed_trade_request_is_ambiguous",
    "stale_accept_button",
    "duplicate_accept",
    "duplicate_arrival_start_complete",
    "unverified_provider_resume",
    "active_job_provider_resume",
  ];
  const names = new Set(scenarios.map((s: { name: string }) => s.name));
  for (const name of required) assert(names.has(name), `missing required regression scenario: ${name}`);
});
