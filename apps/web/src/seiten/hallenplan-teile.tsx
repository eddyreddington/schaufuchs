/**
 * Kleine Teile des Hallenplans: Muster und Legende, Tiere ohne Platz, Sparten in den Reihen, Angaben zu einem Käfig,
 * Schalter „Automatisch planen“.
 */
import { fehlendeKaefige, type Halle, kaefigAnzahl, kaefigMass, type KaefigMasse, MELDEART_LABEL, RICHTER_FARBE, richterSchraffur } from "@schau/domain";
import { useId } from "react";
import { Link } from "react-router-dom";
import { fehlerText } from "../lib";
import { trpc } from "../trpc";
import { Hinweis, Knopf, Laden } from "../ui";
import { WzSymbol } from "./hallenplan-werkzeuge";
import { anzahl, type Daten, type FehlendeSetzen, type Plan } from "./hallenplan-geometrie";

/** Muster für Zeichnung und Legende (SVG-Attribute, keine Inline-Styles). `massstab` verkleinert sie für die Legende. */
export function Muster({ idPrefix = "", massstab = 1 }: { idPrefix?: string; massstab?: number }) {
  const f = 24 * massstab, s = 14 * massstab;
  return (
    <defs>
      {/* Freifläche: feine Schraffur wie auf einem Bauplan. */}
      <pattern id={`${idPrefix}muster-frei`} patternUnits="userSpaceOnUse" width={f} height={f} patternTransform="rotate(45)">
        <rect width={f} height={f} fill="#f4f5f7" />
        <line x1="0" y1="0" x2="0" y2={f} stroke="#9aa2ae" strokeWidth={Math.max(0.6, 1.6 * massstab)} />
      </pattern>
      {RICHTER_FARBE.map((farbe, i) => (
        <pattern key={i} id={`${idPrefix}schraffur-${i}`} patternUnits="userSpaceOnUse" width={s} height={s} patternTransform="rotate(-45)">
          <line x1="0" y1="0" x2="0" y2={s} stroke={farbe} strokeWidth={Math.max(0.8, 2.2 * massstab)} />
        </pattern>
      ))}
    </defs>
  );
}

/** Legendenfeld: gleiches Aussehen wie in der Zeichnung. */
export function LegendenFeld({ fill, stroke, dash, schraffur, breite = 1 }: { fill: string; stroke: string; dash?: boolean; schraffur?: number; breite?: number }) {
  const p = `leg${useId().replace(/[^a-zA-Z0-9]/g, "")}-`;
  return (
    <svg width="22" height="16" aria-hidden="true">
      <Muster idPrefix={p} massstab={0.4} />
      <rect x="1" y="1" width="20" height="14" fill={fill.replace("url(#", `url(#${p}`)} fillOpacity={schraffur != null ? 0.45 : 1} stroke={stroke} strokeWidth={breite} strokeDasharray={dash ? "3 2" : undefined} />
      {schraffur != null && richterSchraffur(schraffur) && <rect x="1" y="1" width="20" height="14" fill={`url(#${p}schraffur-${schraffur % RICHTER_FARBE.length})`} />}
    </svg>
  );
}

/**
 * Tiere ohne Platz je Käfiggröße (Nummer und Rasse, keine Aussteller); im Editor mit Knopf je Größe und „Alle fehlenden
 * Käfige einsetzen“.
 */
export function OhnePlatz({ plan, halle, masse, setzen }: { plan: Plan; halle: Halle; masse: KaefigMasse; setzen?: FehlendeSetzen }) {
  const gruppen = fehlendeKaefige(plan.nichtPlatziert, masse, halle);
  return (
    <div className="flex flex-col gap-3">
      {setzen && gruppen.some((g) => g.einsetzen) && (
        <Knopf variante="primaer" className="w-full justify-start" onClick={() => setzen()}>
          <WzSymbol name="block" klein />
          Alle fehlenden Käfige einsetzen
        </Knopf>
      )}
      {gruppen.map((g) => (
        <div key={g.typ} className="flex flex-col gap-1.5">
          <div className="flex items-baseline justify-between gap-2 text-sm">
            <span className="font-semibold tabular-nums text-tinte">{kaefigAnzahl(g.anzahl, g.typ, masse)}</span>
            <span className="shrink-0 text-xs text-grau">
              {!g.einsetzen ? (kaefigMass(g.typ, masse) ? "kein Käfigblock" : "Käfigmaß fehlt") : g.einsetzen === "kaefigblock" ? anzahl(g.noetig, "Block", "Blöcke") : anzahl(g.noetig, "Voliere", "Volieren")}
            </span>
          </div>
          <p className="text-xs text-grau">{g.tiere.map((t) => (t.nr ? `Nr. ${t.nr} ${t.rasse}` : t.rasse)).join(", ")}</p>
          {setzen && g.einsetzen && (
            <Knopf className="w-full justify-start" onClick={() => setzen(g.typ)}>
              <WzSymbol name={g.einsetzen === "voliere" ? "voliere" : "block"} klein />
              {g.einsetzen === "voliere" ? "Voliere einsetzen" : "Käfigblock einsetzen"}
            </Knopf>
          )}
        </div>
      ))}
    </div>
  );
}

/** Übersicht: welche Sparte in welchen Reihen steht (gestellt wird streng in Katalogfolge, ohne Vorgaben je Sparte). */
export function SpartenReihen({ plan }: { plan: NonNullable<Daten["plan"]> }) {
  const zaehler = new Map<string, { anzahl: number; reihen: Set<number> }>();
  for (const r of plan.reihen)
    for (const k of r.kaefige) {
      const z = zaehler.get(k.sparte ?? "") ?? { anzahl: 0, reihen: new Set<number>() };
      z.anzahl++;
      z.reihen.add(r.nr);
      zaehler.set(k.sparte ?? "", z);
    }
  for (const k of [...plan.volieren, ...plan.nichtPlatziert, ...plan.objekte.flatMap((o) => (o.tier ? [o.tier] : []))]) {
    const z = zaehler.get(k.sparte ?? "") ?? { anzahl: 0, reihen: new Set<number>() };
    z.anzahl++;
    zaehler.set(k.sparte ?? "", z);
  }
  const sparten = [...zaehler.keys()].filter(Boolean);
  if (sparten.length === 0) return null;
  const bereich = (r: Set<number>) => {
    const l = [...r].sort((a, b) => a - b);
    return l.length ? (l.length === 1 ? `R${l[0]}` : `R${l[0]}–R${l.at(-1)}`) : "–";
  };
  return (
    <details className="tabellen-rahmen nicht-drucken group overflow-hidden rounded-xl border border-linie bg-weiss">
      <summary className="flex min-h-10 cursor-pointer items-center gap-2 px-4 py-2 text-sm font-semibold">
        Sparten in den Reihen
        <span className="font-normal text-grau">{sparten.length}</span>
      </summary>
      <div className="overflow-x-auto border-t border-linie">
      <table className="tabelle">
        <thead>
          <tr>
            <th scope="col">Sparte</th>
            <th scope="col" className="text-right">Tiere</th>
            <th scope="col">steht in</th>
          </tr>
        </thead>
        <tbody>
          {sparten.map((sp) => {
            const z = zaehler.get(sp)!;
            return (
              <tr key={sp}>
                <td className="font-semibold text-tinte">{sp}</td>
                <td className="text-right tabular-nums">{z.anzahl}</td>
                <td>{bereich(z.reihen)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>
    </details>
  );
}

export const EINTRAG_STATUS: Record<string, string> = { gemeldet: "gemeldet", katalogisiert: "im Katalog", eingeliefert: "eingeliefert", fehlt: "fehlt", ausgesetzt: "ausgegeben" };

/** Angaben zu einem angeklickten Käfig: Tier, Züchter, Preisrichter, Status, Bewertung und Preise. */
export function KaefigInfo({ schauId, id, schliessen }: { schauId: number; id: number; schliessen: () => void }) {
  const q = trpc.katalog.kaefigInfo.useQuery({ schauId, id });
  const d = q.data;
  return (
    <div role="dialog" aria-label="Angaben zum Käfig" className="nicht-drucken absolute right-3 top-3 z-10 w-80 max-w-[calc(100%-1.5rem)] rounded-lg border border-linie-stark bg-weiss p-4 shadow-xl">
      <div className="mb-3 flex items-center gap-2">
        <h3 className="font-sans text-base font-semibold">{d ? (d.nr ? `Käfig ${d.nr}` : "Käfig ohne Nummer") : "Käfig"}</h3>
        <Knopf variante="leise" className="ml-auto min-h-8 px-2" onClick={schliessen} aria-label="Angaben schließen">
          ×
        </Knopf>
      </div>
      {q.error ? (
        <Hinweis ton="fehler">{fehlerText(q.error)}</Hinweis>
      ) : !d ? (
        <Laden />
      ) : (
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
          <dt className="text-grau">Tier</dt>
          <dd className="font-semibold">{d.tier}</dd>
          <dt className="text-grau">Klasse</dt>
          <dd>
            {d.geschlecht} {d.alter}
            {d.art !== "einzeltier" ? ` (${MELDEART_LABEL[d.art as keyof typeof MELDEART_LABEL] ?? d.art})` : ""}
            {d.jugend ? ", Jugend" : ""}
          </dd>
          <dt className="text-grau">Sparte</dt>
          <dd>{d.sparte || "–"}</dd>
          {d.ringnummern && (
            <>
              <dt className="text-grau">Ring</dt>
              <dd>{d.ringnummern}</dd>
            </>
          )}
          <dt className="text-grau">Käfig</dt>
          <dd>
            {d.kaefig ?? "–"}
            {d.kaefigGewaehlt ? " (gewählt)" : ""}
          </dd>
          <dt className="text-grau">Züchter</dt>
          <dd>
            <Link to={`/schau/${schauId}/meldungen/${d.meldungId}`} className="font-semibold text-tinte no-underline hover:text-band">
              {d.zuechter.name}
            </Link>
            {[d.zuechter.ort, d.zuechter.verein].filter(Boolean).length > 0 && <span className="block text-grau">{[d.zuechter.ort, d.zuechter.verein].filter(Boolean).join(", ")}</span>}
            {d.zuechter.gesperrt && <span className="block text-kamm">Löschwunsch – nicht veröffentlichen</span>}
          </dd>
          <dt className="text-grau">Preisrichter</dt>
          <dd>{d.preisrichter ?? "noch nicht eingeteilt"}</dd>
          <dt className="text-grau">Status</dt>
          <dd>
            {d.meldungStatus === "offen" ? "Meldung offen" : (EINTRAG_STATUS[d.status] ?? d.status)}
            {d.verkauft ? ", verkauft" : ""}
          </dd>
          {d.bewertung && (
            <>
              <dt className="text-grau">Bewertung</dt>
              <dd>
                {d.bewertung}
                {d.bewertetVon ? ` (${d.bewertetVon})` : ""}
              </dd>
            </>
          )}
          {d.preise.length > 0 && (
            <>
              <dt className="text-grau">Preise</dt>
              <dd>{d.preise.join(", ")}</dd>
            </>
          )}
        </dl>
      )}
    </div>
  );
}

/**
 * Schalter „Automatisch planen“: an = die Software stellt die Käfige (und stellt sie bei Änderungen neu), aus = der Plan ist
 * festgeschrieben, nichts rückt von selbst. Ohne `umschalten` nur die Anzeige.
 */
export function AutomatikSchalter({ an, umschalten, festAm }: { an: boolean; umschalten?: () => void; festAm: string | null }) {
  return (
    <label className={`inline-flex items-center gap-2 ${umschalten ? "cursor-pointer" : ""}`}>
      <input type="checkbox" role="switch" aria-label="Automatisch planen" checked={an} disabled={!umschalten} onChange={() => umschalten?.()} className="peer sr-only" />
      <span
        aria-hidden
        className="relative h-5 w-9 shrink-0 rounded-full bg-feldrand transition-colors after:absolute after:left-0.5 after:top-0.5 after:size-4 after:rounded-full after:bg-weiss after:shadow-sm after:transition-transform peer-checked:bg-band peer-checked:after:translate-x-4 peer-focus-visible:ring-2 peer-focus-visible:ring-band/40 peer-focus-visible:ring-offset-1 peer-disabled:opacity-60"
      />
      <span>
        Automatisch planen: <span className="font-semibold text-tinte">{an ? "an" : "aus"}</span>
        {!an && festAm && <span className="text-grau"> · fest seit {festAm}</span>}
      </span>
    </label>
  );
}
