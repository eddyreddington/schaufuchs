# Architektur

Eine Seite zum Einstieg. Wer etwas ändern will, liest danach nur noch die [Modulkarte](modulkarte.md) (wo liegt was), die
Moduldoku in [`docs/module/`](module/) und die [Entscheidungen](entscheidungen/) – und öffnet dann die 1–3 genannten Dateien.

## Schichten

| Schicht | Inhalt | Regel |
|---|---|---|
| `packages/domain` (`@schau/domain`) | Reine Fachlogik: Gebühren, Katalognummern, Noten, Preise, Abrechnung, Hallenplan, SEPA, Fristen | Keine Datenbank, kein Netz, keine Oberfläche. Jede Fachregel einmal, hier, mit Test daneben (`*.test.ts`). |
| `apps/server` | Bun + Hono + tRPC + Drizzle (PostgreSQL 16) | Router in `src/routers` prüfen Eingabe (zod) und Rechte, Logik mit Datenbank in `src/services`, PDFs in `src/pdf`, Datei-Endpunkte (PDF, CSV, Bilder) in `src/datei-*.ts`, registriert in `src/index.ts`. |
| `apps/web` | React + Vite + Tailwind + tRPC-Client, PWA | Seiten in `src/seiten`, Routen in `src/routes.tsx`, Bausteine in `src/ui-*.tsx` (Einstieg `src/ui.tsx`) und `src/komponenten`. Rechnet nichts Fachliches selbst, sondern ruft `@schau/domain` auf. Das Preisrichter-Tablet (`seiten/richter.tsx` mit `richter-*.tsx`) arbeitet offline (IndexedDB). Service Worker (`vite.config.ts`): Seitenaufrufe zuerst übers Netz, damit nach einem Update gleich die neue Oberfläche kommt; ohne Netz die zuletzt geladene Seite bzw. die vorgeladene `index.html`. |

Abhängigkeiten nur nach unten: web → Typen des Servers (`AppRouter`) → domain.

## Datenfluss

- **tRPC:** `apps/server/src/router.ts` setzt die Router zu `appRouter` zusammen (Bereiche wie `schau`, `meldung`, `katalog`,
  `halle`). Das Web ruft `trpc.<bereich>.<prozedur>.useQuery/useMutation` auf, Typen kommen ohne Code-Erzeugung direkt
  aus dem Server. Rollen über die Prozedur-Art in `src/trpc.ts`: `publicProcedure`, `benutzerProcedure` (angemeldet),
  `adminProcedure` (Ausstellungsleitung mit Zwei-Faktor), `richterProcedure` (Tablet). Mandant: `ladeSchau(organisationId, schauId)`.
- **Datenbank:** Schema-Einstieg `apps/server/src/db/schema.ts` (Drizzle), Tabellen nach Fachgebiet in `db/schema-*.ts`.
  Änderung am Schema: passende `schema-*.ts` ändern (neue Datei in `schema.ts` weiterreichen),
  `cd apps/server && bun run db:generate` erzeugt die Migration in `apps/server/drizzle/NNNN_*.sql` (mit ins Repo).
  Legen zwei Zweige je eine Migration an, verwirft der zweite beim Merge seine Migration samt Schnappschuss und
  Journal-Eintrag und erzeugt sie auf dem neuen Stand neu – nur umbenennen hieße, sie würde beim Einspielen still
  übersprungen. Der Servertest `62-gesundheitspruefung` prüft das (`migrationsverzeichnisFehler()`).
  Betrieb spielt sie mit `bun run db:migrate` ein, Entwicklung und Tests mit `db:push`. Danach immer `db/schutz.sql`
  (Trigger für Protokoll und Kasse, wiederholbar).
- **Protokoll:** Jede Änderung an Bewertung, Preisen, Verkauf und Geld schreibt `protokolliere()` (`services/protokoll.ts`)
  in derselben Transaktion; die Datenbank verkettet die Einträge per Hash ([ADR 003](entscheidungen/003-protokoll-hash-kette.md)).

## Fachgebiete und wo sie heute liegen

| Fachgebiet | Domain | Server | Web |
|---|---|---|---|
| Schau, Phasen, Prüfliste | `types.ts` | `routers/schau.ts` mit `routers/schau/*` (Phase: `phase.ts`), `services/pruefung.ts` | `einstellungen.tsx`, `einstellungen-*.tsx`, `uebersicht.tsx` |
| Stammdaten (Rassen, Vereine, Veterinärämter) | `stammdaten.ts`, `veterinaeramt.ts` | `routers/stammdaten.ts`, `services/vereinsverzeichnis.ts` | `stammdaten.tsx`, `rassebilder.tsx` |
| Meldung, Aussteller, Gebühren | `gebuehren.ts`, `adressen.ts`, `besatz.ts` | `routers/meldung.ts`, `routers/oeffentlich.ts`, `services/meldung.ts` | `meldungen.tsx`, `meldung-bearbeiten.tsx`, `oeffentlich.tsx` |
| Preisrichter, Einteilung, Gruppen, Obmann, Zusage, Verpflichtung, Bewertungsliste | `einteilung.ts`, `preisrichter-zulassung.ts`, `preisrichter-druck.ts` | `routers/preisrichter.ts`, `services/einteilung.ts`, `services/einteilung-vorschlag.ts`, `services/preisrichter-speichern.ts`, `pdf/verpflichtung.ts`, `pdf/bewertungsliste.ts` | `preisrichter.tsx`, `preisrichter-form.tsx` – [Moduldoku](module/preisrichter.md) |
| **Halle** (Käfige, Hallenplan, 3D) | `kaefige.ts`, `hallenplan*.ts` | `routers/katalog/kaefige.ts`, `hallenplan.ts`, `gemeinsam.ts`, `pdf/hallenplan.ts` | `kaefige.tsx`, `hallenplan*.tsx` – [Moduldoku](module/halle.md) |
| **Katalog** (Nummern, Sortierung, Druck) | `katalog.ts` | `routers/katalog/nummern.ts`, `routers/katalog-gestaltung.ts`, `pdf/katalog.ts` mit `pdf/katalog-*.ts` | `katalog*.tsx` – [Moduldoku](module/katalog.md) |
| **Drucke** (Übersicht, Formate je Schau, [029](entscheidungen/029-druckformate.md)) | `druck-formate.ts`, `druckvorlage.ts`, `briefvorlage.ts` | `routers/druck-formate.ts` (`druckvorlage.formate/formateSetzen`), `routers/druckvorlage.ts`, `pdf/*`, `datei-*.ts` | `einstellungen-druck.tsx` – [Moduldoku](module/drucke.md) |
| Schautage (Einlieferung, Bewertung, Preise) | `noten.ts`, `preise.ts`, `tiergesundheit.ts`, `textbausteine.ts` | `routers/katalog/einlieferung.ts`, `gesundheit.ts` (`halle.*`), `routers/bewertung.ts`, `routers/preise.ts`, Grundbestand der Textbausteine `services/textbausteine-gestalt/-kopf/-rumpf/-gefieder.ts` | `einlieferung.tsx`, `bewertung.tsx`, `richter.tsx`, `richter-*.tsx`, `preise.tsx` |
| Verkauf, Kasse, Abrechnung, SEPA | `geld.ts`, `abrechnung.ts`, `sepa.ts` | `routers/kasse/{verkauf,auszahlung,sepa,kassenbuch,gemeinsam}.ts`, `services/kasse*.ts` | `verkauf.tsx`, `abrechnung.tsx`, `kassenbuch.tsx` |
| Datenschutz, Protokoll | `datenschutz.ts` | `services/datenschutz.ts`, `services/protokoll*.ts`, `db/schutz.sql` | `verein.tsx`, `protokoll.tsx` |
| Anmeldung, Benutzer | – | `routers/auth/*`, `auth.ts` | `benutzer.tsx`, `benutzer-*.tsx`, `rahmen.tsx` |
| Kommende Schauen (Termine) | `termine.ts`, `kommende-schauen.ts` | `routers/termine.ts` | `kommende-schauen.tsx` |
| Spenden, Zuwendungsbestätigung | `spenden.ts`, `zuwendungsbestaetigung.ts` | `routers/spenden.ts`, `services/spenden*.ts`, `pdf/spenden.ts` | `spenden.tsx`, `spender.tsx`, `verein-steuer.tsx` |
| Meisterschaften | `meisterschaft.ts` | `routers/meisterschaft.ts`, `services/meisterschaften.ts` | `meisterschaften.tsx`, `einstellungen-meisterschaften.tsx` |
| Import aus Altprogrammen | `import.ts` | `routers/import.ts` (`datenimport.*`), `services/import.ts`, `import/xlsx.ts` | `import.tsx` |
| Teilschauen (fortlaufende Katalognummern) | `teilschau.ts`, `katalog.ts` | `routers/schau/einstellungen.ts` (`teilschauenSetzen`), `services/eintraege.ts`, `pdf/katalog-tierteil.ts` | `einstellungen-teilschauen.tsx` |
| Hallenplan-Entwürfe und Archiv | `hallenplan-entfernen.ts` (`halleOhneFestenPlan`), `hallenentwurf.ts` (`entwurfRueckfrage`) | `routers/hallenentwurf.ts`, `db/schema-hallenentwurf.ts` | `hallenplan-entwuerfe.tsx` |
| SEPA-Lastschrift | `lastschrift.ts` | `routers/lastschrift.ts`, `db/schema-lastschrift.ts` | `lastschrift.tsx`, `aussteller-mandate.tsx`, `verein-lastschrift.tsx` |
| Betrieb: Gesundheitsprüfung `/api/gesund` ([024](entscheidungen/024-gesundheitspruefung.md)) | `gesundheitspruefung.ts` (`schautageLaufen`, `offeneMigrationen`) | `index.ts`, `services/gesundheitspruefung.ts`, `db/schema-betrieb.ts`; Zeitpunkt der Sicherung aus `scripts/backup.sh` | – |
| Betrieb: Lesemodus `NUR_LESEN` ([025](entscheidungen/025-lesemodus.md)) | `lesemodus.ts` (`NUR_LESEN_MELDUNG`) | `lesemodus.ts` (Ausnahmen, Sperre außerhalb von tRPC), `trpc.ts` (`basis`), `routers/betrieb.ts` (`betrieb.lesemodus`) | `komponenten/lesemodus.tsx` in `rahmen.tsx`, `richter-tablet.tsx`, `oeffentlich.tsx` |
| Betrieb: Ersteinrichtung über die Kommandozeile ([026](entscheidungen/026-einrichten-per-befehl.md)) | – | `einrichten.ts` (Befehl, aufgerufen von `deploy/schaufuchs`), `services/ersteinrichtung.ts` (gemeinsam mit `auth.einrichten`) | – |
| Sprachen ([020](entscheidungen/020-sprachen-fuer-aussteller.md), [022](entscheidungen/022-sprachen-der-oberflaeche.md)) | `sprachen/`, `sprachen/oberflaeche/` (`oberflaeche()`, `serverText()`) | `routers/oeffentlich.ts`, `routers/meldung.ts` (`eingangsText`), `routers/auth/anmeldung.ts` (`spracheSetzen`) | `sprache.tsx`, `sprache-jetzt.ts`, alle Seiten über `useOberflaeche()` – [Moduldoku](module/sprachen.md) |

Bedienung und Hintergründe für Anwender: `docs/handbuch/` (in der App unter `/hilfe`).

## Lokal starten und prüfen

```bash
bun install
bun run db:start && bun run db:push && bun run db:seed   # PostgreSQL auf Port 5442, Daten in .data/
bun run dev:server                                       # API auf http://localhost:8787
bun run dev:web                                          # Oberfläche (Vite)
bun run typecheck                                        # alle drei Pakete
bun run test                                             # Domain-Tests und Server-Ablauf gegen schau_test
bun run pruefen                                          # alles zusammen wie in der CI (siehe unten)
```

Eigene Test-Datenbank, z. B. wenn mehrere Sitzungen parallel testen: `TEST_DATABASE_URL=postgres://schau@localhost:5442/schau_test_x`
(der Name muss „test“ enthalten, die Datenbank muss es geben). Die Server-Tests in `apps/server/src/tests` laufen nacheinander
gegen dieselbe Datenbank (Einstieg `ablauf.test.ts`); neue Prüfungen als neuer Teil am Ende. Alles in Docker: `bun run docker:start`.

## Grundregeln (ausführlich in den Entscheidungen)

- Geld in Cent (integer), Provisionen in Basispunkten – [ADR 004](entscheidungen/004-geld-in-cent.md)
- Änderungen an Bewertung, Preisen, Verkauf, Geld über `protokolliere()` – [ADR 003](entscheidungen/003-protokoll-hash-kette.md)
- Preisrichter sehen keine Ausstellernamen – [ADR 005](entscheidungen/005-anonyme-bewertung.md)
- Keine Erklärtexte in der Oberfläche, „Hilfe zu …“ ins Handbuch – [ADR 008](entscheidungen/008-handbuch-statt-erklaertexte.md)
- BDRG-Daten nur über Pflege und Import, nicht im Repo – [ADR 027](entscheidungen/027-bdrg-daten-nutzung.md)
- Deutsche Fachbegriffe in Oberfläche und Code-Bezeichnern
- Dateien unter 600 Zeilen halten (Ziel 400); größere beim nächsten Anfassen teilen

## Prüfkette (CI)

`bun run pruefen` (`scripts/pruefen.sh`): Typecheck, Domain- und Server-Tests, Modulkarte aktuell, Warnung bei Dateien über
600 Zeilen. Ohne `TEST_DATABASE_URL` startet es die lokale Datenbank wie `bun run test`. Ist die Modulkarte veraltet,
schreibt es sie neu – lokal ein Hinweis (mit committen), in der CI ein Fehler. Bei einem Merge-Konflikt in
`docs/modulkarte.md` die Datei nicht von Hand zusammenführen, sondern `bun run modulkarte` ausführen.

Die CI steht in `.github/workflows/pruefen.yml` (gleiche Datei unter `.gitea/workflows/` für Gitea Actions):
Container `node:22-bookworm`, Bun, PostgreSQL 16 als Dienst, `bun install --frozen-lockfile`, Schema und Schutz, `bun run pruefen`.
Ein Versions-Tag (`v1.2.0`) baut die fertigen Images für Vereine (`.github/workflows/veroeffentlichen.yml`, siehe `docs/betrieb.md`).
