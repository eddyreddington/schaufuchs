# Modul Halle (Käfige, Hallenplan, 3D)

**Zweck:** Käfigbedarf je Käfigart, Aufstellung der Käfige in der Halle (automatisch oder von Hand im Editor), fester Plan,
Druck (PDF) und 3D-Ansicht. Die Lage richtet sich nach der Katalogfolge (= Käfignummern).
Vollständige Liste der Funktionen: [Modulkarte](../modulkarte.md), Abschnitt `hallenplan*.ts`.

## Einstiegspunkte

| Wo | Datei | Wichtig |
|---|---|---|
| Rechnung | `packages/domain/src/hallenplan.ts` (⚠ 1.500 Z.) | `planeHalle()` (Plan aus Halle, Tieren, Käfigmaßen, festem Plan), `festschreiben()`, `frontFehler()`, `platteFuer()`, `eingangsGang()`, `halleNormal()`, Typen `Halle`, `Hallenplan`, `FesterPlan` |
| Neu setzen | `hallenplan-neu.ts` | `neuSetzen()`, `halleZumNeuSetzen()`, `vonHandGeplant()`, `fehlendeImPlan()` |
| Fehlende Käfige | `hallenplan-fehlend.ts` | `fehlendeKaefige()`, `fehlendeEinsetzen()` (nur in nutzbare Reihenstücke, nie in Gänge) |
| Editor-Logik | `hallenplan-gruppe.ts`, `hallenplan-entfernen.ts` | `verschiebeTeile()`, `pruefeVerschiebung()`, `pruefeLage()`, `rasterAusrichten()`, `leereEntfernen()`, `pruefeEntfernt()` |
| Front, Wand | `hallenplan-wandfront.ts`, `hallenplan-wand.ts` | `wandAusrichtung()` (Rückwand an die Wand), `mitWandreihe()` |
| Folge | `hallenplan-folge.ts` | `planFolge()` („Nach Plan nummerieren“), `planUnordnung()`, `luekenlosAuffuellen()` |
| Druck, 3D | `hallenplan-druck.ts`, `hallenplan-3d.ts`, `stellvorschlaege.ts`, `kaefige.ts` | `zeichnungDerHalle()`, `richterFarbe()`, `hallenSzene()`, `stellVorschlaege()`, `kaefigTyp()`, `kaefigMass()` |
| Server | `apps/server/src/routers/katalog.ts` (`katalogRouter`, ab `kaefigbedarf` bis `wandreiheStellen`) | `katalog.hallenplan`, `halleSetzen`, `planFestschreiben`, `planNeuSetzen` (`planNeuSetzenIn`), `stellVorschlaege`, `plattenSetzen`, `kaefigMassSetzen`; `halle.kaefigSetzen` (einzelnes Tier) |
| PDF | `apps/server/src/pdf/hallenplan.ts` | `hallenplanPdf()`, `aufbaulistePdf()` |
| Web | `apps/web/src/seiten/hallenplan.tsx` (⚠ 3.592 Z., offen: reine Planfunktionen wie `planKoerper`, `plattenDa`, `platzWeg` in die Domain ziehen und die Seite aufteilen), `hallenplan-werkzeuge.tsx`, `hallenplan-3d.tsx` (three.js, nur dynamisch geladen), `hallenplan-3d-seite.tsx`, `kaefige.tsx` | Editor = Seite; rechnet über `@schau/domain` selbst mit, speichert über `katalog.halleSetzen` |

## Regeln und Invarianten

- Katalogfolge streng aufsteigend Reihe für Reihe, keine Sonderregeln je Sparte; Reihen geschlossen.
- Grundplatten nie kürzen; Rest einer Platte darf die nächste Käfigart aufnehmen ([ADR 001](../entscheidungen/001-grundplatten-nie-kuerzen.md)).
- Möbel (Tisch, Bank, Garnitur) sind keine Sperrfläche und verschieben nie Käfige ([ADR 002](../entscheidungen/002-moebel-keine-sperrflaeche.md)).
- Fester Plan vs. „Automatisch planen“ ([ADR 006](../entscheidungen/006-fester-plan.md)): fest = jeder Käfig behält seinen Platz.
- Jede Käfigfront zeigt zu einem Gang (`frontFehler`), Rückwand an die Wand; vor Ein- und Notausgängen bleibt ein Gang frei.
- Käfige nie auf Flächen; eingesetzte Teile nur ganz in der Halle (`pruefeLage`).
- Helfer sehen den Plan nur an; Ändern nur Ausstellungsleitung (`adminProcedure`), jede Änderung mit `protokolliere()`.
- Gleichzeitige Änderungen: `halleSchluessel()` als Stand (`basis`), abweichender Stand wird abgewiesen.
- Domain-Funktionen sind rein; Zufallshallen-Tests prüfen Invarianten über viele Hallen.

## Tests

- Domain: `packages/domain/src/hallenplan*.test.ts`, `stellvorschlaege.test.ts` (u. a. Zufallshallen, Möbel ohne Einfluss).
- Server (`apps/server/src/tests`): `17-kaefige`, `19-hallenplan`, `24-plan-fest`, `31-stellvorschlaege`, `36-nach-plan-nummerieren`,
  `38-hallenplan-entfernen`, `39-hallenplan-druck`, `40-hallenplan-neu-setzen`, `41-hallenplan-3d`, `42-hallenplan-moebel-etagen`,
  `44-pruefliste-hallenplan`.

## Datenbank

Tabelle `schau`: `halle` (jsonb `Halle`: Maße, Gänge, Flächen, eingesetzte Teile, Versatz, entfernte Plätze), `hallenplan_fest`
(jsonb `FesterPlan`; null = Automatik), `kaefig_regeln`, `kaefig_masse`, `kaefig_folge`, `aufsteller`.
Tabelle `katalogeintrag`: `kaefig`, `kaefig_wahl`, `kaefig_block`. Sockelbild in `bild`.

## Handbuch

`docs/handbuch/ausstellungsleitung.md`, Abschnitt 5.5: [Käfige](/hilfe/ausstellungsleitung#käfige-käfigbedarf),
[Hallenplan](/hilfe/ausstellungsleitung#hallenplan), „Hallenplan bearbeiten“, [Hallenplan in 3D](/hilfe/ausstellungsleitung#hallenplan-3d).
