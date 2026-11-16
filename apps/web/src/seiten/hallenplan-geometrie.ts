/**
 * Reine Rechnungen des Hallenplan-Editors (ohne React): Auswahl und Teile, Lage und Versatz von Reihen,
 * Platten und Objekten, Hindernisse (`planKoerper`), Texte zu Teilen. Die Fachregeln selbst stehen in packages/domain.
 */
import { istRechteckUmriss, KAEFIG_TYP_LABEL, LOCALE, umrissNormal, umrissSperren, auswahlBereinigen, blockPlatz, dreheBlick, dreheRechteck, type Drehung, eingangsGang, etagenStreifen, etagenVon, frontDerReihe, type Halle, type HallenFlaeche, type HallenTeil, istMoebel, type KaefigMasse, kaefigName, type KaefigPlatz, type KaefigTyp, mitteVon, nummernBereiche, objektFront, type PlanAuswahlTeil, type PlanKaefig, type PlanKoerper, pruefeLage, type Rechteck, type Reihe, teilGroesse, teilSchluessel, type VerschiebePruefung, type WandKandidat, type WandSeite } from "@schau/domain";
import { aktuelleSprache, ot } from "../sprache-jetzt";
import { type Ausgabe } from "../trpc";

export type Daten = Ausgabe["katalog"]["hallenplan"];



// Preisrichter-Farben (RICHTER_FARBE, richterFarbe, richterSchraffur) und ihre Folge (richterFolge) kommen aus der
// Fachlogik – gleich auf dem Bildschirm und im PDF.
/** Bauteile der Halle: eigene neutrale Töne und Muster, nie eine Preisrichter-Farbe. */
export const BAU = {
  // Wie eine Bauzeichnung: kräftige Wände, feine dunkle Linien für alles, was in der Halle steht.
  halle: { fill: "#fbfbf9" },
  /** Außerhalb eines freien Grundrisses (Entscheidung 019): wie der Rand um die Zeichnung. */
  aussen: "#ffffff",
  wand: "#2b2f36",
  linie: "#3d4450",
  platte: { fill: "#ebe6dc", stroke: "#8f8676" },
  frei: { fill: "url(#muster-frei)", stroke: "#6b7383" },
  eingang: { fill: "#ffffff", stroke: "#2b2f36", text: "#2b2f36" },
  volierenbereich: { fill: "#eef5f1", stroke: "#3d5a50" },
  voliere: { fill: "#ffffff", stroke: "#3d4450" },
  ohne: { fill: "#ffffff", stroke: "#3d4450" },
  raster: { fein: "#eef0f3", meter: "#e1e4e9", fuenf: "#cdd2d9", text: "#5b6577" },
  tisch: { fill: "#e3cfae", stroke: "#8a6d45" },
  bank: { fill: "#efe2cb" },
  // Käfigwände von oben: Rückwand kräftig und dunkel, Seitenwände fein, die offene Front (Gitter) hell gestrichelt.
  kaefigwand: { rueck: "#1b1f26", seite: "#4a515d", front: "#9aa3b2" },
};


export const meter = (cm: number) => (cm / 100).toLocaleString("de-DE", { maximumFractionDigits: 2 });
export const zuCm = (m: string) => Math.round(Number(m.replace(",", ".")) * 100);

/** Käfignummer „12a“ → für die Bereichsangabe „1–40, 52a“. */
export const alsNummer = (nr: string | null) => {
  const t = nr?.match(/^(\d+)(\D*)$/);
  return t ? { katalogNr: Number(t[1]), suffix: t[2] ?? "" } : { katalogNr: null, suffix: "" };
};

/** Texte der Zeichnung und der Teile in der Sprache der Oberfläche (zur Laufzeit lesen). */
const tg = () => ot().halleBild.geometrie;

/** Wörter mit Zahl: Formen für 1, wenige (Polnisch/Tschechisch 2–4) und viele. */
export type Formen = { eins: string; wenige: string; viele: string };
/** Zahl mit passender Wortform in der Sprache der Oberfläche („1 Grundplatte“, „3 Grundplatten“). */
export function zahlWort(n: number, f: Formen): string {
  const form = new Intl.PluralRules(LOCALE[aktuelleSprache()]).select(n);
  return `${n} ${form === "one" ? f.eins : form === "few" ? f.wenige : f.viele}`;
}

/** Käfigbezeichnung wie `kaefigName` (Maße bleiben), die Bezeichnung der Käfigart in der Sprache der Oberfläche. */
export function kaefigBezeichnung(typ: KaefigTyp, masse?: KaefigMasse | null): string {
  const name = kaefigName(typ, masse);
  const de = KAEFIG_TYP_LABEL[typ];
  return name.startsWith(de) ? `${ot().fach.KAEFIG_TYP_LABEL[typ]}${name.slice(de.length)}` : name;
}

export function lage(r: Reihe, alle: Reihe[], quer: boolean): string {
  const t = tg();
  // Von Hand gedreht oder verschoben: die berechnete Lage stimmt nicht mehr – die Zeichnung zeigt, wo sie steht.
  if (r.drehung) return t.vonHandGedreht(r.drehung);
  if (r.versatz.dx || r.versatz.dy) return t.vonHandVerschoben;
  if (r.art === "wand") {
    if (quer) return r.front === "rechts" ? t.vordereStirnwand : t.hintereStirnwand;
    return r.front === "rechts" ? t.linkeWand : t.rechteWand;
  }
  const doppel = alle.filter((x) => x.art === "doppel");
  const nr = Math.floor(doppel.indexOf(r) / 2) + 1;
  if (quer) return r.front === "links" ? t.doppelreiheVorn(nr) : t.doppelreiheHinten(nr);
  return r.front === "links" ? t.doppelreiheLinks(nr) : t.doppelreiheRechts(nr);
}

/** Fehlende Käfige einsetzen – alle oder (`nur`) einen Block dieser Käfigart. */
export type FehlendeSetzen = (nur?: KaefigTyp) => void;

export function zusammenfassen(typen: KaefigTyp[], masse: KaefigMasse): string {
  const n = new Map<KaefigTyp, number>();
  for (const t of typen) n.set(t, (n.get(t) ?? 0) + 1);
  return [...n.entries()].map(([t, k]) => `${k} × ${kaefigBezeichnung(t, masse)}`).join(", ");
}

export function richterNamen(k: PlanKaefig[], richter: { id: number; name: string }[]): string {
  const ids = [...new Set(k.map((x) => x.preisrichterId).filter((x): x is number => x != null))];
  return ids.map((id) => richter.find((r) => r.id === id)?.name ?? "").filter(Boolean).join(", ") || "–";
}

/** Was im Editor gewählt sein kann: ein verschiebbares Teil oder ein freier Käfigplatz (der mit seiner Platte geht). */
export type Ziel = PlanAuswahlTeil;
export type Plan = NonNullable<Daten["plan"]>;
/** Schlüssel eines gewählten Teils (auch eines freien Platzes) – zum Vergleichen. */
export const zielSchluessel = (z: Ziel) => (z.art === "platz" ? `z${z.reihe}|${z.x}|${z.y}|${z.etage ?? 0}` : teilSchluessel(z));
export const gleich = (a: Ziel | null | undefined, b: Ziel | null | undefined) => !!a && !!b && zielSchluessel(a) === zielSchluessel(b);
/** Freier Platz der Auswahl im Plan (null: dort steht inzwischen ein Tier oder er ist entfernt). */
export const freierPlatz = (plan: Plan, z: Extract<Ziel, { art: "platz" }>) => plan.reihen.find((r) => r.nr === z.reihe)?.freiePlaetze?.find((f) => f.x === z.x && f.y === z.y && (f.etage ?? 0) === (z.etage ?? 0)) ?? null;
/**
 * Auswahl als verschiebbare Teile (zum Ziehen, Drehen, Ausrichten): ein freier Platz steht für seine Grundplatte (ohne
 * Platte: für seine Reihe); Platten einer gewählten Reihe fallen weg (siehe `auswahlBereinigen`).
 */
export function zuTeilen(auswahl: Ziel[], plan: Plan): HallenTeil[] {
  const t = auswahl.flatMap((z): HallenTeil[] => {
    if (z.art !== "platz") return [z];
    const f = freierPlatz(plan, z);
    if (!f) return [];
    return [f.platte != null ? { art: "platte", reihe: z.reihe, i: f.platte } : { art: "reihe", nr: z.reihe }];
  });
  return auswahlBereinigen(t);
}
/**
 * Grundplatten einer Reihe, die da sind: ohne die im festen Plan entfernten (Platzhalter, `PlanPlatte.entfernt`) und ohne
 * die, die im Entwurf eben entfernt wurden (der Plan ist noch nicht neu gerechnet) – so verschwinden sie sofort.
 */
export function plattenDa(halle: Halle, r: Reihe): boolean[] {
  const weg = (halle.entfernt ?? []).filter((e) => e.reihe === r.nr && e.art === "platte");
  return r.platten.map((pl) => !pl.entfernt && !weg.some((e) => Math.abs(e.x - pl.x) < 0.5 && Math.abs(e.y - pl.y) < 0.5));
}
/** Freier Platz, der im Entwurf eben entfernt wurde (selbst oder mit seiner Platte). */
export function platzWeg(halle: Halle, r: Reihe, f: { x: number; y: number; platte?: number; etage?: number }, da: boolean[]): boolean {
  if (f.platte != null && da[f.platte] === false) return true;
  return (halle.entfernt ?? []).some((e) => e.reihe === r.nr && e.art === "platz" && Math.abs(e.x - f.x) < 0.5 && Math.abs(e.y - f.y) < 0.5 && (e.etage ?? 0) === (f.etage ?? 0));
}
/** Änderung der Halle im Editor: `was` für Rückgängig, `grund` fürs Protokoll. */
export type Aendern = (f: (h: Halle) => Halle, opt?: { was?: string; grund?: string; ohneVerlauf?: boolean; festschreiben?: boolean }) => Halle;
export type Schritt =
  | { art?: undefined; vorher: Halle; nachher: Halle; was: string }
  /** Tier versetzt (im festen Plan): Rückgängig setzt es zurück, beim Tausch tauschen beide wieder. */
  | { art: "tier"; tierId: number; von: KaefigPlatz | null; ziel: KaefigPlatz; getauscht: number | null; was: string };
/** Tier, das gerade versetzt wird (Ziel im Plan anklicken). */
export type Versetzen = { tierId: number; nr: string | null; rasse: string; typ: KaefigTyp };
/** Aktionen zur Auswahl – gleich in Werkzeugleiste, Eigenschaften und Tastenkürzeln. */
export type Aktionen = { ausrichten: () => void; drehen: () => void; zurueckAnPlatz: () => void; entfernen: () => void; aufheben: () => void; dreht: boolean; zurueck: boolean; einzelreihe?: { seiten: WandSeite[]; text: (seite: WandSeite) => string; stellen: (seite: WandSeite) => void }};
export const anzahl = (n: number, eins: string, viele: string) => `${n} ${n === 1 ? eins : viele}`;
/** Was „Entfernen“ wegnimmt, als Aufzählung („1 Grundplatte und 2 freie Plätze“); leer: nichts. */
export function entfernenText(e: { platten: number; plaetze: number; teile: number; flaechen: number }): string {
  const w = tg();
  const t = [
    e.platten && zahlWort(e.platten, w.grundplatten),
    e.plaetze && zahlWort(e.plaetze, w.freiePlaetze),
    e.teile && zahlWort(e.teile, w.eingesetzteTeile),
    e.flaechen && zahlWort(e.flaechen, w.flaechen),
  ].filter((x): x is string => !!x);
  return t.length > 1 ? w.aufzaehlung(t.slice(0, -1).join(", "), t.at(-1)!) : (t[0] ?? "");
}
/**
 * Ziehen: die ganze Auswahl (bereinigt, siehe `auswahlBereinigen`) bzw. beim Ändern der Größe eine Fläche. start:
 * Bildschirmpunkt beim Greifen – bei jeder Bewegung mit der aktuellen Lage des Plans umgerechnet (nichts springt, wenn
 * sich darüber etwas ändert). konflikt: Ergebnis der Prüfung für den aktuellen Weg. klick: was ein Klick ohne Bewegung
 * an der Auswahl ändert (nur dieses Teil wählen bzw. es aus der Auswahl nehmen).
 */
export type Zug = {
  ziele: HallenTeil[];
  modus: "verschieben" | "groesse";
  start: { clientX: number; clientY: number };
  dx: number;
  dy: number;
  konflikt: string | null;
  klick?: { art: "nurDieses" | "heraus"; ziel: Ziel };
  /** Zeiger, der greift (ein zweiter Finger stört nicht). */
  zeiger: number;
};
/** Auswahlrechteck (Ziehen auf freier Fläche), Ecken in Hallenkoordinaten. */
export type Rahmen = { start: { x: number; y: number }; jetzt: { x: number; y: number }; startBild: { clientX: number; clientY: number }; dazu: boolean; zeiger: number };

export const RASTER = 10;
/** Rand um die Halle in der Zeichnung (cm) – für Beschriftungen vor der Wand. */
export const RAND_CM = 160;
export const raster = (v: number) => Math.round(v / RASTER) * RASTER;

/** Halle mit allen Feldern (ältere gespeicherte Hallen haben noch keine Teile oder Versätze). */
/** Ein automatisch eingesetzter Block, den der Editor verschiebt oder dreht, gilt danach als von Hand gesetzt. */
export const vonHandBewegt = (vorher: Halle, neu: Halle): Halle => {
  const alt = new Map((vorher.objekte ?? []).map((o) => [o.id, o]));
  const bewegt = (o: NonNullable<Halle["objekte"]>[number]) => {
    const a = alt.get(o.id);
    return !!a && (a.x !== o.x || a.y !== o.y || a.drehung !== o.drehung);
  };
  if (!(neu.objekte ?? []).some((o) => o.auto && bewegt(o))) return neu;
  return { ...neu, objekte: neu.objekte!.map((o) => (o.auto && bewegt(o) ? (({ auto: _a, ...rest }) => rest)(o) : o)) };
};
export const vollstaendig = (h: Halle): Halle => ({ ...h, objekte: h.objekte ?? [], reihenVersatz: h.reihenVersatz ?? [], plattenVersatz: h.plattenVersatz ?? [], spartenStart: h.spartenStart ?? [] });

export type PlattenVersatz = NonNullable<Halle["plattenVersatz"]>[number];
/** Versatz einer einzelnen Grundplatte setzen; ohne Verschiebung und Drehung fällt der Eintrag weg. */
export function mitPlattenVersatz(v: Halle, neu: PlattenVersatz): Halle {
  const bleibt = neu.dx || neu.dy || neu.drehung;
  return { ...v, plattenVersatz: [...v.plattenVersatz!.filter((x) => !(x.reihe === neu.reihe && x.platte === neu.platte)), ...(bleibt ? [neu] : [])] };
}

export type ReihenVersatz = NonNullable<Halle["reihenVersatz"]>[number];
/** Versatz einer Reihe setzen; ohne Verschiebung und Drehung fällt der Eintrag weg (Reihe an ihrem Platz). */
export function mitVersatz(v: Halle, neu: ReihenVersatz): Halle {
  const bleibt = neu.dx || neu.dy || neu.drehung;
  return { ...v, reihenVersatz: [...v.reihenVersatz!.filter((x) => x.nr !== neu.nr), ...(bleibt ? [neu] : [])] };
}

/** Größe einer Fläche ändern (Werte in cm, Hallenkoordinaten). Verschoben wird mit `verschiebeTeile`. */
export function groesseAendern(h: Halle, i: number, dx: number, dy: number): Halle {
  const v = vollstaendig(h);
  return { ...v, flaechen: v.flaechen.map((f, j) => (j !== i ? f : { ...f, breite: Math.max(20, f.breite + dx), tiefe: Math.max(20, f.tiefe + dy) })) };
}

/**
 * Lage einer Reihe im Entwurf, ohne laufendes Ziehen: der zuletzt gerechnete Plan, verschoben und gedreht um das, was
 * der Entwurf schon weiter ist (sofort sichtbar, bevor der Server neu rechnet). `aufPlatte` setzt zusätzlich Versatz und
 * Drehung der einzelnen Grundplatte i dazu (Drehung um die Mitte der Platte).
 */
export function reihenLage(halle: Halle, reihe: Reihe) {
  const ev = (halle.reihenVersatz ?? []).find((x) => x.nr === reihe.nr);
  const ex = (ev?.dx ?? 0) - reihe.versatz.dx, ey = (ev?.dy ?? 0) - reihe.versatz.dy;
  // Im Entwurf gedreht, aber noch nicht gerechnet: um den Drehpunkt der Reihe weiterdrehen (wie der Server es tut).
  const dg = ((ev?.drehung ?? 0) - (reihe.drehung ?? 0) + 360) % 360;
  const inReihe = (q: Rechteck): Rechteck => {
    const d = dg ? dreheRechteck(q, reihe.drehpunkt, dg) : q;
    return { ...d, x: d.x + ex, y: d.y + ey };
  };
  const aufPlatte = (q: Rechteck, i: number | undefined): Rechteck => {
    const zr = inReihe(q);
    if (i == null || !reihe.platten[i]) return zr;
    const pl = reihe.platten[i]!;
    const e = (halle.plattenVersatz ?? []).find((x) => x.reihe === reihe.nr && x.platte === i);
    const dgp = ((e?.drehung ?? 0) - (pl.drehung ?? 0) + 360) % 360;
    const d = dgp ? dreheRechteck(zr, mitteVon([inReihe(pl.rechteck)]), dgp) : zr;
    return { ...d, x: d.x + (e?.dx ?? 0) - (pl.versatz?.dx ?? 0), y: d.y + (e?.dy ?? 0) - (pl.versatz?.dy ?? 0) };
  };
  /** Drehung einer Platte im Entwurf gegenüber dem gerechneten Plan (Reihe und Platte) – dreht die Front mit. */
  const vorschauDrehung = (i: number) => {
    const pl = reihe.platten[i];
    const e = (halle.plattenVersatz ?? []).find((x) => x.reihe === reihe.nr && x.platte === i);
    return (dg + ((e?.drehung ?? 0) - (pl?.drehung ?? 0) + 360)) % 360;
  };
  return { ev, inReihe, aufPlatte, vorschauDrehung };
}

/** Lage eines eingesetzten Teils im Entwurf (null: im Entwurf schon entfernt). */
export function objektLage(halle: Halle, o: NonNullable<Daten["plan"]>["objekte"][number]): { lage: Rechteck; gedrehtSeit: boolean } | null {
  const e = (halle.objekte ?? []).find((x) => x.id === o.id);
  if (!e) return null;
  // Tisch, Bank, Garnitur: Größe aus dem Entwurf (Maße wirken sofort).
  if (istMoebel(e)) {
    const g = teilGroesse(e, halle, null);
    return { lage: e.drehung === 90 ? { x: e.x, y: e.y, b: g.kurz, h: g.lang } : { x: e.x, y: e.y, b: g.lang, h: g.kurz }, gedrehtSeit: false };
  }
  const gedrehtSeit = (e.drehung ?? 0) !== (o.drehung ?? 0);
  return { lage: { x: e.x, y: e.y, b: gedrehtSeit ? o.rechteck.h : o.rechteck.b, h: gedrehtSeit ? o.rechteck.b : o.rechteck.h }, gedrehtSeit };
}

export const flaecheRechteck = (f: HallenFlaeche): Rechteck => ({ x: f.x, y: f.y, b: f.breite, h: f.tiefe });
export const innen = (q: Rechteck, a: Rechteck) => q.x >= a.x - 0.5 && q.y >= a.y - 0.5 && q.x + q.b <= a.x + a.b + 0.5 && q.y + q.h <= a.y + a.h + 0.5;

/**
 * Grundplatten, Käfigblöcke und Volieren, wie sie im Entwurf stehen (Lage und Front), als Kandidaten für die
 * Wandausrichtung (siehe wandAusrichtung). `nur`: nur diese Teile (eine Reihe steht für ihre Platten).
 */
export function wandKandidatenImEntwurf(halle: Halle, plan: NonNullable<Daten["plan"]>, nur: HallenTeil[] | null): WandKandidat[] {
  const aus: WandKandidat[] = [];
  for (const k of planKoerper(halle, plan)) {
    const t = k.teil;
    if (t?.art === "platte") {
      if (nur && !nur.some((n) => (n.art === "platte" && n.reihe === t.reihe && n.i === t.i) || (n.art === "reihe" && n.nr === t.reihe))) continue;
      const reihe = plan.reihen.find((r) => r.nr === t.reihe);
      const pl = reihe?.platten[t.i];
      if (!reihe || !pl) continue;
      const front = dreheBlick(frontDerReihe(reihe, plan.quer, pl.drehung ?? 0), reihenLage(halle, reihe).vorschauDrehung(t.i));
      aus.push({ teil: t, rechteck: k.rechteck, front, belegt: pl.belegt });
    } else if (t?.art === "objekt") {
      if (nur && !nur.some((n) => n.art === "objekt" && n.id === t.id)) continue;
      const o = plan.objekte.find((x) => x.id === t.id);
      const e = (halle.objekte ?? []).find((x) => x.id === t.id);
      if (!o || !e || (o.art !== "kaefigblock" && o.art !== "voliere")) continue;
      aus.push({ teil: t, rechteck: k.rechteck, front: objektFront({ front: e.front, rechteck: k.rechteck }), belegt: o.art === "voliere" ? (o.tier ? 1 : 0) : (o.kaefige?.length ?? 0) });
    }
  }
  return aus;
}

/**
 * Alles, was im Entwurf Platz einnimmt – für die Prüfung beim Verschieben und das Auswahlrechteck: jede Grundplatte (geht
 * mit ihrer Reihe), eingesetzte Teile, Flächen und die Volieren im Volierenbereich (gehen mit ihrem Bereich).
 */
export function planKoerper(halle: Halle, plan: NonNullable<Daten["plan"]>): PlanKoerper[] {
  const k: PlanKoerper[] = [];
  for (const reihe of plan.reihen) {
    const { aufPlatte } = reihenLage(halle, reihe);
    const da = plattenDa(halle, reihe);
    reihe.platten.forEach((pl, i) => da[i] && k.push({ teil: { art: "platte", reihe: reihe.nr, i }, name: tg().grundplatteInR(i + 1, reihe.nr), rechteck: aufPlatte(pl.rechteck, i) }));
  }
  for (const o of plan.objekte) {
    const l = objektLage(halle, o);
    if (l) k.push({ teil: { art: "objekt", id: o.id }, name: o.name, rechteck: l.lage, ...(istMoebel(o) ? { moebel: true } : {}) });
  }
  // Freie Bereiche und Eingänge sind Hindernisse (nicht füreinander); in den Volierenbereich gehören die Volieren. In freien
  // Bereichen dürfen Tische und Bänke stehen.
  halle.flaechen.forEach((f, i) => k.push({ teil: { art: "flaeche", i }, name: f.name, rechteck: flaecheRechteck(f), ...(f.art === "volieren" ? { nurGrenze: true } : { flaeche: true, ...(f.art === "sperre" ? { freiBereich: true } : {}) }) }));
  // Freier Grundriss (Entscheidung 019): außerhalb ist Wand – für Käfige, Teile, Tische und Bänke.
  if (!istRechteckUmriss(halle.umriss)) for (const q of umrissSperren(umrissNormal(halle.umriss!))) k.push({ teil: null, name: ot().fach.AUSSEN_NAME, rechteck: q });
  // Tische und Bänke stehen frei, auch im Gang vor den Käfigen (Rückmeldung 14.11.2026).
  // Vor Eingängen und Notausgängen bleibt ein Gang frei (in Fluchtrichtung, so breit wie der Ausgang): keine Reihe, Platte
  // oder eingesetztes Teil dort hinein. Seitlich daneben darf man bis an den Ausgang heran.
  for (const f of halle.flaechen) {
    if (f.art !== "eingang") continue;
    const z = eingangsGang(halle, f);
    const x1 = Math.max(0, z.x), y1 = Math.max(0, z.y);
    const x2 = Math.min(halle.breite, z.x + z.b), y2 = Math.min(halle.laenge, z.y + z.h);
    // Tische und Bänke dürfen hinein (der Plan gibt einen Hinweis), Käfige nicht.
    k.push({ teil: null, name: tg().gangVor(f.name), rechteck: { x: x1, y: y1, b: x2 - x1, h: y2 - y1 }, flaeche: true, fluchtweg: true });
  }
  for (const v of plan.volieren) {
    // Im festen Plan stehen die Volieren auf ihren festen Plätzen (sie gehen nicht mit ihrem Bereich mit).
    const i = plan.fest ? -1 : halle.flaechen.findIndex((f) => f.art === "volieren" && innen(v.rechteck, flaecheRechteck(f)));
    k.push({ teil: i >= 0 ? { art: "flaeche", i } : null, name: v.nr ? tg().voliereNr(v.nr) : tg().voliere, rechteck: v.rechteck });
  }
  return k;
}

/**
 * Darf ein eingesetztes Teil (Block, Voliere, Tisch, Bank) gedreht werden? Es dreht um seine linke vordere Ecke; danach
 * nicht auf einer Freifläche, im Gang vor einem Ausgang (Käfige) oder auf anderen Teilen – wie beim Verschieben.
 */
export function drehPruefung(halle: Halle, plan: NonNullable<Daten["plan"]>, t: HallenTeil): VerschiebePruefung {
  if (t.art !== "objekt") return { ok: true };
  const koerper = planKoerper(halle, plan);
  const k = koerper.find((x) => x.teil?.art === "objekt" && x.teil.id === t.id);
  if (!k) return { ok: true };
  return pruefeLage(halle, koerper, t, { x: k.rechteck.x, y: k.rechteck.y, b: k.rechteck.h, h: k.rechteck.b });
}

/** Teil oder Reihe um 90° drehen bzw. Fläche Breite und Tiefe tauschen. */
export function gedreht(h: Halle, z: HallenTeil): Halle {
  const v = vollstaendig(h);
  // Ein Käfigblock dreht seine Front mit (in vier Richtungen: Front zur einen, dann zur anderen langen Seite).
  if (z.art === "objekt")
    return {
      ...v,
      objekte: v.objekte!.map((o) => {
        if (o.id !== z.id) return o;
        const front = o.art === "kaefigblock" || o.art === "voliere" ? { front: dreheBlick(objektFront({ front: o.front, rechteck: o.drehung === 90 ? { x: 0, y: 0, b: 1, h: 2 } : { x: 0, y: 0, b: 2, h: 1 } }), 90) } : {};
        return { ...o, drehung: o.drehung === 90 ? 0 : 90, ...front };
      }),
    };
  if (z.art === "flaeche") return { ...v, flaechen: v.flaechen.map((f, j) => (j === z.i ? { ...f, breite: f.tiefe, tiefe: f.breite } : f)) };
  if (z.art === "platte") {
    const alt = v.plattenVersatz!.find((x) => x.reihe === z.reihe && x.platte === z.i) ?? { reihe: z.reihe, platte: z.i, dx: 0, dy: 0 };
    return mitPlattenVersatz(v, { ...alt, drehung: (((alt.drehung ?? 0) + 90) % 360) as Drehung });
  }
  // Reihe: um 90° weiter (um die Mitte ihrer Käfige), viermal = wieder wie vorher.
  const alt = v.reihenVersatz!.find((x) => x.nr === z.nr) ?? { nr: z.nr, dx: 0, dy: 0 };
  return mitVersatz(v, { ...alt, drehung: (((alt.drehung ?? 0) + 90) % 360) as Drehung });
}

/**
 * Der Plan als Zeichnung (Maße in cm), von oben gesehen. Ist die Halle länger als breit, liegt sie quer – passt besser
 * aufs Blatt. Im Bearbeiten-Modus lassen sich Flächen, eingesetzte Volieren und Käfigblöcke sowie ganze Reihen mit der
 * Maus (oder den Pfeiltasten) verschieben und drehen. Farben als SVG-Attribute (die CSP der App erlaubt keine Inline-Styles).
 */
/**
 * Käfigplätze, auf die sich ein Tier versetzen lässt: Reihenplätze (belegt und frei, auch auf angebauten Platten) und die Plätze
 * der Käfigblöcke, je mit ihrer Fläche in der Halle (bei Etagen der Streifen der Etage).
 */
export function zielPlaetze(plan: Plan, halle: Halle): { schluessel: string; platz: KaefigPlatz; typ: string; tierId: number | null; nr: string | null; q: Rechteck }[] {
  const aus: ReturnType<typeof zielPlaetze> = [];
  for (const r of plan.reihen) {
    for (const k of r.kaefige) aus.push({ schluessel: `k${k.id}`, platz: { art: "reihe", reihe: r.nr, x: k.x, y: k.y, ...(k.etage ? { etage: k.etage } : {}) }, typ: k.typ, tierId: k.id, nr: k.nr, q: k.zeichnung ?? k.rechteck });
    (r.freiePlaetze ?? []).forEach((f, i) => {
      aus.push({ schluessel: `f${r.nr}-${i}`, platz: { art: "reihe", reihe: r.nr, x: f.x, y: f.y, ...(f.etage ? { etage: f.etage } : {}) }, typ: f.typ, tierId: null, nr: null, q: f.zeichnung ?? f.rechteck });
    });
  }
  for (const o of plan.objekte) {
    if (o.art !== "kaefigblock" || !o.typ || !o.plaetze) continue;
    const et = etagenVon(o.typ, halle);
    for (let i = 0; i < o.plaetze; i++) {
      const k = o.kaefige?.find((x) => x.blockPlatz === i);
      const b = blockPlatz(o.rechteck, o.plaetze, et, i);
      const q = k ? (k.zeichnung ?? k.rechteck) : et > 1 ? etagenStreifen(b.rechteck, b.etage, et, objektFront(o)) : b.rechteck;
      aus.push({ schluessel: `b${o.id}-${i}`, platz: { art: "block", objektId: o.id, i }, typ: o.typ, tierId: k?.id ?? null, nr: k?.nr ?? null, q });
    }
  }
  return aus;
}

/** Umschließendes Rechteck mehrerer Rechtecke (Zeichenkoordinaten). */
export function huelle(q: { x: number; y: number; width: number; height: number }[]) {
  const x = Math.min(...q.map((a) => a.x)), y = Math.min(...q.map((a) => a.y));
  return { x, y, width: Math.max(...q.map((a) => a.x + a.width)) - x, height: Math.max(...q.map((a) => a.y + a.height)) - y };
}

export const BLOCK_TYPEN = ["grosskaefig", "huehner", "zwerghuehner", "tauben", "stamm"] as const;

/** Angaben zu einem gewählten Teil für den Eigenschaften-Bereich. */
export type TeilInfo = { art: string; name: string; status: string; leer: boolean; zeilen: [string, string][]; flaeche?: number; moebel?: string; tiere?: { id: number; nr: string | null; rasse: string; typ: string }[] };

export function teilInfo(halle: Halle, plan: Plan, masse: KaefigMasse, z: Ziel): TeilInfo | null {
  const t = tg();
  const quer = halle.laenge > halle.breite;
  // Lage wie in der Zeichnung (dort liegt eine lange Halle quer): Abstand von der linken und oberen Wand.
  const lage = (q: Rechteck): [string, string][] => {
    const g = quer ? { x: q.y, y: q.x, b: q.h, h: q.b } : q;
    return [
      [t.lage, t.lageWert(meter(g.x), meter(g.y))],
      [t.groesse, `${meter(g.b)} × ${meter(g.h)} m`],
    ];
  };
  const nr = (k: { nr: string | null }[]) => nummernBereiche(k.map((x) => alsNummer(x.nr))) || t.ohneNummer;
  const frei = (n: number) => t.leerFrei(zahlWort(n, t.freiePlaetze));
  const weg = (v: { dx: number; dy: number } | undefined) => (v && (v.dx || v.dy) ? `${meter(Math.hypot(v.dx, v.dy))} m` : t.nein);
  if (z.art === "platte" || z.art === "platz") {
    const r = plan.reihen.find((x) => x.nr === z.reihe);
    if (!r) return null;
    const { aufPlatte } = reihenLage(halle, r);
    if (z.art === "platz") {
      const f = freierPlatz(plan, z);
      if (!f || platzWeg(halle, r, f, plattenDa(halle, r))) return null;
      return {
        art: t.freierPlatz,
        name: `${t.freierPlatzIn(r.nr)}${f.platte != null ? t.grundplatteZusatz(f.platte + 1) : ""}`,
        status: t.leer,
        leer: true,
        zeilen: [[t.kaefig, kaefigBezeichnung(f.typ as KaefigTyp, masse)], ...lage(aufPlatte(f.rechteck, f.platte))],
      };
    }
    const pl = r.platten[z.i];
    if (!pl || !plattenDa(halle, r)[z.i]) return null;
    const drauf = r.kaefige.filter((k) => k.platte === z.i);
    const e = (halle.plattenVersatz ?? []).find((x) => x.reihe === r.nr && x.platte === z.i);
    return {
      art: t.grundplatte,
      name: t.grundplatteInR(z.i + 1, r.nr),
      status: drauf.length ? t.belegtVon(drauf.length, pl.plaetze) : frei(pl.plaetze - drauf.length),
      leer: drauf.length === 0,
      zeilen: [
        [t.kaefigeZeile, pl.gemischt ? plattenKaefige(r, z.i, masse) : `${pl.plaetze} × ${kaefigBezeichnung(pl.typ as KaefigTyp, masse)}`],
        ...(drauf.length ? ([[t.nummern, nr(drauf)]] as [string, string][]) : []),
        ...lage(aufPlatte(pl.rechteck, z.i)),
        [t.drehung, `${e?.drehung ?? 0}°`],
        [t.verschoben, weg(e)],
      ],
      tiere: drauf,
    };
  }
  if (z.art === "reihe") {
    const r = plan.reihen.find((x) => x.nr === z.nr);
    if (!r) return null;
    const { aufPlatte } = reihenLage(halle, r);
    const e = (halle.reihenVersatz ?? []).find((x) => x.nr === r.nr);
    const da = plattenDa(halle, r);
    const q = r.platten.flatMap((pl, i) => (da[i] ? [aufPlatte(pl.rechteck, i)] : []));
    return {
      art: t.reihe,
      name: t.reiheR(r.nr),
      status: r.kaefige.length ? t.kaefigeBelegt(zahlWort(r.kaefige.length, t.kaefige)) : t.leer,
      leer: r.kaefige.length === 0,
      zeilen: [
        [t.grundplattenZeile, String(q.length)],
        ...(r.kaefige.length ? ([[t.nummern, nr(r.kaefige)]] as [string, string][]) : []),
        ...(q.length ? lage(huelleRechteck(q)) : []),
        [t.drehung, `${e?.drehung ?? 0}°`],
        [t.verschoben, weg(e)],
      ],
    };
  }
  if (z.art === "objekt") {
    const o = plan.objekte.find((x) => x.id === z.id);
    const ol = o && objektLage(halle, o);
    // Eben eingesetzt, der Plan ist noch nicht neu gerechnet: schon anzeigen (leer).
    const neu = !o ? (halle.objekte ?? []).find((x) => x.id === z.id) : null;
    const moebelName = ot().fach.MOEBEL_NAME;
    if (neu && istMoebel(neu)) return { art: moebelName[neu.art], name: t.neuesMoebel(neu.art, moebelName[neu.art]), status: t.neu, leer: true, zeilen: [], moebel: neu.id };
    if (neu) return { art: neu.art === "voliere" ? t.voliere : t.kaefigblock, name: neu.art === "voliere" ? t.neueVoliere : t.neuerBlock(kaefigBezeichnung(neu.typ ?? "huehner", masse)), status: t.leer, leer: true, zeilen: [] };
    if (!o || !ol) return null;
    if (istMoebel(o)) {
      const e = (halle.objekte ?? []).find((x) => x.id === o.id);
      return { art: moebelName[o.art], name: o.name, status: t.keinKaefigplatz, leer: true, zeilen: [...lage(ol.lage), [t.drehung, `${e?.drehung ?? 0}°`]], moebel: o.id };
    }
    const drin = [...(o.tier ? [o.tier] : []), ...(o.kaefige ?? [])];
    const e = (halle.objekte ?? []).find((x) => x.id === o.id);
    return {
      art: o.art === "voliere" ? t.voliere : t.kaefigblock,
      name: o.name,
      status: drin.length ? (o.art === "voliere" ? t.belegt : t.belegtVon(drin.length, o.plaetze)) : o.art === "voliere" ? t.leer : frei(o.plaetze),
      leer: drin.length === 0,
      zeilen: [...(drin.length ? ([[t.nummern, nr(drin)]] as [string, string][]) : []), ...lage(ol.lage), [t.drehung, `${e?.drehung ?? 0}°`]],
      tiere: drin,
    };
  }
  const f = halle.flaechen[z.i];
  if (!f) return null;
  const q = flaecheRechteck(f);
  const volieren = f.art === "volieren" ? plan.volieren.filter((v) => innen(v.rechteck, q)) : [];
  return {
    art: f.art === "eingang" ? t.eingang : f.art === "volieren" ? t.volierenbereich : t.freierBereich,
    name: f.name,
    status: volieren.length ? zahlWort(volieren.length, t.volieren) : t.leer,
    leer: volieren.length === 0,
    zeilen: lage(q),
    flaeche: z.i,
  };
}

export const huelleRechteck = (q: Rechteck[]): Rechteck => {
  const x = Math.min(...q.map((a) => a.x)), y = Math.min(...q.map((a) => a.y));
  return { x, y, b: Math.max(...q.map((a) => a.x + a.b)) - x, h: Math.max(...q.map((a) => a.y + a.h)) - y };
};

/**
 * Wand, an der Einzelreihen stehen können, wie sie in der Zeichnung liegt: Die Reihen folgen bei „quer“ entlang der Länge
 * aufeinander, bei „längs“ entlang der Breite; die Zeichnung legt die lange Seite waagrecht.
 */
export function wandText(halle: Pick<Halle, "richtung" | "breite" | "laenge">, seite: WandSeite): string {
  const entlangLaenge = (halle.richtung ?? "quer") === "quer";
  const laengeWaagrecht = halle.laenge > halle.breite;
  const waagrecht = entlangLaenge === laengeWaagrecht;
  const w = tg().wand;
  return waagrecht ? (seite === "anfang" ? w.links : w.rechts) : seite === "anfang" ? w.oben : w.unten;
}

/** Lage des Hauptgangs je Richtung der Reihen – in der Sprache der Oberfläche (beim Zugriff gelesen). */
export const HAUPTGANG_LAGE: Record<"quer" | "laengs", Record<"anfang" | "ende" | "beide" | "mitte" | "keiner", string>> = {
  get quer() {
    return tg().hauptgang.quer;
  },
  get laengs() {
    return tg().hauptgang.laengs;
  },
};

/** Grundplatten zusammen nach Käfigart: „12 × 70 × 70 × 70 cm (3 je Platte), 8 × 50 × 50 × 50 cm (4 je Platte)“. Eine
 * gemischte Platte (Rest mit der nächsten Käfigart belegt) zählt bei der Art, mit der sie beginnt, als „gemischt“. */
export function plattenJeArt(reihen: Reihe[], masse: KaefigMasse): string {
  const n = new Map<string, { typ: KaefigTyp; plaetze: number; gemischt: boolean; anzahl: number }>();
  for (const pl of reihen.flatMap((r) => r.platten.filter((p) => !p.entfernt))) {
    // bleibt deutsch (Schlüssel, kein Text)
    const k = pl.gemischt ? `${pl.typ}|gemischt` : `${pl.typ}|${pl.plaetze}`;
    const z = n.get(k) ?? { typ: pl.typ as KaefigTyp, plaetze: pl.plaetze, gemischt: !!pl.gemischt, anzahl: 0 };
    z.anzahl++;
    n.set(k, z);
  }
  const t = tg();
  return [...n.values()].map((z) => `${z.anzahl} × ${kaefigBezeichnung(z.typ, masse)} (${z.gemischt ? t.gemischt : t.jePlatte(z.plaetze)})`).join(", ") || "–";
}

/** Käfige auf einer Grundplatte je Art (belegt und frei): „1 × 70 × 70 × 70 cm, 3 × 40 × 40 × 40 cm“. */
export function plattenKaefige(r: Reihe, i: number, masse: KaefigMasse): string {
  const n = new Map<KaefigTyp, number>();
  for (const k of [...r.kaefige, ...(r.freiePlaetze ?? [])]) if (k.platte === i) n.set(k.typ as KaefigTyp, (n.get(k.typ as KaefigTyp) ?? 0) + 1);
  return [...n].map(([t, a]) => `${a} × ${kaefigBezeichnung(t, masse)}`).join(", ");
}

/** Tiefe, mit der ein Eingang in die Halle gezeichnet wird (die Reihen halten davon ohnehin einen Gang Abstand). */
export const EINGANG_TIEFE = 50;

/**
 * Lage in der Zeichnung (lange Seite waagrecht, wie im Plan) ↔ Hallenkoordinaten (x entlang der Breite, y entlang der
 * Länge). Bei Reihen quer zur Halle liegt die Länge waagrecht.
 */
export function zeichenSystem(breite: number, laenge: number) {
  const quer = laenge > breite;
  const W = quer ? laenge : breite;
  const H = quer ? breite : laenge;
  const zuZeichnung = (f: { x: number; y: number; breite: number; tiefe: number }) => (quer ? { x: f.y, y: f.x, b: f.tiefe, h: f.breite } : { x: f.x, y: f.y, b: f.breite, h: f.tiefe });
  return { W, H, zuZeichnung };
}
