import { expect, test } from "bun:test";
import { hallenplanAnsicht, serverStandUebernehmen } from "./hallenplan-laden";

test("Hallenplan: Fehlerseite nur, wenn es noch nichts zu zeigen gibt – ein gescheitertes Nachladen lässt den Editor stehen", () => {
  expect(hallenplanAnsicht({ hatDaten: false, hatFehler: true })).toEqual({ zeige: "fehler", nachladeFehler: false });
  expect(hallenplanAnsicht({ hatDaten: false, hatFehler: false })).toEqual({ zeige: "laden", nachladeFehler: false });
  expect(hallenplanAnsicht({ hatDaten: true, hatFehler: false })).toEqual({ zeige: "inhalt", nachladeFehler: false });
  // Plan geladen, dann scheitert das Nachladen (Netz weg, Server kurz nicht da): Editor mit Hinweis darüber.
  expect(hallenplanAnsicht({ hatDaten: true, hatFehler: true })).toEqual({ zeige: "inhalt", nachladeFehler: true });
});

test("nach dem Speichern den Serverstand nur übernehmen, wenn er stimmt und nichts mehr unterwegs ist", () => {
  expect(serverStandUebernehmen({ gespeichert: true, geladen: true, offen: 0, hatServer: true })).toBe(true);
  // Gespeichert, aber das Nachladen scheiterte: sonst spränge der Editor auf den Stand vor der Änderung, Rückgängig wäre weg.
  expect(serverStandUebernehmen({ gespeichert: true, geladen: false, offen: 0, hatServer: true })).toBe(false);
  // Nicht gespeichert und nicht nachgeladen (Netz weg): der zuletzt geladene Stand ist der richtige – zurück dorthin.
  expect(serverStandUebernehmen({ gespeichert: false, geladen: false, offen: 0, hatServer: true })).toBe(true);
  expect(serverStandUebernehmen({ gespeichert: false, geladen: true, offen: 0, hatServer: true })).toBe(true);
  expect(serverStandUebernehmen({ gespeichert: true, geladen: true, offen: 1, hatServer: true })).toBe(false);
  expect(serverStandUebernehmen({ gespeichert: true, geladen: true, offen: 0, hatServer: false })).toBe(false);
});
