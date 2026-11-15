# Modul Katalog (Nummern, Sortierung, Gestaltung, Druck)

**Zweck:** Katalognummern in Ausstellungsfolge vergeben, Reihenfolge je Schau wählen, Nummern festschreiben, danach
Nachmeldungen mit Unternummer (100a); Druckkatalog gestalten (Vorspann, Grußworte, Anzeigen, Bilder) und als PDF erzeugen.
Vollständige Liste der Funktionen: [Modulkarte](../modulkarte.md).

## Einstiegspunkte

| Wo | Datei | Wichtig |
|---|---|---|
| Nummern, Folge | `packages/domain/src/katalog.ts` | `vergebeKatalognummern()` (alle neu, lückenlos ab Start), `nachmeldungsNummern()` / `nachmeldungsNummer()`, `vergleicheFolge()`, `formatKatalognummer()`, `gruppenAbteilung()` |
| Sortierung | `katalog.ts` | `SORTIER_KRITERIEN`, `SORTIER_FEST` (Sparte, Rasse, Farbenschlag immer vorn), `SORTIERUNG_STANDARD`, `sortierungNormal()`, `istStandardSortierung()` |
| Gliederung, Schriften | `schriften.ts`, `kaefige.ts` | `KATALOG_GLIEDERUNG`, `KATALOG_TEILE`, `seitenbereiche()`, `KATALOG_SCHRIFTEN`; `nummernBereiche()`, Käfigblöcke (`kaefigFolge`) |
| Server, Nummern | `apps/server/src/routers/katalog.ts` | `katalog.liste`, `katalog.nummernVergeben` (vor dem Festschreiben alle neu, danach nur Nachmeldungen), `katalog.nummernNachPlan` (Folge aus dem Hallenplan), `katalog.gedrucktSetzen` (festschreiben) |
| Server, Sortierung | `apps/server/src/routers/schau.ts` | `schau.katalogSortierungSetzen` (nur Ausstellungsleitung, gesperrt nach Festschreiben, Protokoll) |
| Server, Gestaltung | `apps/server/src/routers/katalog-gestaltung.ts` | `katalogGestaltung.laden/speichern`, Bilder, Beiträge (`beitragSpeichern`, `beitraegeOrdnen`) |
| PDF | `apps/server/src/pdf/katalog.ts` (⚠ 1.500 Z.) | `katalogPdf()`; ausgeliefert in `src/index.ts` über `/datei/:schauId/katalog.pdf` und öffentlich `/s/:slug/katalog.pdf`, nacheinander in einer Warteschlange (`katalogNacheinander`) |
| Web | `apps/web/src/seiten/katalog.tsx`, `katalog-reihenfolge.tsx`, `katalog-gestalten.tsx` (⚠ 1.000 Z.), `katalog-vorschau.tsx` (PDF-Vorschau) | Routen `/schau/:id/katalog`, `/schau/:id/katalog/gestalten` |

## Regeln und Invarianten

- Vor dem Festschreiben setzt jede Vergabe **alle** Nummern neu, lückenlos ab `katalogStart`. Nach dem Festschreiben
  (`schau.katalog_gedruckt`) ändert sich keine bestehende Nummer mehr; Nachmeldungen bekommen Nummer des Vorgängers plus Unternummer.
- Gliederung: Jugend (wenn getrennt), Käfigblöcke, Volieren und Stämme vorn (wenn gewählt); darin Sparte, Rasse, Farbenschlag
  fest, dann die gewählten Kriterien. Vorgabe = bisherige Folge; gespeicherte Listen ohne neue Kriterien sortieren unverändert.
- Nach dem Festschreiben gesperrt: Sortierung, Verzeichnisversion, Jugendblock, Reihenfolge der Stämme, Rasse/Art/Geschlecht/Alter nummerierter Tiere.
- Sind die Preisrichter nach Rassen eingeteilt, folgen die Nummernbereiche den neuen Nummern.
- Änderungen mit `protokolliere()`; öffentlich sichtbare Gestaltung über `oeffentlichSichtbarProcedure` (erneuert Zwischenspeicher).
- Namen im gedruckten Katalog nur mit unterschriebenem Meldebogen, im Internet zusätzlich mit Online-Einwilligung; online keine Wohnanschrift.
- Bilder nur mit Bildnachweis (Urheber, Lizenz, Quelle).

## Tests

- Domain: `domain.test.ts` (Nummern, Nachmeldungen), `katalog-sortierung.test.ts` (Vorgabe = alte Folge in Zufallsschauen), `katalog-gliederung.test.ts`.
- Server (`apps/server/src/tests`): `01-schau-ablauf`, `04-meldung-katalog-sicherheit`, `34-katalog-gestaltung`, `36-nach-plan-nummerieren`, `43-katalog-sortierung`.

## Datenbank

`katalogeintrag`: `katalog_nr`, `suffix` (Unternummer), `kaefig_block`, eindeutig je Schau (`eintrag_katalognr`).
`schau`: `katalog_start`, `katalog_gedruckt` (Nummern festgeschrieben), `katalog_sortierung` (Migration 0053), `kaefig_folge`,
`jugend_separat`, `staemme_vorn`. Gestaltung: `katalog_gestaltung` (je Schau eine Zeile), `katalog_beitrag`, `bild`.

## Handbuch

`docs/handbuch/ausstellungsleitung.md`, 5.5 und 5.6: [Katalognummern vergeben](/hilfe/ausstellungsleitung#katalognummern-vergeben),
„Reihenfolge der Katalognummern“, „Ausgaben drucken“, „Nummern festschreiben“, [Katalog gestalten](/hilfe/ausstellungsleitung#katalog-gestalten).
