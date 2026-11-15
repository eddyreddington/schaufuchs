/**
 * Werkzeuge des Hallenplan-Editors für die Auswahl und für neue Teile: am Raster ausrichten, drehen, an den Platz
 * zurück, Leeres entfernen, Teile und fehlende Käfige einsetzen, Fläche aufziehen; dazu die Aktionen für Leiste,
 * Eigenschaften und Tastenkürzel (`aktionen`).
 */
import { eingangAnWand, istRechteckUmriss, ueberlappt, umrissNormal, umrissSperren, umrissVon, type Belegt, fehlendeImPlan, freieStelle, type HallenFlaeche, type HallenObjekt, KAEFIG_TYP_MEHRZAHL, type KaefigTyp, leereEntfernen, MOEBEL_NAME, type MoebelArt, rasterAusrichten, type Rechteck, teilGroesse, type WandSeite } from "@schau/domain";
import { trpc } from "../trpc";
import { useFrage, useMeldung } from "../ui";
import { type HallenEntwurf } from "./hallenplan-entwurf";
import { type Aktionen, anzahl, type Daten, drehPruefung, EINGANG_TIEFE, entfernenText, gedreht, type Plan, planKoerper, RASTER, raster, vollstaendig, wandText, type Ziel, zuTeilen } from "./hallenplan-geometrie";

export function useEditorAktionen({ d, plan, schauId, e, auswahl, setAuswahl, zeichnen, setZeichnen, anWandFragen }: {
  d: Daten;
  plan: Plan;
  schauId: number;
  e: HallenEntwurf;
  auswahl: Ziel[];
  setAuswahl: (z: Ziel[]) => void;
  zeichnen: HallenFlaeche["art"] | null;
  setZeichnen: (a: HallenFlaeche["art"] | null) => void;
  anWandFragen: (nr: number, seite: WandSeite) => Promise<void>;
}) {
  const utils = trpc.useUtils();
  const meldung = useMeldung();
  const { bestaetige } = useFrage();
  const { entwurf, entwurfRef, aendern, kette, festUnterwegs, festMachen } = e;
  /** Gewählte Teile zum Verschieben, Drehen und Ausrichten: ein freier Platz steht für seine Grundplatte. */
  const teile = zuTeilen(auswahl, plan);
  const ausrichten = () => {
    const ziele = teile.length ? teile : null;
    const vorab = rasterAusrichten(entwurfRef.current, planKoerper(entwurfRef.current, plan), ziele, RASTER);
    if (!vorab.ok) return meldung(vorab.meldung, "warnung");
    if (!vorab.bewegt) return meldung(ziele ? "Die gewählten Teile stehen schon am Raster." : "Alles steht schon am Raster.");
    // Auf dem neuesten Entwurf rechnen (es kann noch ein Speichern unterwegs sein); gemeldet wird, was wirklich geschah.
    let e: ReturnType<typeof rasterAusrichten> = vorab;
    aendern(
      (h) => {
        e = rasterAusrichten(h, planKoerper(h, plan), ziele, RASTER);
        return e.ok ? e.halle : h;
      },
      { was: "Am Raster ausrichten", festschreiben: !ziele || ziele.some((t) => t.art === "reihe" || t.art === "platte") },
    );
    const ergebnis = e as ReturnType<typeof rasterAusrichten>;
    if (!ergebnis.ok) return meldung(ergebnis.meldung, "warnung");
    meldung(`${ergebnis.bewegt} ${ergebnis.bewegt === 1 ? "Teil" : "Teile"} am Raster ausgerichtet.`);
  };
  const drehen = () => {
    if (teile.length !== 1) return meldung(teile.length ? "Drehen geht für ein Teil auf einmal." : "Erst ein Teil wählen.", "warnung");
    const t = teile[0]!;
    const pr = drehPruefung(entwurf, plan, t);
    if (!pr.ok) return meldung(pr.meldung, "warnung");
    aendern((h) => gedreht(h, t), { was: "Drehen", festschreiben: t.art === "reihe" || t.art === "platte" });
  };
  /** Gewählte Reihen und Platten an ihren gerechneten Platz (Versatz und Drehung weg). */
  const zurueckTeile = teile.filter((t) => (t.art === "reihe" ? entwurf.reihenVersatz!.some((x) => x.nr === t.nr) : t.art === "platte" && entwurf.plattenVersatz!.some((x) => x.reihe === t.reihe && x.platte === t.i)));
  const zurueckAnPlatz = () => {
    if (!zurueckTeile.length) return;
    const z = zurueckTeile;
    aendern(
      (h) => {
        const v = vollstaendig(h);
        return {
          ...v,
          reihenVersatz: v.reihenVersatz!.filter((x) => !z.some((t) => t.art === "reihe" && t.nr === x.nr)),
          plattenVersatz: v.plattenVersatz!.filter((x) => !z.some((t) => t.art === "platte" && t.reihe === x.reihe && t.i === x.platte)),
        };
      },
      { was: "An ihren Platz zurück" },
    );
  };
  const entfernenFragen = async () => {
    if (!auswahl.length) return meldung("Erst etwas wählen.", "warnung");
    const gewaehlt = auswahl;
    // Platten und Plätze entfernt man im festen Plan. Im gerechneten Plan erst prüfen und fragen (mit dem Plan, wie er
    // zu sehen ist), erst danach festschreiben – nichts wird festgeschrieben, wenn nichts zu entfernen ist.
    const mussFest = !plan.fest && gewaehlt.some((z) => z.art === "reihe" || z.art === "platte" || z.art === "platz");
    const e = leereEntfernen(entwurfRef.current, mussFest ? { ...plan, fest: { am: "", veraltet: false } } : plan, gewaehlt);
    const was = entfernenText(e);
    if (!was)
      return meldung(
        e.bleibt.length ? `Bleibt stehen: ${e.bleibt.join(", ")} – nur Leeres lässt sich entfernen.` : e.nurFest ? "Leere Plätze lassen sich nur im festen Plan entfernen." : "Hier ist nichts zu entfernen.",
        "warnung",
      );
    const eins = e.platten + e.plaetze + e.teile + e.flaechen === 1;
    if (
      !(await bestaetige({
        titel: "Leeres entfernen?",
        text: `${was} ${eins ? "verschwindet" : "verschwinden"} aus dem Plan${e.bleibt.length ? `, stehen bleibt: ${e.bleibt.join(", ")}` : ""}.`,
        knopf: "Entfernen",
        gefahr: true,
      }))
    )
      return;
    let p = plan;
    if (mussFest) {
      await kette.current;
      if (festUnterwegs.current) return meldung("Der Plan wird gerade festgeschrieben – bitte gleich noch einmal.", "warnung");
      festUnterwegs.current = true;
      try {
        await festMachen();
      } catch {
        return;
      }
      p = utils.katalog.hallenplan.getData({ schauId })?.plan ?? plan;
      if (!p.fest) return;
    }
    aendern((h) => leereEntfernen(h, p, gewaehlt).halle, { was: "Entfernen", grund: `Leeres entfernt: ${was}` });
    setAuswahl([]);
  };
  const neueId = () => `t${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`;
  const einsetzen = (art: HallenObjekt["art"], typ?: KaefigTyp) => {
    // Neues Teil möglichst in die Mitte der Halle, auf einen freien Platz (nicht auf ein eben eingesetztes) – von dort an
    // den richtigen Platz ziehen. Tische und Bänke gern in einen freien Bereich.
    const id = neueId();
    const moebel = art === "tisch" || art === "bank" || art === "garnitur";
    const groesse = teilGroesse({ art, typ }, entwurf, d.masse);
    const start = { x: raster(entwurf.breite / 2 - groesse.lang / 2), y: raster(entwurf.laenge / 2 - groesse.kurz / 2) };
    const teile = (entwurf.objekte ?? []).map((o) => {
      const g = teilGroesse(o, entwurf, d.masse);
      return o.drehung === 90 ? { x: o.x, y: o.y, b: g.kurz, h: g.lang } : { x: o.x, y: o.y, b: g.lang, h: g.kurz };
    });
    const belegt = moebel ? [...planKoerper(entwurf, plan).filter((k) => !k.freiBereich).map((k) => k.rechteck), ...teile] : belegtJetzt().map((b) => b.q);
    const ort = freieStelle(entwurf, belegt, { b: groesse.lang, h: groesse.kurz }, start);
    const was = moebel ? `${MOEBEL_NAME[art as MoebelArt]} einsetzen` : art === "voliere" ? "Voliere einsetzen" : "Käfigblock einsetzen";
    aendern((h) => ({ ...h, objekte: [...(h.objekte ?? []), { id, art, ...(art === "kaefigblock" ? { typ: typ ?? "huehner" } : {}), ...ort, drehung: 0 }] }), { was });
    setAuswahl([{ art: "objekt", id }]);
  };
  /** Was im Entwurf Platz einnimmt (wie beim Verschieben, dazu alle eingesetzten Teile); Grundplatten mit Käfigart. */
  const belegtJetzt = (): Belegt[] => [
    ...planKoerper(entwurf, plan).filter((k) => !k.nurMoebel).map((k) => {
      const t = k.teil;
      return { q: k.rechteck, typ: t?.art === "platte" ? plan.reihen.find((r) => r.nr === t.reihe)?.platten[t.i]?.typ : undefined };
    }),
    ...(entwurf.objekte ?? []).map((o) => {
      const g = teilGroesse(o, entwurf, d.masse);
      return { q: o.drehung === 90 ? { x: o.x, y: o.y, b: g.kurz, h: g.lang } : { x: o.x, y: o.y, b: g.lang, h: g.kurz } };
    }),
  ];
  /**
   * Fehlende Käfige einsetzen: Käfigblöcke (bzw. Volieren) in freie Stellen der Reihen – nie in Gänge, Quergang, den Gang vor
   * Eingängen oder auf Flächen. `nur`: ein Teil dieser Käfigart; findet sich in den Reihen keine Stelle, kommt es wie aus dem
   * Menü „Einsetzen“ in die Mitte.
   */
  const fehlendeSetzen = (nur?: KaefigTyp) => {
    // Dieselbe Suche wie „Plan neu setzen“ (dazu Volieren und eben eingesetzte, noch nicht gespeicherte Teile).
    const { einsaetze, ohne } = fehlendeImPlan(entwurf, plan, d.masse, { volieren: true, belegtDazu: belegtJetzt(), ...(nur ? { nur: { typ: nur, hoechstens: 1 } } : {}) });
    if (!einsaetze.length) {
      if (!nur) return meldung(`In den Reihen ist kein Platz mehr frei – ${anzahl(ohne, "Tier bleibt", "Tiere bleiben")} ohne Platz.`, "warnung");
      einsetzen(nur === "voliere" ? "voliere" : "kaefigblock", nur === "voliere" ? undefined : nur);
      return meldung("In den Reihen ist kein Platz frei – das Teil steht in der Mitte.", "warnung");
    }
    const basis = neueId();
    // Käfigblöcke gehören zum automatischen Plan (Neu-Setzen setzt sie ohne Rückfrage neu); Volieren nicht (die setzt das
    // Neu-Setzen nicht wieder ein).
    const neu = einsaetze.map((e, i) => ({ id: `${basis}${i}`, art: e.art, ...(e.art === "kaefigblock" ? { typ: e.typ, front: e.front, auto: true } : {}), x: e.x, y: e.y, drehung: e.drehung }));
    const zaehlen = new Map<KaefigTyp, number>();
    for (const e of einsaetze) zaehlen.set(e.typ, (zaehlen.get(e.typ) ?? 0) + 1);
    const was = [...zaehlen].map(([t, n]) => (t === "voliere" ? anzahl(n, "Voliere", "Volieren") : `${anzahl(n, "Block", "Blöcke")} ${KAEFIG_TYP_MEHRZAHL[t]}`)).join(", ");
    aendern((h) => ({ ...h, objekte: [...(h.objekte ?? []), ...neu] }), { was: "Fehlende Käfige einsetzen", grund: `Fehlende Käfige eingesetzt: ${was}` });
    setAuswahl(neu.map((o) => ({ art: "objekt" as const, id: o.id })));
    if (!nur) meldung(`Eingesetzt: ${was}.${ohne ? ` ${anzahl(ohne, "Tier bleibt", "Tiere bleiben")} ohne Platz.` : ""}`, ohne ? "warnung" : undefined);
  };
  /**
   * Fläche aufgezogen (Werkzeug aus „Einsetzen“; Rechteck in Hallenkoordinaten, ein Klick ohne Ziehen: Vorgabegröße). Ein
   * Eingang kommt an die nächste Wand, 50 cm tief, so lang wie aufgezogen.
   */
  const flaecheAufgezogen = (q: Rechteck, klick: boolean) => {
    const art = zeichnen;
    if (!art) return;
    setZeichnen(null);
    const B = entwurf.breite, L = entwurf.laenge;
    const cx = q.x + q.b / 2, cy = q.y + q.h / 2;
    const klemme = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
    let f: { x: number; y: number; breite: number; tiefe: number };
    if (art === "eingang") {
      // An die nächste Wand des Grundrisses (auch eine Innenwand), so lang wie aufgezogen bzw. 2 m bei einem Klick.
      const u = umrissVon(entwurf);
      const waagrecht = eingangAnWand(u, { x: cx, y: cy }, 200, null, EINGANG_TIEFE, RASTER).tiefe === EINGANG_TIEFE;
      f = klick
        ? eingangAnWand(u, { x: cx, y: cy }, 200, null, EINGANG_TIEFE, RASTER)
        : eingangAnWand(u, { x: cx, y: cy }, Math.max(100, raster(waagrecht ? q.b : q.h)), raster(waagrecht ? q.x : q.y), EINGANG_TIEFE, RASTER);
    } else {
      const b = klick ? 400 : Math.max(50, raster(q.b)), t = klick ? 300 : Math.max(50, raster(q.h));
      f = { x: klemme(raster(klick ? cx - b / 2 : q.x), 0, Math.max(0, B - b)), y: klemme(raster(klick ? cy - t / 2 : q.y), 0, Math.max(0, L - t)), breite: Math.min(b, B), tiefe: Math.min(t, L) };
    }
    // Freier Grundriss: nicht teils außerhalb der Halle (der Server lehnte sonst erst danach ab).
    if (art !== "eingang" && !istRechteckUmriss(entwurf.umriss) && umrissSperren(umrissNormal(entwurf.umriss!)).some((a) => ueberlappt({ x: f.x, y: f.y, b: f.breite, h: f.tiefe }, a)))
      return meldung("Die Fläche läge teils außerhalb der Halle – bitte innerhalb aufziehen.", "warnung");
    const anzahl = entwurf.flaechen.filter((x) => x.art === art).length;
    const name = art === "eingang" ? `Eingang${anzahl ? ` ${anzahl + 1}` : ""}` : art === "volieren" ? "Volieren" : "Freier Bereich";
    const neu = aendern((h) => ({ ...h, flaechen: [...h.flaechen, { name, art, ...f }] }), { was: "Fläche aufziehen" });
    setAuswahl([{ art: "flaeche", i: neu.flaechen.length - 1 }]);
  };
  /** Eine gewählte, ungedrehte Doppelreihe lässt sich als Einzelreihe an eine Wand stellen (wo noch keine steht). */
  const einzelreiheFuer = (): Aktionen["einzelreihe"] => {
    const t = teile.length === 1 ? teile[0]! : null;
    if (t?.art !== "reihe") return undefined;
    const r = plan.reihen.find((x) => x.nr === t.nr);
    if (r?.art !== "doppel" || r.drehung || (entwurf.reihenVersatz ?? []).some((v) => v.nr === t.nr && v.drehung)) return undefined;
    const hat = (seite: WandSeite) => entwurf.wandreihen && entwurf.wandreiheSeite !== (seite === "anfang" ? "ende" : "anfang");
    const seiten = (["anfang", "ende"] as const).filter((x) => !hat(x));
    return seiten.length ? { seiten, text: (seite) => `Einzelreihe ${wandText(entwurf, seite)}`, stellen: (seite) => void anWandFragen(t.nr, seite) } : undefined;
  };
  const aktionen: Aktionen = { ausrichten, drehen, zurueckAnPlatz, entfernen: () => void entfernenFragen(), dreht: teile.length === 1, zurueck: zurueckTeile.length > 0, aufheben: () => setAuswahl([]), einzelreihe: einzelreiheFuer() };
  return { aktionen, einsetzen, fehlendeSetzen, flaecheAufgezogen };
}
