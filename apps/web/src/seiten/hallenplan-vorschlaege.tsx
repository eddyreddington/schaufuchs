/**
 * Stellvorschläge: dieselbe Halle in allen möglichen Aufstellungen, je mit Skizze (`HallenSkizze`).
 */
import { type Halle, type HallenFlaeche, halleSchluessel } from "@schau/domain";
import { useEffect, useId, useState } from "react";
import { fehlerText } from "../lib";
import { trpc } from "../trpc";
import { Abschnitt, FehlerAnzeige, Haken, Hinweis, Knopf, Laden, Leer, Marke, useFrage, useMeldung } from "../ui";
import { PlanBild } from "./hallenplan-bild";
import { anzahl, BAU, type Daten, meter, zeichenSystem } from "./hallenplan-geometrie";

/**
 * Stellvorschläge: dieselbe Halle in anderen Aufstellungen (Reihen quer oder längs, Wandreihen, bündig an Wänden, Lage des
 * Hauptgangs), mit Eingängen, Flächen und eingesetzten Teilen durchgerechnet; ein Vorschlag lässt sich übernehmen.
 */
export function StellVorschlaege({
  schauId,
  d,
  entwurf,
  basis,
  schliessen,
  eingebettet = false,
  schmal = false,
}: {
  schauId: number;
  d: Daten;
  /** Noch nicht gespeicherte Halle (geführter Ablauf); dann gilt `basis`: der gespeicherte Stand beim Öffnen. */
  entwurf?: Halle;
  basis?: string;
  schliessen: () => void;
  eingebettet?: boolean;
  /** In der Schublade des Editors: höchstens zwei Spalten. */
  schmal?: boolean;
}) {
  const gespeichert = trpc.katalog.stellVorschlaege.useQuery({ schauId }, { enabled: !entwurf });
  // Entwurf als POST (viele Teile sprengen sonst die Länge der Adresse); neu, sobald sich der Entwurf ändert.
  const ent = trpc.katalog.stellVorschlaegeEntwurf.useMutation();
  const entwurfText = entwurf ? JSON.stringify(entwurf) : "";
  useEffect(() => {
    if (entwurf) ent.mutate({ schauId, entwurf });
  }, [entwurfText]); // eslint-disable-line react-hooks/exhaustive-deps
  const q = entwurf
    ? { data: ent.data, error: ent.error, isFetching: ent.isPending, refetch: () => entwurf && ent.mutate({ schauId, entwurf }) }
    : gespeichert;
  const [konflikt, setKonflikt] = useState(false);
  const [nurAlle, setNurAlle] = useState(false);
  // Gespeicherte Halle inzwischen geändert (Editor, Formular, Käfige): neu rechnen lassen.
  const stand = halleSchluessel(d.halle ?? null);
  const veraltet = !entwurf && !!gespeichert.data && gespeichert.data.basis !== stand;
  useEffect(() => {
    if (veraltet && !gespeichert.isFetching) void gespeichert.refetch();
  }, [veraltet, stand]); // eslint-disable-line react-hooks/exhaustive-deps
  const utils = trpc.useUtils();
  const meldung = useMeldung();
  const { bestaetige } = useFrage();
  // Übernehmen heißt neu setzen (Einstellungen und neue Aufstellung in einem Schritt); Abschluss (neu laden, Meldung,
  // schließen) danach – siehe Knopf „Übernehmen“.
  const uebernehmen = trpc.katalog.planNeuSetzen.useMutation({
    onError: async (e) => {
      meldung(fehlerText(e), "fehler");
      if (e.data?.code === "CONFLICT" || /inzwischen/.test(e.message)) setKonflikt(true);
      // Abgelehnt, weil die Halle inzwischen geändert wurde: Plan und Vorschläge neu laden.
      await Promise.all([utils.katalog.hallenplan.invalidate(), utils.katalog.stellVorschlaege.invalidate()]);
    },
  });
  const fest = !!d.plan?.fest;
  const richterIndex = new Map(d.richter.map((r, i) => [r.id, i]));
  const karte = (v: NonNullable<typeof q.data>["aktuell"], aktuell: boolean) => (
    <div key={v.titel + String(aktuell)} className={`flex flex-col gap-2 rounded-lg border border-linie p-3 ${aktuell ? "bg-papier" : "bg-weiss"}`}>
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
        <div className="min-w-0">
          <p className="font-semibold leading-snug">{aktuell ? (entwurf ? "Mit Ihren Einstellungen" : "So wie jetzt") : v.titel}</p>
          {aktuell && <p className="text-sm text-grau">{v.titel}</p>}
        </div>
        {v.nichtPlatziert === 0 ? <Marke ton="ok">Alle haben Platz</Marke> : <Marke ton="fehler">{v.nichtPlatziert} ohne Platz</Marke>}
      </div>
      <p className="text-sm tabular-nums text-grau">
        {v.freiePlatten} Grundplatten frei · {v.reihen} Reihen mit Käfigen
      </p>
      {v.hinweise.length > 0 && <p className="text-sm text-kamm">{v.hinweise.join(" ")}</p>}
      <div>
        <PlanBild klein halle={v.halle} plan={v.plan} richterIndex={richterIndex} bearbeiten={false} auswahl={[]} waehlen={() => {}} aendern={(f) => f(v.halle)} />
      </div>
      {(!aktuell || entwurf) && (
        <Knopf
          className="self-start"
          variante="primaer"
          disabled={veraltet}
          laedt={uebernehmen.isPending}
          onClick={async () => {
            if (
              !(await bestaetige(
                fest
                  ? { titel: "Plan neu setzen und übernehmen?", text: "Alle Käfige werden in dieser Aufstellung neu aufgestellt.", knopf: "Neu setzen und übernehmen", gefahr: true }
                  : { titel: "Diese Aufstellung übernehmen?", text: "Verschobenes und eingesetzte Teile fallen weg.", knopf: "Übernehmen" },
              ))
            )
              return;
            try {
              await uebernehmen.mutateAsync({ schauId, basis: entwurf ? (basis ?? q.data!.basis) : q.data!.basis, halle: v.halle, grund: "Stellvorschlag übernommen" });
            } catch {
              return;
            } finally {
              await Promise.all([utils.katalog.hallenplan.invalidate(), utils.katalog.stellVorschlaege.invalidate()]);
            }
            meldung("Aufstellung übernommen.");
            schliessen();
          }}
        >
          Übernehmen
        </Knopf>
      )}
    </div>
  );
  const inhalt = (
    <>
      {konflikt && entwurf && (
        <Hinweis ton="fehler" className="mb-3">
          Halle inzwischen anderswo gespeichert – bitte neu öffnen.
        </Hinweis>
      )}
      {veraltet && <Hinweis className="mb-3">Halle geändert – Vorschläge werden neu gerechnet …</Hinweis>}
      {q.error ? (
        <FehlerAnzeige fehler={q.error} nochmal={() => q.refetch()} />
      ) : !q.data ? (
        <Laden />
      ) : (
        <>
          {q.data.vorschlaege.length === 0 && (
            <div className="mb-3">
              <Leer titel="Keine andere Aufstellung möglich" />
            </div>
          )}
          {q.data.vorschlaege.length > 0 && (
            <div className="mb-3 flex flex-wrap items-center justify-between gap-x-6 gap-y-2 text-sm">
              <p className="tabular-nums text-grau">
                <span className="font-semibold text-tinte">{anzahl(q.data.vorschlaege.length, "Aufstellung", "Aufstellungen")}</span> · {q.data.vorschlaege.filter((v) => v.nichtPlatziert === 0).length} mit Platz für alle
              </p>
              <Haken label="Nur mit Platz für alle" checked={nurAlle} onChange={setNurAlle} />
            </div>
          )}
          <div className={`grid gap-4 ${schmal ? "sm:grid-cols-2" : "md:grid-cols-2 xl:grid-cols-3"}`}>
            {(entwurf || q.data.vorschlaege.length > 0) && karte(q.data.aktuell, true)}
            {q.data.vorschlaege.filter((v) => !nurAlle || v.nichtPlatziert === 0).map((v) => karte(v, false))}
          </div>
        </>
      )}
    </>
  );
  if (eingebettet) return inhalt;
  return (
    <Abschnitt titel="Stellvorschläge" className="nicht-drucken" aktionen={<Knopf variante="leise" onClick={schliessen}>Schließen</Knopf>}>
      {inhalt}
    </Abschnitt>
  );
}

/** Skizze der Halle für „Halle einrichten“: Umriss mit Metern, Eingänge dunkel, Freiflächen schraffiert, Volierenbereich grün. */
export function HallenSkizze({ breite, laenge, flaechen }: { breite: number; laenge: number; flaechen: HallenFlaeche[] }) {
  const muster = useId().replace(/:/g, "");
  if (!(breite > 0 && laenge > 0)) return <div />;
  const zs = zeichenSystem(breite, laenge);
  const rand = Math.max(zs.W, zs.H) * 0.06;
  const schrift = Math.max(zs.W, zs.H) * 0.03;
  return (
    <figure className="immer-hell rounded-md border border-linie bg-weiss p-2">
      <svg viewBox={`${-rand} ${-rand} ${zs.W + 2 * rand} ${zs.H + 2 * rand}`} className="h-auto w-full" role="img" aria-label="Skizze der Halle">
        <defs>
          <pattern id={`${muster}-frei`} width={schrift} height={schrift} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2={schrift} stroke={BAU.platte.stroke} strokeWidth={schrift * 0.15} />
          </pattern>
        </defs>
        <rect x={0} y={0} width={zs.W} height={zs.H} fill="#fbfaf7" stroke="#2b2b2b" strokeWidth={rand * 0.12} />
        {flaechen.map((f, i) => {
          const q = zs.zuZeichnung(f);
          const fuell = f.art === "eingang" ? "#1f2a44" : f.art === "volieren" ? "#e3f1e7" : `url(#${muster}-frei)`;
          return (
            <g key={i}>
              <rect x={q.x} y={q.y} width={q.b} height={q.h} fill={fuell} stroke={f.art === "volieren" ? "#3c8a55" : "#555"} strokeWidth={rand * 0.05} strokeDasharray={f.art === "volieren" ? `${schrift * 0.4} ${schrift * 0.3}` : undefined} />
              <text x={q.x + q.b / 2} y={f.art === "eingang" ? (q.y < zs.H / 2 ? q.y + q.h + schrift * 1.1 : q.y - schrift * 0.4) : q.y + q.h / 2} fontSize={schrift} textAnchor="middle" dominantBaseline="middle" fill="#2b2b2b">
                {f.name}
              </text>
            </g>
          );
        })}
        <text x={zs.W / 2} y={-rand * 0.35} fontSize={schrift} textAnchor="middle" fill="#555">{meter(zs.W)} m</text>
        <text x={-rand * 0.35} y={zs.H / 2} fontSize={schrift} textAnchor="middle" fill="#555" transform={`rotate(-90 ${-rand * 0.35} ${zs.H / 2})`}>{meter(zs.H)} m</text>
      </svg>
    </figure>
  );
}

/** `gueltig: false` – die Zahlenfelder sind (noch) unvollständig; die Skizze zeigt Ersatzwerte, gezogen wird dann nicht. */
