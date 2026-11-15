# Werke Dritter in SchauFUCHS

SchauFUCHS selbst steht unter der EUPL-1.2 (siehe `LICENSE`). Folgende mitgelieferte Werke stehen unter eigenen Lizenzen:

## Schriften (SIL Open Font License 1.1)

| Schrift | Verwendung | Lizenztext |
|---|---|---|
| Archivo | Oberfläche | `apps/web/src/schriften/OFL.txt` |
| Atkinson Hyperlegible | Katalog (Schrift „Gut lesbar“) | `apps/server/fonts/OFL-AtkinsonHyperlegible.txt` |
| EB Garamond | Katalog | `apps/server/fonts/OFL-EBGaramond.txt` |
| IBM Plex Sans Condensed | Katalog, Drucke | `apps/server/fonts/OFL-IBMPlex.txt` |
| Source Sans 3 | Katalog | `apps/server/fonts/OFL-SourceSans3.txt` |
| Spectral | Katalog | `apps/server/fonts/OFL-Spectral.txt` |

## Bilder

- **Stiche im Katalog** (`apps/server/stiche/`): historische Holz- und Kupferstiche von Wikimedia Commons, gemeinfrei
  bzw. ohne bekannte Einschränkungen; Quellen je Datei in `apps/server/stiche/QUELLEN.md`.
- **Logo und App-Symbol** (`apps/web/public/icon*`): eigenes Werk, Teil von SchauFUCHS (EUPL-1.2).

## Daten

- **Veterinärämter** (`apps/server/src/daten/veterinaeraemter.json`): öffentliche Behördenangaben (Anschrift, Telefon,
  E-Mail), je Eintrag mit amtlicher Quelle (`quelle`), Stand siehe Datei. Zuständigkeiten vor der Verwendung prüfen.
- **Demo-Rassenliste** (`apps/server/seed/demo-stammdaten.csv`): kleiner, selbst zusammengestellter Auszug zum
  Ausprobieren – **nicht** das Verzeichnis des BDRG.
- **Textbausteine für die Bewertung**: eigene Formulierungen, Herkunft in `docs/textbausteine-quellen.md`.

## Programmbibliotheken

Die Abhängigkeiten (siehe `package.json` und `bun.lock`) behalten ihre eigenen Lizenzen; sie werden beim Bauen aus der
npm-Registry geladen und nicht im Quellcode mitgeliefert.
