# SchauFUCHS 1.7 – Versionshinweise

## 1.7.0 (16.11.2026)

Gegenüber 1.6.2 ist neu:

### Überweisung mit GiroCode

- Neue Zahlungsweise in den Einstellungen der Schau: „vorab per Überweisung mit GiroCode“. Aussteller scannen den
  QR-Code mit ihrer Banking-App; Empfänger, IBAN, Betrag und Verwendungszweck sind dann ausgefüllt. Keine Gebühren,
  kein Zahlungsanbieter.
- Jede Meldung bekommt einen eigenen Verwendungszweck mit Referenz (z. B. „RF540001234 Meldegeld Mueller, Hans“), so
  ist jeder Eingang auf dem Kontoauszug eindeutig einer Meldung zuzuordnen.
- Der Code steht auf der Dankseite nach der Online-Meldung, auf „Meine Meldung“, im vorausgefüllten A-Bogen und im
  B-Bogen, immer über den noch offenen Betrag. Die Eingangsbestätigung nennt den Verwendungszweck, in allen sieben
  Sprachen.
- Voraussetzung: Kontoinhaber und IBAN des Vereinskontos. Den Kontoinhaber genau so schreiben, wie die Bank ihn führt.
  Handbuch: Abschnitt 3.14.
- Ohne die neue Einstellung bleibt alles wie bisher.

### Neue Version gleich beim ersten Aufruf

- Nach einem Update zeigte der Browser beim ersten Aufruf noch die alte Oberfläche, erst beim zweiten die neue. Jetzt
  kommt die Seite immer zuerst vom Server. Ohne Netz (Tablet in der Halle) geht es wie bisher mit dem gespeicherten
  Stand weiter.

### Update

`sudo schaufuchs update` sichert vorher und holt 1.7.0. Die Datenbank bekommt eine neue Spalte (Einstellung GiroCode,
anfangs aus); vorhandene Daten ändern sich nicht.
