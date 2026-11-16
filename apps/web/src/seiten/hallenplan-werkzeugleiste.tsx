/**
 * Werkzeugleiste des Hallenplan-Editors (Auswählen, Einsetzen, Drehen, Entfernen, Zoom, Menü „Plan“).
 */
import { type HallenFlaeche, type HallenObjekt, type KaefigMasse, type KaefigTyp } from "@schau/domain";
import { useOberflaeche } from "../sprache";
import { kaefigNameT } from "./hallenplan-teile";
import { MenueEintrag, MenueKopf, MenueTrenner, strg, WzGruppe, WzKnopf, WzMenue } from "./hallenplan-werkzeuge";
import { type Aktionen, BLOCK_TYPEN } from "./hallenplan-geometrie";

/**
 * Werkzeugleiste des Editors: Auswahl, Rückgängig/Wiederholen, Einsetzen, Bearbeiten der Auswahl, Ansicht und das Menü
 * „Plan“. Immer gleich hoch (bricht nur nach der Breite um, nie nach der Auswahl) – der Plan darunter springt nicht.
 */
export function Werkzeugleiste({
  masse,
  voll,
  setVoll,
  zoom,
  setZoom,
  zoomen,
  mehrfach,
  setMehrfach,
  kannZurueck,
  kannVor,
  zurueckWas,
  vorWas,
  rueckgaengig,
  wiederholen,
  einsetzen,
  flaecheEinsetzen,
  a,
  hatAuswahl,
  plan,
  vorschlaege,
  vorschlaegeOffen,
  dreiD,
}: {
  masse: KaefigMasse;
  voll: boolean;
  setVoll: (v: boolean) => void;
  zoom: number;
  setZoom: (z: number) => void;
  zoomen: (r: 1 | -1) => void;
  mehrfach: boolean;
  setMehrfach: (v: boolean) => void;
  kannZurueck: boolean;
  kannVor: boolean;
  zurueckWas?: string;
  vorWas?: string;
  rueckgaengig: () => void;
  wiederholen: () => void;
  einsetzen: (art: HallenObjekt["art"], typ?: KaefigTyp) => void;
  flaecheEinsetzen: (art: HallenFlaeche["art"]) => void;
  a: Aktionen;
  hatAuswahl: boolean;
  plan: {
    nummerieren: { text: string; tun: () => void } | null;
    reihenZurueck: number;
    plattenZurueck: number;
    alleReihenZurueck: () => void;
    allePlattenZurueck: () => void;
    neuSetzen: () => void;
    anWaenden: (() => void) | null;
  };
  vorschlaege: () => void;
  vorschlaegeOffen: boolean;
  dreiD: () => void;
}) {
  const t = useOberflaeche();
  const tl = t.halleWerkzeuge.leiste;
  const tg = t.halleWerkzeuge.gemeinsam;
  return (
    <div role="toolbar" aria-label={tl.werkzeuge} className={`nicht-drucken z-30 flex flex-wrap items-center gap-y-1 border-b border-linie bg-weiss px-1 py-1 ${voll ? "" : "sticky top-12 rounded-t-xl"}`}>
      <WzGruppe label={tl.auswahl}>
        <WzKnopf symbol="auswahl" titel={tl.auswaehlen} kuerzel="V" an={!mehrfach} onClick={() => setMehrfach(false)} />
        <WzKnopf symbol="mehrfach" titel={tl.mehrfach} kuerzel="M" an={mehrfach} onClick={() => setMehrfach(!mehrfach)} />
      </WzGruppe>
      <WzGruppe label={tl.verlauf}>
        <WzKnopf symbol="rueckgaengig" titel={kannZurueck ? tl.rueckgaengigWas(zurueckWas ?? "") : tl.rueckgaengig} kuerzel={`${strg()} Z`} disabled={!kannZurueck} onClick={rueckgaengig} />
        <WzKnopf symbol="wiederholen" titel={kannVor ? tl.wiederholenWas(vorWas ?? "") : tl.wiederholen} kuerzel={`${strg()} ⇧ Z`} disabled={!kannVor} onClick={wiederholen} />
      </WzGruppe>
      <WzGruppe label={tl.einsetzen}>
        <WzMenue symbol="einsetzen" titel={tl.einsetzen} text={tl.einsetzen}>
          {(zu) => (
            <>
              <MenueKopf>{tl.flaechen}</MenueKopf>
              {(
                [
                  ["eingang", "eingang", tg.eingangAusgang, tl.anDerWand],
                  ["sperre", "flaeche", tl.freierBereich, undefined],
                  ["volieren", "voliere", tg.volierenbereich, undefined],
                ] as const
              ).map(([art, symbol, text, zusatz]) => (
                <MenueEintrag
                  key={art}
                  symbol={symbol}
                  zusatz={zusatz}
                  onClick={() => {
                    zu();
                    flaecheEinsetzen(art);
                  }}
                >
                  {text}
                </MenueEintrag>
              ))}
              <MenueTrenner />
              <MenueKopf>{tl.kaefige}</MenueKopf>
              {BLOCK_TYPEN.map((typ) => (
                <MenueEintrag
                  key={typ}
                  symbol="block"
                  onClick={() => {
                    zu();
                    einsetzen("kaefigblock", typ);
                  }}
                >
                  {tl.kaefigblock(kaefigNameT(t, typ, masse))}
                </MenueEintrag>
              ))}
              <MenueEintrag
                symbol="voliere"
                onClick={() => {
                  zu();
                  einsetzen("voliere");
                }}
              >
                {tl.voliere}
              </MenueEintrag>
              <MenueTrenner />
              <MenueKopf>{tl.tischeBaenke}</MenueKopf>
              {(
                [
                  ["garnitur", tl.garnitur],
                  ["tisch", tl.tisch],
                  ["bank", tl.bank],
                ] as const
              ).map(([art, text]) => (
                <MenueEintrag
                  key={art}
                  symbol="tisch"
                  onClick={() => {
                    zu();
                    einsetzen(art);
                  }}
                >
                  {text}
                </MenueEintrag>
              ))}
            </>
          )}
        </WzMenue>
      </WzGruppe>
      <WzGruppe label={tl.bearbeiten}>
        <WzKnopf symbol="raster" titel={hatAuswahl ? tl.auswahlRaster : tl.allesRaster} kuerzel="A" onClick={a.ausrichten} />
        <WzKnopf symbol="drehen" titel={tl.drehen} kuerzel="R" disabled={!a.dreht} onClick={a.drehen} />
        <WzKnopf symbol="zurueck" titel={tg.anPlatzZurueck} disabled={!a.zurueck} onClick={a.zurueckAnPlatz} />
        <WzKnopf symbol="entfernen" titel={tl.entfernen} kuerzel={tl.entf} gefahr disabled={!hatAuswahl} onClick={a.entfernen} />
      </WzGruppe>
      <WzGruppe label={tl.ansicht}>
        <WzKnopf symbol="verkleinern" titel={tl.verkleinern} kuerzel="−" disabled={zoom <= 1} onClick={() => zoomen(-1)} />
        <span className="w-11 text-center text-sm tabular-nums text-grau" aria-live="polite">
          {Math.round(zoom * 100)} %
        </span>
        <WzKnopf symbol="vergroessern" titel={tl.vergroessern} kuerzel="+" disabled={zoom >= 4} onClick={() => zoomen(1)} />
        <WzKnopf symbol="einpassen" titel={tl.ganzeHalle} kuerzel="0" disabled={zoom === 1} onClick={() => setZoom(1)} />
        <WzKnopf symbol={voll ? "vollansichtAus" : "vollansicht"} titel={voll ? tl.vollansichtZu : tl.vollansicht} kuerzel="F" an={voll} onClick={() => setVoll(!voll)} />
        <WzKnopf symbol="dreiD" titel={tl.halle3d} text="3D" onClick={dreiD} />
      </WzGruppe>
      <WzGruppe label={tl.aufstellung}>
        <WzKnopf symbol="vorschlaege" titel={tl.stellvorschlaege} text={tl.stellvorschlaege} textBreit an={vorschlaegeOffen} onClick={vorschlaege} />
      </WzGruppe>
      <WzGruppe label={tl.plan}>
        <WzMenue symbol="menue" titel={tl.plan} text={tl.plan} rechts>
          {(zu) => {
            const tun = (f: () => void) => () => {
              zu();
              f();
            };
            return (
              <>
                {plan.nummerieren && (
                  <>
                    <MenueEintrag symbol="nummern" onClick={tun(plan.nummerieren.tun)}>
                      {plan.nummerieren.text}
                    </MenueEintrag>
                    <MenueTrenner />
                  </>
                )}
                <MenueEintrag symbol="zurueck" zusatz={plan.reihenZurueck || undefined} disabled={!plan.reihenZurueck} onClick={tun(plan.alleReihenZurueck)}>
                  {tl.alleReihen}
                </MenueEintrag>
                <MenueEintrag symbol="zurueck" zusatz={plan.plattenZurueck || undefined} disabled={!plan.plattenZurueck} onClick={tun(plan.allePlattenZurueck)}>
                  {tl.allePlatten}
                </MenueEintrag>
                {plan.anWaenden && (
                  <MenueEintrag symbol="drehen" onClick={tun(plan.anWaenden)}>
                    {tl.wandAusrichten}
                  </MenueEintrag>
                )}
                <MenueTrenner />
                <MenueEintrag symbol="neu" onClick={tun(plan.neuSetzen)}>
                  {tl.neuSetzen}
                </MenueEintrag>
              </>
            );
          }}
        </WzMenue>
      </WzGruppe>
    </div>
  );
}
