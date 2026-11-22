# 027 BDRG-Daten: Nutzung im Verein, kein Verzeichnis im Repo

**Stand:** gilt (22.11.2026), ersetzt [007](007-keine-bdrg-daten.md). Die Klärung der Nutzungsrechte ist vor dem Merge
von der Ausstellungsleitung zu bestätigen.

**Kontext:** Rassen- und Farbenschlagverzeichnis, Ausstellungsfolge und die Gruppen der Rassen (A–M, Z1–Z3, BV o. ä.)
stammen vom BDRG. 007 schloss BDRG-Daten aus, solange die Nutzungsrechte offen waren. Mit dem Auftrag für die
Preisrichter-Gruppen (22.11.2026) wurde festgehalten, dass der Verein die BDRG-Daten verwenden darf; ein Beleg dafür
liegt nicht im Repo. Die Prüfung der Preisrichter-Gruppen braucht die Gruppe je Rasse.

**Entscheidung:**
- Die Software arbeitet mit BDRG-Daten in der Datenbank des Vereins: Verzeichnis und Ausstellungsfolge, die Gruppe je
  Rasse und die Gruppen, für die ein Preisrichter zugelassen ist ([Moduldoku Preisrichter](../module/preisrichter.md)).
- Sie kommen nur über Pflege und Import dorthin: CSV der Stammdaten (je Jahr versioniert, freiwillige vierte Spalte
  „Gruppe“) und „Rassen und Farbenschläge“ → „Gruppen“.
- Im öffentlichen Repo weiterhin kein Verzeichnis, keine Auszüge und keine Zuordnung Rasse → Gruppe, die echt aussehen
  könnte. Demo, Seeds und Tests nutzen erkennbar erfundene Werte (z. B. Gruppen X1, X2) oder freie Daten; vollständige
  Verzeichnisse liegen lokal in `lokal/` (nicht im Git).
- Ausnahme: die bloße Liste der Gruppenbezeichnungen A–M und Z1–Z3 (`GRUPPEN_VORGABE` in
  `packages/domain/src/preisrichter-druck.ts`) als Vorgabe zum Ankreuzen auf der Preisrichterverpflichtung, wenn im
  Verzeichnis keine Gruppen gepflegt sind, und ihr Test. Sie enthält keine Zuordnung und keinen Inhalt des Verzeichnisses.
- Rassebilder weiterhin nur mit freier Lizenz und Bildnachweis.

**Folgen:** Echte Zuordnungen pflegt jeder Verein selbst oder spielt sie mit dem Verzeichnis ein. Neue Daten-Dateien im
Repo nur mit Quelle und Lizenz. Stellt sich heraus, dass die Nutzung nicht geklärt ist, gilt wieder 007; die Gruppen
bleiben dann leer und die Vorgabe zum Ankreuzen entfällt.
