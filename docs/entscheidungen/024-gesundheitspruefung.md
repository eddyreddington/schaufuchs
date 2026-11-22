# 024 Gesundheitsprüfung mit Sicherung, Migrationen und Schautagen

**Stand:** gilt (17.11.2026)

**Kontext:** `GET /api/gesund` meldete nur, ob Server und Datenbank antworten (`ok`), und seit 1.3.0 die Version.
Wer SchauFUCHS überwacht (z. B. mit Uptime Kuma) oder Updates automatisch einspielt, will mehr wissen: Läuft die
Sicherung noch? Passt die Datenbank zum Programmstand? Läuft gerade eine Schau, in die kein Update und kein Neustart
fallen sollte? Bisher musste der Betreiber dafür in `./backups` schauen bzw. sich selbst merken, wann geschaut wird.

**Entscheidung:**
- `/api/gesund` behält `ok` und `version` unverändert und liefert zusätzlich:
  - `letzteSicherung` (ISO-Zeitpunkt) und `sicherungAlterStunden` (volle Stunden) – `null`, solange keine gemeldet ist;
  - `migrationenOffen` – Migrationen dieses Stands (`drizzle/meta/_journal.json`), die jünger sind als die zuletzt
    eingespielte (so entscheidet auch drizzle beim Einspielen); `null` bei Datenbanken ohne Migrationsverzeichnis
    (Entwicklung und Tests mit `db:push`). Im Docker-Betrieb startet der Server erst nach dem Einspielen, der Wert ist
    dort also 0 – alles andere ist ein Fehler im Ablauf. Eine Datenbank, die *neuer* ist als das Programm, zeigt er
    nicht;
  - `schautage` – `true` vom Tag vor dem ersten Schautag (Einlieferung) bis zum letzten Öffnungstag einer echten,
    nicht abgeschlossenen Schau, höchstens zwei Wochen (gegen verirrte Daten im Freitext). Erster Schautag ist der
    frühere von Bewertungstag und erstem Öffnungstag (Daten aus den Öffnungszeiten wie für „Kommende Schauen“,
    `schauTage()`). Ohne jedes Datum entscheidet die Phase (Einlieferung bis Schau). Testschauen zählen nie; Tage in
    deutscher Zeit; es zählen die Schauen aller Vereine der Installation.
- Die Sicherungsdateien sieht die App nicht (`./backups` gehört dem Sicherungsdienst, die App läuft als eigener
  Benutzer). Darum meldet `scripts/backup.sh` nach jeder geprüften Sicherung den Zeitpunkt in die Tabelle `sicherung`
  (genau eine Zeile). Fehlt die Tabelle (Sicherung vor einem Update auf diese Version), steht nur ein Hinweis im
  Protokoll des Sicherungsdienstes; die Sicherung selbst gilt. Die Meldung zählt nicht als Änderung für die Frage
  „seit der letzten Sicherung etwas geändert?“.
- Fehlen nur die Zusatzangaben (Fehler, Zeitüberschreitung), bleibt `ok: true` mit Status 200, und alle vier stehen
  auf `null`: Sie sind Auskunft, kein Lebenszeichen. Ein Docker-Neustart oder ein abgebrochenes Update wegen einer
  fehlenden Zusatzangabe wäre schlimmer als die fehlende Angabe; der Fehler steht im Protokoll des Servers. Fristen:
  3 s für die Datenbank, 1 s für die Zusatzangaben – zusammen unter den 5 s der Docker-Prüfung.
- Die Adresse bleibt ohne Anmeldung erreichbar. Sie verrät nur, ob gerade Schautage sind (die Termine stehen ohnehin
  öffentlich) und wie alt die letzte Sicherung ist – keine Namen, keine Daten des Vereins.

**Folgen:** Eine Überwachung kann warnen, wenn `sicherungAlterStunden` fehlt (`null`) oder über 24 Stunden plus
`BACKUP_INTERVALL_MINUTEN` steigt (in ruhigen Zeiten sichert der Dienst nur einmal am Tag; mit der Vorgabe 120 Minuten
also über 26), oder wenn `migrationenOffen` > 0 ist. Ein Update-Lauf wartet bei `schautage: true` und behandelt `null`
vorsichtig wie `true`. Was als Schautag zählt, regelt `schautageLaufen()` in
`packages/domain/src/gesundheitspruefung.ts`.

Weil `migrationenOffen` wie das Einspielen nur nach `when` zählt, muss das Journal streng aufsteigen: Nummern lückenlos,
`when` jünger als bei der Migration davor, je Eintrag eine SQL-Datei und eine Kette der Schnappschüsse.
`migrationsverzeichnisFehler()` prüft das im Servertest `62-gesundheitspruefung`, so fällt eine nach einem Merge nur
umbenannte Migration in `bun run pruefen` auf (Vorgehen beim Merge: `docs/architektur.md`, Datenbank).
