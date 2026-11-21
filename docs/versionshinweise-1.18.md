# SchauFUCHS 1.18 – Versionshinweise

## 1.18.0 (22.11.2026)

Gegenüber 1.17.0 ist neu:

### Hallenplan: einstellen, wie „Nach Plan nummerieren“ zählt

In den Eigenschaften der Halle (rechts, wenn nichts gewählt ist) unter „Nach Plan nummerieren“:

- **Beginnen bei** einer Reihe – dort steht die 1, die übrigen Reihen folgen ringsum; auch auf der zweiten Seite einer
  Doppelreihe.
- **Reihen** aufsteigend (R1, R2 …) oder absteigend.
- **Erste Reihe** vom Anfang oder vom Ende.
- **Schlangenlinie:** jede nächste Reihe in Gegenrichtung.
- **Doppelreihen** Seite für Seite oder abwechselnd links und rechts.

Ohne Einstellung zählt die Software wie bisher. Die Einstellung gehört zur Halle (Protokoll, Rückgängig, Entwürfe),
setzt den Plan nicht neu und lässt einen festgeschriebenen Plan gültig. Der Hinweis „Nummern nicht in Planfolge“
rechnet mit ihr.

Handbuch: „Nach Plan nummerieren“ im Abschnitt Hallenplan.

### Update

`sudo schaufuchs update` sichert vorher und holt 1.18.0. An der Datenbank ändert sich nichts.
