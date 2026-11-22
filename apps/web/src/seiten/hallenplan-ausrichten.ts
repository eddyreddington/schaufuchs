/**
 * Käfige im Editor ausrichten, wenn sie gestellt werden (ohne React): nach Verschieben, Pfeiltasten, Drehen und Einsetzen.
 * Zeigt die Front eines gestellten Teils zu einer Wand oder an ein anderes Teil und ist die Gegenseite frei, dreht ihn die
 * Software an Ort und Stelle um 180° – Rückwand an die Wand bzw. an die Rückwand des anderen (`ausrichtungBeimStellen`,
 * Entscheidung 029). Nur die gestellten Teile drehen, die Nachbarn bleiben. Alles in einem Schritt (ein Rückgängig).
 */
import { ausrichtungBeimStellen, type Halle, type HallenObjekt, type HallenTeil, type KaefigMasse, objektFront, ruhendeNachbarn, teilGroesse, verschiebeTeile, wandDrehungenAnwenden, type WandKandidat } from "@schau/domain";
import { ot } from "../sprache-jetzt";
import { type Daten, gedreht, vollstaendig, wandKandidatenImEntwurf, zahlWort } from "./hallenplan-geometrie";

type Plan = NonNullable<Daten["plan"]>;
export interface Ausgerichtet {
  halle: Halle;
  /** Gedreht: mit der Rückwand an eine Wand bzw. an ein anderes Teil. */
  wand: number;
  ruecken: number;
}

/** Eingesetzte Teile, die der Plan noch nicht kennt (eben eingesetzt, noch nicht gespeichert), als Kandidaten. */
function neueKandidaten(h: Halle, plan: Plan, masse: KaefigMasse | null | undefined): WandKandidat[] {
  if (masse === undefined) return [];
  return (h.objekte ?? [])
    .filter((o): o is HallenObjekt & { art: "kaefigblock" | "voliere" } => (o.art === "kaefigblock" || o.art === "voliere") && !plan.objekte.some((p) => p.id === o.id))
    .map((o) => {
      const g = teilGroesse(o, h, masse);
      const rechteck = o.drehung === 90 ? { x: o.x, y: o.y, b: g.kurz, h: g.lang } : { x: o.x, y: o.y, b: g.lang, h: g.kurz };
      return { teil: { art: "objekt", id: o.id }, rechteck, front: objektFront({ front: o.front, rechteck }), belegt: 0 };
    });
}

/** Die gestellten Teile `ziele` im Entwurf h ausrichten. `masse`: auch noch nicht gespeicherte Teile berücksichtigen. */
export function ausrichten(h: Halle, plan: Plan, ziele: HallenTeil[], masse?: KaefigMasse | null): Ausgerichtet {
  const v = vollstaendig(h);
  const a = ausrichtungBeimStellen(v, [...wandKandidatenImEntwurf(v, plan), ...neueKandidaten(v, plan, masse)], ziele, ruhendeNachbarn(plan));
  return { halle: wandDrehungenAnwenden(v, [...a.wand, ...a.ruecken]), wand: a.wand.length, ruecken: a.ruecken.length };
}

/** Auswahl um dx/dy verschieben und ausrichten. */
export const verschiebenUndAusrichten = (h: Halle, plan: Plan, ziele: HallenTeil[], dx: number, dy: number): Ausgerichtet =>
  ausrichten(verschiebeTeile(vollstaendig(h), ziele, dx, dy), plan, ziele);

/**
 * Ein Teil drehen (R, Doppelklick, Knopf) und ausrichten. Die Drehung des Nutzers bleibt, solange die Front danach frei ist;
 * nur wenn sie verdeckt wäre und die Gegenseite frei ist, dreht es um 180° weiter.
 */
export const gedrehtUndAusgerichtet = (h: Halle, plan: Plan, t: HallenTeil, masse?: KaefigMasse | null): Ausgerichtet => ausrichten(gedreht(h, t), plan, [t], masse);

/** Eben eingesetzte Teile (Ids, schon in h) ausrichten. */
export const eingesetztUndAusgerichtet = (h: Halle, plan: Plan, ids: string[], masse: KaefigMasse | null | undefined): Ausgerichtet =>
  ausrichten(h, plan, ids.map((id) => ({ art: "objekt", id })), masse ?? null);

/** Hinweis nach dem Ausrichten (null: nichts gedreht). */
export function ausrichtHinweis({ wand, ruecken }: Pick<Ausgerichtet, "wand" | "ruecken">): string | null {
  const tb = ot().halleBild.bedienung;
  const teile = [
    wand ? (wand === 1 ? tb.anWandGedrehtEins : tb.anWandGedreht(zahlWort(wand, tb.teile))) : "",
    ruecken ? (ruecken === 1 ? tb.rueckenGedrehtEins : tb.rueckenGedreht(zahlWort(ruecken, tb.teile))) : "",
  ].filter(Boolean);
  return teile.length ? teile.join(" ") : null;
}
