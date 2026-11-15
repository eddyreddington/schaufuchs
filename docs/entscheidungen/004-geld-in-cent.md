# 004 Geld in Cent, Provisionen in Basispunkten

**Stand:** gilt

**Kontext:** Gleitkommazahlen runden bei Beträgen falsch (0,1 + 0,2), Abrechnung und SEPA-Datei müssen auf den Cent stimmen.

**Entscheidung:** Alle Beträge sind ganze Zahlen in Cent (Spalten `*_cent`, Felder `…Cent`). Prozentsätze in Basispunkten
(1500 = 15 %), gerechnet mit `anteil()` (kaufmännisch gerundet). Umwandlung nur an der Oberfläche: `formatEuro()`, `parseEuro()`.

**Folgen:** Keine Euro-Dezimalzahlen in Datenbank, tRPC-Eingaben oder Fachlogik.

**Wo:** `packages/domain/src/geld.ts`, `abrechnung.ts`, `sepa.ts`.
