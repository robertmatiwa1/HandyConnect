import { classifyService } from "./service-scope.ts";
import { parseLocationInput } from "./location-input.ts";
import { decideEntry } from "./entry-contract.ts";

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

Deno.test("Reuben location: Claremont Capetown is accepted", () => {
  const location = parseLocationInput("Claremont Capetown");
  assert(location !== null, "location should parse");
  assert(location?.suburb === "Claremont", "suburb should be Claremont");
  assert(location?.city === "Cape Town", "city should normalize to Cape Town");
});

Deno.test("Fridge request is supported appliance repair", () => {
  const result = classifyService("my fridge is broken");
  assert(result.scope === "supported", "fridge should be supported");
  if (result.scope === "supported") {
    assert(result.candidate.name === "Appliance Repair", "fridge should map to Appliance Repair");
  }
});

Deno.test("Pregnancy request is blocked", () => {
  const result = classifyService("my wife is pregnant");
  assert(result.scope === "unsupported", "pregnancy must be unsupported");
});

Deno.test("Body/sexual repair request is blocked", () => {
  const result = classifyService("repair my penis");
  assert(result.scope === "unsupported", "body/sexual request must be unsupported");
});

Deno.test("Vehicle repair is outside HandyConnect scope", () => {
  const result = classifyService("fix my car engine");
  assert(result.scope === "unsupported", "vehicle repair must be unsupported");
});

Deno.test("Mixed plumbing and electrical request is not silently first-match classified", () => {
  const result = classifyService("my toilet leaks and my socket is broken");
  assert(result.scope !== "supported", "mixed trades must require clarification");
});

Deno.test("Greeting resumes registered but unverified provider", () => {
  const result = decideEntry({
    restricted: false,
    customer: "none",
    provider: "active",
    activeRole: "handyman",
    sessionFlow: null,
    sessionState: "ready",
  }, "hi");
  assert(result.kind === "provider_home" || result.kind === "resume_onboarding", "provider greeting must not become guest flow");
  assert(result.role === "handyman", "provider role must be preserved");
});

Deno.test("Greeting resumes active provider conversation before generic menu", () => {
  const result = decideEntry({
    restricted: false,
    customer: "none",
    provider: "verified",
    activeRole: "handyman",
    sessionFlow: "handyman_onboarding",
    sessionState: "capture_location",
  }, "hello");
  assert(result.kind === "resume_onboarding", "unfinished conversation must resume");
});
