# SchauFUCHS 1.11 – Versionshinweise

## 1.11.0 (17.11.2026)

Gegenüber 1.10.0 ist neu:

### Lesemodus

- Mit `NUR_LESEN=1` in den Einstellungen (`sudo schaufuchs einstellungen`) nimmt SchauFUCHS keine Änderungen an.
  Ansehen, Suchen, Drucken, Herunterladen und Anmelden gehen weiter – etwa während einer Wartung. Für einen Umzug auf
  einen anderen Server ist SchauFUCHS weiter anzuhalten: Hintergrundarbeiten wie Löschfristen laufen im Lesemodus.
- In der Verwaltung steht oben „Nur Lesen – Änderungen sind gerade nicht möglich.“, auf Wunsch mit einem eigenen
  Hinweis (`NUR_LESEN_HINWEIS`, z. B. „Wartung bis 18 Uhr“). Aussteller sehen, dass gerade keine Meldungen möglich
  sind; Preisrichter-Tablets bewerten weiter und übertragen danach. Handbuch: Abschnitt 1.7.
- Den Widerruf der Online-Veröffentlichung, das eigene Passwort und die Zwei-Faktor-Einrichtung nimmt SchauFUCHS auch
  im Lesemodus an; Administratoren können einen Benutzer abmelden oder sperren.
- `/api/gesund` meldet zusätzlich `nurLesen`.

Einzelheiten: [Entscheidung 025](entscheidungen/025-lesemodus.md).

### Update

`sudo schaufuchs update` sichert vorher und holt 1.11.0. An der Datenbank ändert sich nichts; ohne `NUR_LESEN` läuft
alles wie bisher.
