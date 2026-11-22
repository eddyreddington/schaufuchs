/** Abschnitt „Aussehen (3D)“ in den Eigenschaften der Halle (Entscheidung 028). */
import { aussehenBereinigt, aussehenVon, deckeSchalten, wandHoeheSetzen, FIRST_HOEHE_MAX, HALLEN_BOEDEN, type HallenAussehen, type HallenBoden, PRALLWAND_HOEHE_MAX, PRALLWAND_VORGABEN, WAND_HOEHE_MAX, WAND_HOEHE_MIN } from "@schau/domain";
import { useEffect, useRef, useState } from "react";
import { useOberflaeche } from "../sprache";
import { Auswahl, Feld, Haken, HilfeLink } from "../ui";
import { MeterFeld } from "./hallenplan-meterfeld";

/** Farbe des Holzes im Farbfeld (wie die Holz-Prallwand in 3D). */
const HOLZ = "#dcc29a";

/** Änderung des Aussehens auf dem jeweils aktuellen Stand der Halle (nicht auf dem beim Zeichnen gesehenen). */
export type AussehenAendern = (f: (alt: HallenAussehen | undefined) => HallenAussehen | undefined) => void;

/**
 * Einstellung „Aussehen (3D)“: Boden und Folie, Prallwand (Farbe und Höhe), Wand- und Firsthöhe, Fenster, Decke,
 * Spielfeldlinien, Geräte. Gespeichert in der Halle wie eine Änderung im Editor, ohne den Plan neu zu setzen; die 3D-Ansicht
 * zeigt es nach dem Neuladen. `aendern` fehlt: nur ansehen.
 */
export function AussehenEinstellung({ aussehen, aendern }: { aussehen: HallenAussehen | undefined; aendern?: AussehenAendern }) {
  const t = useOberflaeche().halle.aussehen;
  const a = aussehenVon(aussehen);
  const neu = (patch: Partial<HallenAussehen>) => aendern?.((alt) => aussehenBereinigt({ ...(alt ?? {}), ...patch }));
  const aus = !aendern;
  /** Höhe übernehmen, nur wenn sie so gespeichert würde (sonst springt das Feld zurück statt einen anderen Wert zu zeigen). */
  const hoehe = (feld: "prallwandHoehe" | "wandHoehe" | "firstHoehe") => (cm: number) => {
    if (aussehenVon({ ...(aussehen ?? {}), [feld]: cm })[feld] !== cm) return false;
    // Die Wand nimmt einen gesetzten First mit (Dachhöhe bleibt), siehe `wandHoeheSetzen`.
    if (feld === "wandHoehe") aendern?.((alt) => wandHoeheSetzen(alt, cm));
    else neu({ [feld]: cm });
    return true;
  };
  // Freie Farbe: beim Ziehen im Farbwähler erst nach einer kurzen Pause speichern, beim Verlassen der Eigenschaften sofort.
  const [farbe, setFarbe] = useState(a.prallwand === "holz" ? HOLZ : a.prallwand);
  useEffect(() => setFarbe(a.prallwand === "holz" ? HOLZ : a.prallwand), [a.prallwand]);
  const offen = useRef<{ farbe: string; zeit: ReturnType<typeof setTimeout> } | null>(null);
  const aendernRef = useRef(aendern);
  aendernRef.current = aendern;
  const farbeSpeichern = () => {
    const o = offen.current;
    if (!o) return;
    clearTimeout(o.zeit);
    offen.current = null;
    aendernRef.current?.((alt) => aussehenBereinigt({ ...(alt ?? {}), prallwand: o.farbe }));
  };
  useEffect(() => farbeSpeichern, []);
  const farbeWaehlen = (f: string) => {
    setFarbe(f);
    if (offen.current) clearTimeout(offen.current.zeit);
    offen.current = { farbe: f, zeit: setTimeout(farbeSpeichern, 400) };
  };
  return (
    <details className="border-t border-linie pt-4">
      <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-grau hover:text-tinte">{t.titel}</summary>
      <div className="mt-3 flex flex-col gap-3">
        <Feld label={t.boden}>
          {(id) => (
            <Auswahl id={id} disabled={aus} value={a.boden} onChange={(e) => neu({ boden: e.target.value as HallenBoden })}>
              {HALLEN_BOEDEN.map((b) => (
                <option key={b} value={b}>
                  {t[b]}
                </option>
              ))}
            </Auswahl>
          )}
        </Feld>
        <Haken label={t.abdeckung} checked={a.abdeckung} disabled={aus} onChange={(v) => neu({ abdeckung: v })} />
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">{t.prallwand}</span>
          <div className="flex flex-wrap items-center gap-2">
            {PRALLWAND_VORGABEN.map((v) => (
              <button
                key={v.name}
                type="button"
                disabled={aus}
                title={t[v.name]}
                aria-label={t[v.name]}
                aria-pressed={a.prallwand === v.farbe}
                onClick={() => {
                  // Eine noch wartende freie Farbe fällt weg – die gewählte Vorgabe gilt.
                  if (offen.current) clearTimeout(offen.current.zeit);
                  offen.current = null;
                  neu({ prallwand: v.farbe });
                }}
                className={`size-8 rounded-md border ${a.prallwand === v.farbe ? "border-tinte ring-2 ring-tinte/30" : "border-linie-stark"}`}
                style={{ background: v.farbe === "holz" ? HOLZ : v.farbe }}
              />
            ))}
            <label className="flex items-center gap-1.5 text-sm text-grau">
              <input type="color" disabled={aus} value={farbe} aria-label={t.eigeneFarbe} title={t.eigeneFarbe} onChange={(e) => farbeWaehlen(e.target.value)} className="size-8 cursor-pointer rounded-md border border-linie-stark bg-weiss p-0.5" />
              {t.eigeneFarbe}
            </label>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <MeterFeld label={t.prallwandHoehe} cm={a.prallwandHoehe} min={0} max={PRALLWAND_HOEHE_MAX} disabled={aus} setzen={hoehe("prallwandHoehe")} />
          <MeterFeld label={t.wandHoehe} cm={a.wandHoehe} min={WAND_HOEHE_MIN} max={WAND_HOEHE_MAX} disabled={aus} setzen={hoehe("wandHoehe")} />
          <MeterFeld label={t.firstHoehe} cm={a.firstHoehe} min={WAND_HOEHE_MIN} max={FIRST_HOEHE_MAX} disabled={aus} setzen={hoehe("firstHoehe")} />
        </div>
        <Haken label={t.fenster} checked={a.fenster} disabled={aus} onChange={(v) => neu({ fenster: v })} />
        <Haken label={t.decke} checked={a.decke} disabled={aus} onChange={(v) => aendern?.((alt) => deckeSchalten(alt, v))} />
        <Haken label={t.linien} checked={a.linien} disabled={aus} onChange={(v) => neu({ linien: v })} />
        <Haken label={t.geraete} checked={a.geraete} disabled={aus} onChange={(v) => neu({ geraete: v })} />
        <HilfeLink abschnitt="hallenplan-3d-aussehen">{t.hilfe}</HilfeLink>
      </div>
    </details>
  );
}
