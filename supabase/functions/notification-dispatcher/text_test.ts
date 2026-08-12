import { normalizeOutboundText } from "./text.ts";

function assertEquals(actual: string, expected: string): void {
  if (actual !== expected) {
    throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

Deno.test("renders database escape sequences as WhatsApp line breaks", () => {
  assertEquals(
    normalizeOutboundText("New Plumbing job\\nLocation: Pinelands\\nWhen: Today"),
    "New Plumbing job\nLocation: Pinelands\nWhen: Today",
  );
});

Deno.test("preserves text that already contains real line breaks", () => {
  assertEquals(
    normalizeOutboundText("Job accepted\nCustomer: Robert"),
    "Job accepted\nCustomer: Robert",
  );
});
