# SchauFUCHS 1.12 – Versionshinweise

## 1.12.1 (20.11.2026)

Gegenüber 1.12.0 ist neu:

### Updates füllen die Platte nicht mehr

Mit jedem Update blieb Altes auf der Platte liegen, bis sie voll war. Dann kann die Datenbank nicht mehr schreiben und
SchauFUCHS steht.

- `sudo schaufuchs update` braucht mindestens 3 GB freien Platz und bricht sonst ab, bevor es etwas ändert. Danach
  behält es nur die neue und die vorige Version (für `zuruecknehmen`), ältere löscht es.
- Selbst gebaute Installationen (`scripts/docker-start.sh`): Vor dem Bau wird der Platz geprüft (`MIN_FREI_GB` in der
  `.env`, Vorgabe 5 GB). Ist es knapp, wird zuerst aufgeräumt; reicht es dann nicht, bricht das Update ab. Nach dem
  Start werden Build-Cache und alte Programme ohne Namen gelöscht.
- `gefluegelschau-app:vorher` ist jetzt immer der letzte andere Programmstand (Version oder Migrationen). Wird derselbe
  Stand noch einmal gebaut, bleibt `vorher` erhalten. `wiederherstellen.sh --vorherige-version` bricht ab, wenn
  `vorher` derselbe Stand wäre.

Einzelheiten: [Betrieb](betrieb.md), [Installation, Updates](installation.md#updates).

### Update

`sudo schaufuchs update` holt 1.12.1. An der Datenbank ändert sich nichts. Dieses Update läuft noch mit dem bisherigen
Befehl; Platzprüfung und Aufräumen gelten ab dem nächsten. Alte Versionen jetzt schon entfernen: `sudo docker image ls`
zeigt sie, `sudo docker image rm …` löscht eine.

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
