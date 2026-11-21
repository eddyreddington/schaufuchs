import { expect, test } from "bun:test";
import { speicherBericht } from "./hallenplan-speichern";

test("„Speichern“ im Hallenplan: gespeichert nur, wenn der Server denselben Stand hat und nichts schiefging", () => {
  expect(speicherBericht({ letzteFehlgeschlagen: false, server: "a", entwurf: "a" })).toBe("gespeichert");
  // Die letzte Änderung lehnte der Server ab: der Entwurf ist schon auf den Server zurückgesprungen, trotzdem melden.
  expect(speicherBericht({ letzteFehlgeschlagen: true, server: "a", entwurf: "a" })).toBe("fehler");
  // Jemand anders hat inzwischen gespeichert: sein Stand kommt gleich in den Editor.
  expect(speicherBericht({ letzteFehlgeschlagen: false, server: "b", entwurf: "a" })).toBe("anderswo");
  expect(speicherBericht({ letzteFehlgeschlagen: true, server: "b", entwurf: "a" })).toBe("fehler");
});
