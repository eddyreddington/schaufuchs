# 028 Aussehen der Halle in 3D

**Stand:** gilt (22.11.2026)

**Kontext:** Vereine möchten die 3D-Ansicht ihrer echten Halle ähnlich sehen – meist eine Sporthalle mit Parkett,
Spielfeldlinien, farbiger Prallwand, Fensterband und Holzdecke. Bisher war die Halle fest gestaltet (heller Boden,
Holz-Prallwand bis 2 m, 3,50 m hoch).

**Entscheidung:**
- Neues optionales Feld `halle.aussehen` (`HallenAussehen`): Boden (Parkett, Sportboden, Estrich), Prallwand (Holz oder
  #rrggbb) und ihre Höhe, Wandhöhe, Schalter für Fenster, Decke, Spielfeldlinien und Geräte. Fehlt es, gilt die Vorgabe
  (`AUSSEHEN_STANDARD`, wie die Halle bisher aussah); vorhandene Hallen bleiben unverändert.
- **Das Aussehen ändert nie den Plan.** `festGeometrie` kennt es nicht: Ein fester Plan bleibt fest, kein Käfig, keine
  Nummer und kein Platz ändert sich; `planeHalle` rechnet mit und ohne Aussehen dasselbe. Nur der Stand der Halle
  (`halleSchluessel`) ändert sich wie bei jeder gespeicherten Änderung.
- Gespeichert über den gewöhnlichen Weg der Halle (`katalog.halleSetzen`) mit Protokoll; der Server begrenzt die Werte
  (zod) und legt nur ab, was von der Vorgabe abweicht (`aussehenBereinigt`) – ohne Abweichung fällt das Feld weg.
- Was daraus in 3D wird, rechnet die Domain (`hallenplan-3d-ausstattung.ts`, rein, mit Test): Fenster nur in voll hohen
  Wandstücken der Längsseiten (nie über Türen), Geräte nur dort, wo keine Tür ist und keine Käfige, Volieren oder Möbel an
  der Wand stehen, Spielfeldlinien maßstäblich zur Halle (beim freien Grundriss nur, wenn das Feld ganz hineinpasst),
  Decke mit Bindern und Leuchten. Nichts davon ist ein Hindernis für den Plan.
- Die Decke ist nur von innen zu sehen (`deckeSichtbar`: Kamera unter der Decke über der Grundfläche); von oben und außen
  verdeckte sie die Käfige.

**Folgen:** Als Teil der Halle kommt das Aussehen mit Entwürfen, dem Archiv (017) und einer neuen Schau aus der Vorlage
mit. Die Texturen werden im Browser aus kleinen Canvas-Bildern gerechnet (keine Bilddateien, auch keine Fotos von Hallen
im Repo).
