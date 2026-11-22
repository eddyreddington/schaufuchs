/**
 * Hallenplan: Wie stehen die Käfige in der Halle? Die Halle ist ein Rechteck (Maße in cm, x = Breite, die kurze
 * Seite; y = Länge). Die Reihen laufen meist quer (parallel zur kurzen Seite) und folgen über die Länge aufeinander;
 * „längs“ ist wählbar. An den beiden Wänden quer zu den Reihen steht je eine Einzelreihe (Front zum Gang), dazwischen
 * Doppelreihen Rücken an Rücken; zwischen allen Reihen und an den Reihenenden bleibt ein Gang (Gangbreite der Halle). Eingänge
 * halten rundherum einen Gang frei; an Freiflächen (Bühne, Kasse …) laufen die Käfige ohne Abstand bis an die Fläche – nur
 * im Gang vor den Käfigen darf keine Fläche stehen. Volieren stehen frei in eigenen Volierenbereichen.
 *
 * Die Käfige stehen auf Grundplatten von rund 2 m, je Platte eine Käfigart (zwei 100er, drei 70er, vier 50er, fünf 40er).
 * Gestellt wird streng in Katalogfolge (= Käfignummern) Reihe für Reihe, ohne Sonderregeln für Tauben oder Käfiggrößen:
 * die Platten stehen ganz und lückenlos aneinander, auch über Sparten und Käfigarten hinweg (Rückmeldung 14.11.2026); die
 * Käfige der nächsten Art stehen zuerst auf dem Rest der angefangenen Platte, wenn sie hineinpassen (`Halle.restPlaetze`),
 * frei bleibt sonst nur der Rest der letzten Platte. Die Reihen werden danach gleich lang gestellt (`planeAusgeglichen`). Reine Rechnung ohne Datenbank – Grundlage für Plan, Aufbauliste und
 * Platzreserve.
 */
import { KAEFIG_TYP_LABEL, kaefigMass, kaefigName, type KaefigMasse, type KaefigTyp } from "./kaefige";
import { mitUmrissSperren } from "./hallenplan-umriss";
import { blockFolge } from "./hallenplan-folge";
import { blickTausch, blockPlatz, dreheRechteck, eingangsGang, etagenStreifen, frontDerReihe, mitteVon, objektFront, streifenVor, ueberlappt } from "./hallenplan-rechtecke";
import { m, VOLIERE_ERSATZ } from "./hallenplan-intern";
import { istMoebel, MOEBEL_NAME, type MoebelArt } from "./hallenplan-moebel";
import { festGeometrie, planeFest } from "./hallenplan-fest";
import { planeAusgeglichen } from "./hallenplan-reihen";
import type { Blick, Drehung, FesterPlan, Halle, HallenFlaeche, Hallenplan, PlanObjekt, PlanTier, Rechteck, Reihe } from "./hallenplan-typen";
import { etageFeld, etagenVon, GRUNDPLATTE_STANDARD, plaetzeJePlatte, teilGroesse, VOLIEREN_GANG } from "./hallenplan-vorgaben";

// Einstieg: Typen und Teile des Hallenplans bleiben von hier importierbar.
export * from "./hallenplan-typen";
export * from "./hallenplan-rechtecke";
export * from "./hallenplan-moebel";
export * from "./hallenplan-vorgaben";
export { blockBelegung, festGeometrie, festschreiben } from "./hallenplan-fest";
export { planeImReihensystem } from "./hallenplan-reihen";

/**
 * Plan der Halle. Gerechnet wird im Reihensystem (x quer zu den Reihen, y entlang der Reihen); bei Reihen quer zur Halle
 * sind dafür Breite und Länge vertauscht. Die Rechtecke kommen in Hallenkoordinaten zurück.
 */
export function planeHalle(eingabe: Halle, tiere: PlanTier[], masse: KaefigMasse | null | undefined, fest?: FesterPlan | null): Hallenplan {
  // Freier Grundriss: außerhalb wird Sperrfläche – die Reihen planen um sie herum wie um jede andere (Entscheidung 019).
  const halle = mitUmrissSperren(eingabe);
  const quer = (halle.richtung ?? "quer") === "quer";
  const platte = halle.platte ?? GRUNDPLATTE_STANDARD;

  // Eingesetzte Teile: Größe, Lage in der Halle; Volieren nehmen die gemeldeten Volieren der Reihe nach auf.
  const volierenMass = kaefigMass("voliere", masse) ?? VOLIERE_ERSATZ;
  const freieVolieren = tiere.filter((t) => t.typ === "voliere");
  // Fester Plan: eine eingesetzte Voliere behält ihr Tier (solange es gemeldet ist); frei gewordene nehmen neue auf.
  const festeObjektVoliere = new Map<string, PlanTier>();
  for (const z of fest?.objektVolieren ?? []) {
    const i = freieVolieren.findIndex((t) => t.id === z.tierId);
    if (i >= 0 && (halle.objekte ?? []).some((o) => o.id === z.objektId && o.art === "voliere")) festeObjektVoliere.set(z.objektId, freieVolieren.splice(i, 1)[0]!);
  }
  let vNr = 0;
  const moebelNr: Record<MoebelArt, number> = { tisch: 0, bank: 0, garnitur: 0, pokaltisch: 0 };
  const objekte: PlanObjekt[] = (halle.objekte ?? []).map((o) => {
    const istVoliere = o.art === "voliere";
    const typ = o.typ ?? "huehner";
    // Ein Käfigblock hat die Grundplatte seiner Käfigart (ohne Maß: die Grundplatte der Halle).
    const { lang, kurz } = teilGroesse(o, halle, masse);
    const rechteck = o.drehung === 90 ? { x: o.x, y: o.y, b: kurz, h: lang } : { x: o.x, y: o.y, b: lang, h: kurz };
    if (istVoliere) {
      vNr++;
      return { ...o, rechteck, front: objektFront({ front: o.front, rechteck }), name: `Voliere ${vNr}`, tier: festeObjektVoliere.get(o.id) ?? freieVolieren.shift() ?? null, plaetze: 1 };
    }
    // Tisch, Bank, Garnitur: kein Käfigplatz.
    if (istMoebel(o)) return { ...o, rechteck, name: `${MOEBEL_NAME[o.art]} ${++moebelNr[o.art]}`, tier: null, plaetze: 0 };
    const mass = kaefigMass(typ, masse);
    return { ...o, typ, rechteck, front: objektFront({ front: o.front, rechteck }), name: `Block ${mass ? kaefigName(typ, masse) : KAEFIG_TYP_LABEL[typ]}`, tier: null, plaetze: mass ? plaetzeJePlatte(typ, mass.breite, halle) : 0 };
  });
  // Fester Plan: ein eingesetzter Käfigblock behält seine Tiere (gleiche Käfigart, noch gemeldet, höchstens so viele wie Plätze).
  const imBlock = new Map(tiere.filter((t) => t.typ !== "voliere").map((t) => [t.id, t]));
  // Je Platz das Tier (null: von Hand frei gemacht – bleibt frei, die Tiere dahinter rücken nicht nach). Ein nicht mehr
  // gemeldetes Tier fällt weg, die übrigen rücken wie bisher auf.
  const festeBlockTiere = new Map<string, (PlanTier | null)[]>();
  for (const z of fest?.objektKaefige ?? []) {
    const o = objekte.find((x) => x.id === z.objektId && x.art === "kaefigblock");
    if (!o) continue;
    const drin: (PlanTier | null)[] = [];
    for (const id of z.tierIds) {
      if (id == null) drin.push(null);
      else {
        const t = imBlock.get(id);
        if (t && t.typ === o.typ) {
          drin.push(t);
          imBlock.delete(id);
        }
      }
    }
    while (drin.length && drin.at(-1) == null) drin.pop();
    const platz = drin.slice(0, o.plaetze);
    // Mehr als Plätze (Block kleiner geworden): die übrigen sind wieder ohne Platz.
    for (const t of drin.slice(o.plaetze)) if (t) imBlock.set(t.id, t);
    if (platz.some((t) => t)) festeBlockTiere.set(o.id, platz);
  }
  const vergeben = new Set([...objekte.map((o) => o.tier?.id).filter((x) => x != null), ...[...festeBlockTiere.values()].flat().flatMap((t) => (t ? [t.id] : []))]);
  // Eingesetzte Teile sind für die Reihen Hindernisse: Volieren mit Gang rundherum, ein Käfigblock wie eine Freifläche – so
  // lässt er sich direkt an eine Reihe ansetzen (verlängert sie oder schließt eine Lücke).
  const hindernisse: HallenFlaeche[] = objekte.map((o) => ({ name: o.name, art: "sperre", x: o.rechteck.x, y: o.rechteck.y, breite: o.rechteck.b, tiefe: o.rechteck.h, mitGang: o.art === "voliere", teil: o.art === "kaefigblock", ...(istMoebel(o) ? { moebel: true } : {}) }));
  const alleFlaechen = [...halle.flaechen, ...hindernisse];

  const sys: Halle = quer
    ? { ...halle, breite: halle.laenge, laenge: halle.breite, flaechen: alleFlaechen.map((f) => ({ ...f, x: f.y, y: f.x, breite: f.tiefe, tiefe: f.breite })) }
    : { ...halle, flaechen: alleFlaechen };
  const rest = tiere.filter((t) => !vergeben.has(t.id));
  const eingesetzt = objekte.some((o) => o.art === "voliere");
  let p = fest ? planeFest(sys, fest, rest, masse, eingesetzt) : planeAusgeglichen(sys, rest, masse, eingesetzt);
  if (!fest) {
    // Käfigblöcke, die ganz in einer Reihe stehen, stehen meist dort, wo die Reihen ohne sie frei bleiben (so setzt „Fehlende
    // Käfige einsetzen“ und „Plan neu setzen“ sie ein). Dann gilt der Plan ohne sie – genau so, wie die Blöcke eingesetzt
    // wurden (sonst rückten z. B. Platten nicht mehr an eine Freifläche). Nur wenn eine Platte dort stünde, stellt die
    // Rechnung die Platten um die Blöcke herum.
    const inReihe = sys.flaechen.filter((f) => f.teil && p.reihen.some((r) => f.x >= r.x - 0.5 && f.x + f.breite <= r.x + r.tiefe + 0.5));
    if (inReihe.length) {
      const ohne = planeAusgeglichen({ ...sys, flaechen: sys.flaechen.filter((f) => !inReihe.includes(f)) }, rest, masse, eingesetzt);
      const auf = (r: Rechteck) => inReihe.some((f) => ueberlappt(r, { x: f.x, y: f.y, b: f.breite, h: f.tiefe }));
      if (!ohne.reihen.some((r) => r.platten.some((pl) => auf({ x: pl.x, y: pl.y, b: pl.tiefe, h: pl.laenge })))) p = ohne;
    }
  }
  const zuHalle = (x: number, y: number, b: number, h: number): Rechteck => (quer ? { x: y, y: x, b: h, h: b } : { x, y, b, h });
  const schieben = (q: Rechteck, v: { dx: number; dy: number }): Rechteck => ({ ...q, x: q.x + v.dx, y: q.y + v.dy });
  const versatzVon = (nr: number) => {
    const v = (halle.reihenVersatz ?? []).find((x) => x.nr === nr);
    return { dx: v?.dx ?? 0, dy: v?.dy ?? 0, drehung: (v?.drehung ?? 0) as Drehung };
  };
  const reihen: Reihe[] = p.reihen.map((r) => {
    const { drehung, ...v } = versatzVon(r.nr);
    // Gedreht wird um den Anfang der Reihe (Mitte ihres ersten Platzes), danach verschoben – kommen Tiere dazu, wächst die
    // gedrehte Reihe nur nach einer Seite und rückt nicht.
    const anfang = r.abschnitte[0]?.von ?? 0;
    const c = mitteVon([zuHalle(r.x, anfang, r.tiefe, r.tiefe)]);
    const lage = (q: Rechteck) => schieben(dreheRechteck(q, c, drehung), v);
    const von = r.abschnitte[0]?.von ?? 0;
    // Beschriftung „R1“ vor dem Reihenanfang; steht die Reihe bündig an der Wand, außen vor der Wand (im Rand der Zeichnung).
    const lang = Math.min(60, Math.max(30, halle.gang * 0.4));
    // Vor der Wand mit deutlichem Abstand (rund 80 cm Luft), damit „R1“ frei über der Wandlinie steht.
    const vorn = von >= lang + 10 ? von - lang - 5 : -lang - 80;
    // Einzelne Grundplatten: Käfige (und freie Plätze) gehören zu der Platte, auf der sie stehen (Reihensystem).
    const plattenLage = r.platten.map((pl) => lage(zuHalle(pl.x, pl.y, pl.tiefe, pl.laenge)));
    // Nur über die Lage entlang der Reihe: Platten einer Reihe überlappen sich dort nicht, und ein Käfig, der tiefer ist als
    // die Platte, steht quer zur Reihe vor ihr (Front links) – über x wäre er keiner Platte zugeordnet.
    const plattenNr = (_x: number, y: number) => r.platten.findIndex((pl) => y >= pl.y - 0.5 && y < pl.y + pl.laenge - 0.5);
    const pv = (i: number) => {
      const e = (halle.plattenVersatz ?? []).find((x) => x.reihe === r.nr && x.platte === i);
      return e && (e.dx || e.dy || e.drehung) ? { dx: e.dx, dy: e.dy, drehung: (e.drehung ?? 0) as Drehung } : null;
    };
    const aufPlatte = (q: Rechteck, i: number) => {
      const e = i >= 0 ? pv(i) : null;
      return e ? schieben(dreheRechteck(q, mitteVon([plattenLage[i]!]), e.drehung), e) : q;
    };
    // Mehrere Etagen: Feld im Plan quer zur Front geteilt.
    const streifen = (typ: KaefigTyp, etage: number | undefined, q: Rechteck, i: number) => {
      const et = etagenVon(typ, halle);
      return et > 1 ? { zeichnung: etagenStreifen(q, etage ?? 0, et, frontDerReihe({ front: r.front, drehung }, quer, pv(i)?.drehung ?? 0)) } : {};
    };
    return {
      ...r,
      versatz: v,
      drehung,
      drehpunkt: { x: c.x + v.dx, y: c.y + v.dy },
      flaechen: r.abschnitte.map((a) => lage(zuHalle(r.x, a.von, r.tiefe, a.bis - a.von))),
      beschriftung: lage(zuHalle(r.x, vorn, r.tiefe, lang)),
      platten: r.platten.map((pl, i) => {
        const e = pv(i);
        return { ...pl, rechteck: aufPlatte(plattenLage[i]!, i), ...(e ? { versatz: { dx: e.dx, dy: e.dy }, drehung: e.drehung } : {}) };
      }),
      kaefige: r.kaefige.map((k) => {
        const i = plattenNr(k.x, k.y);
        const rechteck = aufPlatte(lage(zuHalle(k.x, k.y, k.tiefe, k.breite)), i);
        return { ...k, ...(i >= 0 ? { platte: i } : {}), rechteck, ...streifen(k.typ, k.etage, rechteck, i) };
      }),
      ...(r.freiePlaetze
        ? {
            freiePlaetze: r.freiePlaetze.map((f) => {
              const i = plattenNr(f.x, f.y);
              const rechteck = aufPlatte(lage(zuHalle(f.x, f.y, f.tiefe, f.breite)), i);
              return { ...f, ...(i >= 0 ? { platte: i } : {}), rechteck, ...streifen(f.typ, f.etage, rechteck, i) };
            }),
          }
        : {}),
    };
  });
  // Volieren stehen frei im Volierenbereich (dort zeilenweise im Reihensystem gelegt).
  const volieren = p.volieren.map((v) => ({ ...v, ...(v.front ? { front: quer ? blickTausch(v.front) : v.front } : {}), rechteck: quer ? { x: v.y, y: v.x, b: v.tiefe, h: v.breite } : { x: v.x, y: v.y, b: v.breite, h: v.tiefe } }));

  // Von Hand eingesetzte Käfigblöcke nehmen Tiere ohne Platz auf: passende Käfiggröße, in Katalogfolge. Die Plätze liegen
  // entlang der langen Seite des Blocks.
  // Die Blöcke in der Folge des Plans (wie „Nach Plan nummerieren“ zählt), die Tiere in der Folge ihrer Käfignummer (bei
  // gedrucktem Katalog die Käfigplätze, sonst die Katalognummer), ohne Nummer in Katalogfolge – so bleibt nach dem
  // Nummerieren jedes Tier in seinem Block und die Nummern folgen dem Plan.
  let nichtPlatziert = [...p.nichtPlatziert];
  const folge = new Map(tiere.map((t, i) => [t.id, i]));
  const kaefigNr = (t: PlanTier) => {
    const m = /^(\d+)/.exec((t.kaefig ?? t.nr ?? "").trim());
    return m ? Number(m[1]) : Infinity;
  };
  for (const i of blockFolge(reihen, objekte, quer ? "quer" : "laengs", eingabe.nummerFolge)) {
    const o = objekte[i]!;
    if (o.art !== "kaefigblock" || !o.plaetze) continue;
    const fix = festeBlockTiere.get(o.id) ?? [];
    const passend = nichtPlatziert.filter((t) => t.typ === o.typ).sort((a, b) => kaefigNr(a) - kaefigNr(b) || folge.get(a.id)! - folge.get(b.id)!);
    if (!passend.length && !fix.some((t) => t)) continue;
    // Plätze des Blocks: die festen, dahinter die Tiere ohne Platz. Von Hand frei gemachte Plätze bleiben frei.
    const rein: (PlanTier | null)[] = [...fix, ...passend.slice(0, o.plaetze - fix.length)];
    const et = etagenVon(o.typ!, halle);
    o.kaefige = rein.flatMap((t, i) => {
      if (!t) return [];
      const b = blockPlatz(o.rechteck, o.plaetze, et, i);
      return [{ ...t, x: 0, y: 0, breite: b.breite, tiefe: b.tiefe, ...etageFeld(b.etage), rechteck: b.rechteck, blockPlatz: i, ...(et > 1 ? { zeichnung: etagenStreifen(b.rechteck, b.etage, et, objektFront(o)) } : {}) }];
    });
    const ids = new Set(o.kaefige.map((t) => t.id));
    nichtPlatziert = nichtPlatziert.filter((t) => !ids.has(t.id));
  }

  // Prüfen, was von Hand verschoben oder eingesetzt ist: über die Halle hinaus oder überschneidend?
  // Eingesetzte Teile gingen als Hindernisse in die Rechnung ein – ihr „ragt hinaus“ meldet die Prüfung unten selbst.
  const teilNamen = new Set(objekte.map((o) => `„${o.name}“ ragt über die Halle hinaus.`));
  // Zahl der Tiere ohne Platz neu, nachdem die Käfigblöcke gefüllt sind.
  const zahlWarnung = (w: string) => / keinen Platz\.$/.test(w) || / noch zu stellen, /.test(w);
  const warnungen = p.warnungen.filter((w) => !teilNamen.has(w) && !zahlWarnung(w));
  if (nichtPlatziert.length)
    warnungen.push(
      fest
        ? `${nichtPlatziert.length} ${nichtPlatziert.length === 1 ? "Tier ist" : "Tiere sind"} noch zu stellen, kein passender Platz frei.`
        : `${nichtPlatziert.length} ${nichtPlatziert.length === 1 ? "Tier hat" : "Tiere haben"} keinen Platz.`,
    );
  const innen = (q: Rechteck) => q.x >= -0.5 && q.y >= -0.5 && q.x + q.b <= halle.breite + 0.5 && q.y + q.h <= halle.laenge + 0.5;
  const teile: { name: string; flaechen: Rechteck[]; bewegt: boolean; moebel?: true; freiBereich?: true }[] = [
    ...reihen
      .filter((r) => r.platten.some((pl) => !pl.versatz && !pl.entfernt))
      .map((r) => ({ name: `R${r.nr}`, flaechen: r.platten.filter((pl) => !pl.versatz && !pl.entfernt).map((pl) => pl.rechteck), bewegt: !!fest || r.versatz.dx !== 0 || r.versatz.dy !== 0 || r.drehung !== 0 })),
    // Einzeln verschobene Grundplatten prüfen sich für sich (auch gegen die übrigen Platten ihrer Reihe).
    ...reihen.flatMap((r) => r.platten.flatMap((pl, i) => (pl.versatz && !pl.entfernt ? [{ name: `R${r.nr} Platte ${i + 1}`, flaechen: [pl.rechteck], bewegt: true }] : []))),
    ...objekte.map((o) => ({ name: o.name, flaechen: [o.rechteck], bewegt: true, ...(istMoebel(o) ? { moebel: true as const } : {}) })),
    // Im festen Plan können Volieren nach dem Festschreiben auf Reihen geraten (Volierenbereich verschoben oder neu).
    ...(fest ? volieren.map((v) => ({ name: `Voliere ${v.nr ? `Nr. ${v.nr}` : v.rasse}`, flaechen: [v.rechteck], bewegt: true })) : []),
    ...halle.flaechen.filter((f) => f.art !== "volieren").map((f) => ({ name: `„${f.name}“`, flaechen: [{ x: f.x, y: f.y, b: f.breite, h: f.tiefe }], bewegt: false, ...(f.art === "sperre" ? { freiBereich: true as const } : {}) })),
  ];
  const meldungen: string[] = [];
  for (const t of teile) if (t.bewegt && t.flaechen.some((q) => !innen(q))) meldungen.push(`${t.name} ragt über die Halle hinaus.`);
  for (let a = 0; a < teile.length; a++) {
    for (let b = a + 1; b < teile.length; b++) {
      const A = teile[a]!, B = teile[b]!;
      if (!A.bewegt && !B.bewegt) continue;
      // Tische und Bänke dürfen in einem freien Bereich stehen (Cafeteria …).
      if ((A.moebel && B.freiBereich) || (B.moebel && A.freiBereich)) continue;
      if (A.flaechen.some((x) => B.flaechen.some((y) => ueberlappt(x, y)))) meldungen.push(`${A.name} überschneidet ${B.name}.`);
    }
  }
  // Tische und Bänke stehen frei, auch vor Käfigen. Im Gang vor einem Ein- oder Ausgang (Fluchtweg) nur ein Hinweis.
  const fluchtwege = halle.flaechen.filter((f) => f.art === "eingang").map((f) => ({ name: `Gang vor „${f.name}“`, rechteck: eingangsGang(halle, f) }));
  for (const o of objekte) {
    if (!istMoebel(o)) continue;
    const g = fluchtwege.find((x) => ueberlappt(o.rechteck, x.rechteck));
    if (g) meldungen.push(`${o.name} steht im ${g.name}.`);
  }
  // Von Hand gesetzte Volieren: mindestens 1,50 m Abstand (direkt aneinander = Rücken an Rücken oder nebeneinander, erlaubt).
  const handVolieren = objekte.filter((o) => o.art === "voliere");
  for (let a = 0; a < handVolieren.length; a++) {
    for (let b = a + 1; b < handVolieren.length; b++) {
      const A = handVolieren[a]!.rechteck, B = handVolieren[b]!.rechteck;
      const dx = Math.max(0, B.x - (A.x + A.b), A.x - (B.x + B.b));
      const dy = Math.max(0, B.y - (A.y + A.h), A.y - (B.y + B.h));
      const abstand = Math.max(dx, dy);
      if (abstand > 0.5 && abstand < VOLIEREN_GANG - 0.5)
        meldungen.push(`${handVolieren[a]!.name} und ${handVolieren[b]!.name} stehen nur ${m(abstand)} auseinander (mindestens ${m(VOLIEREN_GANG)} Gang).`);
    }
  }
  // Käfigfronten: offen zum Gang (siehe `frontFehler`).
  meldungen.push(...frontFehler(halle, { quer, reihen, objekte, volieren }).map((x) => `${x}.`));
  warnungen.push(...meldungen.slice(0, 6), ...(meldungen.length > 6 ? [`… und ${meldungen.length - 6} weitere Überschneidungen.`] : []));
  const veraltet = !!fest && fest.geometrie !== festGeometrie(halle, masse);
  if (veraltet) warnungen.unshift("Maße nach dem Festschreiben geändert.");
  return {
    ...p,
    quer,
    reihen,
    volieren,
    objekte,
    nichtPlatziert,
    warnungen,
    fest: fest ? { am: fest.am, veraltet, ...(fest.vonHand?.length ? { vonHand: fest.vonHand } : {}), ...(fest.freiGemacht?.length ? { freiGemacht: fest.freiGemacht } : {}) } : null,
  };
}

/**
 * Käfigfronten, die nicht zu einem Gang zeigen: Die Front (Gitter) eines Käfigs ist offen, Rück- und Seitenwände sind dicht –
 * vor jeder Front muss ein Gang von mindestens Gangbreite frei sein. Davor darf keine Wand, keine Platte oder Rückwand einer
 * anderen Reihe, kein Block, keine Voliere und keine Fläche stehen; vor einem Block auch kein Tisch und keine Bank (vor den
 * Reihen meldet das schon „… steht im Gang vor R…“). Je Reihe höchstens ein Hinweis, z. B. „R3: Front zu R4“,
 * „Block 40 × 40 × 40 cm: Front zur Wand“.
 */
export function frontFehler(halle: Pick<Halle, "breite" | "laenge" | "gang" | "flaechen"> & Partial<Pick<Halle, "umriss">>, plan: Pick<Hallenplan, "quer" | "reihen" | "objekte" | "volieren">): string[] {
  const T = 0.5;
  const ueber = (a: Rechteck, b: Rechteck) => a.x < b.x + b.b - T && b.x < a.x + a.b - T && a.y < b.y + b.h - T && b.y < a.y + a.h - T;
  const innen = (q: Rechteck) => q.x >= -T && q.y >= -T && q.x + q.b <= halle.breite + T && q.y + q.h <= halle.laenge + T;
  const hindernisse = [
    ...plan.reihen.flatMap((r) => r.platten.filter((pl) => !pl.entfernt).map((pl) => ({ name: `R${r.nr}`, q: pl.rechteck, moebel: false }))),
    ...plan.objekte.map((o) => ({ name: o.name, q: o.rechteck, moebel: istMoebel(o) })),
    ...plan.volieren.map((v) => ({ name: `Voliere${v.nr ? ` Nr. ${v.nr}` : ""}`, q: v.rechteck, moebel: false })),
    // Außerhalb eines freien Grundrisses ist Wand (Entscheidung 019) – auch wenn die Halle die Sperrflächen nicht mitbringt.
    ...mitUmrissSperren({ umriss: halle.umriss, flaechen: halle.flaechen })
      .flaechen.filter((f) => f.art === "sperre")
      .map((f) => ({ name: `„${f.name}“`, q: { x: f.x, y: f.y, b: f.breite, h: f.tiefe }, moebel: false, wand: !!f.aussen })),
  ];
  // Tische und Bänke dürfen vor Käfigen stehen (Rückmeldung 14.11.2026) – sie zählen hier nicht.
  const fehler = (q: Rechteck, blick: Blick, _mitMoebel: boolean): string | null => {
    const s = streifenVor(q, blick, Math.max(0, halle.gang));
    // Was direkt davor steht, zuerst nennen; sonst die Wand.
    const h = hindernisse.find((x) => x.q !== q && !x.moebel && ueberlappt(s, x.q));
    if (h) return "wand" in h && h.wand ? "Front zur Wand" : `Front zu ${h.name}`;
    return innen(s) ? null : "Front zur Wand";
  };
  const aus: string[] = [];
  for (const r of plan.reihen) {
    for (const pl of r.platten) {
      if (pl.entfernt) continue;
      const f = fehler(pl.rechteck, frontDerReihe(r, plan.quer, pl.drehung ?? 0), false);
      if (f) {
        aus.push(`R${r.nr}: ${f}`);
        break;
      }
    }
  }
  for (const o of plan.objekte) {
    if (o.art !== "kaefigblock") continue;
    const f = fehler(o.rechteck, objektFront(o), true);
    if (f) aus.push(`${o.name}: ${f}`);
  }
  return aus;
}
