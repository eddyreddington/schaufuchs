# SchauFUCHS 1.12 – Versionshinweise

## 1.12.0 (17.11.2026)

Gegenüber 1.11.0 ist neu:

### Verein auf dem Server einrichten

- `sudo schaufuchs einrichten --verein "…" --name "…" --email …` legt auf einer neuen Installation den Verein und den
  ersten Ausstellungsleiter an. Dafür ist kein Browser und kein Einrichtungscode nötig. Der Ausstellungsleiter bekommt
  eine Mail mit dem Link „Passwort setzen“. Der Link gilt 7 Tage und nur einmal.
- Ohne Mailversand: mit `--link-zeigen` steht der Link im Terminal.
- Kam die Mail nicht an oder ist der Link abgelaufen, den Befehl einfach noch einmal aufrufen. Der neue Link ersetzt den
  alten.
- Die Einrichtung im Browser mit Einrichtungscode bleibt, wie sie ist.
- Wird ein neuer Link „Passwort setzen“ verschickt (auch über „Willkommensmail erneut senden“), gehen ältere, noch
  nicht verschickte Mails mit einem Link an dieselbe Adresse nicht mehr hinaus.

Einzelheiten: [Entscheidung 026](entscheidungen/026-einrichten-per-befehl.md), Anleitung: [Installation, Schritt
8](installation.md#schritt-8--verein-einrichten).

### Update

`sudo schaufuchs update` sichert vorher und holt 1.12.0, auch den neuen Befehl. An der Datenbank ändert sich nichts.
