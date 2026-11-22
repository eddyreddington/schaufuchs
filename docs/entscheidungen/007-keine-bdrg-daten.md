# 007 Keine BDRG-Daten ohne Nutzungsrecht

**Stand:** ersetzt durch [027](027-bdrg-daten-nutzung.md) (22.11.2026); galt, bis der BDRG antwortet (Anfrage vom 30.10.2026)

**Kontext:** Rassen- und Farbenschlagverzeichnis und Ausstellungsfolge stammen vom BDRG. Die Nutzungsrechte für eine Software
sind nicht geklärt (Anfrage an den BDRG läuft).

**Entscheidung:** Keine echten BDRG-Daten ins Repo – weder Verzeichnis noch Auszüge in Seeds, Tests oder Beispielen. Jeder Verein
spielt sein Verzeichnis selbst als CSV ein (Stammdaten, je Jahr versioniert). Demo und Tests nutzen erfundene oder freie Daten;
lokale vollständige Verzeichnisse liegen in `lokal/` (nicht im Git). Rassebilder nur mit freier Lizenz und Bildnachweis.

**Folgen:** Vor dem Veröffentlichen als Open Source einmal gezielt prüfen; neue Daten-Dateien mit Quelle und Lizenz.
