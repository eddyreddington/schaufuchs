# 019 Freier Grundriss der Halle

**Stand:** gilt (15.11.2026)

**Kontext:** Bisher ist jede Halle ein Rechteck (Breite × Länge). Viele Schauen stehen in Turn- oder Mehrzweckhallen mit
L-, T- oder U-Form, Nischen, Bühnenvorbau oder Anbau. Die Ausstellungsleitung soll den Grundriss selbst zeichnen.

**Entscheidung:**
- Grundriss als Vieleck `halle.umriss` (Ecken in cm, im Uhrzeigersinn); fehlt er, ist die Halle das Rechteck wie bisher
  (alle vorhandenen Hallen bleiben unverändert). Breite und Länge sind das umschließende Rechteck.
- Zuerst **rechtwinklig**: jede Wand waagrecht oder senkrecht, beliebig viele Ecken (L, T, U, Nischen, Vorsprünge). Das
  deckt die üblichen Hallen ab; schräge Wände wären ein eigener späterer Schritt (3D-Wände und Türen sind achsparallel).
- Die Planung bleibt, wie sie ist: alles außerhalb des Umrisses wird intern zu Sperrflächen (wie „hier keine Käfige“),
  in Rechtecke zerlegt (`umrissSperren`, rein in der Domain, mit Test). So gelten alle Regeln (Gänge, Fluchtwege,
  Grundplatten nie kürzen, fester Plan) unverändert; nichts steht außerhalb der Wände.
- Wände entstehen aus den Kanten des Umrisses: in der Zeichnung, im Druck und in 3D (je Kante ein Wandstück). Ein- und
  Notausgänge sitzen an einer Kante; „Fläche aufziehen“ setzt einen Eingang an die nächste Kante.
- Editor: in „Einstellungen der Halle“ „Grundriss bearbeiten“ – Wände ziehen (10-cm-Raster; liegt die Nachbarwand in
  derselben Flucht, entsteht eine Querwand, zurückgezogen fallen überflüssige Ecken weg), Wand per Doppelklick teilen,
  „Rechteck“ setzt zurück. Prüfung: geschlossen, ohne Überschneidung,
  mindestens 3 × 3 m, jede Wand mindestens 0,5 m (kein unbenutzbar schmaler Arm), keine Wand über die Gegenwand hinaus.
  Flächen und Möbel außerhalb verhindern die Änderung mit Meldung (eingesetzte Blöcke und Volieren fallen beim Neu-Setzen
  ohnehin weg); beim gewöhnlichen Speichern zählt nur, was neu hinausragt.
- Änderung des Grundrisses ist eine Einstellung der Halle: immer mit neu gesetztem Plan, im festen Plan nach Rückfrage;
  der Server lehnt einen anderen Grundriss im festen Plan ohne Neu-Setzen ab. Der Editor merkt sich den Stand beim
  Öffnen und übernimmt nicht, wenn inzwischen jemand anders die Halle geändert hat.

**Folgen:** Wandreihen und „bündig an Wänden“ beziehen sich weiter auf die Außenseiten des umschließenden Rechtecks;
an Nischen enden die Reihen an der Sperrfläche. Stellvorschläge rechnen mit dem Umriss. Entwürfe und Archiv (017)
speichern den Umriss mit.

**Wo:** `packages/domain/src/hallenplan-umriss.ts` (Prüfen, Zerlegen, Kanten, Wand ziehen/teilen, Wandring, Türöffnung,
Eingang an der Wand), `hallenplan-umriss-pruefen.ts` (Prüfung beim Speichern, `grundrissUebernehmen`), `hallenplan.ts`
(Sperren in `planeHalle`, Schlüssel und feste Geometrie), `hallenplan-3d.ts` (Wände je Kante, Seite der Wand), Server
`routers/katalog.ts` (`mitGeprueftemUmriss`), Editor `hallenplan-grundriss.tsx`, Zeichnung `hallenplan-bild.tsx`, PDF
`apps/server/src/pdf/hallenplan.ts`. Tests: Domain `hallenplan-umriss*.test.ts`, `hallenplan-3d-umriss.test.ts`, Server `56-grundriss`.
