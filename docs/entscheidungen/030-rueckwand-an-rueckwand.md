# 030 Käfige beim Stellen ausrichten: Rückwand an die Wand, Rückwand an Rückwand

**Stand:** gilt (22.11.2026)

**Kontext:** Ein Käfig hat vorn die offene Gitterfront, Rück- und Seitenwände sind dicht. Schon bisher drehte der Editor ein
an die Wand geschobenes Teil so, dass die Rückwand an der Wand liegt (`wandAusrichtung`, Rückmeldung 14.11.2026). Wunsch des
Vereins: „Wenn Käfige aneinander gestellt werden, richte sie automatisch so aus, dass die Rückwände aneinander stehen und nicht
die Front verdecken.“ Dazu entschieden: auch beim T-Stoß drehen, und immer ausrichten (auch beim Einsetzen und Drehen).

**Entscheidung:**
- Eine Stelle für alles: `ausrichtungBeimStellen()` (`hallenplan-rueckwand.ts`), im Editor nach Verschieben (Ziehen,
  Pfeiltasten), Drehen (R, Doppelklick, Knopf) und Einsetzen (Block, Voliere, „Fehlende Käfige einsetzen“) –
  `hallenplan-ausrichten.ts`. Kandidaten wie bei der Wand: Grundplatten, Käfigblöcke, eingesetzte Volieren (Lage samt Versatz
  und Drehung, auch eben eingesetzte); Volieren im Volierenbereich sind ruhende Nachbarn.
- **Verdeckt** ist die Front eines gestellten Teils, wenn sie zu einer Wand zeigt (lange Seite bis `WAND_FANG` = 30 cm an der
  Hallenwand oder einer Innenwand des freien Grundrisses, ADR 019) oder ein anderes Teil an ihr liegt: bis 30 cm davor, mit
  Front, Rück- oder Seitenwand (T-Stoß), entlang der Front mindestens `UEBERLAPP_MIN` = 30 cm überlappend (ist eine Seite
  kürzer, ganz) – etwa eine Taubenkäfigbreite; Ecke an Ecke und ein Streifen von wenigen Zentimetern zählen nicht. Die
  Seitenwand des gestellten Teils zählt nie (Seitenwand an Seitenwand ist kein Fall).
- **Gedreht** wird dann um 180° an Ort und Stelle (gleiche Fläche), aber **nur, wenn die Gegenseite frei ist**: nach einer
  Wand darf die neue Front nicht direkt (bis 30 cm) an einem Teil, einer Sperrfläche (z. B. Bühne) oder einer Wand stehen; nach einem Nachbarn muss vor ihr ein
  ganzer Gang frei sein (Gangbreite der Halle, wie `frontFehler`). Sonst bleibt alles, wie es ist; die Prüfliste meldet die
  Front weiter. Die Gangbreite verhindert das Hin- und Herdrehen bei Pfeilschritten zwischen Wand und Nachbar.
- Erst die Wand, dann die Nachbarn. Es dreht nur, was gestellt wurde – der ruhende Nachbar nie, auch wenn beide Fronten
  zueinander zeigen. Beim Drehen gilt dieselbe Regel: Die gewählte Drehung bleibt, solange ihre Front frei ist; nur wenn sie
  verdeckt wäre und die Gegenseite frei ist, dreht es um 180° weiter – „R“ springt dann von 90° gleich auf 270°.
- **Eine Reihe dreht nur als Ganzes oder gar nicht.** Werden Grundplatten einer Reihe zusammen gestellt (die ganze Reihe
  oder mehrere ihrer Platten) und ist mindestens eine Front verdeckt, drehen alle diese Platten – aber nur, wenn danach jede
  ihrer Fronten frei ist; sonst keine (die Prüfliste meldet weiter). Sonst kehrte sich die Folge einer einzelnen Platte
  mitten in der Reihe um. Jede Platte dreht dabei um ihre eigene Mitte (`plattenVersatz.drehung`). Einzeln gestellte
  Platten, Blöcke und Volieren drehen für sich.
- Eine Gruppe aus mehreren Teilen richtet jedes Teil (bzw. jede Reihe) für sich aus; auch Fehlstellungen, die schon vorher
  bestanden, werden dabei mit gedreht.
- Die Reihen der Planung (Doppelreihen Rücken an Rücken, dazwischen Gänge) dreht das nie, solange sie nicht bewegt werden.
  Der Knopf „Käfige an den Wänden ausrichten …“ bleibt bei der Wand (jetzt auch an Innenwänden), ohne Prüfung der Gegenseite.
- Innenwände des Grundrisses gelten auch in der Prüfliste (`frontFehler`: „Front zur Wand“), auch wenn die Halle die
  Sperrflächen des Grundrisses nicht mitbringt.
- Eben eingesetzte Teile, die der Plan vom Server noch nicht kennt, zählen mit (Größe aus den Käfigmaßen der Schau) – beim
  Verschieben, Drehen und Einsetzen gleich. „Fehlende Käfige einsetzen“: gedrehte Blöcke bleiben automatisch gesetzt (`auto`).
- Bekannte Grenze: Volieren im Volierenbereich zählen mit ihrer Lage aus dem zuletzt gerechneten Plan (wie beim Verschieben,
  `planKoerper`); wer den Bereich eben verschoben hat, bekommt die neue Lage erst nach dem Speichern.

**Folgen:** Gespeichert wie die auslösende Änderung über `halleSetzen` (ein Schritt, ein Rückgängig, Protokoll wie bisher),
Hinweis „An der Wand gedreht …“ bzw. „Am Nachbarn gedreht …“. Grundplatten drehen über `plattenVersatz.drehung` (ADR 001: nie
gekürzt), Blöcke und Volieren über ihre Front. Im festen Plan (ADR 006) behalten die Käfige ihre Tiere; auf einer gedrehten
belegten Platte läuft die Folge andersherum, „Nummern nicht in Planfolge“ bietet „Nach Plan nummerieren“ an. Möbel zählen
nicht (ADR 002).

**Wo:** `packages/domain/src/hallenplan-rueckwand.ts`, `hallenplan-wandfront.ts` (`liegtAn`, `wandSoll`, `innenWaende`),
`hallenplan.ts` (`frontFehler`); `apps/web/src/seiten/hallenplan-ausrichten.ts` (`mitAusrichtung`: ein Schritt über `aendern`), aufgerufen in `hallenplan-bild-bedienung.ts`
und `hallenplan-aktionen.ts`.
