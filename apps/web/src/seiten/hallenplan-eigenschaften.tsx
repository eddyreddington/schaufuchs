/**
 * Eigenschaften im Hallenplan: rechte Leiste zur Auswahl (`Eigenschaften`) und die Einstellungen der Halle
 * (`HalleEigenschaften`) mit ihren Eingabefeldern.
 */
import { type Punkt, type Halle, type HallenFlaeche, type NummerFolge, type HallenObjekt, HAUPTGANG_STANDARD, istMoebel, kaefigeJePlatte, kaefigMass, type KaefigMasse, type KaefigTyp, LOCALE, moebelMass, type OberflaecheTexte, type WandSeite } from "@schau/domain";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { useOberflaeche, useSprache } from "../sprache";
import { Auswahl, Eingabe, Feld, Haken, Knopf, Marke } from "../ui";
import { WzSymbol } from "./hallenplan-werkzeuge";
import { type Aendern, type Aktionen, BLOCK_TYPEN, type FehlendeSetzen, HAUPTGANG_LAGE, meter, type Plan, teilInfo, type TeilInfo, type Versetzen, wandText, type Ziel, zweisprachig } from "./hallenplan-geometrie";
import { AutomatikSchalter, OhnePlatz } from "./hallenplan-teile";
import { GrundrissKnopf } from "./hallenplan-grundriss";
import { NummerFolgeEinstellung } from "./hallenplan-nummerfolge";
import { type AussehenAendern, AussehenEinstellung } from "./hallenplan-aussehen";
import { enterUebernimmt, MeterFeld, MitEinheit } from "./hallenplan-meterfeld";
import { kaefigNameIn } from "./kaefige";

export { MitEinheit };

/**
 * Eigenschaften der Auswahl: was gewählt ist, Belegung, Lage, Größe, Drehung und die passenden Aktionen. `kompakt`: als
 * feste Zeile über dem Plan (Tablet und schmaler), sonst als Spalte rechts daneben (ab 1024 px).
 */
export function Eigenschaften({
  kompakt,
  halle,
  plan,
  masse,
  auswahl,
  a,
  aendern,
  mehrfach,
  zeichnen,
  zeichnenAus,
  angaben,
  versetzen,
  hallePanel,
  halleOeffnen,
  detailsOeffnen,
  imDialog,
}: {
  /** Schmale Ansicht: Werte einer Fläche bzw. Tiere einer Platte im Dialog. */
  detailsOeffnen?: () => void;
  /** Im Dialog (schmale Ansicht): die volle Spalte ohne eigene Breite. */
  imDialog?: boolean;
  kompakt?: boolean;
  halle: Halle;
  plan: Plan;
  masse: KaefigMasse;
  auswahl: Ziel[];
  a: Aktionen;
  aendern: Aendern;
  mehrfach: boolean;
  /** Werkzeug „Fläche aufziehen“ läuft. */
  zeichnen: HallenFlaeche["art"] | null;
  zeichnenAus: () => void;
  /** Angaben zu einem Tier (Züchter, Bewertung …) öffnen. */
  angaben: (id: number) => void;
  /** Tier versetzen (Ziel danach im Plan anklicken); fehlt: nicht erlaubt. */
  versetzen?: (t: Versetzen) => void;
  /** Einstellungen der Halle (wenn nichts gewählt ist). */
  hallePanel: ReactNode;
  /** Schmale Ansicht: Einstellungen der Halle im Dialog. */
  halleOeffnen: () => void;
}) {
  const t = useOberflaeche();
  const te = t.halle.eigenschaften;
  const infos = auswahl.map((z) => teilInfo(halle, plan, masse, z)).filter((x): x is TeilInfo => !!x);
  const eins = auswahl.length === 1 ? (infos[0] ?? null) : null;
  const knopf = (symbol: Parameters<typeof WzSymbol>[0]["name"], text: string, tun: () => void, opt: { kuerzel?: string; gefahr?: boolean; disabled?: boolean } = {}) => (
    <Knopf variante={opt.gefahr ? "gefahr" : "zweit"} className={kompakt ? "shrink-0 px-3" : "w-full justify-start"} disabled={opt.disabled} onClick={tun} aria-keyshortcuts={opt.kuerzel}>
      <WzSymbol name={symbol} klein />
      <span className={kompakt ? "" : "flex-1 text-left"}>{text}</span>
      {opt.kuerzel && !kompakt && <kbd className="rounded border border-linie px-1 font-mono text-xs font-normal text-grau">{opt.kuerzel}</kbd>}
    </Knopf>
  );
  const knoepfe =
    auswahl.length > 1 ? (
      <>
        {knopf("raster", te.amRaster, a.ausrichten, { kuerzel: "A" })}
        {knopf("entfernen", te.leeresEntfernen, a.entfernen, { kuerzel: te.tasteEntf, gefahr: true })}
        {knopf("auswahl", te.auswahlAufheben, a.aufheben, { kuerzel: "Esc" })}
      </>
    ) : eins ? (
      <>
        {knopf("drehen", te.drehen, a.drehen, { kuerzel: "R", disabled: !a.dreht })}
        {a.zurueck && knopf("zurueck", te.anPlatzZurueck, a.zurueckAnPlatz)}
        {a.einzelreihe?.seiten.map((seite) => (
          <div key={seite} className="contents">
            {knopf("einpassen", a.einzelreihe!.text(seite), () => a.einzelreihe!.stellen(seite))}
          </div>
        ))}
        {knopf("entfernen", t.allgemein.entfernen, a.entfernen, { kuerzel: te.tasteEntf, gefahr: true, disabled: !eins.leer })}
      </>
    ) : null;
  const flaeche = eins?.flaeche != null ? halle.flaechen[eins.flaeche] : null;
  const zeichnenText = zeichnen && (zeichnen === "eingang" ? te.eingangAufziehen : zeichnen === "volieren" ? te.volierenAufziehen : te.freiAufziehen);
  if (kompakt && zeichnen)
    return (
      <div className="nicht-drucken flex h-14 shrink-0 items-center gap-3 overflow-hidden whitespace-nowrap border-b border-linie bg-papier px-3 lg:hidden" aria-live="polite">
        <span className="truncate font-semibold">{zeichnenText}</span>
        <Knopf className="ml-auto shrink-0 px-3" onClick={zeichnenAus}>
          {t.allgemein.abbrechen}
        </Knopf>
      </div>
    );
  if (kompakt)
    return (
      <div className="nicht-drucken flex h-14 shrink-0 items-center gap-3 overflow-hidden whitespace-nowrap border-b border-linie bg-papier px-3 lg:hidden" aria-live="polite">
        {auswahl.length === 0 ? (
          mehrfach ? (
            <span className="truncate font-semibold">{te.mehrfachauswahl}</span>
          ) : (
            <>
              <span className="truncate font-semibold">{te.halleMasse(meter(halle.breite), meter(halle.laenge))}</span>
              <Knopf className="ml-auto shrink-0 px-3" onClick={halleOeffnen}>
                {te.einstellungenHalle}
              </Knopf>
            </>
          )
        ) : auswahl.length > 1 ? (
          <>
            <span className="shrink-0 font-semibold">{te.teileGewaehlt(auswahl.length)}</span>
            <span className="min-w-0 flex-1 truncate text-sm text-grau">{infos.map((i) => i.name).join(", ")}</span>
          </>
        ) : eins ? (
          <>
            <span className="min-w-0 shrink truncate font-semibold">{eins.name}</span>
            <Marke ton={eins.leer ? "ok" : "neutral"}>{eins.status}</Marke>
            {flaeche && eins.flaeche != null && <NameFeld key={`f${eins.flaeche}`} i={eins.flaeche} name={flaeche.name} aendern={aendern} />}
            <span className="min-w-0 flex-1 truncate text-sm text-grau">
              {/* Zeilen aus teilInfo (hallenplan-geometrie.ts) – beschriftet in der Sprache der Oberfläche */}
              {eins.zeilen.find(([k]) => k === t.halleBild.geometrie.kaefigeZeile || k === t.halleBild.geometrie.kaefig || k === t.halleBild.geometrie.nummern)?.[1]}
            </span>
            {detailsOeffnen && (eins.flaeche != null || (eins.tiere?.length ?? 0) > 0) && (
              <Knopf className="shrink-0 px-3" onClick={detailsOeffnen}>
                {t.halle.eigenschaftenTitel}
              </Knopf>
            )}
          </>
        ) : (
          <span className="flex-1" />
        )}
        {knoepfe && <span className="ml-auto flex shrink-0 gap-2">{knoepfe}</span>}
      </div>
    );
  return (
    <aside className={imDialog ? "flex flex-col gap-4" : "nicht-drucken hidden w-72 shrink-0 flex-col gap-4 self-start p-4 lg:sticky lg:top-14 lg:flex"} aria-label={te.eigenschaftenAuswahl} aria-live="polite">
      {zeichnen ? (
        <>
          <PanelKopf ueber={te.einsetzen} titel={zeichnenText || ""} />
          <Knopf onClick={zeichnenAus}>{t.allgemein.abbrechen}</Knopf>
        </>
      ) : auswahl.length === 0 ? (
        mehrfach ? (
          <PanelKopf ueber={te.auswahl} titel={te.mehrfachauswahl} />
        ) : (
          hallePanel
        )
      ) : auswahl.length > 1 ? (
        <>
          <PanelKopf ueber={te.auswahl} titel={te.teileGewaehlt(auswahl.length)} />
          <ul className="flex max-h-48 flex-col gap-1 overflow-auto text-sm">
            {infos.map((i, n) => (
              <li key={n} className="flex items-center justify-between gap-2">
                <span className="truncate">{i.name}</span>
                <Marke ton={i.leer ? "ok" : "neutral"}>{i.leer ? te.leer : te.belegt}</Marke>
              </li>
            ))}
          </ul>
          <div className="flex flex-col gap-2">{knoepfe}</div>
        </>
      ) : eins ? (
        <>
          <PanelKopf ueber={eins.art} titel={eins.name} marke={<Marke ton={eins.leer ? "ok" : "neutral"}>{eins.status}</Marke>} />
          {flaeche && eins.flaeche != null ? (
            <FlaecheFelder key={`f${eins.flaeche}`} halle={halle} i={eins.flaeche} aendern={aendern} />
          ) : eins.moebel ? (
            <MoebelFelder key={`m${eins.moebel}`} halle={halle} id={eins.moebel} aendern={aendern} zeilen={eins.zeilen} />
          ) : (
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
              {eins.zeilen.map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="text-grau">{k}</dt>
                  <dd className="tabular-nums">{v}</dd>
                </div>
              ))}
            </dl>
          )}
          <div className="flex flex-col gap-2">{knoepfe}</div>
          {eins.tiere && eins.tiere.length > 0 && (
            <div className="flex flex-col gap-2 border-t border-linie pt-4">
              <Gruppenkopf>{t.allgemein.tiere}</Gruppenkopf>
              <ul className="flex max-h-56 flex-col gap-1 overflow-auto text-sm">
                {eins.tiere.map((x) => (
                  <li key={x.id} className="flex items-center justify-between gap-2">
                    <span className="truncate">
                      {x.nr ? `${t.halle.nr(x.nr)} ` : ""}
                      {x.rasse}
                    </span>
                    <span className="flex shrink-0 gap-3">
                      {versetzen && x.typ !== "voliere" && (
                        <button type="button" className="font-semibold text-band hover:underline" onClick={() => versetzen({ tierId: x.id, nr: x.nr, rasse: x.rasse, typ: x.typ as KaefigTyp })}>
                          {te.versetzen}
                        </button>
                      )}
                      <button type="button" className="font-semibold text-band hover:underline" onClick={() => angaben(x.id)}>
                        {te.angaben}
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      ) : (
        hallePanel
      )}
    </aside>
  );
}

/** Kleine Überschrift einer Gruppe in der Eigenschaften-Spalte. */
export function Gruppenkopf({ children }: { children: ReactNode }) {
  return <div className="text-xs font-semibold uppercase tracking-wide text-grau">{children}</div>;
}

/** Kopf der Eigenschaften-Spalte: Art klein darüber, Name, optional der Zustand als Marke. */
export function PanelKopf({ ueber, titel, marke, className = "" }: { ueber: string; titel: string; marke?: ReactNode; className?: string }) {
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <Gruppenkopf>{ueber}</Gruppenkopf>
      <h3 className="font-sans text-base font-semibold leading-snug">{titel}</h3>
      {marke && <div>{marke}</div>}
    </div>
  );
}

/** Ein gewählter Tisch, Pokaltisch, eine Bank oder Garnitur: Maße (Länge, Tiefe, bei der Garnitur die Tiefe der Bänke), dazu die Lage. */
export function MoebelFelder({ halle, id, aendern, zeilen }: { halle: Halle; id: string; aendern: Aendern; zeilen: [string, string][] }) {
  const t = useOberflaeche();
  const o = (halle.objekte ?? []).find((x) => x.id === id);
  if (!o || !istMoebel(o)) return null;
  const m = moebelMass(o);
  const setze = (patch: Partial<HallenObjekt>) => {
    aendern((h) => ({ ...h, objekte: (h.objekte ?? []).map((x) => (x.id === id ? { ...x, ...patch } : x)) }), zweisprachig((x) => x.halle.eigenschaften.aendern(x.fach.MOEBEL_NAME[o.art])));
  };
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-x-2 gap-y-3">
        <MeterFeld label={t.halle.laenge} cm={m.laenge} min={30} max={2000} setzen={(v) => setze({ laenge: v })} />
        <MeterFeld label={o.art === "garnitur" ? t.halle.eigenschaften.tiefeTisch : t.halle.tiefe} cm={m.tiefe} min={10} max={500} setzen={(v) => setze({ tiefe: v })} />
        {o.art === "garnitur" && <MeterFeld label={t.halle.eigenschaften.tiefeBank} cm={m.bankTiefe} min={10} max={200} setzen={(v) => setze({ bankTiefe: v })} />}
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
        {zeilen.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-grau">{k}</dt>
            <dd className="tabular-nums">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** Eine gewählte Fläche: Name, Art, Lage und Größe (wie in der Zeichnung: von links und von oben). */
export function FlaecheFelder({ halle, i, aendern }: { halle: Halle; i: number; aendern: Aendern }) {
  const t = useOberflaeche().halle;
  const te = t.eigenschaften;
  const f = halle.flaechen[i];
  if (!f) return null;
  const quer = halle.laenge > halle.breite;
  const g = quer ? { x: f.y, y: f.x, b: f.tiefe, h: f.breite } : { x: f.x, y: f.y, b: f.breite, h: f.tiefe };
  const setzeG = (patch: Partial<typeof g>) => {
    const n = { ...g, ...patch };
    const neu = quer ? { x: n.y, y: n.x, breite: n.h, tiefe: n.b } : { x: n.x, y: n.y, breite: n.b, tiefe: n.h };
    aendern((h) => ({ ...h, flaechen: h.flaechen.map((x, j) => (j === i ? { ...x, ...neu } : x)) }), zweisprachig((x) => x.halle.eigenschaften.flaecheAendern));
  };
  return (
    <div className="flex flex-col gap-3">
      <NameFeld i={i} name={f.name} aendern={aendern} breit />
      <Feld label={te.art}>
        {(id) => (
          <Auswahl id={id} value={f.art} onChange={(e) => aendern((h) => ({ ...h, flaechen: h.flaechen.map((x, j) => (j === i ? { ...x, art: e.target.value as HallenFlaeche["art"] } : x)) }), zweisprachig((x) => x.halle.eigenschaften.flaecheAendern))}>
            <option value="eingang">{te.eingangAusgang}</option>
            <option value="sperre">{te.freierBereich}</option>
            <option value="volieren">{te.volierenbereich}</option>
          </Auswahl>
        )}
      </Feld>
      <div className="grid grid-cols-2 gap-x-2 gap-y-3">
        <MeterFeld label={te.vonLinks} cm={g.x} min={0} setzen={(v) => setzeG({ x: v })} />
        <MeterFeld label={te.vonOben} cm={g.y} min={0} setzen={(v) => setzeG({ y: v })} />
        <MeterFeld label={t.breite} cm={g.b} min={20} setzen={(v) => setzeG({ b: v })} />
        <MeterFeld label={t.hoehe} cm={g.h} min={20} setzen={(v) => setzeG({ h: v })} />
      </div>
    </div>
  );
}

/**
 * Einstellungen der Halle im Editor (wenn nichts gewählt ist): Maße, Gänge, Reihen, Grundplatten, Stellvorschläge und
 * Schalter „Automatisch planen“. Jede Änderung wirkt sofort: bei „an“ wird der Plan neu gesetzt, bei „aus“ bleiben die Käfige.
 */
export function HalleEigenschaften({
  halle,
  plan,
  masse,
  platziert,
  aendernHalle,
  grundriss,
  automatik,
  setzen,
  vorschlaege,
  nummerFolgeSetzen,
  aussehenAendern,
}: {
  halle: Halle;
  plan: Plan;
  masse: KaefigMasse;
  platziert: number;
  aendernHalle: (patch: Partial<Halle>, was: (t: OberflaecheTexte) => string) => Promise<boolean>;
  /** Grundriss bearbeiten (Entscheidung 019); fehlt, wenn die Halle nicht geändert werden darf. */
  grundriss?: (roh: Punkt[], basis: string) => Promise<boolean>;
  automatik?: () => void;
  setzen?: FehlendeSetzen;
  vorschlaege: () => void;
  /** Einstellung „Nach Plan nummerieren“ speichern (ohne den Plan neu zu setzen); fehlt: nur ansehen. */
  nummerFolgeSetzen?: (f: NummerFolge | undefined) => void;
  /** Aussehen in 3D ändern und speichern (ändert nie den Plan); fehlt: nur ansehen. */
  aussehenAendern?: AussehenAendern;
}) {
  const t = useOberflaeche();
  const te = t.halle.eigenschaften;
  const sprache = useSprache();
  const richtung = halle.richtung ?? "quer";
  const hg = halle.hauptgang ?? HAUPTGANG_STANDARD;
  const gruppe = "flex flex-col gap-3 border-t border-linie pt-4";
  return (
    <div className="flex flex-col gap-4">
      {/* Im Dialog „Halle“ (Tablet) steht der Titel schon im Dialog. */}
      <PanelKopf ueber={te.nichtsGewaehlt} titel={te.halle} className="[dialog_&]:hidden" />
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <Gruppenkopf>{te.platz}</Gruppenkopf>
          {plan.nichtPlatziert.length > 0 && <Marke ton="fehler">{te.ohnePlatz(plan.nichtPlatziert.length)}</Marke>}
        </div>
        {plan.nichtPlatziert.length === 0 ? <span className="text-sm tabular-nums">{te.alleHabenPlatz(platziert)}</span> : <OhnePlatz plan={plan} halle={halle} masse={masse} setzen={setzen} />}
      </div>
      <div className={gruppe}>
        <Gruppenkopf>{te.masse}</Gruppenkopf>
        {halle.umriss ? (
          // Freier Grundriss: Breite und Länge ergeben sich aus den Wänden.
          <span className="text-sm tabular-nums">{te.freierGrundriss(meter(halle.breite), meter(halle.laenge))}</span>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <MeterFeld label={t.halle.breite} cm={halle.breite} min={300} setzen={(v) => aendernHalle({ breite: v }, (x) => x.halle.breite)} />
            <MeterFeld label={t.halle.laenge} cm={halle.laenge} min={300} setzen={(v) => aendernHalle({ laenge: v }, (x) => x.halle.laenge)} />
          </div>
        )}
        {grundriss && <GrundrissKnopf halle={halle} masse={masse} uebernehmen={grundriss} />}
      </div>
      <div className={gruppe}>
        <Gruppenkopf>{te.gaenge}</Gruppenkopf>
        <div className="grid grid-cols-2 gap-2">
          <MeterFeld label={t.halle.gangMindestens} cm={halle.gang} min={50} max={1000} setzen={(v) => aendernHalle({ gang: v }, (x) => x.halle.eigenschaften.gangbreite)} />
          {hg.lage !== "keiner" && <MeterFeld label={te.hauptgang} cm={hg.breite} min={50} max={2000} setzen={(v) => aendernHalle({ hauptgang: { ...hg, breite: v } }, (x) => x.halle.eigenschaften.hauptgang)} />}
        </div>
        <Feld label={te.lageHauptgang}>
          {(id) => (
            <Auswahl
              id={id}
              value={hg.lage}
              onChange={(e) => {
                const lage = e.target.value as typeof hg.lage;
                void aendernHalle({ hauptgang: { lage, breite: lage === "keiner" ? 0 : hg.breite || HAUPTGANG_STANDARD.breite } }, (x) => x.halle.eigenschaften.hauptgang);
              }}
            >
              {(["anfang", "ende", "beide", "mitte", "keiner"] as const).map((l) => (
                <option key={l} value={l}>
                  {HAUPTGANG_LAGE[richtung][l]}
                </option>
              ))}
            </Auswahl>
          )}
        </Feld>
      </div>
      <div className={gruppe}>
        <Gruppenkopf>{te.reihen}</Gruppenkopf>
        <div className="flex gap-0.5 rounded-md border border-linie-stark bg-papier p-0.5" role="radiogroup" aria-label={te.reihenLaufen}>
          {(["quer", "laengs"] as const).map((x) => (
            <button
              key={x}
              type="button"
              role="radio"
              aria-checked={richtung === x}
              className={`min-h-8 flex-1 rounded text-sm ${richtung === x ? "bg-weiss font-semibold text-tinte shadow-sm" : "text-grau hover:text-tinte"}`}
              onClick={() => richtung !== x && void aendernHalle({ richtung: x }, (y) => y.halle.eigenschaften.reihenrichtung)}
            >
              {x === "quer" ? te.quer : te.laengs}
            </button>
          ))}
        </div>
        <Feld label={te.einzelreihen}>
          {(id) => (
            <Auswahl
              id={id}
              value={!halle.wandreihen ? "keine" : (halle.wandreiheSeite ?? "beide")}
              onChange={(e) => {
                const w = e.target.value;
                void aendernHalle(w === "keine" ? { wandreihen: false, wandreiheSeite: undefined } : { wandreihen: true, wandreiheSeite: w === "beide" ? undefined : (w as WandSeite) }, (x) => x.halle.eigenschaften.wandreihen);
              }}
            >
              <option value="beide">{te.anBeidenWaenden}</option>
              <option value="anfang">{te.nur(wandText(halle, "anfang"))}</option>
              <option value="ende">{te.nur(wandText(halle, "ende"))}</option>
              <option value="keine">{te.keine}</option>
            </Auswahl>
          )}
        </Feld>
        <Haken label={te.buendig} checked={halle.wandBuendig ?? true} onChange={(v) => void aendernHalle({ wandBuendig: v }, (x) => x.halle.eigenschaften.buendigKurz)} />
      </div>
      <NummerFolgeEinstellung folge={halle.nummerFolge} reihen={plan.reihen.map((r) => r.nr)} setzen={nummerFolgeSetzen} />
      <AussehenEinstellung aussehen={halle.aussehen} aendern={aussehenAendern} />
      <details className="border-t border-linie pt-4">
        <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-grau hover:text-tinte">{te.grundplattenJeArt}</summary>
        <div className="mt-3 grid grid-cols-2 gap-x-2 gap-y-3">
          {BLOCK_TYPEN.map((k) => {
            const mass = kaefigMass(k, masse);
            const vorgabe = mass ? kaefigeJePlatte(k, mass.breite, { platte: halle.platte, plattenMass: halle.plattenMass }) : null;
            return <JePlatteFeld key={k} label={kaefigNameIn(t, k, masse)} wert={halle.jePlatte?.[k]} vorgabe={vorgabe} setzen={(v) => aendernHalle({ jePlatte: { ...(halle.jePlatte ?? {}), [k]: v } }, (x) => x.halle.kaefigeJePlatte)} />;
          })}
        </div>
      </details>
      <div className={gruppe}>
        <Gruppenkopf>{te.aufstellung}</Gruppenkopf>
        <Knopf className="w-full justify-start" onClick={vorschlaege}>
          <WzSymbol name="vorschlaege" klein />
          {te.stellvorschlaegeAnsehen}
        </Knopf>
      </div>
      <div className="flex flex-col gap-2 border-t border-linie pt-4 text-sm">
        <div className="flex items-center justify-between gap-2">
          <Gruppenkopf>{te.plan}</Gruppenkopf>
        </div>
        <AutomatikSchalter an={!plan.fest} umschalten={automatik} festAm={plan.fest ? new Date(plan.fest.am).toLocaleDateString(LOCALE[sprache]) : null} />
      </div>
    </div>
  );
}

/** Käfige je Grundplatte für eine Käfigart; leer = Vorgabe (grau im Feld). */
export function JePlatteFeld({ label, wert, vorgabe, setzen }: { label: string; wert: number | undefined; vorgabe: number | null; setzen: (v: number | undefined) => Promise<boolean> }) {
  const te = useOberflaeche().halle.eigenschaften;
  const [text, setText] = useState(wert ? String(wert) : "");
  useEffect(() => setText(wert ? String(wert) : ""), [wert]);
  const laeuft = useRef(false);
  const textRef = useRef(text);
  textRef.current = text;
  const uebernehmen = async () => {
    if (laeuft.current) return;
    const t = textRef.current;
    const n = t.trim() ? Math.round(Number(t.replace(",", "."))) : undefined;
    if (n !== undefined && (!Number.isFinite(n) || n < 1 || n > 20)) return setText(wert ? String(wert) : "");
    if (n === wert) return;
    laeuft.current = true;
    try {
      if (!(await setzen(n))) setText(wert ? String(wert) : "");
    } finally {
      laeuft.current = false;
    }
  };
  return (
    <Feld label={label}>
      {(id) => <Eingabe id={id} inputMode="numeric" placeholder={vorgabe ? te.vorgabe(vorgabe) : te.massFehlt} value={text} onChange={(e) => setText(e.target.value)} onBlur={() => void uebernehmen()} onKeyDown={(e) => enterUebernimmt(e, uebernehmen)} className="tabular-nums" />}
    </Feld>
  );
}

/**
 * Name einer Fläche: speichert kurz nach dem Tippen, beim Verlassen und beim Wechsel der Auswahl (Aufräumen) – immer für
 * die Fläche, für die das Feld geöffnet wurde.
 */
export function NameFeld({ i, name, aendern, breit }: { i: number; name: string; aendern: Aendern; breit?: boolean }) {
  const te = useOberflaeche().halle.eigenschaften;
  const [wert, setWert] = useState(name);
  const stand = useRef({ wert: name, gespeichert: name });
  const uhr = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sichern = () => {
    if (uhr.current) clearTimeout(uhr.current);
    uhr.current = null;
    const neu = stand.current.wert.trim().slice(0, 100);
    if (!neu || neu === stand.current.gespeichert) return;
    stand.current.gespeichert = neu;
    aendern((h) => ({ ...h, flaechen: h.flaechen.map((f, j) => (j === i ? { ...f, name: neu } : f)) }), zweisprachig((x) => x.halle.eigenschaften.umbenennen));
  };
  const sichernRef = useRef(sichern);
  sichernRef.current = sichern;
  useEffect(() => () => sichernRef.current(), []);
  return (
    <Eingabe
      aria-label={te.nameFlaeche}
      value={wert}
      maxLength={100}
      onChange={(e) => {
        setWert(e.target.value);
        stand.current.wert = e.target.value;
        if (uhr.current) clearTimeout(uhr.current);
        uhr.current = setTimeout(() => sichernRef.current(), 700);
      }}
      onBlur={() => sichernRef.current()}
      onKeyDown={(e) => e.key === "Enter" && sichernRef.current()}
      className={breit ? "w-full py-1" : "w-32 shrink-0 py-1 sm:w-48"}
    />
  );
}
