/**
 * Hallenplan – Datentypen: Halle mit Flächen und eingesetzten Teilen, Rechteck und Blickrichtung, gerechneter Plan
 * (Reihen, Platten, Käfige, freie Plätze) und festgeschriebener Plan. Nur Typen, keine Rechnung.
 */
import type { KaefigTyp } from "./kaefige";
import type { Punkt } from "./hallenplan-umriss";
import type { MoebelArt } from "./hallenplan-moebel";
import type { HallenAussehen } from "./hallenplan-aussehen";
import type { TuerArt } from "./hallenplan-tueren";

export interface HallenFlaeche {
  name: string;
  /** „sperre“: hier stehen keine Käfige; „eingang“: Ein- oder Ausgang (frei, im Plan als Tür); „volieren“: Platz für Volieren. */
  art: "sperre" | "eingang" | "volieren";
  x: number;
  y: number;
  breite: number;
  tiefe: number;
  /** Nur intern: eingesetzte Voliere – wie ein Eingang mit einem Gang rundherum (sonst gilt das Teil als Freifläche). */
  mitGang?: boolean;
  /** Nur intern: außerhalb des Grundrisses (Entscheidung 019) – Sperrfläche für die Planung, nie gespeichert oder gezeichnet. */
  aussen?: boolean;
  /**
   * Nur intern: eingesetzter Käfigblock. Steht er ganz in einer Reihe, belegt er dort nur sein Stück – die Platten der Reihe
   * stehen davor und dahinter, die Abschnitte und damit die Folge der Sparten bleiben dieselben.
   */
  teil?: boolean;
  /** Nur intern: eingesetzter Tisch, Bank oder Garnitur – für die Reihen wie eine Freifläche. */
  moebel?: boolean;
  /** Eingang: Tür in 3D (wie Wand, Glas, Holz oder offen); fehlt: `TUER_VORGABE`. Nur Darstellung, nie Plan. */
  tuer?: TuerArt;
}

export interface Halle {
  /** Umschließendes Rechteck (cm); bei freiem Grundriss dessen Breite und Länge. */
  breite: number;
  laenge: number;
  /**
   * Freier, rechtwinkliger Grundriss (Entscheidung 019): Ecken in cm, links oben bei 0/0, im Uhrzeigersinn (`umrissNormal`).
   * Fehlt er, ist die Halle das Rechteck aus Breite und Länge.
   */
  umriss?: Punkt[];
  /** Mindestbreite der Gänge (cm). */
  gang: number;
  /** „quer“: Reihen parallel zur kurzen Seite (üblich); „laengs“: parallel zur langen Seite. */
  richtung: "quer" | "laengs";
  /** Einzelreihen an den beiden Wänden, an denen die Reihen entlanglaufen. */
  wandreihen: boolean;
  /**
   * Einzelreihe nur an einer dieser Wände (mit `wandreihen`): „anfang“ an der Wand, an der R1 steht, „ende“ gegenüber.
   * Fehlt die Angabe, an beiden.
   */
  wandreiheSeite?: "anfang" | "ende";
  /** Früher: Quergang zwischen zwei Käfiggrößen. Wird nicht mehr beachtet (Käfige stehen lückenlos), bleibt für ältere Hallen. */
  quergang: boolean;
  /**
   * Reihenenden an Wänden ohne Eingang (und ohne Hauptgang) bündig an die Wand – so wird üblich gestellt. Fehlt die
   * Angabe (ältere Hallen), gilt bündig.
   */
  wandBuendig?: boolean;
  /** Breiter Hauptgang an den Reihenenden (bei Reihen quer: an der Längsseite) oder quer durch die Mitte. */
  hauptgang?: Hauptgang;
  /** Früher: einheitliche große Grundplatte. Bestimmt die Platten nicht mehr (sie richten sich nach den Käfigen), bleibt für ältere Hallen. */
  platte?: Grundplatte;
  /** Käfige je Grundplatte, abweichend von der Vorgabe (siehe `kaefigeJePlatte`). */
  jePlatte?: Partial<Record<KaefigTyp, number>>;
  /** Grundplatte je Käfigart, abweichend von der Vorgabe (siehe `platteFuer`), z. B. 160 × 40 für 40er-Käfige. */
  plattenMass?: Partial<Record<KaefigTyp, Grundplatte>>;
  /** Käfige übereinander je Käfigart (Etagen auf einer Grundplatte); fehlt die Angabe, eine Etage. Siehe `etagenVon`. */
  etagen?: Partial<Record<KaefigTyp, number>>;
  flaechen: HallenFlaeche[];
  /** Von Hand eingesetzte Volieren (nehmen die gemeldeten Volieren der Reihe nach auf) und leere Käfigblöcke. */
  objekte?: HallenObjekt[];
  /** Von Hand verschobene und gedrehte Reihen (Versatz in cm, Hallenkoordinaten; Drehung in 90°-Schritten um die Mitte). */
  reihenVersatz?: { nr: number; dx: number; dy: number; drehung?: Drehung }[];
  /**
   * Von Hand verschobene oder gedrehte einzelne Grundplatten mit ihren Käfigen: Reihe (R-Nummer), Platte (laufende Nummer
   * in der Reihe, ab 0), Versatz in cm (Hallenkoordinaten) und Drehung um die Mitte der Platte.
   */
  plattenVersatz?: { reihe: number; platte: number; dx: number; dy: number; drehung?: Drehung }[];
  /**
   * Übrige Plätze auf der letzten Platte einer Käfigart, wenn danach eine andere Art folgt. „naechsteArt“ (Standard, Rückmeldung
   * 14.11.2026: „Ja, mischen erlaubt“): passen die Käfige der nächsten Art auf den Rest (Länge und Tiefe der Platte reichen),
   * stehen sie zuerst dort – so bleibt mitten in der Reihe kein „frei“. „frei“: jede Platte sortenrein, die übrigen Plätze
   * bleiben frei, die nächste Art beginnt auf ihrer eigenen Platte (früheres Verhalten, ohne Schalter in der Oberfläche).
   */
  restPlaetze?: "frei" | "naechsteArt";
  /** Früher: Startreihe je Sparte. Wird nicht mehr beachtet (strenge Katalogfolge), bleibt für ältere Hallen. */
  spartenStart?: { sparte: string; reihe: number }[];
  /**
   * Im festen Plan entfernte leere Grundplatten und freie Käfigplätze: Reihe und Lage im Reihensystem (wie im festen Plan).
   * Der feste Plan selbst bleibt unverändert; „Plan neu setzen“ und neues Festschreiben leeren die Liste. Siehe
   * `leereEntfernen`.
   */
  entfernt?: EntfernterPlatz[];
  /** Wie „Nach Plan nummerieren“ zählt (fehlt: Reihe für Reihe ab der ersten, jede Seite vom Anfang). */
  nummerFolge?: NummerFolge;
  /** Aussehen in der 3D-Ansicht (Boden, Prallwand, Wandhöhe …); ändert nie den Plan. Fehlt: Vorgabe (`aussehenVon`). */
  aussehen?: HallenAussehen;
}

/**
 * Einstellung „Nach Plan nummerieren“ (Rückmeldung 22.11.2026). Reihen sind hier die Zeilen quer zur Reihenrichtung, jede
 * Seite einer Doppelreihe für sich (R1, R2 …); Anfang und Ende wie die Software stellt.
 */
export interface NummerFolge {
  /** R-Nummer der Reihe, bei der die 1 steht (fehlt oder gibt es nicht: die erste); die übrigen folgen ringsum. */
  startReihe?: number;
  /** Reihen in absteigender Folge (R4, R3 …) statt aufsteigend. */
  absteigend?: boolean;
  /** Die erste Reihe vom Ende zum Anfang zählen (ohne Schlangenlinie: alle). */
  vomEnde?: boolean;
  /** Schlangenlinie: jede folgende Reihe in Gegenrichtung. */
  schlange?: boolean;
  /** Doppelreihen abwechselnd über beide Seiten (links, rechts, links …) statt Seite für Seite. */
  doppelAbwechselnd?: boolean;
}

/** Ist eine Einstellung gesetzt, die von der gewohnten Folge abweicht? */
export const nummerFolgeAktiv = (f: NummerFolge | null | undefined): f is NummerFolge =>
  !!f && (f.startReihe != null || !!f.absteigend || !!f.vomEnde || !!f.schlange || !!f.doppelAbwechselnd);

/** Entfernte leere Grundplatte (Lage der Platte) bzw. entfernter freier Platz im festen Plan. */
export interface EntfernterPlatz {
  reihe: number;
  art: "platte" | "platz";
  x: number;
  y: number;
  /** Platz: Etage (fehlt: unten). */
  etage?: number;
}

export type Drehung = 0 | 90 | 180 | 270;

/** Richtung, in die eine Käfigfront zeigt (Hallenkoordinaten: x+ zu größerem x, z+ zu größerem y). */
export type Blick = "x+" | "x-" | "z+" | "z-";

/** Strecke von (x1, y1) nach (x2, y2) in Hallenkoordinaten. */
export interface Strecke {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface HallenObjekt {
  id: string;
  art: "voliere" | "kaefigblock" | MoebelArt;
  /** Käfigart des Blocks (nur Käfigblock). */
  typ?: KaefigTyp;
  /** Tisch, Bank, Garnitur, Pokaltisch: Länge (lange Seite) und Tiefe des Tisches bzw. der Bank in cm; fehlt: Vorgabe. */
  laenge?: number;
  tiefe?: number;
  /** Garnitur: Tiefe der beiden Bänke (cm); fehlt: Vorgabe. */
  bankTiefe?: number;
  /** Linke vordere Ecke in der Halle (cm). */
  x: number;
  y: number;
  /** 0: lange Seite entlang der Breite (x); 90: gedreht. */
  drehung: 0 | 90;
  /** Käfigblock: Seite mit der offenen Front (Hallenkoordinaten, zu einer langen Seite); fehlt: siehe `blockFront`. */
  front?: Blick;
  /**
   * Von der Software eingesetzt („Plan neu setzen“, „Fehlende Käfige einsetzen“): gehört zum automatischen Plan, fällt beim
   * nächsten Neu-Setzen ohne Rückfrage weg. Wird der Block von Hand verschoben oder gedreht, entfällt das Kennzeichen.
   */
  auto?: boolean;
}

export interface Hauptgang {
  breite: number;
  /** „anfang“: an der linken Längsseite (Reihen quer) bzw. vorn (längs); „ende“: gegenüber; „beide“; „mitte“: quer durch die Reihen. */
  lage: "anfang" | "ende" | "beide" | "mitte" | "keiner";
}

/** Grundplatte eines Käfigblocks: Länge entlang der Reihe, Tiefe quer dazu. */
export interface Grundplatte {
  laenge: number;
  tiefe: number;
}

/** Ein Tier in Katalogfolge, wie es in einen Käfig kommt. */
export interface PlanTier {
  id: number;
  typ: KaefigTyp;
  /** Käfignummer (= Katalognummer), sobald vergeben. */
  nr: string | null;
  /** Käfigplatz, wenn er von der Katalognummer abweicht („Käfigplätze nach Plan“). */
  kaefig?: string | null;
  rasse: string;
  /** Sparte (Hühner, Zwerghühner, Tauben …) – für die Reihen je Sparte. */
  sparte?: string;
  preisrichterId: number | null;
}

/** Rechteck in Hallenkoordinaten (x entlang der Breite, y entlang der Länge) – zum Zeichnen. */
export interface Rechteck {
  x: number;
  y: number;
  b: number;
  h: number;
}

export interface PlanKaefig extends PlanTier {
  /** Laufende Nummer der Grundplatte in ihrer Reihe (ab 0), auf der der Käfig steht. */
  platte?: number;
  /** Lage im Reihensystem (x quer zu den Reihen, y entlang der Reihe). */
  x: number;
  y: number;
  /** Frontbreite und Tiefe des Käfigs. */
  breite: number;
  tiefe: number;
  /** Etage (0 = unten; fehlt: unten). Käfige derselben Spalte haben dieselbe Grundfläche. */
  etage?: number;
  /** Voliere im Volierenbereich: Seite der offenen Front (zum Gang). */
  front?: Blick;
  /** Lage in der Halle. */
  rechteck: Rechteck;
  /** Nur bei mehreren Etagen: Feld im Plan (die Grundfläche quer zur Front geteilt, siehe `etagenStreifen`). */
  zeichnung?: Rechteck;
  /** Käfig in einem Käfigblock: laufende Nummer des Platzes darin (ab 0, siehe `blockPlatz`). */
  blockPlatz?: number;
}

export interface Reihe {
  nr: number;
  art: "wand" | "doppel";
  /** Linke Kante und Tiefe der Reihe (cm). */
  x: number;
  tiefe: number;
  /** Seite, zu der die Käfigfronten zeigen. */
  front: "links" | "rechts";
  /** Nutzbare Abschnitte entlang der Länge (y von–bis), nach Abzug der Sperrflächen. */
  abschnitte: { von: number; bis: number }[];
  /** Die Abschnitte als Rechtecke in der Halle (zum Vorzeichnen der Reihe). */
  flaechen: Rechteck[];
  /** Platz für die Beschriftung „R1“ vor dem Reihenanfang (in der Halle). */
  beschriftung: Rechteck;
  /** Von Hand verschoben (cm, Hallenkoordinaten). */
  versatz: { dx: number; dy: number };
  /** Von Hand gedreht (in 90°-Schritten um den Anfang der Reihe). */
  drehung: Drehung;
  /** Punkt, um den gedreht wird (Mitte des ersten Platzes der Reihe, mit Versatz; Hallenkoordinaten). */
  drehpunkt: { x: number; y: number };
  /** Grundplatten in dieser Reihe, lückenlos aneinander (je Platte nur eine Käfigart). */
  platten: PlanPlatte[];
  kaefige: PlanKaefig[];
  /** Nicht belegte Plätze auf Grundplatten (angefangene Platte, im festen Plan auch Storno oder Käfiggröße geändert) – für Nachmeldungen. */
  freiePlaetze?: FreierPlatz[];
}

export interface FreierPlatz {
  typ: KaefigTyp;
  /** Im festen Plan: Platz auf einer für eine Nachmeldung angebauten Platte (nicht im festen Plan, lässt sich nicht entfernen). */
  angebaut?: true;
  /** Laufende Nummer der Grundplatte in ihrer Reihe (ab 0). */
  platte?: number;
  x: number;
  y: number;
  breite: number;
  tiefe: number;
  /** Etage (0 = unten; fehlt: unten). */
  etage?: number;
  rechteck: Rechteck;
  /** Nur bei mehreren Etagen: Feld im Plan (siehe `etagenStreifen`). */
  zeichnung?: Rechteck;
}

/**
 * Festgeschriebener Plan: die Lage jedes Käfigs im Reihensystem (ohne Versatz und Drehung, die bleiben einstellbar).
 * Danach rechnet die Automatik nicht mehr neu; Nachmeldungen kommen in freie Plätze, sonst „noch zu stellen“.
 */
export interface FesterPlan {
  am: string;
  /** Maße von Halle und Käfigen beim Festschreiben – ändern sie sich, passt der feste Plan nicht mehr. */
  geometrie: string;
  reihen: {
    nr: number;
    art: Reihe["art"];
    x: number;
    tiefe: number;
    front: Reihe["front"];
    abschnitte: { von: number; bis: number }[];
    platten: Omit<PlanPlatte, "rechteck">[];
    plaetze: { tierId: number | null; typ: KaefigTyp; x: number; y: number; breite: number; tiefe: number; etage?: number }[];
  }[];
  /** Volieren im Volierenbereich (Reihensystem) und in eingesetzten Volieren (Teil → Tier). */
  volieren?: { tierId: number; x: number; y: number; breite: number; tiefe: number; front?: Blick }[];
  objektVolieren?: { objektId: string; tierId: number }[];
  /**
   * Tiere in eingesetzten Käfigblöcken (Teil → Tiere in der Folge der Plätze): sie bleiben dort, solange gemeldet. `null`:
   * Platz von Hand frei gemacht (Tier versetzt) – die Tiere dahinter rücken nicht nach.
   */
  objektKaefige?: { objektId: string; tierIds: (number | null)[] }[];
  /**
   * Von Hand versetzte oder getauschte Tiere (Tier versetzen, Rückmeldung 15.11.2026). Für den Hinweis unter dem Plan
   * (`planUnordnung`): hinter ihnen zählt ein freier Platz nicht als Lücke.
   */
  vonHand?: number[];
  /** Reihenplätze, von denen ein Tier von Hand weg versetzt wurde: zählen im Hinweis unter dem Plan nicht als Lücke. */
  freiGemacht?: { reihe: number; x: number; y: number; etage?: number }[];
}

export interface PlanPlatte {
  typ: KaefigTyp;
  /** Lage im Reihensystem. */
  x: number;
  y: number;
  laenge: number;
  tiefe: number;
  /** Plätze auf der Platte und davon belegt. */
  plaetze: number;
  belegt: number;
  rechteck: Rechteck;
  /** Von Hand verschoben bzw. gedreht (einzelne Platte, zusätzlich zur Reihe). */
  versatz?: { dx: number; dy: number };
  drehung?: Drehung;
  /**
   * Im festen Plan leer entfernt (`halle.entfernt`): bleibt als Platzhalter ohne Plätze stehen, damit die Nummern der
   * folgenden Platten (und ihr `plattenVersatz`) gleich bleiben und dort keine Nachmeldung angebaut wird. Nicht zeichnen,
   * nicht zählen.
   */
  entfernt?: true;
  /** Im festen Plan für eine Nachmeldung angebaut (nicht im festen Plan). */
  angebaut?: true;
  /** Trägt auf dem Rest auch Käfige einer anderen Art (siehe `Halle.restPlaetze`); `typ` ist die Art, mit der sie beginnt. */
  gemischt?: true;
}

export interface PlanObjekt extends HallenObjekt {
  rechteck: Rechteck;
  /** Bezeichnung im Plan, z. B. „Voliere 2“ oder „Block 50 × 50 × 50 cm“. */
  name: string;
  /** Voliere: das Tier darin (oder leer). */
  tier: PlanTier | null;
  /** Käfigblock: Zahl der Plätze. */
  plaetze: number;
  /** Käfigblock: die Tiere darin (aus „noch zu stellen“ zugeordnet); die übrigen Plätze sind leer. */
  kaefige?: PlanKaefig[];
}

export interface Hallenplan {
  /** Reihen quer zur Halle (parallel zur kurzen Seite). */
  quer: boolean;
  /** Von Hand eingesetzte Volieren und Käfigblöcke. */
  objekte: PlanObjekt[];
  reihen: Reihe[];
  volieren: PlanKaefig[];
  /** Tiere ohne Platz (Halle voll, Maß fehlt oder kein Volierenbereich). */
  nichtPlatziert: PlanTier[];
  /** Käfigarten, die gebraucht werden, aber kein Maß haben (Stamm, Voliere). */
  fehlendeMasse: KaefigTyp[];
  /** Wie viele Käfige je Art in den freien Rest der Reihen noch passen würden (jede Art für sich gerechnet). */
  reserve: { typ: KaefigTyp; anzahl: number }[];
  /** Freie Grundplatten in den Reihen. */
  reservePlatten: number;
  warnungen: string[];
  /** Festgeschrieben (Zeitpunkt); veraltet = Hallen- oder Käfigmaße danach geändert. */
  fest?: ({ am: string; veraltet: boolean } & Pick<FesterPlan, "vonHand" | "freiGemacht">) | null;
}
