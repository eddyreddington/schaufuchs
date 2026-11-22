# Modul Preisrichter (Zulassung, Obmann, Zusage, Einteilung)

**Zweck:** Preisrichter einer Schau mit Sparten und BDRG-Gruppen, für die sie zugelassen sind, Zuordnung zu einem Obmann
und Stand der Zusage; Einteilung nach Rassen (vor den Katalognummern) und nach Nummern, mit Vorschlag. Grundlage für
Tablet, Bewertung und Preise. Vollständige Liste der Funktionen: [Modulkarte](../modulkarte.md).

## Einstiegspunkte

| Wo | Datei | Wichtig |
|---|---|---|
| Zulassung, Obmann, Zusage | `packages/domain/src/preisrichter-zulassung.ts` | `darfBewerten()` (Sparte und Gruppe), `bewertetSparte()`, `bewertetGruppe()`, `bdrgGruppe()` / `bdrgGruppeGueltig()`, `pruefeObmann()`, `ZUSAGEN` |
| Einteilung nach Rassen | `packages/domain/src/einteilung.ts` | `richterNachRasse()`, `bereicheAusRassen()`, `regelnAusZuteilung()` |
| Gruppe im Verzeichnis | `packages/domain/src/stammdaten.ts` | `parseStammdatenCsv()`: freiwillige vierte Spalte „Gruppe“ |
| Server, Preisrichter | `apps/server/src/routers/preisrichter.ts` | `preisrichter.liste`, `.speichern` (→ `services/preisrichter-speichern.ts`), `.einteilungSetzen`, `.zuteilungSetzen`, Vorschläge |
| Server, Vorschlag | `apps/server/src/services/einteilung-vorschlag.ts` | `schlageEinteilungVor()`: nur an Preisrichter, die Sparte und Gruppe bewerten |
| Server, Gruppen pflegen | `apps/server/src/routers/stammdaten.ts` | `stammdaten.gruppenSetzen` (nur eigene Version, Protokoll), `gliederung` und `baum` mit `gruppe` |
| Server, Einträge | `apps/server/src/services/eintraege.ts` | `gruppe` je Eintrag (Rasse bzw. bei freier Bezeichnung die gewählte Rasse) |
| Vorlage | `apps/server/src/routers/schau/anlegen.ts` | Preisrichter mit Gruppen und Zusage übernommen, Obmann-Zuordnung auf die neue Schau umgesetzt |
| Web | `apps/web/src/seiten/preisrichter.tsx` (Liste, Einteilungen), `preisrichter-form.tsx` (Dialog), `stammdaten-gruppen.tsx` | Route `/schau/:schauId/preisrichter`, `/stammdaten` → „Gruppen“ |

## Regeln und Invarianten

- Sparten leer = alle Sparten; Gruppen leer = keine Einschränkung über Gruppen. Eine Rasse ohne Gruppe wird nicht über
  Gruppen geprüft. Ein Farbenschlag zählt mit der Gruppe seiner Rasse.
- Fremde Sparte oder fremde Gruppe: Einteilung nach Rassen und nach Nummern lehnen ab und nennen Preisrichter, Sparte bzw.
  Gruppe und Rasse bzw. Nummern; die Vorschläge teilen solche Tiere nicht zu („Kein Preisrichter für: Gruppe …“).
- Gruppen werden einheitlich gespeichert (ohne Leerzeichen, groß, höchstens 10 Zeichen aus Buchstaben und Ziffern).
- Obmann-Zuordnung: nur ein Obmann derselben Schau, nicht er selbst. Verliert ein Obmann den Haken, werden die ihm
  zugeordneten Preisrichter gelöst; beim Löschen setzt die Datenbank die Zuordnung auf leer. Die Bestätigung der Noten
  (`bewertung.obmannBestaetigen`) ist davon unabhängig.
- Zusage `offen` | `zugesagt` | `abgesagt` (Vorgabe offen), dazu „zugesagt für“ und Vorbehalt als freier Text.
- Jede Änderung am Preisrichter mit `protokolliere()` (Tabelle `preisrichter`, alter und neuer Wert); Kontaktdaten nur als
  „geändert“ vermerkt, ohne Werte (das Protokoll lässt sich nicht löschen). Gruppen im Verzeichnis: Tabelle `stammdaten_version`.
- Keine erfundene Zuordnung Rasse → Gruppe im Repo; Tests nutzen erkennbar erfundene Gruppen (X1, X2) – [ADR 007](../entscheidungen/007-keine-bdrg-daten.md).

## Tests

- Domain: `preisrichter-zulassung.test.ts`, `stammdaten-gruppe.test.ts`, `einteilung.test.ts`.
- Server (`apps/server/src/tests`): `29-einteilung-rassen`, `30-einteilung-gegenpruefung`, `69-preisrichter-gruppen`; `src/einteilung.test.ts` (Vorschlag).

## Datenbank

`rasse.gruppe` (Text, leer = nicht gepflegt). `preisrichter`: `sparten`, `gruppen` (jsonb), `obmann_id` (→ `preisrichter`,
beim Löschen leer), `zusage` (Aufzählung `pr_zusage`), `zugesagt_fuer`, `vorbehalt` – Migration 0068.
