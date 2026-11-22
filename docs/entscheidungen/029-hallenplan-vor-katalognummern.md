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
- Übersicht: `arbeitsZiel` (`packages/domain/src/ablauf.ts`) führt in „Halle & Katalog“ zum Hallenplan, solange dort
  etwas zu tun ist (`hallenplanOffen`): Halle angelegt und Tiere ohne Platz, fester Plan veraltet, oder noch keine Halle
  und noch keine Nummern. Danach zu den Katalognummern – ein automatischer Plan mit allen Tieren zählt als fertig, eine
  Schau ohne Hallenplan kommt nach dem Nummerieren nicht mehr zum Hallenplan zurück. Den Stand (`HallenStand`, aus
  `hallenStandVon`) rechnet der Server einmal mit der Prüfliste (`pruefliste()` in `services/pruefung.ts`, dieselben
  Einträge und derselbe Plan); die Seite „Katalognummern“ holt ihn über `katalog.nummernStand`.
- Prüfliste: Die Gruppen stehen in der festen Folge `PRUEFLISTE_FOLGE` (`prueflistenGruppen`), nicht in der Folge, in der
  `checkliste()` prüft. Die Überschriften (t.schau.pruefliste.ziel) stehen in derselben Folge; ein Test hält beides gleich.
- Hallenplan vor den Nummern farbig: `planTiere` setzt den Preisrichter mit `richterImPlan` – mit Katalognummer aus den
  Nummernbereichen (unverändert, Grundlage für Tablet und Bewertung), ohne Nummer aus der Einteilung nach Rassen
  (`richterNachRasse`, auch die Jugend bei „separat“). Dasselbe gilt für die Angaben zum Käfig und den Druck des Plans.
  Ohne Nummer ist er nur vorgesehen (`kaefigInfo.preisrichterVorgesehen`, „(vorgesehen)“): Nachmeldungen gehen später an
  den Preisrichter der Hauptnummer, eine Einteilung von Hand nach Nummern geht vor.
- Farben der Preisrichter (`richterFolge`): in der Folge ihres ersten Käfigs im Plan (Reihen mit Käfigen, Volieren,
  eingesetzte Teile), nicht mehr nach der kleinsten Katalognummer. Im festen Plan bleiben die Käfige beim Nummerieren
  stehen, der automatische steht vor und nach der Vergabe in Ausstellungsfolge – kein Preisrichter wechselt die Farbe.
- Seite „Katalognummern“: Steht ein fester, aktueller Plan mit Tieren (`nachPlanVergeben`), ist „Nach Hallenplan vergeben“
  der erste Weg – dieselbe Prozedur (`katalog.nummernNachPlan`) und Rückfrage wie „Nach Plan nummerieren“ im Editor, mit
  denselben Meldungen zur Einteilung wie „Katalognummern vergeben“; „Ohne Hallenplan vergeben“ ist die zweite Möglichkeit,
  mit Rückfrage. Was am Plan fehlt (`hallenplanOffen`: Tiere ohne Platz, veralteter Plan), nennt ein Hinweis mit Weg zum
  Hallenplan. Ohne bestätigte Meldungen lehnt `nummernNachPlan` vor dem Festschreiben ab. Ohne Halle oder im automatischen Plan bleibt es bei „Katalognummern vergeben“:
  Dort folgen die Käfige den Nummern, „nach Plan“ hätte keinen eigenen Sinn. Nach dem Festschreiben der Nummern wie bisher
  „Nachmeldungen nummerieren“.

**Folgen:**
- Ohne Bereiche bleibt ein nummeriertes Tier ohne Preisrichter im Plan, auch wenn seine Rasse eingeteilt ist – die
  Bereiche sind nach den Nummern die einzige Wahrheit (wie bisher).
- Nachbarfarben folgen jetzt Nachbarn in der Halle statt Nachbarn im Katalog; bei einem nach Plan nummerierten Katalog ist
  das dasselbe.
- Die Übersicht rechnet den Plan nicht zusätzlich: Prüfliste und Knopf teilen Einträge und Plan. Scheitert die Rechnung,
  führt der Knopf zum Hallenplan; die Übersicht selbst scheitert nicht daran.
- Der Anker des Handbuchabschnitts 5.5 ändert sich mit der Überschrift (`…-phase-halle-katalog`); im Programm verweist
  nichts darauf.
