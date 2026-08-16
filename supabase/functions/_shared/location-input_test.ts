import { assertEquals } from "jsr:@std/assert";
import { parseHumanLocation } from "./location-input.ts";

Deno.test("accepts Reuben Capetown input", () => {
  const x = parseHumanLocation("Claremont Capetown");
  assertEquals(x?.suburb, "Claremont");
  assertEquals(x?.city, "Cape Town");
  assertEquals(x?.province, "Western Cape");
  assertEquals(x?.needsCity, false);
});

Deno.test("accepts comma separated Cape Town", () => {
  const x = parseHumanLocation("Constantia, Cape Town");
  assertEquals(x?.suburb, "Constantia");
  assertEquals(x?.city, "Cape Town");
  assertEquals(x?.province, "Western Cape");
});

Deno.test("infers known Cape Town suburb", () => {
  const x = parseHumanLocation("Claremont");
  assertEquals(x?.city, "Cape Town");
  assertEquals(x?.needsCity, false);
});

Deno.test("keeps unknown suburb and asks only for city", () => {
  const x = parseHumanLocation("Somewhereville");
  assertEquals(x?.suburb, "Somewhereville");
  assertEquals(x?.city, null);
  assertEquals(x?.needsCity, true);
});

Deno.test("accepts Langa without comma", () => {
  const x = parseHumanLocation("Langa Cape Town");
  assertEquals(x?.suburb, "Langa");
  assertEquals(x?.city, "Cape Town");
});
