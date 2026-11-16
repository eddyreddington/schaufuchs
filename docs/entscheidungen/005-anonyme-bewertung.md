# 005 Preisrichter sehen keine Ausstellernamen

**Stand:** gilt

**Kontext:** Die Bewertung soll unabhängig vom Züchter sein (anonyme Bewertung nach den AAB).

**Entscheidung:** Was ein Preisrichter am Tablet sieht, enthält Katalognummer, Käfig, Sparte, Bezeichnung (Rasse, Farbenschlag),
Art, Geschlecht, Alter und die Bewertung – keine Namen, keine Anschrift, keinen Verein des Ausstellers. Der Server gibt Preisrichter-Prozeduren nur die anonyme Form heraus (`anonym` in `routers/bewertung.ts`).

**Folgen:** Neue Felder für das Tablet nie aus `aussteller` befüllen; Tests in `01-schau-ablauf`, `05-datenschutz-fachrecht`, `07-runde4` prüfen das.

**Wo:** `apps/server/src/routers/bewertung.ts` (`richterRouter`), `apps/web/src/seiten/richter-tablet.tsx`, `richter-karte.tsx`.
