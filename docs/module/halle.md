# Modul Halle (Käfige, Hallenplan, 3D)

**Zweck:** Käfigbedarf je Käfigart, Aufstellung der Käfige in der Halle (automatisch oder von Hand im Editor), fester Plan,
Druck (PDF) und 3D-Ansicht. Die Lage richtet sich nach der Katalogfolge (= Käfignummern).
Vollständige Liste der Funktionen: [Modulkarte](../modulkarte.md), Abschnitt `hallenplan*.ts`.

## Einstiegspunkte

| Wo | Datei | Wichtig |
|---|---|---|
| Rechnung | `packages/domain/src/hallenplan.ts` (Einstieg) mit `hallenplan-typen.ts`, `-rechtecke.ts`, `-moebel.ts`, `-vorgaben.ts`, `-intern.ts`, `-fest.ts`, `-reihen.ts` | `planeHalle()` (Plan aus Halle, Tieren, Käfigmaßen, festem Plan), `frontFehler()` in `hallenplan.ts`; `festschreiben()` (`-fest`), `platteFuer()`, `halleNormal()` (`-vorgaben`), `eingangsGang()` (`-rechtecke`), Typen `Halle`, `Hallenplan`, `FesterPlan` (`-typen`) |
| Neu setzen | `hallenplan-neu.ts` | `neuSetzen()`, `halleZumNeuSetzen()`, `vonHandGeplant()`, `fehlendeImPlan()` |
| Fehlende Käfige | `hallenplan-fehlend.ts` | `fehlendeKaefige()`, `fehlendeEinsetzen()` (nur in nutzbare Reihenstücke, nie in Gänge) |
| Editor-Logik | `hallenplan-gruppe.ts`, `hallenplan-entfernen.ts` | `verschiebeTeile()`, `pruefeVerschiebung()`, `pruefeLage()`, `rasterAusrichten()`, `leereEntfernen()`, `pruefeEntfernt()` |
| Front, Wand | `hallenplan-wandfront.ts`, `hallenplan-wand.ts` | `wandAusrichtung()` (Rückwand an die Wand), `mitWandreihe()` |
| Folge | `hallenplan-folge.ts` | `planFolge()` („Nach Plan nummerieren“, nur Nummern, kein Tier wechselt den Käfig; Einstellung `Halle.nummerFolge`, Oberfläche `hallenplan-nummerfolge.tsx`), `planUnordnung()` |
| Druck, 3D | `hallenplan-druck.ts`, `hallenplan-3d.ts`, `hallenplan-3d-waende.ts`, `hallenplan-3d-rundgang.ts`, `stellvorschlaege.ts`, `kaefige.ts` | `zeichnungDerHalle()`, `richterFarbe()`, `hallenSzene()`, `waendeImGrundriss()`, `rundgang()` (Wegpunkte des Rundgangs), `stellVorschlaege()`, `kaefigTyp()`, `kaefigMass()` |
| Aussehen (3D) | `hallenplan-aussehen.ts`, `hallenplan-3d-ausstattung.ts`, `hallenplan-3d-dach.ts` | `Halle.aussehen` ([ADR 028](../entscheidungen/028-aussehen-der-halle.md)): `aussehenVon()` (Vorgaben, Grenzen), `aussehenBereinigt()` (nur Abweichungen speichern), `deckeSchalten()` (Vorschlag 7/9 m), `wirksamerFirst()`; `fensterInWaenden()`, `geraeteAnWaenden()`, `spielfeldLinien()`; `dachVon()`, `deckenHoehe()`, `deckeSichtbar()`, `deckenTeile()` (Binder, Leuchten), `giebel()`, `hoechstesInDerHalle()`. Web: `hallenplan-aussehen.tsx` (Abschnitt „Aussehen (3D)“), `hallenplan-meterfeld.tsx` (`MeterFeld`, `MitEinheit`), `hallenplan-3d-raum.ts` (Boden, Folie, Linien, Innenwände, Fenster, Geräte), `hallenplan-3d-decke.ts` (Decke, Binder, Giebel, Leuchten), `hallenplan-3d-texturen.ts` (Canvas-Texturen); Schalter „Folie“ in `hallenplan-3d.tsx` |
| Server | `apps/server/src/routers/katalog/kaefige.ts`, `hallenplan.ts`, `gemeinsam.ts` (`planNeuSetzenIn`), `einlieferung.ts` | `katalog.hallenplan`, `halleSetzen`, `planFestschreiben`, `planNeuSetzen`, `stellVorschlaege` (`hallenplan.ts`); `plattenSetzen`, `kaefigMassSetzen` (`kaefige.ts`); `halle.kaefigSetzen` (einzelnes Tier, `einlieferung.ts`) |
| PDF | `apps/server/src/pdf/hallenplan.ts` | `hallenplanPdf()`, `aufbaulistePdf()` |
| Web | `apps/web/src/seiten/hallenplan.tsx` (Seite, `NeueHalle`, Editor `Plan`: Zustand der Auswahl, Tastatur, Aufbau der Seite), `hallenplan-entwurf.ts` (`useHallenEntwurf`: Entwurf, Speicherkette, Verlauf, Festschreiben, Plan neu setzen), `hallenplan-laden.ts` (`hallenplanAnsicht`: Fehlerseite nur ohne geladenen Plan; `serverStandUebernehmen`: wann der Entwurf nach dem Speichern den Serverstand übernimmt), `hallenplan-speichern.ts` (`speicherBericht`: Meldung des Knopfs „Speichern“, der nach dem sofortigen Speichern den Stand am Server nachprüft; `speicherAnzeige`: Anzeige oben rechts), `hallenplan-wiederholen.ts` (`mitWiederholen`, `fehlerArt`, `istVerbindungsfehler`, `wartezeit`, `wartenOderOnline`: Speichern ohne Verbindung von selbst wiederholen; `festEinreihen`, `festSchonAngekommen`: Festschreiben in der Reihe), `hallenplan-befehle.ts` (`usePlanBefehle`: Rückgängig/Wiederholen, Tier versetzen, nach Plan nummerieren, Einstellungen der Halle, Automatik, an den Wänden ausrichten, Einzelreihe), `hallenplan-aktionen.ts` (`useEditorAktionen`: Ausrichten, Drehen, Entfernen, Einsetzen, fehlende Käfige, Fläche aufziehen), `hallenplan-bild.tsx` (Zeichnung `PlanBild`) mit `hallenplan-bild-bedienung.ts` (`usePlanBedienung`: Greifen, Ziehen, Rahmen, Pfeiltasten, an die Wand ziehen), `hallenplan-grundriss.tsx` (Grundriss bearbeiten, Entscheidung 019), `hallenplan-geometrie.ts` (reine Rechnungen des Editors), `hallenplan-eigenschaften.tsx`, `hallenplan-werkzeugleiste.tsx`, `hallenplan-vorschlaege.tsx`, `hallenplan-uebersicht.tsx` (Legende, Platz, Aufbauliste), `hallenplan-teile.tsx`, `hallenplan-werkzeuge.tsx` (Bausteine der Werkzeugleiste), `hallenplan-entwuerfe.tsx`, `hallenplan-3d.tsx` (Seite der 3D-Ansicht, three.js nur dynamisch geladen) mit `hallenplan-3d-welt.ts` (Szene, Kamera, Zeichenschleife), `hallenplan-3d-bausteine.ts` (Texturen, Geometrien, Figuren), `hallenplan-3d-landschaft.ts` (Umgebung), `hallenplan-3d-steuerung.ts` (Tasten, Doppelklick, Rundgang) und `hallenplan-3d-steuerkreuz.tsx`, `hallenplan-3d-seite.tsx`, `kaefige.tsx` | Editor = Seite; rechnet über `@schau/domain` selbst mit, speichert über `katalog.halleSetzen` |

## Regeln und Invarianten

- Katalogfolge streng aufsteigend Reihe für Reihe, keine Sonderregeln je Sparte; Reihen geschlossen.
- Grundplatten nie kürzen; Rest einer Platte darf die nächste Käfigart aufnehmen ([ADR 001](../entscheidungen/001-grundplatten-nie-kuerzen.md)).
- Möbel (Tisch, Bank, Garnitur, Pokaltisch) sind keine Sperrfläche und verschieben nie Käfige ([ADR 002](../entscheidungen/002-moebel-keine-sperrflaeche.md)).
- Pokale auf dem Pokaltisch (`pokalStellen`, 3D) stehen mit Henkeln (`POKAL_BREITE`) ganz auf der Platte und berühren sich nicht; auf kleinen Tischen werden sie kleiner.
- Fester Plan vs. „Automatisch planen“ ([ADR 006](../entscheidungen/006-fester-plan.md)): fest = jeder Käfig behält seinen Platz.
- Jede Käfigfront zeigt zu einem Gang (`frontFehler`), Rückwand an die Wand; vor Ein- und Notausgängen bleibt ein Gang frei.
- Käfige nie auf Flächen; eingesetzte Teile nur ganz in der Halle (`pruefeLage`).
- Freier Grundriss ([ADR 019](../entscheidungen/019-freier-grundriss.md)): rechtwinklig; außerhalb wird für Planung und Verschieben Sperrfläche (`mitUmrissSperren`, „Hallenwand“); Wände in Plan, Druck und 3D entlang der Kanten.
- Helfer sehen den Plan nur an; Ändern nur Ausstellungsleitung (`adminProcedure`), jede Änderung mit `protokolliere()`.
- Gleichzeitige Änderungen: `halleSchluessel()` als Stand (`basis`), abweichender Stand wird abgewiesen.
- Ohne Verbindung (keine Antwort: TypeError von fetch, oder 502/503/504) sendet der Editor `halleSetzen` und das automatische
  Festschreiben erneut (1 s, 2 s, 4 s … höchstens 30 s, sofort bei „online“), bis es gelingt oder ein echter Fehler kommt;
  eine unlesbare Antwort (kein JSON) nur bis zu fünfmal (`fehlerArt`, `UNLESBAR_HOECHSTENS`). CONFLICT bei einer
  Wiederholung gilt als gespeichert, wenn der Server schon den neuen Stand hat – beim Festschreiben: fest mit denselben
  Grundplatten (`festSchonAngekommen`). `planNeuSetzen` nicht.
- Das automatische Festschreiben steht immer in der Reihe der Speicherungen (`festEinreihen`): Verschieben, „Leeres
  entfernen“ und „Tier versetzen“ hängen sich an ein laufendes an – so erreicht keine Verschiebung den Server vor dem
  Festschreiben, auch nicht nach langem Warten auf die Verbindung.
- Aussehen der Halle (3D) ändert nie Plan, Plätze oder Nummern: `festGeometrie` kennt es nicht, ein fester Plan bleibt fest
  ([ADR 028](../entscheidungen/028-aussehen-der-halle.md)). Gespeichert über `halleSetzen` (zod in `HALLE_EINGABE`), nur
  Abweichungen von der Vorgabe; kommt als Teil der Halle mit Entwürfen und Vorlagen mit.
- Domain-Funktionen sind rein; Zufallshallen-Tests prüfen Invarianten über viele Hallen.

## Tests

- Web: `apps/web/src/seiten/hallenplan-*.test.ts` (Laden, Speichern, Wiederholen ohne Verbindung).
- Domain: `packages/domain/src/hallenplan*.test.ts`, `stellvorschlaege.test.ts` (u. a. Zufallshallen, Möbel ohne Einfluss, Aussehen ohne Einfluss).
- Server (`apps/server/src/tests`): `17-kaefige`, `19-hallenplan`, `24-plan-fest`, `31-stellvorschlaege`, `36-nach-plan-nummerieren`,
  `38-hallenplan-entfernen`, `39-hallenplan-druck`, `40-hallenplan-neu-setzen`, `41-hallenplan-3d`, `42-hallenplan-moebel-etagen`,
  `44-pruefliste-hallenplan`, `67-pokaltisch`, `75-halle-aussehen`.

## Datenbank

Tabelle `schau`: `halle` (jsonb `Halle`: Maße, Gänge, Flächen, eingesetzte Teile, Versatz, entfernte Plätze), `hallenplan_fest`
(jsonb `FesterPlan`; null = Automatik), `kaefig_regeln`, `kaefig_masse`, `kaefig_folge`, `aufsteller`.
Tabelle `katalogeintrag`: `kaefig`, `kaefig_wahl`, `kaefig_block`. Sockelbild in `bild`.

## Handbuch

`docs/handbuch/ausstellungsleitung.md`, Abschnitt 5.5: [Käfige](/hilfe/ausstellungsleitung#käfige-käfigbedarf),
[Hallenplan](/hilfe/ausstellungsleitung#hallenplan), „Hallenplan bearbeiten“, [Hallenplan in 3D](/hilfe/ausstellungsleitung#hallenplan-3d), [Aussehen der Halle in 3D](/hilfe/ausstellungsleitung#hallenplan-3d-aussehen).
