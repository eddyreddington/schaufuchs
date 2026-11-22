/**
 * Hallenplan: Pokaltisch (Tisch für die Ehrenpreise) als eingesetztes Möbel – gespeichert mit Maßen, kein Käfigplatz, bleibt
 * beim Neu-Setzen, im gedruckten Plan mit Legende „Pokaltisch“. Teil des Schau-Ablaufs.
 */
import { describe, expect, test } from "bun:test";
import { halleSchluessel, istMoebel, type Halle } from "@schau/domain";
import { adminKontext, m, pdfText } from "./kontext";

describe("Hallenplan: Pokaltisch", () => {
  const al = () => m.appRouter.createCaller(adminKontext);
  test("einsetzen, speichern, neu setzen und drucken", async () => {
    const { hallenplanPdf } = await import("../pdf/hallenplan");
    const { id } = await al().schau.anlegen({ name: "Ehrenpreise", ort: "Halle" });
    const halle = {
      breite: 1000, laenge: 2000, gang: 150, richtung: "laengs" as const, wandreihen: false, quergang: false, wandBuendig: true, hauptgang: { breite: 0, lage: "keiner" as const }, platte: { laenge: 210, tiefe: 70 }, jePlatte: {}, reihenVersatz: [], plattenVersatz: [], spartenStart: [], flaechen: [],
      objekte: [
        { id: "p1", art: "pokaltisch" as const, x: 400, y: 1800, drehung: 0 as const },
        { id: "p2", art: "pokaltisch" as const, x: 100, y: 1600, drehung: 90 as const, laenge: 300, tiefe: 60 },
      ],
    };
    await al().katalog.halleSetzen({ schauId: id, halle });
    // Maße wie beim Tisch begrenzt.
    await expect(al().katalog.halleSetzen({ schauId: id, halle: { ...halle, objekte: [{ ...halle.objekte[0]!, tiefe: 5 }] } })).rejects.toThrow();
    let d = await al().katalog.hallenplan({ schauId: id });
    expect(d.halle!.objekte!.filter(istMoebel)).toEqual(halle.objekte);
    expect(d.plan!.objekte.map((o) => [o.name, o.rechteck.b, o.rechteck.h, o.plaetze])).toEqual([["Pokaltisch 1", 200, 80, 0], ["Pokaltisch 2", 60, 300, 0]]);
    expect(d.plan!.warnungen).toEqual([]);

    // Neu setzen: die Pokaltische bleiben stehen wie die anderen Möbel.
    await al().katalog.planNeuSetzen({ schauId: id, basis: halleSchluessel(d.halle as Halle), halle: { ...d.halle!, richtung: "quer" } as never, grund: "Halle: Reihenrichtung" });
    d = await al().katalog.hallenplan({ schauId: id });
    expect(d.halle!.objekte!.filter(istMoebel).map((o) => [o.id, o.art])).toEqual([["p1", "pokaltisch"], ["p2", "pokaltisch"]]);

    // Gedruckter Plan: Legende mit „Pokaltisch“.
    const zeile = (await m.db.select().from(m.schema.schau).where(m.eq(m.schema.schau.id, id)))[0]!;
    expect(pdfText(await hallenplanPdf(zeile))).toContain("Pokaltisch");
  });
});
