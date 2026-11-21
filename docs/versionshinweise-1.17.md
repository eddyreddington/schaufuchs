# SchauFUCHS 1.17 – Versionshinweise

## 1.17.0 (22.11.2026)

Gegenüber 1.16.0 ist neu:

### Hallenplan: Entwürfe ohne Verlust laden

- Ein Entwurf speichert jetzt auch den festgeschriebenen Plan, also die Lage jedes Käfigs und Tiers.
- Lädt man einen festgeschriebenen Entwurf derselben Schau (auch aus dem Archiv) oder entscheidet sich für ihn, kommt
  er genau so zurück, wie er gespeichert wurde – mit verschobenen Reihen und Platten. Bisher wurde er neu gesetzt, und
  die festgeschriebene Aufstellung ging verloren.
- Entwürfe ohne festen Plan (automatisch geplant, oder vor 1.17 gespeichert) und Pläne aus früheren Schauen werden wie
  bisher neu gesetzt.
- „Plan neu setzen“ und das Laden eines Entwurfs schreiben den ersetzten festen Plan vollständig ins Protokoll; so lässt
  sich der vorige Stand wiederherstellen.

Handbuch: „Entwürfe und Archiv“ im Abschnitt Hallenplan.

### Update

`sudo schaufuchs update` sichert vorher und holt 1.17.0. Die Datenbank bekommt eine neue Spalte für Entwürfe
(`hallenentwurf.fest`); vorhandene Daten bleiben unverändert.
