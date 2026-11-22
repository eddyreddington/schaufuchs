# 029 Käfige beim Verschieben ausrichten: Rückwand an die Wand, Rückwand an Rückwand

**Stand:** gilt (22.11.2026)

**Kontext:** Ein Käfig hat vorn die offene Gitterfront, Rück- und Seitenwände sind dicht. Schon bisher drehte der Editor ein
an die Wand geschobenes Teil so, dass die Rückwand an der Wand liegt (`wandAusrichtung`, Rückmeldung 14.11.2026). Wunsch des
Vereins: „Wenn Käfige aneinander gestellt werden, richte sie automatisch so aus, dass die Rückwände aneinander stehen und nicht
die Front verdecken.“

**Entscheidung:**
- Eine Stelle für beides: `ausrichtungBeimStellen()` (`hallenplan-rueckwand.ts`), aufgerufen beim Loslassen nach dem
  Verschieben und bei den Pfeiltasten (`verschiebenUndAusrichten` im Web). Kandidaten wie bei der Wand: Grundplatten,
  Käfigblöcke, eingesetzte Volieren mit Lage samt Versatz und Drehung.
- Aneinander heißt: Front- oder Rückseite des einen steht einer Front- oder Rückseite des anderen gegenüber, bündig oder bis
  `WAND_FANG` (30 cm), und beide überlappen sich entlang der Seite. Ecke an Ecke und Seitenwand an Seitenwand zählen nicht.
- Zeigt die Front eines bewegten Teils auf ein anliegendes, dreht es an Ort und Stelle um 180° (gleiche Fläche, keine
  Prüfung auf Anstoßen nötig). Es dreht nur, was bewegt wurde – der ruhende Nachbar nie, auch wenn beide Fronten zueinander
  zeigen (dann meldet die Prüfliste dessen Front weiter über `frontFehler`). Zusammen verschobene Teile drehen beide.
- Gedreht wird nur, wenn die Front danach weder an einer Wand noch an einem anderen Teil liegt. Reihenfolge: erst die Wand,
  dann die Nachbarn – ein an der Wand gedrehtes Teil dreht nicht zurück.
- Die Reihen der Planung (Doppelreihen stehen schon Rücken an Rücken, dazwischen Gänge) dreht das nie, solange sie nicht
  bewegt werden; der Knopf „Käfige an den Wänden ausrichten …“ bleibt bei der Wand.

**Folgen:** Gespeichert wie jede Verschiebung über `halleSetzen` (ein Schritt, ein Rückgängig, Protokoll wie jede Verschiebung).
Grundplatten drehen über `plattenVersatz.drehung` (ADR 001: nie gekürzt), Blöcke und Volieren über ihre Front. Im festen Plan
(ADR 006) behalten die Käfige ihre Tiere; auf einer gedrehten belegten Platte läuft die Folge andersherum, „Nummern nicht in
Planfolge“ bietet „Nach Plan nummerieren“ an – wie bei der Wand. Möbel zählen nicht (ADR 002).

**Wo:** `packages/domain/src/hallenplan-rueckwand.ts` (mit Test), `hallenplan-wandfront.ts` (`kandidatGewaehlt`),
`apps/web/src/seiten/hallenplan-ausrichten.ts`, `hallenplan-bild-bedienung.ts` (`verschiebeAuswahl`).
