/**
 * Zeichnung des Hallenplans (`PlanBild`): Reihen, Käfige, Flächen und Objekte als SVG, Auswahl, Ziehen und Zoomen.
 */
import { type Blick, blockPlatz, dreheBlick, etagenStreifen, etagenVon, frontDerReihe, type Halle, type HallenFlaeche, type HallenObjekt, istMoebel, kaefigKanten, kaefigName, type KaefigPlatz, type KaefigTyp, type MoebelArt, moebelStuecke, objektFront, type PlanKaefig, type Rechteck, reihenSchilder, RICHTER_FARBE, richterFarbe, richterSchraffur, type Strecke, type WandSeite } from "@schau/domain";
import { useLayoutEffect, useRef } from "react";
import { type Aendern, BAU, type Daten, huelle, meter, objektLage, platzWeg, RAND_CM, RASTER, type Ziel, zielPlaetze, zuTeilen } from "./hallenplan-geometrie";
import { usePlanBedienung } from "./hallenplan-bild-bedienung";
import { Muster } from "./hallenplan-teile";

export function PlanBild({
  halle,
  plan,
  richterIndex,
  bearbeiten,
  auswahl,
  waehlen,
  aendern,
  voll = false,
  klein = false,
  zeigeKaefig,
  markiert: markierterKaefig = null,
  mehrfach = false,
  melden,
  zoom = 1,
  pfeilRef,
  zeichnen = null,
  gezeichnet,
  anWand,
  zielWahl = null,
}: {
  /**
   * Tier versetzen: über jedem Käfig eine Klickfläche (gleiche Größe hervorgehoben); ein Klick wählt das Ziel, ein Käfig
   * anderer Größe meldet nur. Sonst lässt sich in dieser Zeit nichts greifen.
   */
  zielWahl?: { tierId: number; typ: KaefigTyp; waehlen: (p: KaefigPlatz) => void; falsch: () => void } | null;
  /** Werkzeug „Fläche aufziehen“: Ziehen auf der Halle zieht eine neue Fläche auf (statt zu wählen). */
  zeichnen?: HallenFlaeche["art"] | null;
  gezeichnet?: (q: Rechteck, klick: boolean) => void;
  /** Eine Doppelreihe wurde an eine Wand gezogen (dort steht noch keine Einzelreihe): Einzelreihe stellen? */
  anWand?: (nr: number, seite: WandSeite) => void;
  /** Zoom im Editor (1 = ganze Halle in der Breite); die Zeichnung scrollt. */
  zoom?: number;
  /** Pfeiltasten von außerhalb der Zeichnung: verschieben die Auswahl (true = behandelt). */
  pfeilRef?: React.MutableRefObject<((e: KeyboardEvent) => boolean) | null>;
  /** Schalter „Mehrfachauswahl“: Antippen nimmt ein Teil in die Auswahl auf oder heraus (wie Umschalt-Klick). */
  mehrfach?: boolean;
  /** Meldung, wenn eine Verschiebung nicht geht (Hallenwand, anderes Teil). */
  melden?: (text: string) => void;
  /** Angeklickter Käfig (hervorgehoben). */
  markiert?: number | null;
  /** Vollansicht: Zeichnung füllt die verfügbare Höhe. */
  voll?: boolean;
  /** Vorschaubild (Stellvorschläge): ganze Halle in der Breite der Karte, ohne Mindestbreite. */
  klein?: boolean;
  /** Klick auf einen Käfig (außerhalb des Bearbeitens): Angaben anzeigen. */
  zeigeKaefig?: (id: number) => void;
  /** Entwurf der Halle (lokal sofort aktuell). */
  halle: Halle;
  plan: NonNullable<Daten["plan"]>;
  richterIndex: Map<number, number>;
  bearbeiten: boolean;
  /** Gewählte Teile (eins oder mehrere). */
  auswahl: Ziel[];
  waehlen: (z: Ziel[]) => void;
  aendern: Aendern;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const kastenRef = useRef<HTMLDivElement>(null);
  // Zoom: die Mitte des sichtbaren Ausschnitts bleibt stehen.
  const zoomVorher = useRef(zoom);
  useLayoutEffect(() => {
    const k = kastenRef.current;
    const alt = zoomVorher.current;
    zoomVorher.current = zoom;
    if (!k || alt === zoom) return;
    const f = zoom / alt;
    k.scrollLeft = (k.scrollLeft + k.clientWidth / 2) * f - k.clientWidth / 2;
    k.scrollTop = (k.scrollTop + k.clientHeight / 2) * f - k.clientHeight / 2;
  }, [zoom]);
  const quer = halle.laenge > halle.breite;
  const W = quer ? halle.laenge : halle.breite;
  const H = quer ? halle.breite : halle.laenge;
  const { bedienbar, drehen, ergaenzen, gegriffen, greifen, hallenPunkt, loslassen, markiert, pfeilWeg, rahmen, rahmenRef, reiheImEntwurf, setRahmen, setZug, versatz, verschiebeAuswahl, verschoben, ziehen, zug, zugRef } = usePlanBedienung({ halle, plan, bearbeiten, auswahl, waehlen, aendern, mehrfach, melden, pfeilRef, zeichnen, gezeichnet, anWand, quer, svgRef });
  /** Rechteck aus Hallenkoordinaten (x entlang der Breite, y entlang der Länge) in Zeichenkoordinaten. */
  const r = (x: number, y: number, b: number, t: number) => (quer ? { x: y, y: x, width: t, height: b } : { x, y, width: b, height: t });
  const rr = (q: Rechteck) => r(q.x, q.y, q.b, q.h);
  const rand = Math.max(W, H) * 0.004;
  const schrift = Math.max(W, H) * 0.014;
  /** Linie wie mit dem Zeichenstift: feste Stärke in Bildpunkten, gleich bei kleiner und großer Halle. */
  const strich = (px: number) => ({ strokeWidth: px, vectorEffect: "non-scaling-stroke" as const });
  /**
   * Wände eines Käfigs von oben (Rückmeldung: „die Rückwände erkennen, damit man sie immer korrekt herum setzt“): Rückwand kräftig,
   * Seitenwände fein, offene Front hell gestrichelt. `q` in Hallenkoordinaten (wie gezeichnet, auch beim Ziehen).
   */
  const waende = (q: Rechteck, front: Blick, key?: string) => {
    const k = kaefigKanten(q, front);
    const linie = (st: Strecke, farbe: string, px: number, dash?: string) => {
      const a = quer ? { x: st.y1, y: st.x1 } : { x: st.x1, y: st.y1 };
      const b = quer ? { x: st.y2, y: st.x2 } : { x: st.x2, y: st.y2 };
      return <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={farbe} {...strich(px)} strokeDasharray={dash} strokeLinecap="square" />;
    };
    return (
      <g key={key} pointerEvents="none">
        {linie(k.front, BAU.kaefigwand.front, 1, `${rand * 0.7} ${rand * 0.5}`)}
        {linie(k.seiten[0], BAU.kaefigwand.seite, 1.2)}
        {linie(k.seiten[1], BAU.kaefigwand.seite, 1.2)}
        {linie(k.rueck, BAU.kaefigwand.rueck, 3)}
      </g>
    );
  };
  /** Wandstärke in cm, außen an die Halle gesetzt (Innenmaße bleiben). */
  const wand = Math.min(24, Math.max(12, Math.max(W, H) * 0.008));


  const kaefig = (k: PlanKaefig, lage?: Rechteck) => {
    const i = k.preisrichterId != null ? (richterIndex.get(k.preisrichterId) ?? 0) : -1;
    const g = rr(lage ?? k.zeichnung ?? k.rechteck);
    const gr = Math.min(g.width, g.height) * 0.42;
    return (
      <g
        key={k.id}
        {...(zeigeKaefig
          ? {
              onClick: () => zeigeKaefig(k.id),
              onKeyDown: (e: React.KeyboardEvent) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), zeigeKaefig(k.id)),
              tabIndex: 0,
              role: "button",
              "aria-label": `Käfig ${k.nr ?? "ohne Nummer"}: ${k.rasse} – Angaben anzeigen`,
              className: "cursor-pointer focus:outline-none",
            }
          : {})}
      >
        <rect {...g} fill="#ffffff" stroke="none" />
        <rect {...g} fill={i >= 0 ? richterFarbe(i) : BAU.ohne.fill} fillOpacity={i >= 0 ? 0.45 : 1} stroke="none" />
        {i >= 0 && richterSchraffur(i) && <rect {...g} fill={`url(#schraffur-${i % RICHTER_FARBE.length})`} stroke="none" />}
        <rect {...g} fill="none" stroke={BAU.linie} {...strich(0.9)} />
        {k.nr && (
          <text x={g.x + g.width / 2} y={g.y + g.height / 2} fontSize={gr} textAnchor="middle" dominantBaseline="central" fill="#171b24">
            {k.nr}
          </text>
        )}
        <title>{`${k.nr ? `Nr. ${k.nr}: ` : ""}${k.rasse}`}</title>
        {markierterKaefig === k.id && <rect x={g.x - rand * 1.5} y={g.y - rand * 1.5} width={g.width + rand * 3} height={g.height + rand * 3} fill="none" stroke="#171b24" strokeWidth={rand * 1.2} />}
      </g>
    );
  };
  /** Gewählte Teile: blau getönt und gerahmt; während des Ziehens rot, wenn die Auswahl dort nicht stehen kann. */
  const farbe = zug?.konflikt ? "#c62828" : "#2d4bd2";
  const auswahlRahmen = (g: { x: number; y: number; width: number; height: number }) => (
    <rect x={g.x - rand} y={g.y - rand} width={g.width + 2 * rand} height={g.height + 2 * rand} fill={farbe} fillOpacity={0.14} stroke={farbe} strokeWidth={rand * 0.9} strokeDasharray={`${rand * 2} ${rand}`} pointerEvents="none" />
  );

  // Reihenbezeichnungen: alle gleich groß, bei den Platten, wie sie gezeichnet sind (auch beim Ziehen), nie übereinander.
  const schildSchrift = Math.min(schrift, RAND_CM * 0.3);
  const schildAbstand = { oben: schildSchrift * 2.6, links: schildSchrift * 1.4 };
  const schilder = new Map(
    reihenSchilder(
      plan.reihen.flatMap((reihe) => {
        const { lage, verschoben, aufPlatte, da } = reiheImEntwurf(reihe);
        const platten = reihe.platten.flatMap((pl, i) => (da[i] ? [aufPlatte(pl.rechteck, i)] : []));
        // Wie gezeichnet: leere Reihen nur, wenn sie im Bearbeiten von Hand verschoben sind.
        if (!platten.length && !(bearbeiten && lage.ev)) return [];
        const zeichnung = (q: Rechteck): Rechteck => (quer ? { x: q.y, y: q.x, b: q.h, h: q.b } : q);
        return [{ nr: reihe.nr, platten: (platten.length ? platten : reihe.flaechen.map((q) => verschoben(q))).map(zeichnung) }];
      }),
      { x: 0, y: 0, b: W, h: H },
      schildAbstand,
    ).map((x) => [x.nr, x]),
  );
  return (
    <div ref={kastenRef} className={`immer-hell overflow-auto bg-weiss p-2 ${bearbeiten ? "" : "rounded-md border border-linie"} ${voll ? "h-full" : ""}`}>
      <svg
        ref={svgRef}
        // Gezoomt: größer als der Kasten (Breite und, in der Vollansicht, Höhe), der Kasten scrollt.
        {...(zoom !== 1 ? { width: `${zoom * 100}%`, ...(voll ? { height: `${zoom * 100}%` } : {}) } : {})}
        // Rand rundum: Platz für Reihenbeschriftungen vor einer Wand, an der die Reihe bündig steht, und die Maßleisten.
        viewBox={`${-RAND_CM} ${-RAND_CM} ${W + 2 * RAND_CM} ${H + 2 * RAND_CM}`}
        className={`${zoom !== 1 ? (voll ? "" : "h-auto") : voll ? "h-full w-full" : klein ? "h-auto w-full" : "h-auto w-full min-w-[40rem]"} ${bearbeiten ? "touch-none select-none" : ""} ${zeichnen ? "cursor-crosshair" : ""} print:h-auto print:w-full`}
        role="img"
        aria-label={`Hallenplan, ${meter(halle.breite)} × ${meter(halle.laenge)} m`}
        onPointerMove={ziehen}
        onPointerUp={loslassen}
        onPointerCancel={(e) => {
          if (zugRef.current?.zeiger === e.pointerId) setZug(null);
          if (rahmenRef.current?.zeiger === e.pointerId) setRahmen(null);
        }}
        // Auf freier Fläche: Auswahlrechteck aufziehen (ein Klick ohne Ziehen hebt die Auswahl auf).
        onPointerDown={(e) => {
          if (!bearbeiten || e.button !== 0 || zugRef.current || rahmenRef.current) return;
          gegriffen.current = null;
          svgRef.current?.setPointerCapture(e.pointerId);
          // Fokus auf den Plan: danach verschieben die Pfeiltasten die gewählten Teile.
          svgRef.current?.focus({ preventScroll: true });
          const p = hallenPunkt(e);
          setRahmen({ start: p, jetzt: p, startBild: { clientX: e.clientX, clientY: e.clientY }, dazu: ergaenzen(e), zeiger: e.pointerId });
        }}
        // Strg-Klick (Mehrfachauswahl) öffnet am Mac sonst das Kontextmenü – und das Loslassen käme nie an.
        onContextMenu={bearbeiten ? (e) => e.preventDefault() : undefined}
        tabIndex={bearbeiten ? -1 : undefined}
        onKeyDown={(e) => {
          // Pfeiltasten, wenn der Plan selbst den Fokus hat (nach einem Auswahlrechteck): die ganze Auswahl.
          if (!bearbeiten || e.target !== e.currentTarget || auswahl.length === 0) return;
          const weg = pfeilWeg(e);
          if (!weg) return;
          e.preventDefault();
          verschiebeAuswahl(zuTeilen(auswahl, plan), weg[0], weg[1], true);
        }}
        // Doppelklick dreht das zuletzt gegriffene Teil (beim Ziehen hält das SVG den Zeiger fest, daher hier statt am Teil).
        onDoubleClick={() => {
          const z = gegriffen.current;
          if (bearbeiten && z) drehen(z);
        }}
      >
        <Muster massstab={Math.max(1, Math.max(W, H) / 2000)} />
        <rect x={0} y={0} width={W} height={H} fill={BAU.halle.fill} stroke="none" />
        {/* Raster zum Orientieren: 0,5 m fein, jeder Meter und alle 5 m etwas kräftiger. */}
        {Array.from({ length: Math.floor(W / 50) + 1 }, (_, n) => n * 50).map((x) => (
          <line key={`rx${x}`} x1={x} y1={0} x2={x} y2={H} stroke={x % 500 === 0 ? BAU.raster.fuenf : x % 100 === 0 ? BAU.raster.meter : BAU.raster.fein} strokeWidth={rand * (x % 100 === 0 ? 0.2 : 0.12)} />
        ))}
        {Array.from({ length: Math.floor(H / 50) + 1 }, (_, n) => n * 50).map((y) => (
          <line key={`ry${y}`} x1={0} y1={y} x2={W} y2={y} stroke={y % 500 === 0 ? BAU.raster.fuenf : y % 100 === 0 ? BAU.raster.meter : BAU.raster.fein} strokeWidth={rand * (y % 100 === 0 ? 0.2 : 0.12)} />
        ))}
        {/* Maßleisten in Metern: unten und links; die Reihennamen stehen oben (bzw. links neben der Meterleiste) am Rand. */}
        {Array.from({ length: Math.floor(W / 100) + 1 }, (_, n) => n * 100)
          .filter((x) => x % (W > 4000 ? 200 : 100) === 0)
          .map((x) => (
            <text key={`mx${x}`} x={x} y={H + RAND_CM * 0.45} fontSize={schrift * 0.6} textAnchor="middle" dominantBaseline="central" fill={BAU.raster.text}>
              {x / 100}
            </text>
          ))}
        {Array.from({ length: Math.floor(H / 100) + 1 }, (_, n) => n * 100)
          .filter((y) => y % (H > 4000 ? 200 : 100) === 0)
          .map((y) => (
            <text key={`my${y}`} x={-RAND_CM * 0.3} y={y} fontSize={schrift * 0.6} textAnchor="end" dominantBaseline="central" fill={BAU.raster.text}>
              {y / 100}
            </text>
          ))}
        <text x={W} y={H + RAND_CM * 0.85} fontSize={schrift * 0.55} textAnchor="end" dominantBaseline="central" fill={BAU.raster.text}>
          Meter
        </text>
        {/* Wände: kräftig und außen um die Halle, an Eingängen offen. */}
        <path
          d={`M${-wand} ${-wand}H${W + wand}V${H + wand}H${-wand}Z M0 0V${H}H${W}V0Z`}
          fill={BAU.wand}
          fillRule="evenodd"
        />
        {halle.flaechen.map((f: HallenFlaeche, i) => {
          if (f.art !== "eingang") return null;
          // Gleiche Lage wie die Fläche darunter, auch während sie gezogen wird.
          const v = versatz({ art: "flaeche", i }), gv = versatz({ art: "flaeche", i }, "groesse");
          const g = r(f.x + v.dx, f.y + v.dy, Math.max(20, f.breite + gv.dx), Math.max(20, f.tiefe + gv.dy));
          const n = RASTER; // cm Spiel: Eingang „an der Wand“ (auch wenn die Halle kein Vielfaches des Rasters ist)
          // Entlang der Wand auf die Halle begrenzt (die Ecken bleiben stehen), nach außen 1 cm länger gegen Haarlinien.
          const gx = Math.max(0, g.x), gy = Math.max(0, g.y);
          const gb = Math.min(W, g.x + g.width) - gx, gh = Math.min(H, g.y + g.height) - gy;
          // Eine Tür öffnet genau eine Wand: die berührte, an der ihre lange Seite liegt (in einer Ecke nicht beide).
          const stehend = g.height > g.width;
          const waende = [
            { an: g.x <= n, laengs: stehend, o: { x: -wand - 1, y: gy, width: wand + 1, height: gh } },
            { an: g.x + g.width >= W - n, laengs: stehend, o: { x: W, y: gy, width: wand + 1, height: gh } },
            { an: g.y <= n, laengs: !stehend, o: { x: gx, y: -wand - 1, width: gb, height: wand + 1 } },
            { an: g.y + g.height >= H - n, laengs: !stehend, o: { x: gx, y: H, width: gb, height: wand + 1 } },
          ].filter((x) => x.an);
          const offen = waende.find((x) => x.laengs) ?? waende[0];
          return offen && offen.o.width > 0 && offen.o.height > 0 ? <rect key={`o${i}`} {...offen.o} fill={BAU.halle.fill} stroke="none" /> : null;
        })}
        {halle.flaechen.map((f: HallenFlaeche, i) => {
          const z: Ziel = { art: "flaeche", i };
          const v = versatz(z), gv = versatz(z, "groesse");
          const g = r(f.x + v.dx, f.y + v.dy, Math.max(20, f.breite + gv.dx), Math.max(20, f.tiefe + gv.dy));
          return (
            <g key={`f${i}`} {...bedienbar(z, f.name)}>
              <rect
                {...g}
                fill={f.art === "sperre" ? BAU.frei.fill : f.art === "eingang" ? BAU.eingang.fill : BAU.volierenbereich.fill}
                stroke={f.art === "sperre" ? BAU.frei.stroke : f.art === "eingang" ? BAU.eingang.stroke : BAU.volierenbereich.stroke}
                {...strich(1)}
                strokeDasharray={f.art === "volieren" ? `${rand * 2} ${rand * 1.2}` : undefined}
              />
              <text
                x={g.x + g.width / 2}
                // Volierenbereich: Name am oberen Rand, damit ihn die Volieren nicht verdecken.
                y={f.art === "volieren" ? (g.y < wand + schrift ? g.y + schrift * 0.7 : g.y - schrift * 0.6) : g.y + g.height / 2}
                fontSize={Math.min(schrift, Math.max(g.height, g.width) * 0.4, (Math.max(g.width, g.height) / Math.max(f.name.length, 1)) * 1.6)}
                textAnchor="middle"
                dominantBaseline="central"
                fill={f.art === "eingang" ? BAU.eingang.text : "#171b24"}
                fontWeight={f.art === "eingang" ? "bold" : undefined}
                transform={f.art !== "volieren" && g.height > g.width * 1.5 ? `rotate(-90 ${g.x + g.width / 2} ${g.y + g.height / 2})` : undefined}
              >
                {f.name}
              </text>
              {markiert(z) && (
                <>
                  {auswahlRahmen(g)}
                  {/* Ecke zum Ändern der Größe */}
                  <rect x={g.x + g.width - rand * 3} y={g.y + g.height - rand * 3} width={rand * 6} height={rand * 6} fill="#2d4bd2" className="cursor-nwse-resize" onPointerDown={greifen(z, "groesse")} />
                </>
              )}
            </g>
          );
        })}
        {plan.reihen.map((reihe) => {
          const z: Ziel = { art: "reihe", nr: reihe.nr };
          const { lage, verschoben, aufPlatte, da } = reiheImEntwurf(reihe);
          const ev = lage.ev;
          const sichtbar = reihe.platten.filter((_, i) => da[i]);
          // Umriss: die Platten, wie sie gezeichnet sind (auch einzeln verschobene und gedrehte).
          const umriss = sichtbar.length ? reihe.platten.flatMap((pl, i) => (da[i] ? [rr(aufPlatte(pl.rechteck, i))] : [])) : reihe.flaechen.map((q) => rr(verschoben(q, z)));
          // Beschriftung „R…“ außerhalb der Halle am Rand, beim größten Stück der Reihe, alle gleich groß, nie übereinander
          // (siehe reihenSchilder). So verdeckt sie nichts im Plan.
          const sch = schilder.get(reihe.nr);
          const b = !sch
            ? null
            : sch.seite === "oben"
              ? { x: sch.mitte - schildAbstand.oben / 2, y: -wand - RAND_CM * 0.42, width: schildAbstand.oben, height: RAND_CM * 0.34 }
              : { x: -RAND_CM * 0.98, y: sch.mitte - schildAbstand.links / 2, width: RAND_CM * 0.34, height: schildAbstand.links };
          // Nur Reihen mit Käfigen zeichnen – leere Reihen nicht (der freie Platz steht unter „Platz“). Eine leere, aber
          // von Hand verschobene Reihe bleibt im Bearbeiten wählbar, damit sie sich zurücksetzen lässt.
          const leer = sichtbar.length === 0;
          if (leer && !(bearbeiten && ev)) return null;
          const aufPlatteNr = new Map<number, PlanKaefig[]>();
          for (const k of reihe.kaefige) if (k.platte != null) aufPlatteNr.set(k.platte, [...(aufPlatteNr.get(k.platte) ?? []), k]);
          return (
            <g key={reihe.nr}>
              {leer &&
                reihe.flaechen.map((q, i) => (
                  <rect key={i} {...rr(verschoben(q, z))} fill="none" stroke="#b8bfca" {...strich(0.8)} strokeDasharray={`${rand * 2} ${rand * 1.5}`} />
                ))}
              {/* Jede Grundplatte mit ihren Käfigen für sich wählbar und verschiebbar. Erst alle Platten, darüber die Käfige: ein
                  Käfig kann über die Kante auf die nächste Platte reichen (die Platten stehen lückenlos aneinander). */}
              {reihe.platten.map((pl, i) => {
                if (!da[i]) return null;
                const pz: Ziel = { art: "platte", reihe: reihe.nr, i };
                const g = rr(aufPlatte(pl.rechteck, i));
                return (
                  <g
                    key={`p${i}`}
                    {...bedienbar(pz, `Grundplatte ${i + 1} in Reihe R${reihe.nr}${(aufPlatteNr.get(i) ?? []).some((k) => k.nr) ? ` (Käfige ${(aufPlatteNr.get(i) ?? []).map((k) => k.nr).filter(Boolean).join(", ")})` : ""}`)}
                  >
                    <rect {...g} fill={BAU.platte.fill} stroke={BAU.platte.stroke} {...strich(0.8)} />
                  </g>
                );
              })}
              {/* Im Bearbeiten greift ein Klick auf einen Käfig die Platte darunter. */}
              <g pointerEvents={bearbeiten ? "none" : undefined}>
                {reihe.platten.map((_, i) => (aufPlatteNr.get(i) ?? []).map((k) => kaefig(k, aufPlatte(k.zeichnung ?? k.rechteck, i))))}
                {reihe.kaefige.filter((k) => k.platte == null).map((k) => kaefig(k, verschoben(k.zeichnung ?? k.rechteck, z)))}
              </g>
              {reihe.platten.map((pl, i) => (markiert({ art: "platte", reihe: reihe.nr, i }) ? <g key={`m${i}`}>{auswahlRahmen(rr(aufPlatte(pl.rechteck, i)))}</g> : null))}
              {(reihe.freiePlaetze ?? []).map((f, i) => {
                if (platzWeg(halle, reihe, f, da)) return null;
                const g = rr(aufPlatte(f.zeichnung ?? f.rechteck, f.platte));
                // Im Editor auf einer teils belegten Platte einzeln wählbar (zum Entfernen); Ziehen nimmt die Platte mit. Auf einer
                // ganz leeren Platte wählt ein Klick die Platte selbst (die man als Ganzes entfernt).
                const fz: Ziel = { art: "platz", reihe: reihe.nr, x: f.x, y: f.y, ...(f.etage ? { etage: f.etage } : {}) };
                // Plätze auf einer für eine Nachmeldung angebauten Platte gehören zu ihr (die Platte ist belegt).
                const einzeln = !f.angebaut && (f.platte == null || (reihe.platten[f.platte]?.belegt ?? 0) > 0);
                return (
                  <g key={`frei${i}`} {...(einzeln ? bedienbar(fz, `Freier Platz in R${reihe.nr}${f.platte != null ? `, Grundplatte ${f.platte + 1}` : ""}`) : { pointerEvents: bearbeiten ? "none" : undefined })}>
                    <rect {...g} fill="#ffffff" stroke="#7c8696" {...strich(0.8)} strokeDasharray={`${rand * 0.8} ${rand * 0.6}`} />
                    <text x={g.x + g.width / 2} y={g.y + g.height / 2} fontSize={Math.min(g.width, g.height) * 0.3} textAnchor="middle" dominantBaseline="central" fill="#7c8696">
                      frei
                    </text>
                    <title>{`Freier Platz (${kaefigName(f.typ as KaefigTyp)})${f.etage ? `, ${f.etage + 1}. Etage` : ""}`}</title>
                    {markiert(fz) && auswahlRahmen(g)}
                  </g>
                );
              })}
              {/* Rückwand, Seiten und offene Front jeder Grundplatte (über den Käfigen, damit man sie immer sieht). */}
              {reihe.platten.map((pl, i) => (da[i] ? waende(aufPlatte(pl.rechteck, i), dreheBlick(frontDerReihe(reihe, plan.quer, pl.drehung ?? 0), lage.vorschauDrehung(i)), `w${i}`) : null))}
              {/* Die ganze Reihe greift man an ihrer Beschriftung „R…“. */}
              {b && (
                <g {...bedienbar(z, `Reihe R${reihe.nr}`)}>
                  <rect {...b} fill="transparent" />
                  <text x={b.x + b.width / 2} y={b.y + b.height / 2} fontSize={schildSchrift} textAnchor="middle" dominantBaseline="central" fontWeight="bold" fill={reihe.kaefige.length ? "#2d4bd2" : "#7c8696"}>
                    R{reihe.nr}
                  </text>
                </g>
              )}
              {markiert(z) && umriss.length > 0 && auswahlRahmen(huelle(umriss))}
            </g>
          );
        })}
        {plan.volieren.map((k) => kaefig(k))}
        {plan.volieren.map((k, i) => (k.front ? waende(k.rechteck, k.front, `vw${i}`) : null))}
        {plan.objekte.map((o) => {
          const z: Ziel = { art: "objekt", id: o.id };
          const ol = objektLage(halle, o);
          if (!ol) return null; // im Entwurf schon entfernt
          const { lage, gedrehtSeit } = ol;
          const g = rr(verschoben(lage, z));
          const lang = g.width >= g.height;
          return (
            <g key={o.id} {...bedienbar(z, o.name)}>
              {istMoebel(o) ? (
                <>
                  {moebelStuecke(((halle.objekte ?? []).find((x) => x.id === o.id) ?? o) as HallenObjekt & { art: MoebelArt }, lage).map((m, i) => {
                    const f = rr(verschoben(m.q, z));
                    return <rect key={i} {...f} fill={m.art === "tisch" ? BAU.tisch.fill : BAU.bank.fill} stroke={BAU.tisch.stroke} {...strich(0.8)} />;
                  })}
                  <title>{o.name}</title>
                </>
              ) : o.art === "voliere" ? (
                <>
                  <rect {...g} fill={BAU.voliere.fill} stroke={BAU.voliere.stroke} {...strich(2.2)} />
                  <text x={g.x + g.width / 2} y={g.y + g.height / 2} fontSize={Math.min(schrift, Math.min(g.width, g.height) * 0.4)} textAnchor="middle" dominantBaseline="central" fill="#171b24">
                    {o.tier ? (o.tier.nr ? `V ${o.tier.nr}` : "V") : "V (frei)"}
                  </text>
                  <title>{o.tier ? `${o.name}: ${o.tier.nr ? `Nr. ${o.tier.nr}, ` : ""}${o.tier.rasse}` : `${o.name}: frei`}</title>
                  {o.tier && zeigeKaefig && <rect {...g} fill="transparent" className="cursor-pointer" onClick={() => zeigeKaefig(o.tier!.id)} />}
                  {waende(verschoben(lage, z), objektFront({ front: halle.objekte?.find((x) => x.id === o.id)?.front, rechteck: lage }))}
                </>
              ) : (
                <>
                  <rect {...g} fill={BAU.platte.fill} stroke={BAU.platte.stroke} {...strich(0.8)} />
                  {/* Belegte Plätze (Tiere aus „noch zu stellen“) wie Käfige; die übrigen leer gestrichelt. Im Entwurf gedreht:
                      erst nach dem Neurechnen wieder belegt gezeichnet. */}
                  {Array.from({ length: o.plaetze }, (_, i) => {
                    if (!gedrehtSeit && (o.kaefige ?? []).some((k, j) => (k.blockPlatz ?? j) === i)) return null;
                    // Je Spalte die Etagen (Feld quer zur Front geteilt), etwas eingerückt.
                    const et = etagenVon(o.typ ?? "huehner", halle);
                    const p = blockPlatz(lage, o.plaetze, et, i);
                    const q = etagenStreifen(p.rechteck, p.etage, et, objektFront({ front: halle.objekte?.find((x) => x.id === o.id)?.front, rechteck: lage }));
                    const e = Math.min(q.b, q.h) * 0.08;
                    const k = rr(verschoben({ x: q.x + e, y: q.y + e, b: q.b - 2 * e, h: q.h - 2 * e }, z));
                    return <rect key={i} {...k} fill="#ffffff" stroke="#7c8696" {...strich(0.8)} strokeDasharray={`${rand * 0.8} ${rand * 0.6}`} />;
                  })}
                  {!gedrehtSeit &&
                    (o.kaefige ?? []).map((k) => {
                      const q = k.zeichnung ?? k.rechteck;
                      return kaefig(k, verschoben({ ...q, x: q.x + lage.x - o.rechteck.x, y: q.y + lage.y - o.rechteck.y }, z));
                    })}
                  {waende(verschoben(lage, z), objektFront({ front: halle.objekte?.find((x) => x.id === o.id)?.front, rechteck: lage }))}
                  <title>{o.kaefige?.length ? `${o.name} – ${o.kaefige.length} von ${o.plaetze} belegt` : `${o.name} – leer (Reserve)`}</title>
                </>
              )}
              {markiert(z) && auswahlRahmen(g)}
            </g>
          );
        })}
        {rahmen && (
          <rect
            {...r(Math.min(rahmen.start.x, rahmen.jetzt.x), Math.min(rahmen.start.y, rahmen.jetzt.y), Math.abs(rahmen.jetzt.x - rahmen.start.x), Math.abs(rahmen.jetzt.y - rahmen.start.y))}
            fill="#2d4bd2"
            fillOpacity={0.08}
            stroke="#2d4bd2"
            strokeWidth={rand * 0.6}
            strokeDasharray={`${rand * 2} ${rand}`}
            pointerEvents="none"
          />
        )}
        {zielWahl && (
          <g aria-label="Ziel für das Tier wählen">
            {zielPlaetze(plan, halle).map((z) => {
              const gleich = z.typ === zielWahl.typ;
              const selbst = z.tierId === zielWahl.tierId;
              const q = z.q;
              return (
                <rect
                  key={z.schluessel}
                  {...r(q.x, q.y, q.b, q.h)}
                  fill={gleich && !selbst ? "#2d4bd2" : "#000"}
                  fillOpacity={gleich && !selbst ? (z.tierId == null ? 0.28 : 0.12) : 0.001}
                  stroke={gleich && !selbst ? "#2d4bd2" : "none"}
                  strokeWidth={rand * 0.5}
                  className={gleich && !selbst ? "cursor-pointer" : "cursor-not-allowed"}
                  role="button"
                  aria-label={`${z.tierId == null ? "Freier Käfig" : `Käfig Nr. ${z.nr ?? "ohne Nummer"}`}${gleich ? "" : " (andere Größe)"}`}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    if (selbst) return;
                    if (!gleich) return zielWahl.falsch();
                    zielWahl.waehlen(z.platz);
                  }}
                />
              );
            })}
          </g>
        )}
      </svg>
    </div>
  );
}
