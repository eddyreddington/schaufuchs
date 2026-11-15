# Architektur

Eine Seite zum Einstieg. Wer etwas ändern will, liest danach nur noch die [Modulkarte](modulkarte.md) (wo liegt was), die
Moduldoku in [`docs/module/`](module/) und die [Entscheidungen](entscheidungen/) – und öffnet dann die 1–3 genannten Dateien.

## Schichten

| Schicht | Inhalt | Regel |
|---|---|---|
| `packages/domain` (`@schau/domain`) | Reine Fachlogik: Gebühren, Katalognummern, Noten, Preise, Abrechnung, Hallenplan, SEPA, Fristen | Keine Datenbank, kein Netz, keine Oberfläche. Jede Fachregel einmal, hier, mit Test daneben (`*.test.ts`). |
| `apps/server` | Bun + Hono + tRPC + Drizzle (PostgreSQL 16) | Router in `src/routers` prüfen Eingabe (zod) und Rechte, Logik mit Datenbank in `src/services`, PDFs in `src/pdf`, Datei-Endpunkte (PDF, CSV, Bilder) in `src/index.ts`. |
| `apps/web` | React + Vite + Tailwind + tRPC-Client, PWA | Seiten in `src/seiten`, Routen in `src/routes.tsx`, Bausteine in `src/ui.tsx` und `src/komponenten`. Rechnet nichts Fachliches selbst, sondern ruft `@schau/domain` auf. Das Preisrichter-Tablet (`seiten/richter.tsx`) arbeitet offline (IndexedDB). |

Abhängigkeiten nur nach unten: web → Typen des Servers (`AppRouter`) → domain.

## Datenfluss

- **tRPC:** `apps/server/src/router.ts` setzt die Router zu `appRouter` zusammen (Bereiche wie `schau`, `meldung`, `katalog`,
  `halle`). Das Web ruft `trpc.<bereich>.<prozedur>.useQuery/useMutation` auf, Typen kommen ohne Code-Erzeugung direkt
  aus dem Server. Rollen über die Prozedur-Art in `src/trpc.ts`: `publicProcedure`, `benutzerProcedure` (angemeldet),
  `adminProcedure` (Ausstellungsleitung mit Zwei-Faktor), `richterProcedure` (Tablet). Mandant: `ladeSchau(organisationId, schauId)`.
- **Datenbank:** Schema in `apps/server/src/db/schema.ts` (Drizzle). Änderung am Schema: `schema.ts` ändern,
  `cd apps/server && bun run db:generate` erzeugt die Migration in `apps/server/drizzle/NNNN_*.sql` (mit ins Repo).
  Betrieb spielt sie mit `bun run db:migrate` ein, Entwicklung und Tests mit `db:push`. Danach immer `db/schutz.sql`
  (Trigger für Protokoll und Kasse, wiederholbar).
- **Protokoll:** Jede Änderung an Bewertung, Preisen, Verkauf und Geld schreibt `protokolliere()` (`services/protokoll.ts`)
  in derselben Transaktion; die Datenbank verkettet die Einträge per Hash ([ADR 003](entscheidungen/003-protokoll-hash-kette.md)).

## Fachgebiete und wo sie heute liegen

| Fachgebiet | Domain | Server | Web |
|---|---|---|---|
| Schau, Phasen, Prüfliste | `types.ts` | `routers/schau.ts`, `services/pruefung.ts` | `einstellungen.tsx`, `uebersicht.tsx` |
| Stammdaten (Rassen, Vereine, Veterinärämter) | `stammdaten.ts`, `veterinaeramt.ts` | `routers/stammdaten.ts`, `services/vereinsverzeichnis.ts` | `stammdaten.tsx`, `rassebilder.tsx` |
| Meldung, Aussteller, Gebühren | `gebuehren.ts`, `adressen.ts`, `besatz.ts` | `routers/meldung.ts`, `routers/oeffentlich.ts`, `services/meldung.ts` | `meldungen.tsx`, `meldung-bearbeiten.tsx`, `oeffentlich.tsx` |
| Preisrichter, Einteilung | `einteilung.ts` | `routers/preisrichter.ts`, `services/einteilung.ts` | `preisrichter.tsx` |
| **Halle** (Käfige, Hallenplan, 3D) | `kaefige.ts`, `hallenplan*.ts` | `routers/katalog.ts` (Teil), `pdf/hallenplan.ts` | `kaefige.tsx`, `hallenplan*.tsx` – [Moduldoku](module/halle.md) |
| **Katalog** (Nummern, Sortierung, Druck) | `katalog.ts` | `routers/katalog.ts`, `routers/katalog-gestaltung.ts`, `pdf/katalog.ts` | `katalog*.tsx` – [Moduldoku](module/katalog.md) |
| Schautage (Einlieferung, Bewertung, Preise) | `noten.ts`, `preise.ts`, `tiergesundheit.ts`, `textbausteine.ts` | `routers/katalog.ts` (`halle.*`), `routers/bewertung.ts`, `routers/preise.ts` | `einlieferung.tsx`, `bewertung.tsx`, `richter.tsx`, `preise.tsx` |
| Verkauf, Kasse, Abrechnung, SEPA | `geld.ts`, `abrechnung.ts`, `sepa.ts` | `routers/kasse.ts`, `services/kasse*.ts` | `verkauf.tsx`, `abrechnung.tsx`, `kassenbuch.tsx` |
| Datenschutz, Protokoll | `datenschutz.ts` | `services/datenschutz.ts`, `services/protokoll*.ts`, `db/schutz.sql` | `verein.tsx`, `protokoll.tsx` |
| Anmeldung, Benutzer | – | `routers/auth/*`, `auth.ts` | `benutzer.tsx`, `rahmen.tsx` |
| Kommende Schauen (Termine) | `termine.ts`, `kommende-schauen.ts` | `routers/termine.ts` | `kommende-schauen.tsx` |
| Spenden, Zuwendungsbestätigung | `spenden.ts`, `zuwendungsbestaetigung.ts` | `routers/spenden.ts`, `services/spenden*.ts`, `pdf/spenden.ts` | `spenden.tsx`, `spender.tsx`, `verein-steuer.tsx` |
| Meisterschaften | `meisterschaft.ts` | `routers/meisterschaft.ts`, `services/meisterschaften.ts` | `meisterschaften.tsx`, `einstellungen-meisterschaften.tsx` |
| Import aus Altprogrammen | `import.ts` | `routers/import.ts` (`datenimport.*`), `services/import.ts`, `import/xlsx.ts` | `import.tsx` |

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
- Keine BDRG-Daten ohne Nutzungsrecht – [ADR 007](entscheidungen/007-keine-bdrg-daten.md)
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
