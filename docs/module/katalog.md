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
| Typografie | `katalog-typografie.ts`, Server `pdf/katalog-schrift.ts` | `KATALOG_SCHRIFT_FAMILIE` (eine Familie je Wahl), `katalogSchriftsatz()`, `schnittDatei()`, `KATALOG_GROESSEN` / `katalogGroessen()`; `registriereKatalogSchrift()`, `NORMAL`/`FETT`/`KURSIV`/`AUSZEICHNUNG` |
| Server, Nummern | `apps/server/src/routers/katalog/nummern.ts` | `katalog.liste`, `katalog.nummernVergeben` (vor dem Festschreiben alle neu, danach nur Nachmeldungen), `katalog.nummernNachPlan` (Folge aus dem Hallenplan), `katalog.gedrucktSetzen` (festschreiben) |
| Server, Sortierung | `apps/server/src/routers/schau/einstellungen.ts` | `schau.katalogSortierungSetzen` (nur Ausstellungsleitung, gesperrt nach Festschreiben, Protokoll) |
| Server, Gestaltung | `apps/server/src/routers/katalog-gestaltung.ts` | `katalogGestaltung.laden/speichern`, Bilder, Beiträge (`beitragSpeichern`, `beitraegeOrdnen`) |
| PDF | `apps/server/src/pdf/katalog.ts` (Einstieg) mit `katalog-kontext.ts`, `-hilfen.ts`, `-titel.ts`, `-vorspann.ts`, `-tierteil.ts`, `-verzeichnisse.ts`, `-anhang.ts` | `katalogPdf()`; ausgeliefert über `/datei/:schauId/katalog.pdf` (`src/datei-katalog.ts`) und öffentlich `/s/:slug/katalog.pdf` (`src/datei-oeffentlich.ts`), nacheinander in einer Warteschlange (`katalogNacheinander` in `datei-katalog.ts`) |
| Web | `apps/web/src/seiten/katalog.tsx`, `katalog-reihenfolge.tsx`, `katalog-gestalten.tsx` mit `katalog-gestalten-*.tsx` (Bilder: `useBildHochladen`, `BildHochladen`, `BildAblage` – hineingezogen wie über „Bild wählen“, mit `DateiAblage` aus `ui-ablage.tsx`, Regeln in `ablage.ts`), `katalog-vorschau.tsx` (PDF-Vorschau) | Routen `/schau/:id/katalog`, `/schau/:id/katalog/gestalten` |

## Regeln und Invarianten

- Vor dem Festschreiben setzt jede Vergabe **alle** Nummern neu, lückenlos ab `katalogStart`. Nach dem Festschreiben
  (`schau.katalog_gedruckt`) ändert sich keine bestehende Nummer mehr; Nachmeldungen bekommen Nummer des Vorgängers plus Unternummer.
- Gliederung: Jugend (`schau.jugend_separat`: „eigener Block am Ende“, sonst „in der Rasse eingereiht“; `istJugendBlock()`
  für Nummern, Katalog-PDF, Kurzkatalog und Ergebnisse), Käfigblöcke, Volieren und Stämme vorn (wenn gewählt); darin Sparte, Rasse, Farbenschlag
  fest, dann die gewählten Kriterien. Vorgabe = bisherige Folge; gespeicherte Listen ohne neue Kriterien sortieren unverändert.
- Jugend-Kennzeichen: Bei „in der Rasse eingereiht“ bekommt jedes Jugendtier „Jgd.“ (`jugendKennzeichen()`, `JUGEND_KUERZEL`)
  – im Katalog-PDF (auch online und im Kurzkatalog) hinter dem Aussteller, in der Legende erklärt (`ausstellerFeld` in
  `pdf/katalog-tierteil.ts`: gleiche Größe und Grundlinie wie der Name; ist es eng, erst Mindestgröße, dann Vorname als
  Initiale, dann Kürzel kleiner, zuletzt nur der Nachname). In den öffentlichen Ergebnissen eine Marke mit dem Wort „Jugend“
  (`ergebnisse.jugend` der Sprache) in der Spalte Aussteller – kein Kürzel hinter dem Alter, das läse sich wie „jung“.
  Beim eigenen Block nie, dort steht die Überschrift. Die Ehrentafel bleibt ohne Kennzeichen.
- Öffentliche Ergebnisse liefern nur, was die Seite zeigt: je Tier `jugendBlock` (Gruppierung) und `jugendKennzeichen`
  (Marke), aber kein `istJugend` und keine Einstellung `jugendSeparat`. Die Marke steht auch an Zeilen ohne
  Online-Einwilligung („nicht veröffentlicht“): Sie nennt wie die Überschrift des Jugendblocks nur die Klasse, nicht die
  Person – Name, Verein, Alter und Erziehungsberechtigter bleiben verdeckt.
- Nach dem Festschreiben gesperrt: Sortierung, Verzeichnisversion, „Jugend im Katalog“, Reihenfolge der Stämme, Rasse/Art/Geschlecht/Alter nummerierter Tiere.
- Sind die Preisrichter nach Rassen eingeteilt, folgen die Nummernbereiche den neuen Nummern.
- Die Katalognummern kommen nach dem Hallenplan ([ADR 031](../entscheidungen/031-hallenplan-vor-katalognummern.md)):
  Steht ein fester Plan mit Tieren (`nachPlanVergeben`, Stand aus `katalog.nummernStand`), zeigt die Seite „Nach Hallenplan
  vergeben“ (`katalog.nummernNachPlan`, Rückfrage wie im Editor) als ersten Knopf und „Ohne Hallenplan vergeben“
  (`katalog.nummernVergeben`) daneben; sonst wie bisher „Katalognummern vergeben“. Nach dem Festschreiben „Nachmeldungen nummerieren“.
- Änderungen mit `protokolliere()`; öffentlich sichtbare Gestaltung über `oeffentlichSichtbarProcedure` (erneuert Zwischenspeicher).
- Namen im gedruckten Katalog nur mit unterschriebenem Meldebogen, im Internet zusätzlich mit Online-Einwilligung; online keine Wohnanschrift.
- Bilder nur mit Bildnachweis (Urheber, Lizenz, Quelle).
- Schrift ([ADR 032](../entscheidungen/032-eine-schriftfamilie-im-katalog.md)): ein Katalog, eine Familie – die gewählte –
  in normal, fett, kursiv; Größen nur aus `KATALOG_GROESSEN` (im Kontext `G`, im Tierteil `GT`). Auszeichnung nur für den
  Schaunamen auf der Titelseite bei „Buch, schmal“ und „Ausgewogen“. Fehlt ein Schnitt, die Regular derselben Familie.
  Katalog-Teile nehmen nie `SANS`/`SERIF` aus `basis.ts` (die gehören Briefen und Belegen), sondern die Schnitte aus
  `pdf/katalog-schrift.ts`. Nichts mit „…“ kürzen: lieber eine Kurzform („nicht veröff.“). Lange Namen erst verkleinern,
  dann umbrechen – mit `textUmbrochen()`/`zeilenUmbrechen()` aus `basis.ts` (nie `textImFeld`, das kürzt), Höhe vorher
  messen (`zeichnen: false`), damit Spalten- und Seitenwechsel stimmen; Tierzeilen, Rassen- und Klassenköpfe,
  Spartenband, Verzeichnisse und Kolumnentitel werden dann höher.

## Tests

- Domain: `domain.test.ts` (Nummern, Nachmeldungen), `katalog-typografie.test.ts` (eine Familie je Wahl, Ersatzschnitt, Größenstufen), `einteilung-jugend.test.ts` (Jugendblock, Kennzeichen), `katalog-sortierung.test.ts` (Vorgabe = alte Folge in Zufallsschauen), `katalog-gliederung.test.ts`.
- Server (`apps/server/src/tests`): `01-schau-ablauf`, `04-meldung-katalog-sicherheit`, `34-katalog-gestaltung`, `82-katalog-schriften` (pdffonts: nur die gewählte Familie, pdftotext: Text vollständig), `36-nach-plan-nummerieren`, `43-katalog-sortierung`, `72-jugend-einteilung` (Jugendblock oder eingereiht, Kurzkatalog), `79-ablauf-halle` (Stand für „Nach Hallenplan vergeben“), `81-jugend-kennzeichen` („Jgd.“ in Druck, Online-Katalog, Ergebnissen), `83-katalog-nicht-kuerzen` (sehr lange Namen in jeder Schrift, Aufteilung, A4/A5, mit und ohne Ergebnisse, Kurzkatalog: vollständig, kein „…“, keine überlappenden Wörter).

## Datenbank

`katalogeintrag`: `katalog_nr`, `suffix` (Unternummer), `kaefig_block`, eindeutig je Schau (`eintrag_katalognr`).
`schau`: `katalog_start`, `katalog_gedruckt` (Nummern festgeschrieben), `katalog_sortierung` (Migration 0053), `kaefig_folge`,
`jugend_separat`, `staemme_vorn`. Gestaltung: `katalog_gestaltung` (je Schau eine Zeile), `katalog_beitrag`, `bild`.

## Handbuch

`docs/handbuch/ausstellungsleitung.md`, 5.5 und 5.6: [Katalognummern vergeben](/hilfe/ausstellungsleitung#katalognummern-vergeben),
„Reihenfolge der Katalognummern“, „Ausgaben drucken“, „Nummern festschreiben“, [Katalog gestalten](/hilfe/ausstellungsleitung#katalog-gestalten).
