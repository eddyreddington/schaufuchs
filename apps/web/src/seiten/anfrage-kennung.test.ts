import { afterEach, expect, test } from "bun:test";
import { neueAnfrageId } from "./anfrage-kennung";

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const original = crypto.randomUUID;
afterEach(() => {
  crypto.randomUUID = original;
});

test("Anfrage-Kennung: auch ohne sicheren Kontext (http im Hallen-WLAN, kein crypto.randomUUID) eine v4-UUID", () => {
  // Über http:// fehlt crypto.randomUUID; getRandomValues gibt es dort.
  (crypto as { randomUUID?: unknown }).randomUUID = undefined;
  const a = neueAnfrageId();
  const b = neueAnfrageId();
  expect(a).toMatch(UUID_V4);
  expect(b).toMatch(UUID_V4);
  expect(a).not.toBe(b);
});
