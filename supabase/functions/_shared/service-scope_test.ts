import {
  classifyService,
  normalizeServiceTypos,
  serviceScope,
} from "./service-scope.ts";

function assertEquals(actual: unknown, expected: unknown) {
  if (actual !== expected) {
    throw new Error(`Expected ${expected}, received ${actual}`);
  }
}

Deno.test("pregnancy is outside the marketplace scope", () => {
  assertEquals(serviceScope("my wife is pregnant"), "unsupported");
});

Deno.test("baby request is outside the marketplace scope", () => {
  assertEquals(serviceScope("my wife needs a baby"), "unsupported");
});

Deno.test("plumbing request is supported", () => {
  assertEquals(serviceScope("fix plumbing in the toilet"), "supported");
});

Deno.test("unknown requests require clarification", () => {
  assertEquals(serviceScope("please help me"), "unclear");
});

Deno.test("generic repair verbs are not eligibility evidence", () => {
  assertEquals(serviceScope("repair something"), "unclear");
  assertEquals(serviceScope("I want to repair my dick"), "unsupported");
});

Deno.test("sexual and escort requests are rejected", () => {
  assertEquals(serviceScope("I am looking for an escourt"), "unclear");
  assertEquals(serviceScope("I need sex"), "unsupported");
});

Deno.test("vehicles and medical work are outside scope", () => {
  assertEquals(serviceScope("repair my car engine"), "unsupported");
  assertEquals(serviceScope("fix my injured hand"), "unclear");
});

Deno.test("supported assets map to a named active service", () => {
  assertEquals(
    classifyService("my toilet is leaking").candidate?.name,
    "Plumbing",
  );
  assertEquals(
    classifyService("paint my bedroom wall").candidate?.name,
    "Painting",
  );
  assertEquals(
    classifyService("my roof is leaking").candidate?.name,
    "Roofing",
  );
});

Deno.test("common high-confidence service typos are normalized", () => {
  assertEquals(normalizeServiceTypos("leaking tiolet"), "leaking toilet");
  assertEquals(
    classifyService("leaking tiolet").candidate?.name,
    "Plumbing",
  );
  assertEquals(classifyService("broken fawcet").candidate?.name, "Plumbing");
  assertEquals(
    classifyService("electical socket is broken").candidate?.name,
    "Electrical",
  );
  assertEquals(
    classifyService("damaged cieling").candidate?.name,
    "Ceilings & Drywall",
  );
});

Deno.test("typo tolerance does not turn unrelated text into a service", () => {
  assertEquals(serviceScope("please help me"), "unclear");
  assertEquals(serviceScope("repair my car engine"), "unsupported");
  assertEquals(serviceScope("I want to repair my dick"), "unsupported");
});

Deno.test("home-menu non-job text is not direct service intent", () => {
  for (const message of ["hi", "hello", "thanks", "okay", "more options"]) {
    assertEquals(classifyService(message).scope, "unclear");
  }
});
