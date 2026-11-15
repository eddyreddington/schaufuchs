/**
 * Werkzeugleiste des Hallenplan-Editors (Auswählen, Einsetzen, Drehen, Entfernen, Zoom, Menü „Plan“).
 */
import { type HallenFlaeche, type HallenObjekt, type KaefigMasse, kaefigName, type KaefigTyp } from "@schau/domain";
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
  return (
    <div role="toolbar" aria-label="Werkzeuge des Hallenplans" className={`nicht-drucken z-30 flex flex-wrap items-center gap-y-1 border-b border-linie bg-weiss px-1 py-1 ${voll ? "" : "sticky top-12 rounded-t-xl"}`}>
      <WzGruppe label="Auswahl">
        <WzKnopf symbol="auswahl" titel="Auswählen und verschieben" kuerzel="V" an={!mehrfach} onClick={() => setMehrfach(false)} />
        <WzKnopf symbol="mehrfach" titel="Mehrfachauswahl" kuerzel="M" an={mehrfach} onClick={() => setMehrfach(!mehrfach)} />
      </WzGruppe>
      <WzGruppe label="Verlauf">
        <WzKnopf symbol="rueckgaengig" titel={kannZurueck ? `Rückgängig: ${zurueckWas}` : "Rückgängig"} kuerzel={`${strg} Z`} disabled={!kannZurueck} onClick={rueckgaengig} />
        <WzKnopf symbol="wiederholen" titel={kannVor ? `Wiederholen: ${vorWas}` : "Wiederholen"} kuerzel={`${strg} ⇧ Z`} disabled={!kannVor} onClick={wiederholen} />
      </WzGruppe>
      <WzGruppe label="Einsetzen">
        <WzMenue symbol="einsetzen" titel="Einsetzen" text="Einsetzen">
          {(zu) => (
            <>
              <MenueKopf>Flächen</MenueKopf>
              {(
                [
                  ["eingang", "eingang", "Eingang / Ausgang", "an der Wand"],
                  ["sperre", "flaeche", "Freier Bereich (Bühne, Kasse …)", undefined],
                  ["volieren", "voliere", "Volierenbereich", undefined],
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
              <MenueKopf>Käfige</MenueKopf>
              {BLOCK_TYPEN.map((t) => (
                <MenueEintrag
                  key={t}
                  symbol="block"
                  onClick={() => {
                    zu();
                    einsetzen("kaefigblock", t);
                  }}
                >
                  Käfigblock {kaefigName(t, masse)}
                </MenueEintrag>
              ))}
              <MenueEintrag
                symbol="voliere"
                onClick={() => {
                  zu();
                  einsetzen("voliere");
                }}
              >
                Voliere
              </MenueEintrag>
              <MenueTrenner />
              <MenueKopf>Tische und Bänke</MenueKopf>
              {(
                [
                  ["garnitur", "Garnitur (Tisch mit zwei Bänken)"],
                  ["tisch", "Tisch"],
                  ["bank", "Bank"],
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
      <WzGruppe label="Bearbeiten">
        <WzKnopf symbol="raster" titel={hatAuswahl ? "Auswahl am Raster ausrichten" : "Alles am Raster ausrichten"} kuerzel="A" onClick={a.ausrichten} />
        <WzKnopf symbol="drehen" titel="Drehen um 90°" kuerzel="R" disabled={!a.dreht} onClick={a.drehen} />
        <WzKnopf symbol="zurueck" titel="An ihren Platz zurück" disabled={!a.zurueck} onClick={a.zurueckAnPlatz} />
        <WzKnopf symbol="entfernen" titel="Entfernen (nur Leeres)" kuerzel="Entf" gefahr disabled={!hatAuswahl} onClick={a.entfernen} />
      </WzGruppe>
      <WzGruppe label="Ansicht">
        <WzKnopf symbol="verkleinern" titel="Verkleinern" kuerzel="−" disabled={zoom <= 1} onClick={() => zoomen(-1)} />
        <span className="w-11 text-center text-sm tabular-nums text-grau" aria-live="polite">
          {Math.round(zoom * 100)} %
        </span>
        <WzKnopf symbol="vergroessern" titel="Vergrößern" kuerzel="+" disabled={zoom >= 4} onClick={() => zoomen(1)} />
        <WzKnopf symbol="einpassen" titel="Ganze Halle" kuerzel="0" disabled={zoom === 1} onClick={() => setZoom(1)} />
        <WzKnopf symbol={voll ? "vollansichtAus" : "vollansicht"} titel={voll ? "Vollansicht schließen" : "Vollansicht"} kuerzel="F" an={voll} onClick={() => setVoll(!voll)} />
        <WzKnopf symbol="dreiD" titel="Halle in 3D" text="3D" onClick={dreiD} />
      </WzGruppe>
      <WzGruppe label="Aufstellung">
        <WzKnopf symbol="vorschlaege" titel="Stellvorschläge" text="Stellvorschläge" textBreit an={vorschlaegeOffen} onClick={vorschlaege} />
      </WzGruppe>
      <WzGruppe label="Plan">
        <WzMenue symbol="menue" titel="Plan" text="Plan" rechts>
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
                  Alle Reihen an ihren Platz
                </MenueEintrag>
                <MenueEintrag symbol="zurueck" zusatz={plan.plattenZurueck || undefined} disabled={!plan.plattenZurueck} onClick={tun(plan.allePlattenZurueck)}>
                  Alle Platten an ihren Platz
                </MenueEintrag>
                {plan.anWaenden && (
                  <MenueEintrag symbol="drehen" onClick={tun(plan.anWaenden)}>
                    Käfige an den Wänden ausrichten …
                  </MenueEintrag>
                )}
                <MenueTrenner />
                <MenueEintrag symbol="neu" onClick={tun(plan.neuSetzen)}>
                  Plan neu setzen …
                </MenueEintrag>
              </>
            );
          }}
        </WzMenue>
      </WzGruppe>
    </div>
  );
}
