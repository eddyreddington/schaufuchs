/**
 * Anzeige unter dem Hallenplan: Legende der Zeichnung, „Platz“ (gestellt, ohne Platz, frei) und die Aufbauliste je Reihe.
 */
import { type Halle, istMoebel, type KaefigMasse, type KaefigTyp, nummernBereiche, type PlanKaefig, richterFarbe } from "@schau/domain";
import { useOberflaeche } from "../sprache";
import { Abschnitt, Marke, TabellenRahmen } from "../ui";
import { alsNummer, BAU, type Daten, lage, meter, type Plan, plattenJeArt, richterNamen, zusammenfassen } from "./hallenplan-geometrie";
import { kaefigNameT, LegendenFeld, OhnePlatz } from "./hallenplan-teile";

/** Legende: Preisrichterfarben in Katalogfolge, Grundplatte, Flächen, Eingang, Volieren, Käfigblock, Möbel, Rückwand. */
export function PlanLegende({ plan, richterReihe, richterIndex }: { plan: Plan; richterReihe: { id: number; name: string }[]; richterIndex: Map<number, number> }) {
  const t = useOberflaeche().halleWerkzeuge;
  const tu = t.uebersicht;
  return (
    <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-grau">
      {richterReihe
        .filter((r) => plan.reihen.some((x) => x.kaefige.some((k) => k.preisrichterId === r.id)) || plan.volieren.some((k) => k.preisrichterId === r.id))
        .map((r) => {
          const i = richterIndex.get(r.id)!;
          return (
            <span key={r.id} className="flex items-center gap-2 text-tinte">
              <LegendenFeld fill={richterFarbe(i)} stroke={BAU.linie} schraffur={i} />
              {r.name}
            </span>
          );
        })}
      <span className="flex items-center gap-2">
        <LegendenFeld {...BAU.ohne} />
        {tu.ohnePreisrichter}
      </span>
      <span className="flex items-center gap-2">
        <LegendenFeld {...BAU.platte} />
        {tu.grundplatte}
      </span>
      <span className="flex items-center gap-2">
        <LegendenFeld {...BAU.frei} />
        {tu.freierBereich}
      </span>
      <span className="flex items-center gap-2">
        {/* Öffnung in der Wand wie in der Zeichnung. */}
        <svg width="22" height="16" aria-hidden="true">
          <rect x="0" y="1" width="6" height="3.5" fill={BAU.wand} />
          <rect x="16" y="1" width="6" height="3.5" fill={BAU.wand} />
          <rect x="6" y="4.5" width="10" height="10.5" fill={BAU.eingang.fill} stroke={BAU.eingang.stroke} strokeWidth="1" />
        </svg>
        {t.gemeinsam.eingangAusgang}
      </span>
      <span className="flex items-center gap-2">
        <LegendenFeld {...BAU.volierenbereich} dash />
        {t.gemeinsam.volierenbereich}
      </span>
      <span className="flex items-center gap-2">
        <LegendenFeld {...BAU.voliere} breite={2.2} />
        {tu.eingesetzteVoliere}
      </span>
      <span className="flex items-center gap-2">
        <svg width="22" height="16" aria-hidden="true">
          <rect x="1" y="1" width="20" height="14" fill={BAU.platte.fill} stroke={BAU.platte.stroke} strokeWidth="0.75" />
          <rect x="4" y="4" width="6" height="8" fill="#ffffff" stroke="#7c8696" strokeWidth="0.75" strokeDasharray="2 1" />
          <rect x="12" y="4" width="6" height="8" fill="#ffffff" stroke="#7c8696" strokeWidth="0.75" strokeDasharray="2 1" />
        </svg>
        {tu.leererBlock}
      </span>
      {plan.objekte.some(istMoebel) && (
        <span className="flex items-center gap-2">
          <LegendenFeld fill={BAU.tisch.fill} stroke={BAU.tisch.stroke} />
          {tu.tischBank}
        </span>
      )}
      <span className="flex items-center gap-2">
        {/* Käfig von oben: Rückwand kräftig oben, Seiten fein, Front unten hell gestrichelt. */}
        <svg width="22" height="16" aria-hidden="true">
          <rect x="2" y="2" width="18" height="12" fill={BAU.platte.fill} />
          <line x1="2" y1="14" x2="20" y2="14" stroke={BAU.kaefigwand.front} strokeWidth="1" strokeDasharray="2 1.5" />
          <line x1="2" y1="2" x2="2" y2="14" stroke={BAU.kaefigwand.seite} strokeWidth="1.2" />
          <line x1="20" y1="2" x2="20" y2="14" stroke={BAU.kaefigwand.seite} strokeWidth="1.2" />
          <line x1="2" y1="2" x2="20" y2="2" stroke={BAU.kaefigwand.rueck} strokeWidth="3" />
        </svg>
        {tu.rueckwand}
      </span>
      <span className="flex items-center">{tu.raster}</span>
    </div>
  );
}

/** Abschnitt „Platz“: gestellt, ohne Platz bzw. noch zu stellen, frei in den Reihen. */
export function PlatzUebersicht({ plan, halle, masse, platziert }: { plan: Plan; halle: Halle; masse: KaefigMasse; platziert: number }) {
  const gesamt = platziert + plan.nichtPlatziert.length;
  const t = useOberflaeche();
  const tu = t.halleWerkzeuge.uebersicht;
  const tg = t.halleWerkzeuge.gemeinsam;
  return (
    <Abschnitt
      titel={tu.platz}
      aktionen={plan.nichtPlatziert.length === 0 ? <Marke ton="ok">{tg.alleHabenPlatz}</Marke> : <Marke ton="fehler">{tg.ohnePlatz(plan.nichtPlatziert.length)}</Marke>}
    >
      <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[10rem_minmax(0,1fr)]">
        <dt className="text-grau">{tu.gestellt}</dt>
        <dd className="tabular-nums">{tu.gestelltVon(platziert, gesamt)}</dd>
        {plan.nichtPlatziert.length > 0 && (
          <>
            <dt className="text-grau">{plan.fest ? tu.nochZuStellen : tu.ohnePlatz}</dt>
            <dd>
              <OhnePlatz plan={plan} halle={halle} masse={masse} />
            </dd>
          </>
        )}
        {plan.reserve.length > 0 && (
          <>
            <dt className="text-grau">{plan.fest ? tu.freiFest : tu.freiReihen}</dt>
            <dd>
              {!plan.fest && tu.plattenUndFrei(plan.reservePlatten)}
              {plan.reserve.map((r) => `${r.anzahl} × ${kaefigNameT(t, r.typ as KaefigTyp, masse)}`).join(tu.oder)}
            </dd>
          </>
        )}
      </dl>
    </Abschnitt>
  );
}

/** Aufbauliste je Reihe: Lage, Nummern, Käfige, Grundplatten, Länge, Rassen, Preisrichter. */
export function Aufbauliste({ plan, masse, richter }: { plan: Plan; masse: KaefigMasse; richter: Daten["richter"] }) {
  // Tiere in eingesetzten Volieren zählen mit.
  const inTeilen = plan.objekte.filter((o) => o.tier).map((o) => ({ ...o.tier!, typ: "voliere" as KaefigTyp }));
  const plattenZusammen = plan.reihen.reduce((n, r) => n + r.platten.filter((pl) => !pl.entfernt).length, 0);
  const laengeZusammen = plan.reihen.reduce((n, r) => n + r.platten.filter((pl) => !pl.entfernt).reduce((m, pl) => m + pl.laenge, 0), 0);
  const t = useOberflaeche();
  const tu = t.halleWerkzeuge.uebersicht;
  const tg = t.halleWerkzeuge.gemeinsam;
  const tp = t.allgemein.preisrichter;
  return (
    <TabellenRahmen
      className="print:overflow-visible print:*:overflow-visible"
      kopf={<h2 className="text-[1.02rem] font-semibold">{tu.aufbauliste}</h2>}
      fuss={<span>{tu.plattenJeArt(plattenJeArt(plan.reihen, masse))}</span>}
    >
      <table className="tabelle">
        <thead>
          <tr>
            <th scope="col">{tu.reihe}</th>
            <th scope="col">{tu.lage}</th>
            <th scope="col">{tu.kaefignummern}</th>
            <th scope="col">{tu.kaefige}</th>
            <th scope="col" className="text-right">{tu.grundplatten}</th>
            <th scope="col" className="text-right">{tu.laenge}</th>
            <th scope="col">{tu.rassen}</th>
            <th scope="col">{tp}</th>
          </tr>
        </thead>
        <tbody>
          {plan.reihen
            .filter((r) => r.kaefige.length || r.freiePlaetze?.length)
            .map((r) => (
              <tr key={r.nr}>
                <td className="font-semibold text-tinte">R{r.nr}</td>
                <td className="text-sm">{lage(r, plan.reihen, plan.quer)}</td>
                <td className="tabular-nums">{nummernBereiche(r.kaefige.map((k) => alsNummer(k.nr))) || "–"}</td>
                <td className="text-sm">
                  {zusammenfassen(r.kaefige.map((k) => k.typ as KaefigTyp), masse)}
                  {r.freiePlaetze?.length ? `${r.kaefige.length ? ", " : ""}${tu.frei(zusammenfassen(r.freiePlaetze.map((f) => f.typ as KaefigTyp), masse))}` : ""}
                </td>
                <td className="text-right tabular-nums">{r.platten.filter((pl) => !pl.entfernt).length}</td>
                <td className="whitespace-nowrap text-right tabular-nums">{meter(r.platten.filter((pl) => !pl.entfernt).reduce((n, pl) => n + pl.laenge, 0))} m</td>
                <td className="text-sm">{[...new Set(r.kaefige.map((k) => k.rasse))].join(", ")}</td>
                <td className="text-sm">{richterNamen(r.kaefige, richter)}</td>
              </tr>
            ))}
          {inTeilen.length > 0 && (
            <tr>
              <td className="font-semibold text-tinte">V*</td>
              <td className="text-sm">{tu.eingesetzteVolieren}</td>
              <td className="tabular-nums">{nummernBereiche(inTeilen.map((k) => alsNummer(k.nr))) || "–"}</td>
              <td className="text-sm">{tu.voliereMal(inTeilen.length)}</td>
              <td />
              <td />
              <td className="text-sm">{[...new Set(inTeilen.map((k) => k.rasse))].join(", ")}</td>
              <td className="text-sm">{richterNamen(inTeilen as unknown as PlanKaefig[], richter)}</td>
            </tr>
          )}
          {plan.volieren.length > 0 && (
            <tr>
              <td className="font-semibold text-tinte">V</td>
              <td className="text-sm">{tg.volierenbereich}</td>
              <td className="tabular-nums">{nummernBereiche(plan.volieren.map((k) => alsNummer(k.nr))) || "–"}</td>
              <td className="text-sm">{zusammenfassen(plan.volieren.map((k) => k.typ as KaefigTyp), masse)}</td>
              <td />
              <td />
              <td className="text-sm">{[...new Set(plan.volieren.map((k) => k.rasse))].join(", ")}</td>
              <td className="text-sm">{richterNamen(plan.volieren, richter)}</td>
            </tr>
          )}
        </tbody>
        <tfoot>
          <tr>
            <td>{tu.zusammen}</td>
            <td />
            <td />
            <td className="text-sm">{zusammenfassen([...plan.reihen.flatMap((r) => r.kaefige), ...plan.volieren].map((k) => k.typ as KaefigTyp), masse)}</td>
            <td className="text-right tabular-nums">{plattenZusammen}</td>
            <td className="whitespace-nowrap text-right tabular-nums">{meter(laengeZusammen)} m</td>
            <td />
            <td />
          </tr>
        </tfoot>
      </table>
    </TabellenRahmen>
  );
}
