# 001 Grundplatten nie kürzen, Platten mischen erlaubt

**Stand:** gilt (14.11.2026)

**Kontext:** Die Käfige stehen auf Grundplatten von rund 2 m Länge. Am Reihenende passt oft keine ganze Platte mehr, und auf
der letzten Platte einer Käfigart bleiben Plätze übrig, wenn danach eine andere Art folgt.

**Entscheidung:** Eine Grundplatte steht immer ganz – keine gekürzten Platten, keine Einzelkäfige. Passt am Reihenende keine
ganze Platte mehr, bleibt der Rest frei (kommt zum Quergang). Der Rest einer angefangenen Platte nimmt die Käfige der
nächsten Art auf, wenn Länge und Tiefe der Platte reichen (`restPlaetze: "naechsteArt"`, Vorgabe); „frei“ = sortenrein, ohne Schalter.

**Folgen:** Reihen haben am Ende Lücken statt krummer Plattenmaße; gemischte Platten tragen `gemischt`.

**Wo:** `packages/domain/src/hallenplan-vorgaben.ts` (`platteFuer`), `hallenplan-reihen.ts` (Aufstellen der Reihen), Tests `hallenplan*.test.ts`, Handbuch „Hallenplan“ Punkt 2 und 5.
