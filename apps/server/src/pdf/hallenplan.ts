/**
 * Hallenplan als PDF: genau ein Blatt DIN A4 oder A3 (Formatvorgabe der Schau, Entscheidung 029) – der Plan füllt es
 * (Querformat, wenn die Zeichnung breiter als hoch ist),
 * darüber ein knapper Kopf (Schau, Halle, Stand), darunter eine kleine Legende. Große Hallen werden verkleinert, nie
 * abgeschnitten. Die Aufbauliste ist ein eigenes PDF.
 */
import { druckFormateLesen, hallenplanBlatt, istRechteckUmriss, tuerOeffnung, umrissVersetzt, umrissVon, reihenSchilder, frontDerReihe, kaefigKanten, type Blick, type Strecke, objektFront, blockPlatz, druckMassstab, etagenStreifen, etagenVon, istMoebel, kaefigName, moebelStuecke, nummernBereiche, planeHalle, richterFarbe, richterFolge, richterSchraffur, zeichnungDerHalle, type Hallenplan, type KaefigTyp, type PlanKaefig, type Rechteck } from "@schau/domain";
import type { schau } from "../db/schema";
import { planTiere } from "../routers/katalog";
import { erzeugePdf, GRAU, MM, SANS, SANS_FETT, SERIF_FETT, tabelle, TINTE, type Doc } from "./basis";

type Schau = typeof schau.$inferSelect;

const BAU = {
  boden: "#fbfbf9",
  wand: "#2b2f36",
  linie: "#3d4450",
  platte: { fill: "#ebe6dc", stroke: "#8f8676" },
  sperre: { fill: "#e9ebee", stroke: "#6b7383" },
  volieren: { fill: "#eef5f1", stroke: "#3d5a50" },
  moebel: { tisch: "#e3cfae", bank: "#efe2cb", stroke: "#8a6d45" },
  pokal: { fill: "#d9b23a", stroke: "#7a5c12" },
  frei: "#7c8696",
  reihe: "#2547a8",
  // Käfigwände von oben (wie auf dem Bildschirm): Rückwand kräftig, Seiten fein, offene Front hell gestrichelt.
  kaefigwand: { rueck: "#1b1f26", seite: "#4a515d", front: "#9aa3b2" },
};
const meter = (cm: number) => (cm / 100).toLocaleString("de-DE", { maximumFractionDigits: 2 });
const alsNummer = (nr: string | null) => {
  const t = nr?.match(/^(\d+)(\D*)$/);
  return t ? { katalogNr: Number(t[1]), suffix: t[2] ?? "" } : { katalogNr: null, suffix: "" };
};
const jetzt = () => new Date().toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Berlin" });

async function ladePlan(s: Schau) {
  if (!s.halle) return null;
  const { tiere, richter } = await planTiere(s);
  const plan = planeHalle(s.halle, tiere, s.kaefigMasse, s.hallenplanFest);
  // Farbe nach dem Platz in der ganzen Folge (wie auf dem Bildschirm); in der Legende nur, wer Tiere im Plan hat.
  const folge = richterFolge(plan, richter);
  return { halle: s.halle, plan, richter: folge, legende: folge.map((r, i) => ({ ...r, i })).filter((r) => hatTiere(plan, r.id)) };
}
const hatTiere = (plan: Hallenplan, id: number) =>
  plan.reihen.some((r) => r.kaefige.some((k) => k.preisrichterId === id)) || plan.volieren.some((k) => k.preisrichterId === id) || plan.objekte.some((o) => o.tier?.preisrichterId === id || o.kaefige?.some((k) => k.preisrichterId === id));

/** Hallenplan auf einem Blatt A4 oder A3. */
export async function hallenplanPdf(s: Schau): Promise<Buffer> {
  const daten = await ladePlan(s);
  const z = zeichnungDerHalle(daten?.halle ?? { breite: 1, laenge: 1 });
  const quer = z.W >= z.H;
  const seite = hallenplanBlatt(druckFormateLesen(s.druckFormate).hallenplan, quer);
  return erzeugePdf(
    `Hallenplan ${s.name}`,
    (doc) => {
      const x0 = doc.page.margins.left, y0 = doc.page.margins.top;
      const b = doc.page.width - x0 - doc.page.margins.right;
      const unten = doc.page.height - doc.page.margins.bottom;
      // Kopf: eine Zeile.
      doc.font(SERIF_FETT).fontSize(13).fillColor(TINTE).text("Hallenplan", x0, y0, { lineBreak: false });
      const titelB = doc.widthOfString("Hallenplan") + 8;
      doc.font(SANS).fontSize(10).fillColor(TINTE).text(s.name, x0 + titelB, y0 + 2.5, { width: b / 2 - titelB, lineBreak: false, ellipsis: true });
      const stand = daten?.plan.fest ? `festgeschrieben ${new Date(daten.plan.fest.am).toLocaleDateString("de-DE", { timeZone: "Europe/Berlin" })}` : "automatisch gestellt";
      const rechts = daten ? `Halle ${meter(daten.halle.breite)} × ${meter(daten.halle.laenge)} m · ${stand} · Stand ${jetzt()}` : `Stand ${jetzt()}`;
      doc.font(SANS).fontSize(8.5).fillColor(GRAU).text(rechts, x0 + b / 2, y0 + 3.5, { width: b / 2, align: "right", lineBreak: false });
      const kopfUnten = y0 + 18;
      doc.save().lineWidth(0.6).strokeColor(TINTE).moveTo(x0, kopfUnten).lineTo(x0 + b, kopfUnten).stroke().restore();
      if (!daten) {
        doc.font(SANS).fontSize(11).fillColor(GRAU).text("Noch keine Halle angelegt.", x0, kopfUnten + 20);
        return;
      }
      // Legende unten (so hoch wie nötig), dazwischen der Plan.
      const legendeH = legende(doc, daten, x0, b, unten, true);
      const flaeche = { x: x0, y: kopfUnten + 6, b, h: unten - legendeH - 6 - (kopfUnten + 6) };
      // Umriss der Zeichnung: die Halle samt Wand und dem Rand für die Reihennamen.
      const wandCm = 25;
      // Rand außen für die Reihennamen (oben bzw. links).
      const randCm = 70;
      const teile = [{ x: -wandCm - randCm, y: -wandCm - randCm, b: z.W + 2 * wandCm + randCm, h: z.H + 2 * wandCm + randCm }];
      const links = Math.min(...teile.map((q) => q.x)), oben = Math.min(...teile.map((q) => q.y));
      const umriss = { W: Math.max(...teile.map((q) => q.x + q.b)) - links, H: Math.max(...teile.map((q) => q.y + q.h)) - oben };
      const m = druckMassstab(umriss, flaeche);
      const ox = flaeche.x + (flaeche.b - umriss.W * m) / 2 - links * m;
      const oy = flaeche.y + (flaeche.h - umriss.H * m) / 2 - oben * m;
      zeichne(doc, daten, (q) => {
        const g = z.zuZeichnung(q);
        return { x: ox + g.x * m, y: oy + g.y * m, b: g.b * m, h: g.h * m };
      }, { W: z.W * m, H: z.H * m, ox, oy, m });
      legende(doc, daten, x0, b, unten, false);
    },
    { size: [seite.breite * MM, seite.hoehe * MM], margin: 10 * MM },
  );
}

type Daten = NonNullable<Awaited<ReturnType<typeof ladePlan>>>;
type Abb = (q: Rechteck) => Rechteck;

function zeichne(doc: Doc, d: Daten, abb: Abb, g: { W: number; H: number; ox: number; oy: number; m: number }) {
  const { plan, halle } = d;
  const farbIndex = new Map(d.richter.map((r, i) => [r.id, i]));
  const wand = Math.max(1.6, Math.min(4, 18 * g.m));
  // Boden und Wände (außen um die Halle) – beim freien Grundriss (Entscheidung 019) entlang seiner Wände.
  const frei = !istRechteckUmriss(halle.umriss);
  const umriss = umrissVon(halle);
  const punkte = (u: { x: number; y: number }[]) => u.map((p) => abb({ x: p.x, y: p.y, b: 0, h: 0 })).map((q) => [q.x, q.y] as [number, number]);
  if (frei) {
    doc.save().polygon(...punkte(umriss)).fill(BAU.boden).restore();
    doc.save().polygon(...punkte(umrissVersetzt(umriss, wand / g.m))).polygon(...punkte(umriss)).fill(BAU.wand, "even-odd").restore();
  } else {
    doc.save().rect(g.ox, g.oy, g.W, g.H).fill(BAU.boden).restore();
    doc.save().lineWidth(wand).strokeColor(BAU.wand).rect(g.ox - wand / 2, g.oy - wand / 2, g.W + wand, g.H + wand).stroke().restore();
  }
  // Flächen: Eingänge als Öffnung in der Wand, freie Bereiche grau, Volierenbereiche grün gestrichelt.
  for (const f of halle.flaechen) {
    const q = abb({ x: f.x, y: f.y, b: f.breite, h: f.tiefe });
    if (f.art === "eingang") {
      // Öffnung: die Wand an der berührten Seite aussparen.
      const n = 12 * g.m;
      doc.save().fillColor("#ffffff");
      const o = frei ? tuerOeffnung(umriss, { x: f.x, y: f.y, b: f.breite, h: f.tiefe }, wand / g.m + 1, 12) : null;
      if (o) {
        const r = abb(o);
        doc.rect(r.x, r.y, r.b, r.h).fill();
      } else if (frei) {
        // an keiner Wand des Grundrisses: keine Öffnung
      } else if (q.x <= g.ox + n) doc.rect(g.ox - wand - 0.5, q.y, wand + 1, q.h).fill();
      else if (q.x + q.b >= g.ox + g.W - n) doc.rect(g.ox + g.W - 0.5, q.y, wand + 1, q.h).fill();
      else if (q.y <= g.oy + n) doc.rect(q.x, g.oy - wand - 0.5, q.b, wand + 1).fill();
      else if (q.y + q.h >= g.oy + g.H - n) doc.rect(q.x, g.oy + g.H - 0.5, q.b, wand + 1).fill();
      doc.restore();
      doc.save().lineWidth(0.6).strokeColor(BAU.wand).fillColor("#ffffff").rect(q.x, q.y, q.b, q.h).fillAndStroke().restore();
    } else if (f.art === "sperre") {
      doc.save().lineWidth(0.5).strokeColor(BAU.sperre.stroke).fillColor(BAU.sperre.fill).rect(q.x, q.y, q.b, q.h).fillAndStroke().restore();
      schraffur(doc, q, "#9aa2ae", 4);
    } else {
      doc.save().lineWidth(0.6).dash(3, { space: 2 }).strokeColor(BAU.volieren.stroke).fillColor(BAU.volieren.fill).rect(q.x, q.y, q.b, q.h).fillAndStroke().undash().restore();
    }
    beschrifte(doc, f.name, q, f.art === "eingang" ? SANS_FETT : SANS, 8, f.art === "volieren" ? "oben" : "mitte");
  }
  // Reihen: Grundplatten (ohne entfernte), Käfige, freie Plätze, Beschriftung „R…“.
  for (const r of plan.reihen) {
    const platten = r.platten.filter((p) => !p.entfernt);
    if (!platten.length && !r.kaefige.length) continue;
    for (const p of platten) {
      const q = abb(p.rechteck);
      doc.save().lineWidth(0.4).strokeColor(BAU.platte.stroke).fillColor(BAU.platte.fill).rect(q.x, q.y, q.b, q.h).fillAndStroke().restore();
    }
    // Mehrere Etagen: je Käfig sein Feld (Grundfläche quer zur Front geteilt).
    for (const k of r.kaefige) kaefig(doc, k, abb(k.zeichnung ?? k.rechteck), farbIndex);
    for (const f of r.freiePlaetze ?? []) {
      const q = abb(f.zeichnung ?? f.rechteck);
      doc.save().lineWidth(0.4).dash(1.2, { space: 0.9 }).strokeColor(BAU.frei).fillColor("#ffffff").rect(q.x, q.y, q.b, q.h).fillAndStroke().undash().restore();
    }
    for (const p of platten) waende(doc, abb, p.rechteck, frontDerReihe(r, plan.quer, p.drehung ?? 0));
  }
  // Reihennamen außerhalb der Halle am Rand: über der Wand (Reihe senkrecht im Plan) bzw. links davor (waagrecht) – beim
  // größten Stück der Reihe, wie die Platten wirklich stehen, alle gleich groß und nie übereinander (wie im Editor).
  const gr = 7;
  doc.font(SANS_FETT).fontSize(gr);
  const breitester = Math.max(...plan.reihen.map((r) => doc.widthOfString(`R${r.nr}`)), 0);
  const schilder = reihenSchilder(
    plan.reihen.flatMap((r) => {
      const platten = r.platten.filter((p) => !p.entfernt);
      const q = platten.length ? platten.map((p) => abb(p.rechteck)) : r.kaefige.map((k) => abb(k.rechteck));
      return q.length ? [{ nr: r.nr, platten: q }] : [];
    }),
    { x: g.ox, y: g.oy, b: g.W, h: g.H },
    { oben: breitester + 3, links: gr * 1.3 },
  );
  doc.fillColor(BAU.reihe);
  for (const sch of schilder) {
    const t = `R${sch.nr}`;
    const tw = doc.widthOfString(t);
    if (sch.seite === "oben") doc.text(t, sch.mitte - tw / 2, g.oy - wand - gr - 3, { lineBreak: false });
    else doc.text(t, g.ox - wand - tw - 4, sch.mitte - gr * 0.6, { lineBreak: false });
  }
  // Volieren im Volierenbereich und eingesetzte Teile.
  for (const v of plan.volieren) {
    kaefig(doc, v, abb(v.rechteck), farbIndex);
    if (v.front) waende(doc, abb, v.rechteck, v.front);
  }
  for (const o of plan.objekte) {
    const q = abb(o.rechteck);
    if (istMoebel(o)) {
      // Tisch, Bank, Garnitur: Holzton, die Garnitur als Bank, Tisch, Bank; der Pokaltisch mit einem Pokal in der Mitte.
      for (const m of moebelStuecke(o, o.rechteck)) {
        const g2 = abb(m.q);
        doc.save().lineWidth(0.4).strokeColor(BAU.moebel.stroke).fillColor(m.art === "bank" ? BAU.moebel.bank : BAU.moebel.tisch).rect(g2.x, g2.y, g2.b, g2.h).fillAndStroke().restore();
        if (m.art === "pokaltisch") pokal(doc, g2.x + g2.b / 2, g2.y + g2.h / 2, Math.min(g2.b, g2.h) * 0.8);
      }
      continue;
    }
    if (o.art === "voliere") {
      if (o.tier) kaefig(doc, { ...o.tier, rechteck: o.rechteck } as PlanKaefig, q, farbIndex, 1.4);
      else {
        doc.save().lineWidth(1.4).strokeColor(BAU.linie).fillColor("#ffffff").rect(q.x, q.y, q.b, q.h).fillAndStroke().restore();
        beschrifte(doc, "V", q, SANS, 8, "mitte");
      }
      waende(doc, abb, o.rechteck, objektFront(o));
      continue;
    }
    doc.save().lineWidth(0.4).strokeColor(BAU.platte.stroke).fillColor(BAU.platte.fill).rect(q.x, q.y, q.b, q.h).fillAndStroke().restore();
    const belegt = o.kaefige ?? [];
    const et = etagenVon(o.typ ?? "huehner", halle);
    for (let i = 0; i < o.plaetze; i++) {
      // Freie Plätze (auch von Hand frei gemachte zwischen belegten).
      if (belegt.some((k, j) => (k.blockPlatz ?? j) === i)) continue;
      const b = blockPlatz(o.rechteck, o.plaetze, et, i);
      const f = abb(etagenStreifen(b.rechteck, b.etage, et, objektFront(o)));
      const e = Math.min(f.b, f.h) * 0.08;
      doc.save().lineWidth(0.4).dash(1.2, { space: 0.9 }).strokeColor(BAU.frei).fillColor("#ffffff").rect(f.x + e, f.y + e, f.b - 2 * e, f.h - 2 * e).fillAndStroke().undash().restore();
    }
    for (const k of belegt) kaefig(doc, k, abb(k.zeichnung ?? k.rechteck), farbIndex);
    waende(doc, abb, o.rechteck, objektFront(o));
  }
}

/** Rückwand, Seitenwände und offene Front eines Käfigs, einer Grundplatte oder eines Blocks (`q` in Hallenkoordinaten). */
function waende(doc: Doc, abb: Abb, q: Rechteck, front: Blick) {
  const k = kaefigKanten(q, front);
  const linie = (st: Strecke, farbe: string, breite: number, strich?: number) => {
    const a = abb({ x: st.x1, y: st.y1, b: st.x2 - st.x1, h: st.y2 - st.y1 });
    doc.save().lineWidth(breite).strokeColor(farbe).lineCap("square");
    if (strich) doc.dash(strich, { space: strich * 0.8 });
    doc.moveTo(a.x, a.y).lineTo(a.x + a.b, a.y + a.h).stroke();
    if (strich) doc.undash();
    doc.restore();
  };
  linie(k.front, BAU.kaefigwand.front, 0.4, 1);
  linie(k.seiten[0], BAU.kaefigwand.seite, 0.55);
  linie(k.seiten[1], BAU.kaefigwand.seite, 0.55);
  linie(k.rueck, BAU.kaefigwand.rueck, 1.3);
}

/** Ein Käfig: Farbe des Preisrichters (ab der fünften schraffiert), Rand, Käfignummer – so groß, wie sie hineinpasst. */
function kaefig(doc: Doc, k: Pick<PlanKaefig, "nr" | "kaefig" | "preisrichterId">, q: Rechteck, farbIndex: Map<number, number>, rand = 0.45) {
  const i = k.preisrichterId != null ? (farbIndex.get(k.preisrichterId) ?? -1) : -1;
  doc.save().rect(q.x, q.y, q.b, q.h).fill("#ffffff").restore();
  if (i >= 0) {
    doc.save().fillOpacity(0.45).rect(q.x, q.y, q.b, q.h).fill(richterFarbe(i)).restore();
    if (richterSchraffur(i)) schraffur(doc, q, richterFarbe(i), Math.max(2, Math.min(q.b, q.h) / 3));
  }
  doc.save().lineWidth(rand).strokeColor(BAU.linie).rect(q.x, q.y, q.b, q.h).stroke().restore();
  const nr = k.kaefig ?? k.nr;
  if (!nr) return;
  doc.font(SANS).fillColor(TINTE);
  // Schriftgröße: so groß, wie Breite und Höhe es erlauben (höchstens 9 pt).
  let gr = Math.min(9, q.h * 0.62);
  doc.fontSize(gr);
  const w = doc.widthOfString(nr);
  if (w > q.b * 0.9) gr = (gr * q.b * 0.9) / w;
  doc.fontSize(gr);
  doc.text(nr, q.x + q.b / 2 - doc.widthOfString(nr) / 2, q.y + q.h / 2 - gr * 0.62, { lineBreak: false });
}

/** Pokal (Ehrenpreis) als Zeichen, `gr` hoch und breit, um die Mitte (cx, cy): Schale mit Henkeln, Fuß, Sockel. */
function pokal(doc: Doc, cx: number, cy: number, gr: number) {
  const x = (u: number) => cx + (u - 0.5) * gr, y = (v: number) => cy + (v - 0.5) * gr;
  doc.save().lineWidth(Math.max(0.3, gr * 0.06)).strokeColor(BAU.pokal.stroke).fillColor(BAU.pokal.fill);
  // Henkel links und rechts.
  doc.moveTo(x(0.26), y(0.16)).quadraticCurveTo(x(0.02), y(0.16), x(0.3), y(0.4)).stroke();
  doc.moveTo(x(0.74), y(0.16)).quadraticCurveTo(x(0.98), y(0.16), x(0.7), y(0.4)).stroke();
  // Schale, Fuß und Sockel.
  doc.moveTo(x(0.22), y(0.08)).lineTo(x(0.78), y(0.08)).quadraticCurveTo(x(0.76), y(0.52), x(0.5), y(0.56)).quadraticCurveTo(x(0.24), y(0.52), x(0.22), y(0.08)).closePath().fillAndStroke();
  doc.rect(x(0.45), y(0.56), gr * 0.1, gr * 0.2).fillAndStroke();
  doc.rect(x(0.3), y(0.76), gr * 0.4, gr * 0.14).fillAndStroke().restore();
}

/** Diagonale Linien im Rechteck (wie die Schraffur im Plan). */
function schraffur(doc: Doc, q: Rechteck, farbe: string, abstand: number) {
  doc.save().rect(q.x, q.y, q.b, q.h).clip();
  doc.lineWidth(0.5).strokeColor(farbe);
  for (let t = -q.h; t < q.b; t += abstand) doc.moveTo(q.x + t, q.y + q.h).lineTo(q.x + t + q.h, q.y).stroke();
  doc.restore();
}

/** Name einer Fläche: mittig (bei hochkant gedreht) oder am oberen Rand; kleiner, wenn er sonst nicht passt. */
function beschrifte(doc: Doc, text: string, q: Rechteck, schrift: string, max: number, lage: "mitte" | "oben") {
  const hoch = lage === "mitte" && q.h > q.b * 1.5;
  const lang = hoch ? q.h : q.b, kurz = hoch ? q.b : q.h;
  doc.font(schrift).fontSize(max);
  let gr = lage === "oben" ? max : Math.min(max, kurz * 0.7);
  doc.fontSize(gr);
  const w = doc.widthOfString(text);
  if (w > lang * 0.92) gr = (gr * lang * 0.92) / w;
  if (gr < 3) return;
  doc.fontSize(gr).fillColor(TINTE);
  const tw = doc.widthOfString(text);
  if (hoch) {
    doc.save().rotate(-90, { origin: [q.x + q.b / 2, q.y + q.h / 2] });
    doc.text(text, q.x + q.b / 2 - tw / 2, q.y + q.h / 2 - gr * 0.62, { lineBreak: false });
    doc.restore();
  } else doc.text(text, q.x + q.b / 2 - tw / 2, lage === "oben" ? q.y - gr * 1.2 : q.y + q.h / 2 - gr * 0.62, { lineBreak: false });
}

/**
 * Legende am unteren Rand: Preisrichter mit Farbe, dazu Eingang, freier Bereich, Volierenbereich, Grundplatte, freier
 * Platz. Bricht nach Bedarf um. `messen`: nur die Höhe bestimmen.
 */
function legende(doc: Doc, d: Daten, x0: number, b: number, unten: number, messen: boolean): number {
  const gr = 7.5, feld = { b: 13, h: 9 }, abstand = 10, zeile = 12;
  type Eintrag = { text: string; male: (x: number, y: number) => void };
  const eintraege: Eintrag[] = [
    ...d.legende.map(({ name, i }): Eintrag => ({
      text: name,
      male: (x, y) => {
        const q = { x, y, b: feld.b, h: feld.h };
        doc.save().rect(x, y, feld.b, feld.h).fill("#ffffff").fillOpacity(0.45).rect(x, y, feld.b, feld.h).fill(richterFarbe(i)).restore();
        if (richterSchraffur(i)) schraffur(doc, q, richterFarbe(i), 3);
        doc.save().lineWidth(0.4).strokeColor(BAU.linie).rect(x, y, feld.b, feld.h).stroke().restore();
      },
    })),
    {
      text: "Eingang / Notausgang",
      male: (x, y) => {
        doc.save().lineWidth(2).strokeColor(BAU.wand).moveTo(x, y + 1).lineTo(x + 4, y + 1).moveTo(x + feld.b - 4, y + 1).lineTo(x + feld.b, y + 1).stroke();
        doc.lineWidth(0.6).fillColor("#ffffff").rect(x + 4, y + 2, feld.b - 8, feld.h - 2).fillAndStroke().restore();
      },
    },
    {
      text: "freie Fläche",
      male: (x, y) => {
        doc.save().lineWidth(0.5).strokeColor(BAU.sperre.stroke).fillColor(BAU.sperre.fill).rect(x, y, feld.b, feld.h).fillAndStroke().restore();
        schraffur(doc, { x, y, b: feld.b, h: feld.h }, "#9aa2ae", 3);
      },
    },
    { text: "Volierenbereich", male: (x, y) => void doc.save().lineWidth(0.6).dash(2, { space: 1.5 }).strokeColor(BAU.volieren.stroke).fillColor(BAU.volieren.fill).rect(x, y, feld.b, feld.h).fillAndStroke().undash().restore() },
    { text: "Grundplatte", male: (x, y) => void doc.save().lineWidth(0.4).strokeColor(BAU.platte.stroke).fillColor(BAU.platte.fill).rect(x, y, feld.b, feld.h).fillAndStroke().restore() },
    { text: "freier Platz", male: (x, y) => void doc.save().lineWidth(0.4).dash(1.2, { space: 0.9 }).strokeColor(BAU.frei).fillColor("#ffffff").rect(x, y, feld.b, feld.h).fillAndStroke().undash().restore() },
    {
      text: "Rückwand",
      male: (x, y) => {
        doc.save().fillColor(BAU.platte.fill).rect(x, y, feld.b, feld.h).fill();
        doc.lineWidth(0.4).strokeColor(BAU.kaefigwand.front).dash(1, { space: 0.8 }).moveTo(x, y + feld.h).lineTo(x + feld.b, y + feld.h).stroke().undash();
        doc.lineWidth(0.55).strokeColor(BAU.kaefigwand.seite).moveTo(x, y).lineTo(x, y + feld.h).moveTo(x + feld.b, y).lineTo(x + feld.b, y + feld.h).stroke();
        doc.lineWidth(1.3).strokeColor(BAU.kaefigwand.rueck).moveTo(x, y).lineTo(x + feld.b, y).stroke().restore();
      },
    },
    ...(d.plan.objekte.some((o) => istMoebel(o) && o.art !== "pokaltisch")
      ? [{ text: "Tisch / Bank", male: (x: number, y: number) => void doc.save().lineWidth(0.4).strokeColor(BAU.moebel.stroke).fillColor(BAU.moebel.tisch).rect(x, y + feld.h * 0.25, feld.b, feld.h * 0.5).fillAndStroke().restore() }]
      : []),
    ...(d.plan.objekte.some((o) => o.art === "pokaltisch")
      ? [
          {
            text: "Pokaltisch",
            male: (x: number, y: number) => {
              doc.save().lineWidth(0.4).strokeColor(BAU.moebel.stroke).fillColor(BAU.moebel.tisch).rect(x, y, feld.b, feld.h).fillAndStroke().restore();
              pokal(doc, x + feld.b / 2, y + feld.h / 2, feld.h * 0.9);
            },
          },
        ]
      : []),
  ];
  doc.font(SANS).fontSize(gr);
  // Zeilen bilden.
  const zeilen: Eintrag[][] = [[]];
  let breiteZeile = 0;
  for (const e of eintraege) {
    const w = feld.b + 4 + doc.widthOfString(e.text) + abstand;
    if (breiteZeile + w > b && zeilen.at(-1)!.length) {
      zeilen.push([]);
      breiteZeile = 0;
    }
    zeilen.at(-1)!.push(e);
    breiteZeile += w;
  }
  const hoehe = zeilen.length * zeile + 4;
  if (messen) return hoehe;
  let y = unten - hoehe + 4;
  for (const z of zeilen) {
    let x = x0;
    for (const e of z) {
      e.male(x, y);
      doc.font(SANS).fontSize(gr).fillColor(TINTE).text(e.text, x + feld.b + 4, y + 1, { lineBreak: false });
      x += feld.b + 4 + doc.widthOfString(e.text) + abstand;
    }
    y += zeile;
  }
  return hoehe;
}

/** Aufbauliste je Reihe als eigenes PDF (Hochformat, so viele Seiten wie nötig). */
export async function aufbaulistePdf(s: Schau): Promise<Buffer> {
  const daten = await ladePlan(s);
  return erzeugePdf(
    `Aufbauliste ${s.name}`,
    (doc) => {
      const x0 = doc.page.margins.left;
      doc.font(SERIF_FETT).fontSize(14).fillColor(TINTE).text("Aufbauliste", x0, doc.page.margins.top, { lineBreak: false });
      doc.font(SANS).fontSize(9).fillColor(GRAU).text(`${s.name} · Stand ${jetzt()}`, x0, doc.page.margins.top + 18);
      doc.y = doc.page.margins.top + 34;
      if (!daten) return void doc.font(SANS).fontSize(11).fillColor(GRAU).text("Noch keine Halle angelegt.", x0, doc.y);
      const { plan } = daten;
      const masse = s.kaefigMasse;
      const zusammen = (typen: string[]) => {
        const n = new Map<string, number>();
        for (const t of typen) n.set(t, (n.get(t) ?? 0) + 1);
        return [...n.entries()].map(([t, k]) => `${k} × ${kaefigName(t as KaefigTyp, masse)}`).join(", ");
      };
      const namen = (k: { preisrichterId: number | null }[]) => [...new Set(k.map((x) => x.preisrichterId))].map((id) => daten.richter.find((r) => r.id === id)?.name).filter(Boolean).join(", ") || "–";
      const zeilen = plan.reihen
        .filter((r) => r.kaefige.length || r.freiePlaetze?.length)
        .map((r) => {
          const platten = r.platten.filter((p) => !p.entfernt);
          return [
            `R${r.nr}`,
            nummernBereiche(r.kaefige.map((k) => alsNummer(k.nr))) || "–",
            [zusammen(r.kaefige.map((k) => k.typ)), r.freiePlaetze?.length ? `frei: ${zusammen(r.freiePlaetze.map((f) => f.typ))}` : ""].filter(Boolean).join(", "),
            String(platten.length),
            `${meter(platten.reduce((n, p) => n + p.laenge, 0))} m`,
            [...new Set(r.kaefige.map((k) => k.rasse))].join(", "),
            namen(r.kaefige),
          ];
        });
      if (plan.volieren.length)
        zeilen.push(["V", nummernBereiche(plan.volieren.map((k) => alsNummer(k.nr))) || "–", zusammen(plan.volieren.map((k) => k.typ)), "", "", [...new Set(plan.volieren.map((k) => k.rasse))].join(", "), namen(plan.volieren)]);
      const w = doc.page.width - doc.page.margins.left - doc.page.margins.right;
      tabelle(
        doc,
        [
          { titel: "Reihe", breite: 14 * MM, fett: true },
          { titel: "Käfignummern", breite: 30 * MM },
          { titel: "Käfige", breite: 42 * MM },
          { titel: "Platten", breite: 14 * MM, align: "right" },
          { titel: "Länge", breite: 16 * MM, align: "right" },
          { titel: "Rassen", breite: w - 146 * MM },
          { titel: "Preisrichter", breite: 30 * MM },
        ],
        zeilen,
        {
          schrift: 8.5,
          summe: [
            "Zus.",
            "",
            zusammen([...plan.reihen.flatMap((r) => r.kaefige), ...plan.volieren].map((k) => k.typ)),
            String(plan.reihen.reduce((n, r) => n + r.platten.filter((p) => !p.entfernt).length, 0)),
            `${meter(plan.reihen.reduce((n, r) => n + r.platten.filter((p) => !p.entfernt).reduce((m, p) => m + p.laenge, 0), 0))} m`,
            "",
            "",
          ],
        },
      );
    },
    { margin: 12 * MM },
  );
}
