# SchauFUCHS 1.8 – Versionshinweise

## 1.8.0 (16.11.2026)

Gegenüber 1.7.0 ist neu:

### Kontoauszug-Import

- Neue Seite „Meldephase“ → „Kontoauszug“ (nur Administratoren): den Umsatzexport aus dem Onlinebanking hochladen
  (CSV oder camt.053), SchauFUCHS ordnet die Überweisungen den Meldungen zu und bucht sie nach Ihrer Prüfung mit einem
  Klick. Ganz bezahlte Meldungen sind danach bestätigt.
- Sicher erkannt wird die Referenz aus dem Verwendungszweck (GiroCode, siehe 1.7.0). Ohne Referenz schlägt die
  Software eine Meldung vor, wenn Name und Betrag eindeutig passen; alles andere ordnen Sie von Hand zu oder lassen es.
- Derselbe Auszug zweimal hochgeladen bucht nichts doppelt. Kein Zugang zum Bankkonto, fremde Umsätze werden nicht
  gespeichert. Handbuch: Abschnitt 3.15.

### Update

`sudo schaufuchs update` sichert vorher und holt 1.8.0. Die Tabelle der Zahlungen bekommt eine neue Spalte;
vorhandene Daten ändern sich nicht.
