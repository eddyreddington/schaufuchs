# 006 Fester Plan und „Automatisch planen“

**Stand:** gilt (Schalter seit 14.11.2026)

**Kontext:** Solange die Software den Hallenplan rechnet, rücken bei Nachmeldung oder Storno alle Käfige dahinter. Nach dem
Aufbau in der Halle darf das nicht mehr passieren.

**Entscheidung:** Zwei Zustände, Schalter „Automatisch planen: an/aus“. *An* (`schau.hallenplan_fest = null`): `planeHalle()`
rechnet bei jeder Änderung neu. *Aus* = festgeschrieben (`festschreiben()` speichert die Lage jedes Käfigs): nichts rückt von
selbst, neue Tiere kommen auf freie Plätze oder stehen unter „Platz“, geänderte Einstellungen gelten, die Käfige bleiben stehen.
Das erste Verschieben, Drehen oder Ausrichten im Editor schreibt den Plan vorher fest. Zurück nur über „Plan neu setzen“
(`neuSetzen()`, mit Rückfrage – Verschobenes und eingesetzte Teile fallen weg, Möbel bleiben). Die Reihenrichtung lässt sich nur bei „an“ ändern.

**Wo:** `hallenplan.ts` (`planeHalle`), `hallenplan-fest.ts` (`festschreiben`, `festGeometrie`), `hallenplan-neu.ts`, Router `katalog.planFestschreiben` / `katalog.planNeuSetzen`, Test `24-plan-fest`, `40-hallenplan-neu-setzen`.
