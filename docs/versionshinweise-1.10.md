# SchauFUCHS 1.10 – Versionshinweise

## 1.10.0 (17.11.2026)

Gegenüber 1.9.1 ist neu:

### Gesundheitsprüfung für Überwachung und Updates

`/api/gesund` meldet neben `ok` und `version` jetzt auch:

- `letzteSicherung` und `sicherungAlterStunden`: wann die letzte geprüfte Sicherung lief. Eine Überwachung (z. B.
  Uptime Kuma) kann so warnen, wenn die Sicherung länger als einen Tag ausbleibt.
- `migrationenOffen`: ob Änderungen an der Datenbank fehlen, die dieser Stand mitbringt (normal: 0).
- `schautage`: ob gerade eine Schau läuft – vom Tag vor der Bewertung bis zum letzten Öffnungstag. Wer Updates
  automatisch einspielt, kann sie damit aus den Schautagen heraushalten. Testschauen zählen nicht.

Bisherige Abfragen von `ok` und `version` funktionieren unverändert. Lassen sich die neuen Angaben nicht ermitteln,
stehen sie auf `null`, die Prüfung bleibt bestanden. Einzelheiten:
[Entscheidung 024](entscheidungen/024-gesundheitspruefung.md).

### Kommende Schauen

- Stehen in den Öffnungszeiten nur Wochentage, zählt der Bewertungstag selbst mit: „Freitag 15–18 Uhr“ bei einer
  Bewertung am Freitag ist dieser Freitag, nicht der eine Woche später. Eine Eröffnung am Vorabend der Bewertung
  („Fr 11.12.“ vor einer Bewertung am 12.12.) bleibt im selben Jahr. Betrifft, ab wann der Katalog kommende Schauen
  zeigt.

### Update

`sudo schaufuchs update` sichert vorher und holt 1.10.0. Die Datenbank bekommt eine kleine Tabelle für den Zeitpunkt
der letzten Sicherung; vorhandene Daten ändern sich nicht. Den ersten Zeitpunkt meldet die erste Sicherung nach dem
Update – bis dahin steht dort `null`.
