# 007 BDRG-Daten: Nutzung geklärt, Verzeichnis nicht im Repo

**Stand:** fortgeschrieben am 22.11.2026 (erste Fassung 30.10.2026: „Keine BDRG-Daten ohne Nutzungsrecht“)

**Kontext:** Rassen- und Farbenschlagverzeichnis, Ausstellungsfolge und die Gruppen der Rassen (A–M, Z1–Z3, BV o. ä.) stammen
vom BDRG. Bis Ende Oktober 2026 waren die Nutzungsrechte für eine Software nicht geklärt; deshalb galt: keine BDRG-Daten,
auch nicht in Auszügen. Am 22.11.2026 hat der Verein als eingetragener Verein entschieden, dass BDRG-Daten verwendet werden
dürfen; die Nutzungsrechte gelten damit als geklärt.

**Entscheidung:**

- Die Software darf mit BDRG-Daten arbeiten: Verzeichnis und Ausstellungsfolge, die Gruppe je Rasse und die Gruppen, für die
  ein Preisrichter zugelassen ist (Prüfung bei der Einteilung, siehe [Moduldoku Preisrichter](../module/preisrichter.md)).
- Die Daten kommen über Pflege und Import in die Datenbank des Vereins, nicht über das Repo: CSV der Stammdaten (je Jahr
  versioniert, freiwillige vierte Spalte „Gruppe“) und „Rassen und Farbenschläge“ → „Gruppen“.
- Im Repo (öffentlich) weiterhin kein Verzeichnis, keine Auszüge und keine erfundene Zuordnung Rasse → Gruppe, die echt
  aussehen könnte. Demo, Seeds und Tests nutzen erkennbar erfundene Werte (z. B. Gruppen X1, X2) oder freie Daten;
  vollständige Verzeichnisse liegen lokal in `lokal/` (nicht im Git).
- Rassebilder weiterhin nur mit freier Lizenz und Bildnachweis.

**Folgen:** Echte Zuordnungen pflegt jeder Verein selbst oder spielt sie mit dem Verzeichnis ein. Neue Daten-Dateien im Repo
nur mit Quelle und Lizenz.
