# SchauFUCHS 1.6 – Versionshinweise

## 1.6.2 (16.11.2026)

- Für Anwender keine Änderung. Intern sind die 13 Code-Dateien über 600 Zeilen (Hallenplan-Rechnung, Katalog-PDF,
  Router für Katalog, Schau und Kasse, Server-Einstieg, Datenbankschema, Textbausteine, Preisrichter-Tablet,
  Benutzer, Einstellungen, Katalog-Gestaltung, Oberflächen-Bausteine) in kleinere, verständliche Teildateien
  aufgeteilt – reine Verschiebung, ohne geänderten Ablauf. Doku und Modulkarte zeigen die neuen Stellen.
- `sudo schaufuchs update` sichert vorher und holt 1.6.2. Daten und Tabellen ändern sich nicht.

## 1.6.1 (16.11.2026)

- Mustertext der Datenschutzhinweise, Abschnitt „Meldung zur Schau“: Die E-Mail-Adresse ist nur bei der
  Online-Meldung Pflicht (für Eingangsbestätigung und Link zu „Meine Meldung“), auf dem Meldebogen aus Papier freiwillig.
  Bisher hieß es, ohne E-Mail-Adresse sei keine Meldung möglich. Vereine mit eigenem Datenschutztext betrifft das nicht.
- `sudo schaufuchs update` sichert vorher und holt 1.6.1. Daten und Tabellen ändern sich nicht.

## 1.6.0 (16.11.2026)

Gegenüber 1.5.0 ist neu:

### A-Bogen (Meldebogen zum Ausfüllen)

- Neben dem B-Bogen (Meldebestätigung) gibt es jetzt den A-Bogen: Anschrift, Registriernummer, Tiere in der
  Reihenfolge des Meldebogens, Stiftung und Spende, Erklärungen zur Herkunft, Datenschutz-Kurzfassung, freiwillige
  Einwilligung fürs Internet und die Unterschrift zu AAB und Sonderbestimmungen. Gebühren, Meldeschluss, Meldestelle,
  Termine und Sonderbestimmungen stehen schon darauf.
- Leer unter „Meldungen“ → „A-Bogen (leer)“ und auf der öffentlichen Schauseite („Meldebogen zum Ausdrucken“), solange
  die Online-Meldung offen ist; vorausgefüllt an jeder Meldung („A-Bogen zum Unterschreiben“), ohne Bankdaten.

### Update

`sudo schaufuchs update` sichert vorher und holt 1.6.0. Daten und Tabellen ändern sich nicht.
