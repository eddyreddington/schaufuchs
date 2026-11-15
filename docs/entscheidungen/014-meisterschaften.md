# 014 Meisterschaften: ein Regelmodell, Vorlagen statt fester Regeln

**Stand:** gilt (15.11.2026)

**Kontext:** Vereine werten auf ihren Schauen Meisterschaften aus – Vereins-, Kreis- und Landesmeister, Zuchtpreis,
Leistungspreis, auf Bundesebene Bundessieger und Jugendmeisterschaft. Eine einheitliche Regel gibt der BDRG nicht vor.
Die AAB legen zwei Grundformeln fest (Zuchtpreis: 4 Jungtiere 1,3 bis 3,1; Leistungspreis: 6 Tiere), alle anderen
Regelwerke drehen an denselben Stellschrauben: Tierzahl je Sparte, Alter, Geschlechter, Mindestpunkte,
Mindestbeteiligung, Berechtigung, Gleichstand. Der Wortlaut der AAB-Gleichstandsregel (Abschnitt XI) ist nicht
öffentlich zugänglich.

**Entscheidung:**
- Ein Regelmodell (`packages/domain/src/meisterschaft.ts`), je Schau eine Liste von Regeln (`schau.meisterschaften`),
  gespeichert von der Ausstellungsleitung mit Protokoll. Vorlagen nur für belegte AAB/BDRG-Regeln (Zuchtpreis,
  Leistungspreis, Bundessieger, Deutsche Jugendmeisterschaft, Vereinsmeisterschaft); Landes- und Kreisverbände stellen
  ihre Werte selbst ein – deren Regeln ändern sich und waren meist nur aus einer Quelle belegbar.
- Gewertet werden bewertete Einzeltiere bestätigter Meldungen, Sondernoten mit 0 Punkten. Je Aussteller zählt die
  punktbeste Auswahl, die alle Bedingungen erfüllt (Geschlechter, Alttiere) – gesucht über alle Kombinationen der
  jeweils besten n Tiere je Geschlecht und Alter. Vereinswertung: die besten Tiere, bei fehlenden Züchtern oder
  Sparten wird das schwächste ersetzbare Tier getauscht.
- Gleichstand als geordnete, einstellbare Liste von Kriterien; danach „beide Titel“ oder „Ausstellungsleitung
  entscheidet“. Die Vorgabe (Einzelnoten, Preise, weitere Tiere) ist eine Annahme, keine belegte AAB-Fassung.
- Ergebnisse werden nicht gespeichert, sondern aus Katalog und Bewertung neu gerechnet. Gewertet wird mit allen
  Daten; erst der Aushang blendet Namen ohne Zustimmung aus (wie der Katalog).

**Folgen:** Eine Entscheidung der Ausstellungsleitung bei vollständigem Gleichstand (z. B. Los) wird nicht gespeichert;
sie steht im Aushang als offener Gleichstand. Teilnahme „nur auf Meldung mit Gebühr“, Zuchtgemeinschaften und
Restgruppen sind nicht abgebildet.
