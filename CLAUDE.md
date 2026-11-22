# SchauFUCHS (Schauverwaltung Rassegeflügel) – Projektregeln

Web-Anwendung für Rassegeflügelschauen: Meldung, Katalog, Bewertung (Tablet, offline), Preise, Verkauf, Abrechnung.
Fachbegriffe, Oberfläche und Code-Bezeichner auf Deutsch (wie im Bestand). Konzept: `docs/konzept.md`.

## Erst lesen, dann ändern
1. `docs/architektur.md` – Schichten, Datenfluss, Fachgebiete, Befehle (eine Seite).
2. `docs/modulkarte.md` – alle Exporte, tRPC-Prozeduren und Seiten mit Datei; hier suchen statt Code durchlesen.
3. Moduldoku in `docs/module/` (z. B. `halle.md`, `katalog.md`) und die Entscheidungen in `docs/entscheidungen/`.
Danach nur die genannten Dateien öffnen.

## Befehle
- `bun run db:start` / `db:push` / `db:seed` – lokale PostgreSQL (Port 5442), Schema, Demo-Daten
- `bun run dev:server` / `bun run dev:web`
- `bun run typecheck`, `bun run test`, `bun run pruefen` (alles wie in der CI)
- `bun run modulkarte` – `docs/modulkarte.md` neu erzeugen
- Docker/OrbStack und weitere: `docs/architektur.md`

## Regeln
- Fachregeln in `packages/domain` (rein, mit Test); Server und Web rufen sie nur auf.
- Geld immer in Cent (integer), Provisionen in Basispunkten – `docs/entscheidungen/004`.
- Jede Änderung an Bewertung, Preisen, Verkauf, Geld über `protokolliere()` – `003`.
- Preisrichter sehen keine Ausstellernamen – `005`.
- Keine langen Erklärtexte in der Oberfläche; „Hilfe zu …“ auf den Handbuchabschnitt (`/hilfe/ausstellungsleitung#abschnitt`) – `008`.
- Keine echten BDRG-Daten ins Repo (Verzeichnis, Auszüge, Zuordnung Rasse → Gruppe); im Verein nur über Pflege und Import – `027`.
- Hallenplan: Grundplatten nie kürzen (`001`), Möbel keine Sperrfläche (`002`), fester Plan (`006`).
- Dateien unter 600 Zeilen halten (Ziel 400); `bun run pruefen` warnt.
- Commit-Betreff kurz (≤ 50 Zeichen, „Bereich: was sich ändert“), ohne Versionsnummer; Version nur in Tag und
  Versionshinweisen, die Erhöhung kommt in den letzten Commit des Blocks.
- **Pflege:** Wer öffentliche Funktionen, Prozeduren oder Seiten ändert, führt `bun run modulkarte` aus und committet
  `docs/modulkarte.md` mit; Moduldoku und betroffene Entscheidung mitpflegen, neue Entscheidung als neue ADR-Datei.
  Bei Merge-Konflikt in der Modulkarte neu erzeugen statt zusammenführen.

## Multi-Agent Workflows
Sinnvoll bei: parallelen Feature-Erweiterungen in getrennten Bereichen (z. B. SEPA-Export, Import aus Altprogrammen,
Mandantenfähigkeit) und bei Bulk-Prüfungen (Review aller Router auf Berechtigungen). Nicht sinnvoll für Änderungen an
der gemeinsamen Fachlogik in `packages/domain` – die sequenziell machen.
