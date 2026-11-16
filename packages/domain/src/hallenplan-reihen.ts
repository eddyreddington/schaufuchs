/**
 * Hallenplan – Stellen im Reihensystem: Reihen und ihre Abschnitte, Grundplatten und Käfige streng in Katalogfolge,
 * Volieren im Volierenbereich, Platzreserve (`planeImReihensystem`), dazu gleich lange Reihen (`planeAusgeglichen`).
 */
import { kaefigMass, type KaefigMasse, type KaefigTyp } from "./kaefige";
import { eingangsGang } from "./hallenplan-rechtecke";
import { abziehen, type Abschnitt, hinterStuecken, LEER, m, teilStuecke } from "./hallenplan-intern";
import type { Blick, Halle, Hallenplan, PlanKaefig, PlanTier, Reihe } from "./hallenplan-typen";
import { etageFeld, GRUNDPLATTE_STANDARD, HAUPTGANG_STANDARD, PLATTE_LAENGE, platteFuer, VOLIEREN_GANG } from "./hallenplan-vorgaben";

/**
 * Automatische Aufstellung mit ruhigem Bild (Rückmeldung 14.11.2026): Die Tiere stehen streng in Katalogfolge Reihe für Reihe,
 * lückenlos – auch über Sparten und Käfigarten hinweg (kleinere direkt an größere). Danach werden die Reihen so kurz und
 * gleich lang wie möglich: Gesucht ist die kleinste Länge je Reihenstück (vom Anfang her), bei der nicht mehr Tiere ohne
 * Platz bleiben und nicht mehr Reihen gebraucht werden als ohne Begrenzung. So beginnen alle Reihen bündig und enden etwa
 * gleich; der Rest jeder Reihe bleibt als Reserve für Nachmeldungen frei. Läuft die Halle über (ein Tier für die Reihen
 * ohne Platz), bleibt es bei der Aufstellung vom Anfang her: es gibt keine Reserve zu verteilen, und kein Tier mit einer
 * früheren Nummer verliert seinen Platz an ein späteres (Gegenprüfung 14.11.2026).
 */
export function planeAusgeglichen(halle: Halle, tiere: PlanTier[], masse: KaefigMasse | null | undefined, eingesetzteVolieren = false): Omit<Hallenplan, "quer" | "objekte"> {
  const roh = planeImReihensystem(halle, tiere, masse, eingesetzteVolieren);
  const genutzt = (p: Omit<Hallenplan, "quer" | "objekte">) => p.reihen.filter((r) => r.platten.length).length;
  const reihenRoh = genutzt(roh);
  if (reihenRoh <= 1) return roh;
  // Volieren und Tiere ohne Maß stehen nicht in den Reihen – sie zählen hier nicht.
  if (roh.nichtPlatziert.some((t) => t.typ !== "voliere" && kaefigMass(t.typ, masse))) return roh;
  const passt = (p: Omit<Hallenplan, "quer" | "objekte">) => p.nichtPlatziert.length <= roh.nichtPlatziert.length && genutzt(p) <= reihenRoh;
  let unten = 0;
  let oben = Math.max(0, ...roh.reihen.flatMap((r) => r.abschnitte.map((a) => a.bis - a.von)));
  let beste = roh;
  // Auf 5 cm genau; die Platten stehen ganz, die Länge springt also in Plattenschritten.
  while (oben - unten > 5) {
    const mitte = Math.round((unten + oben) / 2);
    const p = planeImReihensystem(halle, tiere, masse, eingesetzteVolieren, mitte);
    if (passt(p)) {
      oben = mitte;
      beste = p;
    } else unten = mitte;
  }
  return beste;
}

/**
 * Stellen im Reihensystem. `kappe`: höchstens so lang wird jedes Reihenstück (ab seinem Anfang) belegt – für gleich lange
 * Reihen (siehe `planeAusgeglichen`).
 */
export function planeImReihensystem(halle: Halle, tiere: PlanTier[], masse: KaefigMasse | null | undefined, eingesetzteVolieren = false, kappe = Infinity): Omit<Hallenplan, "quer" | "objekte"> {
  const warnungen: string[] = [];
  const gang = Math.max(0, halle.gang);
  const mischen = halle.restPlaetze !== "frei";
  const fehlendeMasse = [...new Set(tiere.map((t) => t.typ))].filter((t) => !kaefigMass(t, masse));
  const nichtPlatziert: PlanTier[] = tiere.filter((t) => fehlendeMasse.includes(t.typ));
  const inReihen = tiere.filter((t) => t.typ !== "voliere" && !fehlendeMasse.includes(t.typ));
  const volierenTiere = tiere.filter((t) => t.typ === "voliere" && !fehlendeMasse.includes(t.typ));

  for (const f of halle.flaechen) {
    if (f.x < 0 || f.y < 0 || f.x + f.breite > halle.breite || f.y + f.tiefe > halle.laenge) warnungen.push(`„${f.name}“ ragt über die Halle hinaus.`);
  }

  // Einheiten: Grundplatte mit n Käfigen einer Art; ein Käfig, der länger ist als die Platte, steht für sich.
  const platte = halle.platte ?? GRUNDPLATTE_STANDARD;
  const einheit = (typ: KaefigTyp) => {
    const mass = kaefigMass(typ, masse)!;
    // Eine Grundplatte steht immer ganz (Einzelkäfige gibt es nicht), in der Größe ihrer Käfigart. Nicht belegte Plätze
    // bleiben auf der Platte frei.
    const pl = platteFuer(typ, mass, halle);
    return { mass, n: pl.n, etagen: pl.etagen, laenge: pl.laenge, plattenTiefe: pl.tiefe, tiefe: Math.max(pl.tiefe, mass.tiefe) };
  };
  // Reihentiefe: tiefste Einheit, die in Reihen steht (alle Reihen gleich tief, damit die Gänge gerade bleiben).
  const typenInReihen = [...new Set(inReihen.map((t) => t.typ))];
  const tiefe = Math.max(0, ...typenInReihen.map((t) => einheit(t).tiefe));
  const reihen: Reihe[] = [];
  /** Je Reihe: wo Freiflächen beginnen und enden (dort laufen die Käfige ohne Abstand an die Fläche). */
  const anFreiflaeche = new Map<Reihe, { anfaenge: number[]; enden: number[] }>();
  /** Je Reihe: Stücke, auf denen eingesetzte Teile stehen (dort keine Platte; Abschnitte bleiben, wie sie sind). */
  let besetzt = new Map<Reihe, Abschnitt[]>();
  if (tiefe > 0) {
    // Einzelreihen an beiden Wänden oder nur an einer (siehe `wandreiheSeite`).
    const wandAnfang = halle.wandreihen && halle.wandreiheSeite !== "ende";
    const wandEnde = halle.wandreihen && halle.wandreiheSeite !== "anfang";
    const wandTiefe = wandAnfang ? tiefe : 0;
    const innen = halle.breite - (wandAnfang ? tiefe : 0) - (wandEnde ? tiefe : 0);
    const doppel = Math.max(0, Math.floor((innen - gang) / (2 * tiefe + gang)));
    // Überschüssige Breite gleichmäßig auf die Gänge verteilen.
    const luecke = doppel > 0 ? (innen - doppel * 2 * tiefe) / (doppel + 1) : 0;
    const neu = (art: Reihe["art"], x: number, front: Reihe["front"]) => reihen.push({ nr: reihen.length + 1, art, x, tiefe, front, abschnitte: [], flaechen: [], beschriftung: LEER, versatz: { dx: 0, dy: 0 }, drehung: 0, drehpunkt: { x: 0, y: 0 }, platten: [], kaefige: [] });
    if (wandAnfang) neu("wand", 0, "rechts");
    for (let i = 0; i < doppel; i++) {
      const x0 = wandTiefe + luecke + i * (2 * tiefe + luecke);
      neu("doppel", x0, "links");
      neu("doppel", x0 + tiefe, "rechts");
    }
    if (wandEnde && halle.breite - (wandAnfang ? 2 : 1) * tiefe >= gang) neu("wand", halle.breite - tiefe, "links");
    if (reihen.length === 0 || (wandAnfang && wandEnde && halle.breite - 2 * tiefe < gang)) warnungen.push(`Die Halle ist zu schmal für Reihen mit ${m(tiefe)} Tiefe und ${m(gang)} Gang.`);

    // Nutzbare Abschnitte: Reihenenden frei (Gang bzw. Hauptgang). Eingänge, Volierenbereiche und eingesetzte Volieren mit
    // einem Gang Abstand rundherum. Freiflächen ohne Abstand: die Käfige laufen bis direkt an die Fläche – nur wo die Fläche
    // im Gang vor den Käfigen steht, bleibt die Reihe frei (der Gang behält seine volle Breite).
    const hg = halle.hauptgang ?? HAUPTGANG_STANDARD;
    // Reihenenden: Hauptgang, sonst bündig an die Wand (Vorgabe) bzw. Gang. Ein Eingang oder Notausgang hält nur dort einen
    // Gang frei, wo er ist (siehe unten) – nicht an der ganzen Wand. Damit die Gänge zwischen den Reihen nicht an beiden
    // Enden zu sind, bleibt ohne Hauptgang am Ende der Reihen ein Quergang (die Reihen füllen sich vom Anfang her).
    const buendig = halle.wandBuendig ?? true;
    const randGang = buendig ? 0 : gang;
    const anfang = hg.lage === "anfang" || hg.lage === "beide" ? Math.max(gang, hg.breite) : randGang;
    const endeRoh = hg.lage === "ende" || hg.lage === "beide" ? Math.max(gang, hg.breite) : randGang;
    const ende = anfang === 0 && endeRoh === 0 && hg.lage !== "mitte" && reihen.length > 1 ? gang : endeRoh;
    // Eine Wandreihe an einer Wand ohne Eingang läuft über die ganze Wand – auch durch den Hauptgang bis in die Ecke
    // (dort muss niemand durch); an einer Wand mit Eingang enden die Reihen wie alle anderen.
    const eingangAnSeite = (r: Reihe) => halle.flaechen.some((f) => f.art === "eingang" && (r.x <= 0 ? f.x <= 1 : f.x + f.breite >= halle.breite - 1));
    const durchgehend = (r: Reihe) => r.art === "wand" && buendig && !eingangAnSeite(r);
    besetzt = teilStuecke(reihen, halle.flaechen);
    for (const r of reihen) {
      const [von, bis] = durchgehend(r) ? [0, halle.laenge] : [anfang, halle.laenge - ende];
      let ab: Abschnitt[] = bis - von > 0 ? [{ von, bis }] : [];
      if (hg.lage === "mitte" && !durchgehend(r)) ab = abziehen(ab, (halle.laenge - hg.breite) / 2, (halle.laenge + hg.breite) / 2);
      const kanten = { anfaenge: [] as number[], enden: [] as number[] };
      for (const f of halle.flaechen) {
        // Eingesetztes Teil ganz in einer Reihe (z. B. ein Käfigblock aus „Fehlende Käfige einsetzen“): belegt dort nur sein
        // Stück (siehe `teilStuecke`), für alle anderen Reihen und Gänge ist es kein Hindernis. Sonst wie bisher (Freifläche
        // bzw. Voliere mit Gang).
        if (f.teil && reihen.some((q) => f.x >= q.x - 0.5 && f.x + f.breite <= q.x + q.tiefe + 0.5)) continue;
        // Tische, Bänke, Garnituren stehen frei: sie verschieben keine Reihe (Rückmeldung 14.11.2026).
        if (f.moebel) continue;
        if (f.art === "sperre" && !f.mitGang) {
          // Reihe samt Gang vor ihren Käfigen (Front zum Gang).
          const v1 = r.front === "rechts" ? r.x : r.x - gang;
          const v2 = r.front === "rechts" ? r.x + r.tiefe + gang : r.x + r.tiefe;
          if (f.x + f.breite <= v1 + 0.5 || f.x >= v2 - 0.5) continue;
          ab = abziehen(ab, f.y, f.y + f.tiefe);
          kanten.anfaenge.push(f.y);
          kanten.enden.push(f.y + f.tiefe);
          continue;
        }
        // Eingang: Gang nur davor (in Fluchtrichtung, so breit wie er); Volierenbereich und eingesetzte Voliere: rundherum.
        const z = f.art === "eingang" ? eingangsGang(halle, f) : { x: f.x - gang, y: f.y - gang, b: f.breite + 2 * gang, h: f.tiefe + 2 * gang };
        if (z.x + z.b <= r.x + 0.5 || z.x >= r.x + r.tiefe - 0.5) continue;
        ab = abziehen(ab, z.y, z.y + z.h);
      }
      r.abschnitte = ab;
      anFreiflaeche.set(r, kanten);
    }
  }

  // Stellen: streng aufsteigend in Katalogfolge, Reihe für Reihe und Abschnitt für Abschnitt, lückenlos – auch eine neue
  // Sparte geht direkt weiter (Rückmeldung 14.11.2026: „die reihen sollen ein bild bekommen und keine lücken“).
  // Jede Grundplatte trägt nur Käfige ihrer Art; die Platten stehen ganz und lückenlos aneinander. Füllen die Tiere die
  // letzte Platte einer Käfigart nicht, bleiben deren übrige Plätze frei (für Nachmeldungen), die nächste Käfigart beginnt
  // direkt dahinter auf ihrer eigenen Platte. Eine Platte, die nicht mehr ganz in den Abschnitt passt, beginnt im nächsten
  // (sie wird nie geteilt). Was keinen Platz mehr findet, bleibt ohne Platz (nie verstreut auf freie Plätze weiter vorn).
  // Längster freier Abschnitt: eine längere Platte passt nirgends (sofort aussortieren statt alle Reihen abzusuchen).
  const laengsterAbschnitt = Math.max(0, ...reihen.flatMap((r) => r.abschnitte.map((a) => a.bis - a.von)));
  // Ein Abschnitt kürzer als jede Grundplatte (z. B. das Wandstück neben einer Tür) bleibt frei.
  const kuerzestePlatte = Math.min(...typenInReihen.map((t) => einheit(t).laenge));
  const stellbar = (a: Abschnitt) => a.bis - a.von >= kuerzestePlatte - 1e-6;
  // Platte und Käfige stehen hinten: in der Doppelreihe Rücken an Rücken an der Partnerreihe, in der Wandreihe an der Wand.
  // Ist die Reihe tiefer (wegen größerer Käfige anderswo), wird der Rest vorn Gang, nicht Luft dazwischen.
  const vornIn = (r: Reihe, t: number) => (r.front === "rechts" ? r.x : r.x + r.tiefe - t);
  // pos: Spalte, die gerade gefüllt wird; etage: nächste freie Etage darin (Spalte für Spalte, unten zuerst).
  type Stand = { ri: number; ai: number; pos: number; etage: number; plEnde: number; letzter: { typ: KaefigTyp; mass: { breite: number; tiefe: number }; etagen: number } | null };
  const st: Stand = { ri: 0, ai: 0, pos: 0, etage: 0, plEnde: 0, letzter: null };
  while (st.ri < reihen.length && !reihen[st.ri]!.abschnitte.length) st.ri++;
  st.pos = st.plEnde = reihen[st.ri]?.abschnitte[0]?.von ?? 0;
  /** Rest der letzten Platte bis `bis`: freie Plätze ihrer Käfigart (für Nachmeldungen). */
  const restFrei = (bis: number) => {
    const r = reihen[st.ri];
    if (!r || !st.letzter) return;
    const { typ, mass, etagen } = st.letzter;
    const n = Math.floor((bis - st.pos + 1e-6) / mass.breite);
    for (let i = 0; i < n; i++)
      for (let e = i === 0 ? st.etage : 0; e < etagen; e++) (r.freiePlaetze ??= []).push({ typ, x: vornIn(r, mass.tiefe), y: st.pos + i * mass.breite, breite: mass.breite, tiefe: mass.tiefe, ...etageFeld(e), rechteck: LEER });
  };
  const hinterTeilen = (r: Reihe, y: number, laenge: number) => hinterStuecken(besetzt.get(r), y, laenge);
  /** Freie Stücke zwischen `von` und `bis` (ohne die Stücke eingesetzter Teile). */
  const stuecke = (r: Reihe, von: number, bis: number) => (besetzt.get(r) ?? []).reduce((ab, b) => abziehen(ab, b.von, b.bis), bis > von ? [{ von, bis }] : []);
  const naechsterAbschnitt = () => {
    restFrei(st.plEnde);
    st.ai++;
    while (st.ri < reihen.length && !reihen[st.ri]!.abschnitte[st.ai]) {
      st.ri++;
      st.ai = 0;
    }
    st.pos = st.plEnde = reihen[st.ri]?.abschnitte[st.ai]?.von ?? 0;
    st.etage = 0;
    st.letzter = null;
  };
  for (const t of inReihen) {
    const e = einheit(t.typ);
    if (e.laenge > laengsterAbschnitt + 1e-6) {
      nichtPlatziert.push(t);
      continue;
    }
    // Findet das Tier keinen Platz mehr, bleibt die Stelle für die folgenden (kleineren) erhalten.
    const vorher = { ...st, frei: reihen.map((r) => r.freiePlaetze?.length ?? 0) };
    let gestellt = false;
    while (st.ri < reihen.length) {
      const r = reihen[st.ri]!;
      const a = r.abschnitte[st.ai]!;
      if (!stellbar(a)) {
        naechsterAbschnitt();
        continue;
      }
      // Mischen (Standard, siehe `Halle.restPlaetze`): die nächste Käfigart steht zuerst auf dem Rest der Platte, wenn ihre
      // Käfige dort hineinpassen – Länge und Tiefe der Platte reichen (eine angefangene Spalte der vorigen Art bleibt, wie
      // sie ist; die Etagen gelten je Käfigart). Die Platte wird nie gekürzt.
      if (mischen && st.letzter && st.letzter.typ !== t.typ && e.mass.tiefe <= (r.platten.at(-1)?.tiefe ?? 0) + 1e-6) {
        const pos = st.etage > 0 ? st.pos + st.letzter.mass.breite : st.pos;
        if (pos + e.mass.breite <= st.plEnde + 1e-6) {
          st.pos = pos;
          st.etage = 0;
          st.letzter = { typ: t.typ, mass: e.mass, etagen: e.etagen };
          r.platten.at(-1)!.gemischt = true;
        }
      }
      // Andere Käfigart oder die Platte ist voll: der Rest der Platte bleibt frei, eine neue ganze Platte direkt daneben.
      if ((st.letzter && st.letzter.typ !== t.typ) || st.pos + e.mass.breite > st.plEnde + 1e-6) {
        // Steht dort ein eingesetztes Teil, beginnt die Platte dahinter.
        const start = hinterTeilen(r, st.plEnde, e.laenge);
        if (start + e.laenge > Math.min(a.bis, a.von + kappe) + 1e-6) {
          // Passt nicht mehr in den Abschnitt: weiter im nächsten.
          naechsterAbschnitt();
          continue;
        }
        restFrei(st.plEnde);
        r.platten.push({ typ: t.typ, x: vornIn(r, e.plattenTiefe), y: start, laenge: e.laenge, tiefe: e.plattenTiefe, plaetze: e.n * e.etagen, belegt: 0, rechteck: LEER });
        st.pos = start;
        st.etage = 0;
        st.plEnde = start + e.laenge;
      }
      r.kaefige.push({ ...t, x: vornIn(r, e.mass.tiefe), y: st.pos, breite: e.mass.breite, tiefe: e.mass.tiefe, ...etageFeld(st.etage), rechteck: LEER });
      // Nächste Etage derselben Spalte, sonst die nächste Spalte.
      if (++st.etage >= e.etagen) {
        st.etage = 0;
        st.pos += e.mass.breite;
      }
      st.letzter = { typ: t.typ, mass: e.mass, etagen: e.etagen };
      gestellt = true;
      break;
    }
    if (!gestellt) {
      nichtPlatziert.push(t);
      const { frei, ...stand } = vorher;
      Object.assign(st, stand);
      reihen.forEach((r, i) => {
        if (r.freiePlaetze) r.freiePlaetze.length = frei[i]!;
      });
    }
  }
  if (st.ri < reihen.length) restFrei(st.plEnde);
  // Was frei bleibt (Reserve für Nachmeldungen): je Reihenstück der Rest hinter seiner letzten Platte – die Reihen sind
  // gleich lang gestellt (siehe `planeAusgeglichen`), der Rest jeder Reihe bleibt frei. Auch ein Stück, das für die
  // bisherigen Platten zu kurz ist, zählt: eine kürzere Platte einer anderen Art passt vielleicht.
  const freiLaengen: number[] = [];
  for (const r of reihen)
    for (const a of r.abschnitte) {
      const drin = r.platten.filter((pl) => pl.y >= a.von - 0.5 && pl.y < a.bis - 0.5);
      const ende = drin.length ? Math.max(...drin.map((pl) => pl.y + pl.laenge)) : a.von;
      for (const s of stuecke(r, ende, a.bis)) freiLaengen.push(s.bis - s.von);
    }
  // Endet ein Abschnitt an einer Freifläche (und beginnt nicht an einer), rücken seine Platten und Käfige bis an die Fläche;
  // der Rest bleibt am Gang bzw. an der Wand.
  for (const r of reihen) {
    const k = anFreiflaeche.get(r);
    if (!k) continue;
    for (const a of r.abschnitte) {
      if (!k.anfaenge.some((y) => Math.abs(y - a.bis) < 0.5) || k.enden.some((y) => Math.abs(y - a.von) < 0.5)) continue;
      const drin = (y: number) => y >= a.von - 0.5 && y < a.bis - 0.5;
      const platten = r.platten.filter((pl) => drin(pl.y));
      // Stehen eingesetzte Teile im Abschnitt, rückt nichts (sonst liefen Platten auf sie).
      if (!platten.length || (besetzt.get(r) ?? []).some((b) => b.von < a.bis && a.von < b.bis)) continue;
      const d = a.bis - Math.max(...platten.map((pl) => pl.y + pl.laenge));
      if (d < 0.5) continue;
      for (const x of [...platten, ...r.kaefige.filter((x) => drin(x.y)), ...(r.freiePlaetze ?? []).filter((x) => drin(x.y))]) x.y += d;
    }
  }
  for (const r of reihen)
    for (const pl of r.platten) {
      const auf = (x: { y: number }) => x.y >= pl.y - 0.5 && x.y < pl.y + pl.laenge - 0.5;
      pl.belegt = r.kaefige.filter(auf).length;
      // Gemischte Platte: so viele Plätze, wie darauf stehen (belegt und frei).
      if (pl.gemischt) pl.plaetze = pl.belegt + (r.freiePlaetze ?? []).filter(auf).length;
    }

  // Volieren in den Volierenbereichen: Reihen entlang der längeren Seite des Bereichs, nebeneinander ohne Abstand. An einer
  // Hallenwand eine Einzelreihe (Front zur Halle), sonst Doppelreihen Rücken an Rücken; zwischen den Reihen immer 1,50 m
  // frei. Stellplätze auf eingesetzten Teilen, Sperrflächen oder Eingängen fallen weg.
  const volieren: PlanKaefig[] = [];
  const bereiche = halle.flaechen.filter((f) => f.art === "volieren");
  if (volierenTiere.length && !bereiche.length)
    warnungen.push(eingesetzteVolieren ? `${volierenTiere.length} Volieren ohne Platz.` : "Für die Volieren fehlt ein Volierenbereich.");
  const hindernisseVolieren = halle.flaechen.filter((f) => f.art !== "volieren" && !f.moebel);
  const vmass = kaefigMass("voliere", masse);
  const plaetze: { x: number; y: number; w: number; h: number; front: Blick }[] = [];
  if (vmass && volierenTiere.length) {
    const fw = vmass.breite, fd = vmass.tiefe;
    for (const b of bereiche) {
      const laengs = b.breite >= b.tiefe;
      const L = laengs ? b.breite : b.tiefe;
      const Q = laengs ? b.tiefe : b.breite;
      const qStart = laengs ? b.y : b.x;
      const hallenQ = laengs ? halle.laenge : halle.breite;
      const wandAnfang = qStart <= 1;
      const wandEnde = qStart + Q >= hallenQ - 1;
      // Je Volierenreihe die Seite ihrer Front (zum Gang): an der Wand von der Wand weg, Doppelreihen Rücken an Rücken.
      const reihenQ: { q: number; vor: 1 | -1 }[] = [];
      let q = 0;
      if (wandAnfang && fd <= Q) {
        reihenQ.push({ q: 0, vor: 1 });
        q = fd + VOLIEREN_GANG;
      }
      const endeFrei = wandEnde ? fd + VOLIEREN_GANG : 0;
      while (q + 2 * fd <= Q - endeFrei) {
        reihenQ.push({ q, vor: -1 }, { q: q + fd, vor: 1 });
        q += 2 * fd + VOLIEREN_GANG;
      }
      if (wandEnde ? Q - fd >= q : q + fd <= Q) reihenQ.push({ q: wandEnde ? Q - fd : q, vor: -1 });
      for (const { q: rq, vor } of reihenQ)
        for (let l = 0; l + fw <= L; l += fw)
          plaetze.push(laengs ? { x: b.x + l, y: b.y + rq, w: fw, h: fd, front: vor > 0 ? "z+" : "z-" } : { x: b.x + rq, y: b.y + l, w: fd, h: fw, front: vor > 0 ? "x+" : "x-" });
    }
  }
  const freiePlaetze = plaetze.filter((pl) => !hindernisseVolieren.some((h) => pl.x < h.x + h.breite && h.x < pl.x + pl.w && pl.y < h.y + h.tiefe && h.y < pl.y + pl.h));
  volierenTiere.forEach((t, i) => {
    const pl = freiePlaetze[i];
    // breite/tiefe hier als Ausdehnung in x/y (Reihensystem) – planeHalle rechnet daraus die Lage in der Halle.
    if (pl) volieren.push({ ...t, x: pl.x, y: pl.y, breite: pl.w, tiefe: pl.h, front: pl.front, rechteck: LEER });
    else nichtPlatziert.push(t);
  });

  // Platzreserve: ganze Platten im freien Rest (siehe `freiLaengen`), dazu die freien Plätze auf angefangenen Platten.
  const reserve = typenInReihen.map((typ) => {
    const e = einheit(typ);
    const aufPlatten = reihen.reduce((n, r) => n + (r.freiePlaetze ?? []).filter((f) => f.typ === typ).length, 0);
    return { typ, anzahl: freiLaengen.reduce((n, f) => n + Math.floor((f + 1e-6) / e.laenge) * e.n * e.etagen, 0) + aufPlatten };
  });
  const reservePlatten = tiefe > 0 ? freiLaengen.reduce((n, f) => n + Math.floor((f + 1e-6) / PLATTE_LAENGE), 0) : 0;

  if (nichtPlatziert.length) warnungen.push(`${nichtPlatziert.length} ${nichtPlatziert.length === 1 ? "Tier hat" : "Tiere haben"} keinen Platz.`);
  return { reihen, volieren, nichtPlatziert, fehlendeMasse, reserve, reservePlatten, warnungen };
}
