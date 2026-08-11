import { serviceRequestLabel } from "./job-label.ts";

function assertEquals(actual: unknown, expected: unknown) {
  if (actual !== expected) {
    throw new Error(`Expected ${expected}, received ${actual}`);
  }
}

Deno.test("photo preview uses the confirmed service name", () => {
  assertEquals(serviceRequestLabel({ service_name: "Plumbing" }), "Plumbing");
});

Deno.test("photo preview never exposes an undefined service", () => {
  assertEquals(serviceRequestLabel({}), "home service");
  assertEquals(serviceRequestLabel({ service_name: "" }), "home service");
});
