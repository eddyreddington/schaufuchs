# 029 Hallenplan vor den Katalognummern

**Stand:** gilt (22.11.2026)

**Kontext:** Rückmeldung eines Vereins: „Katalognummern werden vergeben vor dem Hallenplan, das ist nicht logisch in der
Reihenfolge.“ Die Seitenleiste stand schon in der richtigen Folge (Käfige, Hallenplan, Katalognummern, Katalog), aber der
Knopf der Phase auf der Übersicht führte zu den Katalognummern, die Prüfliste nannte die Katalognummern vor dem Hallenplan,
der Plan zeigte die Preisrichter erst nach dem Nummerieren, und die Seite „Katalognummern“ bot nur die Vergabe in
Ausstellungsfolge an.

**Entscheidung:** Nach dem Meldeschluss gilt die Folge Einteilung nach Rassen → Käfige → Hallenplan → Katalognummern (nach
dem Plan) → Katalog gestalten → festschreiben.
- Die Phase heißt „Halle & Katalog“ (in allen Sprachen Halle zuerst). Der interne Schlüssel bleibt `katalog` – keine
  Migration, gespeicherte Schauen, Protokoll und Adressen bleiben gültig.
- Übersicht: `arbeitsZiel` (`packages/domain/src/ablauf.ts`) führt in „Halle & Katalog“ zum Hallenplan, solange keine
  Halle angelegt ist, Tiere ohne Platz sind oder der Plan nicht fest ist; danach zu den Katalognummern. Den Stand rechnet
  der Server (`hallenStand` in `routers/katalog/gemeinsam.ts`, wie die Seite „Hallenplan“).
- Prüfliste: Die Gruppen stehen in der festen Folge `PRUEFLISTE_FOLGE` (`prueflistenGruppen`), nicht in der Folge, in der
  `checkliste()` prüft. Die Überschriften (t.schau.pruefliste.ziel) stehen in derselben Folge; ein Test hält beides gleich.
- Hallenplan vor den Nummern farbig: `planTiere` setzt den Preisrichter mit `richterImPlan` – mit Katalognummer aus den
  Nummernbereichen (unverändert, Grundlage für Tablet und Bewertung), ohne Nummer aus der Einteilung nach Rassen
  (`richterNachRasse`, auch die Jugend bei „separat“). Dasselbe gilt für die Angaben zum Käfig und den Druck des Plans.
- Seite „Katalognummern“: Steht ein fester Plan mit Tieren (`nachPlanVergeben`), ist „Nach Hallenplan vergeben“ der erste
  Weg – dieselbe Prozedur (`katalog.nummernNachPlan`) und Rückfrage wie „Nach Plan nummerieren“ im Editor; „Ohne Hallenplan
  vergeben“ ist die zweite Möglichkeit. Ohne Halle oder im automatischen Plan bleibt es bei „Katalognummern vergeben“:
  Dort folgen die Käfige den Nummern, „nach Plan“ hätte keinen eigenen Sinn. Nach dem Festschreiben der Nummern wie bisher
  „Nachmeldungen nummerieren“.

**Folgen:**
- Ohne Bereiche bleibt ein nummeriertes Tier ohne Preisrichter im Plan, auch wenn seine Rasse eingeteilt ist – die
  Bereiche sind nach den Nummern die einzige Wahrheit (wie bisher). Vor den Nummern ordnet `richterFolge` die Farben nach
  Namen, danach nach der kleinsten Katalognummer; die Farben können beim Nummerieren also wechseln.
- Die Übersicht rechnet in „Halle & Katalog“ den Plan einmal mehr (wie die Prüfliste). Scheitert die Rechnung, führt der
  Knopf zum Hallenplan; die Übersicht selbst scheitert nicht daran.
- Der Anker des Handbuchabschnitts 5.5 ändert sich mit der Überschrift (`…-phase-halle-katalog`); im Programm verweist
  nichts darauf.
