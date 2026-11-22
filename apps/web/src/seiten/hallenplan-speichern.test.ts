import { expect, test } from "bun:test";
import { speicherAnzeige, speicherBericht } from "./hallenplan-speichern";

test("„Speichern“ im Hallenplan: gespeichert nur, wenn der Server denselben Stand hat und nichts schiefging", () => {
  expect(speicherBericht({ letzteFehlgeschlagen: false, server: "a", entwurf: "a" })).toBe("gespeichert");
  // Die letzte Änderung lehnte der Server ab: der Entwurf ist schon auf den Server zurückgesprungen, trotzdem melden.
  expect(speicherBericht({ letzteFehlgeschlagen: true, server: "a", entwurf: "a" })).toBe("fehler");
  // Jemand anders hat inzwischen gespeichert: sein Stand kommt gleich in den Editor.
  expect(speicherBericht({ letzteFehlgeschlagen: false, server: "b", entwurf: "a" })).toBe("anderswo");
  expect(speicherBericht({ letzteFehlgeschlagen: true, server: "b", entwurf: "a" })).toBe("fehler");
});

test("Speicheranzeige oben rechts: ohne Verbindung „Keine Verbindung“, sonst wie bisher", () => {
  const s = (x: Partial<Parameters<typeof speicherAnzeige>[0]>) => speicherAnzeige({ bearbeiten: true, verbindung: false, speichertGerade: false, letzteFehlgeschlagen: false, ...x });
  expect(s({})).toBe("gespeichert");
  expect(s({ speichertGerade: true })).toBe("speichert");
  expect(s({ letzteFehlgeschlagen: true })).toBe("fehler");
  // Während auf die Verbindung gewartet wird, ist auch etwas unterwegs – „Keine Verbindung“ geht vor.
  expect(s({ verbindung: true, speichertGerade: true })).toBe("verbindung");
  expect(s({ verbindung: true, speichertGerade: true, letzteFehlgeschlagen: true })).toBe("verbindung");
  expect(s({ speichertGerade: true, letzteFehlgeschlagen: true })).toBe("speichert");
  expect(s({ bearbeiten: false, verbindung: true })).toBe(null);
});
