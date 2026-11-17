<p align="center"><img src="apps/web/public/icon-192.png" alt="SchauFUCHS" width="120"></p>

# SchauFUCHS

**Die Schauverwaltung für Rassegeflügelausstellungen – frei, zum Selberhosten.**

Mit SchauFUCHS wickelt ein Verein seine Rassegeflügelschau komplett ab: Online-Meldung, Katalog und Hallenplan,
Bewertung am Tablet (auch ohne Netz), Preise, Tierverkauf, Kasse und Abrechnung. Grundlage sind die AAB des BDRG mit
den Sonderbestimmungen der jeweiligen Schau. Die Oberfläche ist deutsch, die Handbücher für Ausstellungsleitung, Helfer
und Preisrichter sind eingebaut.

- **Für Vereine:** [SchauFUCHS installieren und betreiben](docs/installation.md) – Schritt für Schritt vom leeren Server (rund 5 € im Monat) bis zur abgesicherten, erreichbaren Schau.
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
| **Abrechnung** | Je Aussteller Preisgeld + Verkauf − Provision − offenes Meldegeld, Quittung, Gesamtliste, CSV-Export; Sammelüberweisung als SEPA-Datei (pain.001.001.09, geprüft gegen das ISO-Schema) mit IBAN-Prüfung; Einzug des Meldegelds per SEPA-Lastschrift (pain.008) mit Mandaten, Vorabankündigung und Rücklastschrift |
| **Druckkatalog** | Heft in A5 (oder A4): Titelseite mit Logo und Titelbild, Inhaltsverzeichnis, Grußworte mit Porträt, Ausstellungsleitung, „Zur besonderen Beachtung“, Preisrichter mit Nummernbereichen, Preise und Stifter, Zeichenerklärung, Ehrentafel, zweispaltiger Tierteil mit PR-Zeilen, Rassen- und Ausstellerverzeichnis, Anzeigenteil, Notizseiten bis zur Vierer-Seitenzahl. Gedruckt wird nach der Bewertung (mit Noten, Preisen, Ehrentafel), vorher als Vorkatalog. Vereinsfarbe (30 Vorschläge oder frei), Logo, Titelbild und Fotos pflegt jeder Verein unter „Druckkatalog“; Schriften Spectral und IBM Plex Sans Condensed (OFL, in `apps/server/fonts`), Spartenseiten mit eigenen Tier-Silhouetten |
| **Drucke (PDF)** | Bewertungskarten (A5), B-Bögen mit doppelten Ringkarten, Preisrichterlisten, Abrechnungen, Kaufbelege |
| **Öffentlich** | Infoseite mit Meldeformular, „Meine Meldung“ per persönlichem Link, Ergebnisse und Katalog nach Freigabe; Impressum und Datenschutzhinweise in der Fußzeile jeder Seite |
| **Aussteller** | Vereinsmitglieder und externe Aussteller getrennt (Mitglied nach festgelegten Schreibweisen des Vereinsnamens oder von Hand), anlegen und Stammdaten ändern mit Protokoll, Auskunft und Löschen |
| **Verein und Datenschutz** | Angaben für Impressum (§ 5 DDG) und Datenschutzhinweise (Art. 13 DSGVO, Muster aus der Software oder eigener Text). Veröffentlichung im Internet nur mit eigener, widerruflicher Einwilligung; ohne unterschriebenen Meldebogen kein Name im Katalog; Jugendmeldung nur mit Erziehungsberechtigtem. Auskunft je Aussteller als PDF und JSON, Löschen auf Wunsch (gesperrt bis Ende der Aufbewahrungsfrist), tägliche Bereinigung nach den Speicherfristen |
| **Protokoll** | Jede Änderung an Bewertung, Preisen, Verkauf und Geld mit Zeit, Person und Grund; unveränderbar (Datenbank-Trigger) mit Hash-Kette und Prüfknopf, Export als CSV. Kaufbelege und Quittungen liegen als PDF mit SHA-256 im Belegarchiv; Zahlungen, Verkäufe und Auszahlungen werden storniert, nie geändert oder gelöscht |

## Installation für Vereine

### Systemvoraussetzungen

| | Voraussetzung |
|---|---|
| **Rechner** | Ein eigener Rechner im Verein, der durchläuft (Mini-PC, alter PC, Raspberry Pi 4/5 mit 64-Bit-System), mit Linux. Geprüft mit **Debian 12** und **Ubuntu 24.04 LTS**; andere Linux-Systeme, auf denen Docker läuft, sollten gehen, sind aber nicht geprüft. |
| **Prozessor** | 64 Bit, Intel/AMD (`amd64`) oder ARM (`arm64`, z. B. Raspberry Pi). Fertige Images gibt es für beide. |
| **Größe** | 2 CPU-Kerne, 4 GB Arbeitsspeicher, 40 GB Speicher. |
| **Netz** | Ein Internetanschluss mit öffentlicher IPv4-Adresse; im Router die Ports 80 und 443 an den Rechner weitergeleitet; eine eigene Adresse (z. B. `schau.example.org`), die per DNS auf den Anschluss zeigt (ohne feste IP über DynDNS). |
| **Software** | Nur Docker mit `docker compose` – der Installer richtet es bei Bedarf selbst ein. |
| **Laptop (Mac, Windows)** | Zum Ausprobieren, für Schulungen oder als Einzelplatz unter `https://localhost`: Mac mit Docker Desktop oder OrbStack (ab 1.2.1, geprüft mit OrbStack), Windows über WSL2 mit Ubuntu und Docker Desktop (nicht geprüft). Für eine Schau mit Online-Meldung und Tablets braucht es den Rechner im Verein mit eigener Adresse. |
| **Arbeitsplätze** | Jeder aktuelle Browser – auch auf Windows, macOS, iPad und Android-Tablets. |

Benutzt wird SchauFUCHS nur im Browser; auf den Rechnern und Tablets des Vereins wird nichts installiert. Preisrichter
bewerten am Tablet auch ohne Netz (die Seite lässt sich als App auf den Startbildschirm legen).

### Installieren und in Betrieb nehmen

Die [Anleitung](docs/installation.md) führt Schritt für Schritt vom eigenen Rechner im Verein bis zur abgesicherten,
erreichbaren Schau. Wer SchauFUCHS anders betreibt, passt die Schritte selbst an. In Kurzform:

1. **SSH-Schlüssel** auf dem eigenen Computer erzeugen (`ssh-keygen -t ed25519`).
2. **Rechner einrichten:** Ubuntu 24.04 oder Debian 12 mit SSH-Server und eigenem Benutzer, feste Adresse im
   Vereinsnetz, Dauerbetrieb.
3. **Adresse einrichten:** im Router Portweiterleitung 80/443 (ggf. DynDNS), DNS-Eintrag `schau` → Anschluss. Das
   HTTPS-Zertifikat holt der mitgelieferte Caddy danach selbst bei Let's Encrypt.
4. **Eigener Benutzer mit sudo:** den Schlüssel hinterlegen – gearbeitet wird nicht als root.
5. **Absichern:** SSH nur mit Schlüssel und ohne root (`PermitRootLogin no`, `PasswordAuthentication no`), Firewall
   (ufw) nur für 22, 80 und 443, automatische Sicherheitsupdates (unattended-upgrades).
6. **Installieren** – als eigener Benutzer, ein Befehl:

   ```bash
   curl -fsSL https://raw.githubusercontent.com/eddyreddington/schaufuchs/main/deploy/install.sh | sudo sh
   ```

   Der Installer fragt nur nach Adresse und E-Mail (für das HTTPS-Zertifikat), installiert bei Bedarf Docker, erzeugt
   alle Schlüssel, startet SchauFUCHS mit HTTPS und automatischen, verschlüsselten Sicherungen. Am Ende zeigt er die
   Adresse und einen Einrichtungscode. `sudo schaufuchs pruefen` fragt danach die Absicherung ab (ab 1.2.1).
7. **Notfallblatt sichern:** `~/schaufuchs-notfallblatt.txt` (Schlüssel zum Wiederherstellen) in den Passwortmanager
   oder ausdrucken, dann auf dem Rechner löschen.
8. **Verein einrichten:** Adresse im Browser öffnen, mit dem Einrichtungscode den ersten Ausstellungsleiter anlegen,
   Zwei-Faktor-Anmeldung einrichten, Impressum und Datenschutzhinweise ausfüllen.
9. **Optional Mailversand:** `sudo schaufuchs einstellungen` und `SMTP_URL` eintragen (siehe unten).

Auf dem Laptop (Mac, Windows) geht es mit der Adresse `localhost` – siehe „Zum Ausprobieren: auf dem Laptop“ in der Anleitung.
Updates, Sicherung außer Haus, Wiederherstellung, Neustart, Meldungen und Notfälle stehen ebenfalls in der
[Anleitung](docs/installation.md), Einzelheiten zu Sicherung und Hallenbetrieb in [docs/betrieb.md](docs/betrieb.md).

### Im Betrieb

| Was | Befehl auf dem Rechner |
|---|---|
| Läuft alles? | `sudo schaufuchs status` |
| Neue Version einspielen (sichert vorher) | `sudo schaufuchs update` |
| Update zurücknehmen | `sudo schaufuchs zuruecknehmen` |
| Sicherung zurückspielen | `sudo schaufuchs sicherungen`, dann `sudo schaufuchs wiederherstellen DATEI` |
| Einstellungen ändern | `sudo schaufuchs einstellungen` (öffnet `/opt/schaufuchs/.env`, startet danach neu) |
| Absicherung prüfen (SSH, Firewall, Updates) | `sudo schaufuchs pruefen` (ab 1.2.1) |
| Alle Befehle | `sudo schaufuchs hilfe` |

**Überwachung:** `https://…/api/gesund` antwortet mit `ok` und `version`, dazu `letzteSicherung` und
`sicherungAlterStunden` (Stunden seit der letzten Sicherung), `migrationenOffen` und `schautage` (läuft gerade eine
Schau?) – z. B. für Uptime Kuma: warnen, wenn `sicherungAlterStunden` fehlt (`null`) oder über 26 liegt (bei geändertem
`BACKUP_INTERVALL_MINUTEN`: 24 Stunden plus Intervall); Updates nicht bei `schautage: true`. Einzelheiten:
[Entscheidung 024](docs/entscheidungen/024-gesundheitspruefung.md).

### Konfiguration

Alles steht in `/opt/schaufuchs/.env`; der Installer legt die Datei an. Ändern mit `sudo schaufuchs einstellungen`.

| Einstellung | Bedeutung |
|---|---|
| `SCHAUFUCHS_DOMAIN`, `PUBLIC_URL` | Adresse, unter der SchauFUCHS erreichbar ist (z. B. `schau.example.org` bzw. `https://schau.example.org`) |
| `ACME_EMAIL` | E-Mail für das HTTPS-Zertifikat |
| `SMTP_URL`, `MAIL_FROM` | Mailversand, z. B. `smtps://benutzer%40example.org:PASSWORT@mail.example.net:465`; leer: Mails bleiben im Postausgang |
| `BACKUP_INTERVALL_MINUTEN`, `BACKUP_TAGE` | Wie oft gesichert wird (Vorgabe 120 Minuten) und wie lange Sicherungen bleiben (Vorgabe 30 Tage) |
| `APP_NAME` | Name in der Oberfläche (Vorgabe „SchauFUCHS“) |
| `APP_SPEICHER` | Arbeitsspeicher-Grenze der Anwendung (Vorgabe `2g`) |
| `DATENSCHLUESSEL`, `POSTGRES_PASSWORD`, `BACKUP_EMPFAENGER` | Vom Installer erzeugt – **nie ändern**. Ohne den Datenschlüssel sind IBAN und Zwei-Faktor-Geheimnisse nicht mehr lesbar. |

Alles Fachliche – Verein, Benutzer, Schauen, Gebühren, Preise, Druckvorlagen, Briefe, Spenden – stellt die
Ausstellungsleitung in der Anwendung selbst ein; das Handbuch dazu ist unter „Hilfe“ eingebaut.

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

**Kasse:** Ob die Verkaufsstelle eine TSE braucht (§ 146a AO), klärt
jeder Verein mit seinem Steuerberater.

## Lizenz

SchauFUCHS steht unter der [European Union Public Licence 1.2](LICENSE) (EUPL-1.2), gültig in allen Amtssprachen der EU
([deutsche Fassung](https://interoperable-europe.ec.europa.eu/collection/eupl/eupl-text-eupl-12)). Schriften und Bilder
von Dritten: [THIRD-PARTY.md](THIRD-PARTY.md).

---

**English:** SchauFUCHS is a free, self-hostable web application for German fancy poultry shows (entries, catalogue, hall
plan, offline judging on tablets, prizes, sales, accounting). The user interface and documentation are in German.
Licensed under the EUPL-1.2.
