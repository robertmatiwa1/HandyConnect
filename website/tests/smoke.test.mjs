import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");

test("mobile viewport and meaningful landmarks are present", () => {
  assert.match(html, /name="viewport"/);
  assert.match(html, /<main id="main">/);
  assert.match(html, /<nav[^>]+aria-label/);
  assert.match(html, /<h1>/);
});

test("homeowner and commercial audiences are represented", () => {
  assert.match(html, /Homeowners & tenants/);
  assert.match(html, /Businesses & property professionals/);
  assert.match(html, /property managers/i);
});

test("booking is WhatsApp-first without parallel booking forms", () => {
  assert.match(html, /wa\.me\//);
  assert.doesNotMatch(html, /<form\b/i);
  assert.doesNotMatch(html, /supabase\.co\/rest\/v1/i);
});

test("links are locked until official number verification", () => {
  assert.match(html, /const verifiedWhatsappNumber = "";/);
  assert.match(html, /aria-disabled="true"/);
  assert.match(html, /event\.preventDefault\(\)/);
});

test("no placeholder contact or secret credentials", () => {
  assert.doesNotMatch(html, /handyconnect\.example|@example\.com|service_role/i);
  assert.match(html, /href="terms\/"/);
  assert.match(html, /href="privacy\/"/);
});
