# 028 Aussehen der Halle in 3D

**Stand:** gilt (22.11.2026)

**Kontext:** Vereine möchten die 3D-Ansicht ihrer echten Halle ähnlich sehen – meist eine Sporthalle mit Parkett,
Spielfeldlinien, farbiger Prallwand, Fensterband und Holzdecke. Bisher war die Halle fest gestaltet (heller Boden,
Holz-Prallwand bis 2 m, 3,50 m hoch).

**Entscheidung:**
- Neues optionales Feld `halle.aussehen` (`HallenAussehen`): Boden (Parkett, Sportboden, Estrich) und Folie darüber,
  Prallwand (Holz oder #rrggbb) und ihre Höhe, Wand- und Firsthöhe, Schalter für Fenster, Decke, Spielfeldlinien und Geräte.
  Fehlt es, gilt die Vorgabe (`AUSSEHEN_STANDARD`): Daten und Plan sind unverändert, die Darstellung ist überarbeitet
  (Parkett statt einfarbigem Boden, Texturen, Licht).
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
- Dach (`hallenplan-3d-dach.ts`): Firsthöhe über der Wandhöhe ergibt mit Decke ein Satteldach (First parallel zur langen
  Seite in der Mitte, geschlossene Giebel, Binder entlang der Neigung); beim freien Grundriss bleibt es flach, weil ein
  Satteldach dort selten passt. Leuchten hängen unter den Bindern, mindestens 1,50 m über dem höchsten Käfig und nie unter
  3 m, sonst direkt an der Decke. Das Einschalten der Decke schlägt Wand 7 m und First 9 m vor, solange beide nie
  eingestellt waren – als gespeicherter Wert im Panel, nicht still in der Darstellung. Bewusst hingenommen: Wer die
  Wandhöhe ausdrücklich auf die Vorgabe 3,50 m gestellt hat, bekommt den Vorschlag trotzdem (gespeichert wird nur die
  Abweichung, 3,50 m sind von „nie eingestellt“ nicht zu unterscheiden); er lässt sich gleich darunter zurückstellen.
- Wandhöhe ändern (`wandHoeheSetzen`): Ein gesetzter First zieht mit, die Dachhöhe (First − Wand) bleibt, höchstens bis
  20 m – sonst verschwände das Satteldach still, sobald die Wand den First erreicht.
- Wände beim Blick von oben: Sie werden durchsichtiger, sobald die Kamera über der Decke an ihrer Stelle steht
  (`deckenHoehe`, beim Satteldach zur Mitte höher). Die Ansicht „Von oben“ rechnet mit der Wandhöhe (die Decke ist von
  oben ohnehin verborgen).
- Folie: Startwert aus dem Aussehen; der Schalter „Folie“ in der 3D-Ansicht wirkt nur auf die Ansicht und speichert nicht
  (`folieJetzt`: die eigene Wahl gilt, bis sich die gespeicherte Einstellung ändert). Lagen am Boden fest
  (`BODEN_LAGEN`): Linien unter der Folie, darüber die Flächen, oben das Meterraster – mit Höhe und Tiefenvorzug.
- Im heruntergeladenen Modell (glTF): Boden, Folie wie gezeigt, Linien, Wände, Fenster, Geräte und die Decke (immer, auch
  wenn sie in der Ansicht gerade verborgen ist); das Meterraster nicht (nur Hilfe zum Abschätzen in der Ansicht).
- Türen in den Eingängen (Rückmeldung 22.11.2026: „sonst sind das nur Löcher“): je Eingang `tuer` („wand“, „glas“,
  „holz“, „offen“), Vorgabe „wand“ (bündig in der Prallwand wie in Sporthallen); „offen“ ist die bisherige Öffnung. Die
  Türart liegt an der Fläche, nicht in `aussehen`, weil sie je Eingang verschieden ist; gespeichert nur an Eingängen, nur
  gültig und nur abweichend von der Vorgabe (`flaecheBereinigt`, zod lehnt Unbekanntes ab). Wie das übrige Aussehen nie
  Plan: `festGeometrie` kennt keine Flächen, nur `halleSchluessel` ändert sich. Ab 1,30 m zweiflügelig (`tuerFluegel`),
  Aufbau und Lage rein in `hallenplan-tueren.ts` (`tuerAufbau`, `tuerLage`). In 3D blendet die Tür mit dem Sturz darüber
  aus (`SzeneTuer.wand`), Glas behält dabei seine eigene Deckkraft als Obergrenze; die bündige Tür trägt dieselbe Textur
  wie die Innenwand an derselben Stelle. Eine geschlossene Tür ist wie die Wand ein Hindernis für den Doppelklick, solange
  sie zu sehen ist; Rundgang und Gehen kennen keine Wände und bleiben unverändert. Im 2D-Plan und im Druck bleibt der
  Eingang eine Öffnung; im heruntergeladenen Modell sind die Türen dabei.
- Käfige (Preisrichterfarben) und Sockelverkleidung ohne Tonemapping, damit ihre Farben der Legende entsprechen.

**Folgen:** Als Teil der Halle kommt das Aussehen mit Entwürfen, dem Archiv (017) und einer neuen Schau aus der Vorlage
mit. Die Texturen werden im Browser aus kleinen Canvas-Bildern gerechnet (keine Bilddateien, auch keine Fotos von Hallen
im Repo).
