# Mitmachen

Danke, dass Sie SchauFUCHS verbessern wollen – ob als Verein mit einer Rückmeldung oder als Entwickler mit Code.

## Rückmeldungen und Fehler

- **Fehler:** Issue „Fehler melden“ – was Sie getan haben, was passiert ist, was Sie erwartet haben, Version (Benutzermenü
  unten links). Bitte keine echten Personendaten in Issues und Bildschirmfotos.
- **Wünsche:** Issue „Vorschlag“ – welches Problem bei der Schau gelöst werden soll, nicht nur die Lösung.
- **Sicherheitslücken:** nicht öffentlich, siehe [SECURITY.md](SECURITY.md).

## Code beitragen

1. Erst lesen: [docs/architektur.md](docs/architektur.md) (eine Seite) und die [Modulkarte](docs/modulkarte.md); für
   größere Änderungen vorher ein Issue anlegen und den Plan abstimmen.
2. Entwicklungsumgebung: siehe README, Abschnitt „Entwicklung“ (Bun, PostgreSQL, Demo-Daten).
3. Regeln, die immer gelten:
   - Fachregeln in `packages/domain`, rein und mit Test; Server und Oberfläche rufen sie nur auf.
   - Geld in Cent, Provisionen in Basispunkten ([Entscheidung 004](docs/entscheidungen/004-geld-in-cent.md)).
   - Änderungen an Bewertung, Preisen, Verkauf und Geld über `protokolliere()` ([003](docs/entscheidungen/003-protokoll-hash-kette.md)).
   - Preisrichter sehen keine Ausstellernamen ([005](docs/entscheidungen/005-anonyme-bewertung.md)).
   - Oberfläche ohne lange Erklärtexte; Erklärungen ins Handbuch `docs/handbuch/` ([008](docs/entscheidungen/008-handbuch-statt-erklaertexte.md)).
   - Keine Daten des BDRG ([007](docs/entscheidungen/007-keine-bdrg-daten.md)), keine echten Personendaten in Tests und Demo.
   - Fachbegriffe und Bezeichner auf Deutsch, wie im Bestand. Dateien unter 600 Zeilen (Ziel 400).
4. Vor dem Pull Request: `bun run pruefen` (Typprüfung, Modulkarte, alle Tests) muss grün sein; neue öffentliche
   Funktionen, Prozeduren oder Seiten: `bun run modulkarte` und `docs/modulkarte.md` mit einchecken. Bei Fehlerbehebungen
   zuerst einen Test schreiben, der den Fehler zeigt.
5. Handbuch geändert: `sh scripts/handbuch.sh` (braucht pandoc und WeasyPrint) und die erzeugten Dateien mit einchecken.
   Oberfläche geändert: Bildschirmfotos neu mit `bun run handbuch:bilder` (eigene Demo-Datenbanken, Chrome ohne Fenster).

Mit einem Beitrag stimmen Sie zu, dass er unter der EUPL-1.2 veröffentlicht wird.
