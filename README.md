<p align="center"><img src="apps/web/public/icon-192.png" alt="SchauFUCHS" width="120"></p>

# SchauFUCHS

**Die Schauverwaltung für Rassegeflügelausstellungen – frei, zum Selberhosten.**

Mit SchauFUCHS wickelt ein Verein seine Rassegeflügelschau komplett ab: Online-Meldung, Katalog und Hallenplan,
Bewertung am Tablet (auch ohne Netz), Preise, Tierverkauf, Kasse und Abrechnung. Grundlage sind die AAB des BDRG mit
den Sonderbestimmungen der jeweiligen Schau. Die Oberfläche ist deutsch, die Handbücher für Ausstellungsleitung, Helfer
und Preisrichter sind eingebaut.

- **Für Vereine:** [SchauFUCHS installieren](docs/installation.md) – ein gemieteter Server für rund 5 € im Monat, ein Befehl, fertig.
- **Betrieb, Sicherung, Notfälle:** [docs/betrieb.md](docs/betrieb.md)
- **Für Entwickler:** [Architektur](docs/architektur.md), [Modulkarte](docs/modulkarte.md), [Mitmachen](CONTRIBUTING.md)

## Was die Anwendung kann

| Bereich | Funktionen |
|---|---|
| **Einstellungen** | Termine, Kapazität, Standgeld je Meldeart und Jugend, Preisarten mit Schlüssel („auf 10 Tiere 1 E“), Notenskala, Sonderbestimmungen |
| **Rassen und Farbenschläge** | Import als CSV, je Jahr versioniert; die Zeilenfolge ist die Ausstellungsfolge |
| **Meldungen** | Online-Formular für Aussteller (Handy-tauglich), schnelle Erfassung von Papiermeldungen, Zahlungen, automatische Bestätigung bei Zahlungseingang, Eingangsbestätigung per E-Mail |
| **Katalog** | Nummern nach Ausstellungsfolge (Volieren → Stämme → Einzeltiere, jeweils Sparte → Rasse → Farbenschlag → 1,0 jung/alt → 0,1 jung/alt; Volieren und Stämme lassen sich auch bei ihrer Rasse einordnen), Jugendblock, Nummern festschreiben vor der Einlieferung, danach Nachmeldungen mit Unternummer (100a) |
| **Preisrichter** | Einteilung nach Nummernbereichen mit Vorschlag an Rassengrenzen, PIN für das Tablet, Bewertungslisten |
| **Einlieferung** | Tiere abhaken, fehlende markieren, Nachweise je Tierart prüfen (ND Hühner/Puten, PMV Tauben, auf Anordnung Untersuchung Wassergeflügel), Tierausgabe, Gesundheitsjournal mit Sperre für Verkauf und Preise, Aussteller- und Tierliste für das Veterinäramt (PDF/CSV) |
| **Bewertung** | Tablet-App für Preisrichter: anonym, große Bedienelemente, Textbausteine, arbeitet offline und gleicht später ab; Obmann bestätigt „vorzüglich“; Nachtragen von Papierkarten am PC |
| **Preise** | Kontingente je Preisrichter, Prüfung von Mindestpunkten und Mehrfachvergabe, Stiftungen, Freigabe der Ergebnisse |
| **Tierverkauf** | Nur bewertete Tiere ab der Phase „Preise“; Käufer-Registriernummer (geprüft), Altersangabe nach § 11c TierSchG, Provision, Kaufbeleg, Storno bleibt gekennzeichnet in der Verkaufsliste |
| **Kassenbuch** | Barkasse je Tag aus den Buchungen (Verkauf bar, Meldegeld bar, Barauszahlung, Wechselgeld, Einlage, Entnahme) mit Soll-Bestand; Tagesabschluss mit gezähltem Bestand und erklärter Differenz, danach keine Barbuchung mehr am selben Tag; Kassenbericht (PDF) und Kassenbuch (CSV) |
| **Abrechnung** | Je Aussteller Preisgeld + Verkauf − Provision − offenes Meldegeld, Quittung, Gesamtliste, CSV-Export; Sammelüberweisung als SEPA-Datei (pain.001.001.09, geprüft gegen das ISO-Schema) mit IBAN-Prüfung |
| **Druckkatalog** | Heft in A5 (oder A4): Titelseite mit Logo und Titelbild, Inhaltsverzeichnis, Grußworte mit Porträt, Ausstellungsleitung, „Zur besonderen Beachtung“, Preisrichter mit Nummernbereichen, Preise und Stifter, Zeichenerklärung, Ehrentafel, zweispaltiger Tierteil mit PR-Zeilen, Rassen- und Ausstellerverzeichnis, Anzeigenteil, Notizseiten bis zur Vierer-Seitenzahl. Gedruckt wird nach der Bewertung (mit Noten, Preisen, Ehrentafel), vorher als Vorkatalog. Vereinsfarbe (30 Vorschläge oder frei), Logo, Titelbild und Fotos pflegt jeder Verein unter „Druckkatalog“; Schriften Spectral und IBM Plex Sans Condensed (OFL, in `apps/server/fonts`), Spartenseiten mit eigenen Tier-Silhouetten |
| **Drucke (PDF)** | Bewertungskarten (A5), B-Bögen mit doppelten Ringkarten, Preisrichterlisten, Abrechnungen, Kaufbelege |
| **Öffentlich** | Infoseite mit Meldeformular, „Meine Meldung“ per persönlichem Link, Ergebnisse und Katalog nach Freigabe; Impressum und Datenschutzhinweise in der Fußzeile jeder Seite |
| **Aussteller** | Vereinsmitglieder und externe Aussteller getrennt (Mitglied nach festgelegten Schreibweisen des Vereinsnamens oder von Hand), anlegen und Stammdaten ändern mit Protokoll, Auskunft und Löschen |
| **Verein und Datenschutz** | Angaben für Impressum (§ 5 DDG) und Datenschutzhinweise (Art. 13 DSGVO, Muster aus der Software oder eigener Text). Veröffentlichung im Internet nur mit eigener, widerruflicher Einwilligung; ohne unterschriebenen Meldebogen kein Name im Katalog; Jugendmeldung nur mit Erziehungsberechtigtem. Auskunft je Aussteller als PDF und JSON, Löschen auf Wunsch (gesperrt bis Ende der Aufbewahrungsfrist), tägliche Bereinigung nach den Speicherfristen |
| **Protokoll** | Jede Änderung an Bewertung, Preisen, Verkauf und Geld mit Zeit, Person und Grund; unveränderbar (Datenbank-Trigger) mit Hash-Kette und Prüfknopf, Export als CSV. Kaufbelege und Quittungen liegen als PDF mit SHA-256 im Belegarchiv; Zahlungen, Verkäufe und Auszahlungen werden storniert, nie geändert oder gelöscht |

## Installation für Vereine

```bash
curl -fsSL https://raw.githubusercontent.com/eddyreddington/schaufuchs/main/deploy/install.sh | sudo sh
```

Der Installer fragt nur nach Adresse und E-Mail, erzeugt alle Schlüssel, startet SchauFUCHS mit HTTPS und automatischen,
verschlüsselten Sicherungen. Danach: `schaufuchs update`, `schaufuchs zuruecknehmen`, `schaufuchs wiederherstellen` …
Die ausführliche Anleitung mit allen Schritten steht in [docs/installation.md](docs/installation.md).

## Entwicklung

Voraussetzungen: [Bun](https://bun.sh) ≥ 1.3, PostgreSQL 16 (lokal installiert, z. B. über Homebrew).

```bash
bun install
bun run db:start      # lokale Datenbank auf Port 5442, Daten in .data/
bun run db:migrate    # Schema anlegen (Migrationen und Schutz-Trigger, wie im Betrieb)
bun run db:demo       # Demo-Verein mit 40 Ausstellern, bis zur Bewertung vorbereitet
# oder: bun run db:demo:komplett   # ganze Schau durchgespielt (Bewertung, Preise, Verkauf, Abrechnung)
# Beide bauen den Demo-Verein bei jedem Aufruf neu auf; Daten anderer Vereine bleiben unberührt.
bun run dev:server    # API auf http://localhost:8787
bun run dev:web       # Oberfläche auf http://localhost:5173
```

Wer am Schema arbeitet, kann mit `bun run db:push` das Schema direkt angleichen (spielt die Schutz-Trigger mit ein); für echte Daten immer `db:migrate`.

### Demo

| Zugang | Wert |
|---|---|
| Anmeldung Ausstellungsleitung | `demo@schau.test` / `Demo-Schau-2026` |
| Tablet für Preisrichter | `http://localhost:5173/richter/demo-schau-2026`, PIN `20262026` (alle drei Preisrichter) |
| Öffentliche Seite | `http://localhost:5173/s/demo-schau-2026` |

Die Demo-Rassenliste ([apps/server/seed/demo-stammdaten.csv](apps/server/seed/demo-stammdaten.csv)) ist ein kleiner Auszug zum Ausprobieren, **nicht** das offizielle BDRG-Verzeichnis.

**Vollständiges Verzeichnis (nur lokal):** Liegt `lokal/verzeichnis/rassenverzeichnis-2024.csv` vor, nutzen `db:demo`,
`db:demo:komplett` und `docker:demo` diese Datei statt des Auszugs (oder eine Datei aus `SCHAU_VERZEICHNIS`).
Der Ordner `lokal/` ist von Git ausgeschlossen – solange die Nutzungsrechte nicht geklärt sind, gehört das Verzeichnis nicht ins Repo.

Ohne Demo-Daten führt die Anwendung beim ersten Aufruf durch die Ersteinrichtung (Verein und erster Administrator).

## Tests

```bash
bun run test        # Fachlogik + kompletter Schau-Ablauf gegen die Datenbank schau_test
bun run typecheck
```

Der Ablauftest spielt eine ganze Schau durch: Online-Meldung, Zahlung, Katalognummern, Einteilung, Anmeldung per PIN, Bewertung mit Offline-Konflikten, Obmann, Preiskontingente, Freigabe, Verkauf, Abrechnung, Nachmeldung nach Katalogdruck. Unter `bun test` verbindet sich die Anwendung immer mit der Test-Datenbank.

## Aufbau

```
packages/domain   Fachlogik ohne Datenbank: Gebühren, Katalognummern, Noten, Preise, Abrechnung (mit Tests)
apps/server       Bun + Hono + tRPC + Drizzle/PostgreSQL, PDF-Erzeugung (pdfkit)
apps/web          React + Vite + Tailwind, PWA; Tablet-Bewertung mit IndexedDB-Ausgang
docs              Konzept und offene Fachfragen
```

Geld wird durchgehend in Cent gespeichert, Provisionen in Basispunkten. Preisrichter sehen am Tablet keine Ausstellernamen.

## Rassen- und Farbenschlagverzeichnis

SchauFUCHS enthält **kein** Verzeichnis des BDRG – die Nutzungsrechte sind nicht geklärt
([Entscheidung 007](docs/entscheidungen/007-keine-bdrg-daten.md)). Jeder Verein spielt seine Liste als CSV ein; die
Demo-Liste ist ein kleiner Auszug zum Ausprobieren.

## Noch nicht enthalten

Lastschrift für das Standgeld (braucht SEPA-Mandate), Druck auf Endlospapier, mehrere Teilschauen je Ausstellung,
Meisterschaftswertungen, Import aus Altprogrammen. **Kasse:** Ob die Verkaufsstelle eine TSE braucht (§ 146a AO), klärt
jeder Verein mit seinem Steuerberater.

## Lizenz

SchauFUCHS steht unter der [European Union Public Licence 1.2](LICENSE) (EUPL-1.2), gültig in allen Amtssprachen der EU
([deutsche Fassung](https://interoperable-europe.ec.europa.eu/collection/eupl/eupl-text-eupl-12)). Schriften und Bilder
von Dritten: [THIRD-PARTY.md](THIRD-PARTY.md).

---

**English:** SchauFUCHS is a free, self-hostable web application for German fancy poultry shows (entries, catalogue, hall
plan, offline judging on tablets, prizes, sales, accounting). The user interface and documentation are in German.
Licensed under the EUPL-1.2.
