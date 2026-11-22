/**
 * Kennzeichen „Jgd.“ für Jugendtiere, wenn die Jugend in der Rasse eingereiht steht: im gedruckten Katalog (zwei Spalten,
 * Tabelle, Kurzkatalog, Legende), im Online-Katalog und in den öffentlichen Ergebnissen. Beim eigenen Block kein Kürzel.
 * Gegenproben: Senioren nie, beim Block nirgends, ohne Online-Einwilligung kein Name (nur die Zeile wie beim Block).
 * Teil des Schau-Ablaufs.
 */
import { describe, expect, test } from "bun:test";
import { adminKontext, leer, m, pdfText } from "./kontext";

const al = () => m.appRouter.createCaller(adminKontext);
const aussteller = (vorname: string, nachname: string) => ({ vorname, nachname, strasse: "", plz: "", ort: "", telefon: "", email: "", verein: "", kreisverband: "", registriernummer: "", geburtsdatum: null, istPreisrichter: false, iban: "", kontoinhaber: "" });
const pos = (farbenschlagId: number) => ({ farbenschlagId, freitext: "", art: "einzeltier" as const, geschlecht: "1,0", alter: "jung" as const, istAoc: false, istNeuzuechtung: false, eigeneZucht: true, verkaufspreisCent: null });

describe("Jugend-Kennzeichen „Jgd.“", () => {
  test("eingereiht: Kürzel an der Tierzeile in Druck, Online-Katalog und Ergebnissen; Block: nirgends", async () => {
    const { id } = await al().schau.anlegen({ name: "Jugend Kennzeichen", ort: "Halle" });
    const s0 = await al().schau.get({ id });
    const [fs] = (await m.sql`
      select f.id from farbenschlag f join rasse r on r.id = f.rasse_id
      where r.version_id = ${s0.stammdatenVersionId!} order by r.folge, f.folge limit 1`) as unknown as { id: number }[];
    const melde = async (vorname: string, nachname: string, n: number, istJugend: boolean, online: boolean) => {
      const r = await al().meldung.speichern({ schauId: id, aussteller: aussteller(vorname, nachname), eingang: "papier", istJugend, bemerkung: "", zustimmung: true, positionen: Array.from({ length: n }, () => pos(fs!.id)) });
      await al().meldung.statusSetzen({ id: r.meldungId, status: "bestaetigt" });
      if (online) await m.db.update(m.schema.meldung).set({ onlineZustimmungAm: new Date(), ...(istJugend ? { erziehungsberechtigter: "Erika Elternteil" } : {}) }).where(m.eq(m.schema.meldung.id, r.meldungId));
    };
    await melde("Senta", "Seniorin", 2, false, true);
    await melde("Jonas", "Junior", 2, true, true);
    // Jugendlicher ohne Online-Einwilligung: im Internet ohne Namen.
    await melde("Vera", "Verborgen", 1, true, false);

    const einstellen = async (jugendSeparat: boolean) => {
      await al().schau.aktualisieren({ id, daten: { ...(await al().schau.get({ id })), jugendSeparat } });
      await al().katalog.nummernVergeben({ schauId: id });
      await m.db.update(m.schema.schau).set({ ergebnisseFreigegeben: true }).where(m.eq(m.schema.schau.id, id));
      const [s] = await m.db.select().from(m.schema.schau).where(m.eq(m.schema.schau.id, id));
      return s!;
    };
    const { katalogPdf } = await import("../pdf/katalog");
    /** Zeilen des PDFs (pdftotext -layout), Leerraum vereinheitlicht. */
    const zeilen = (pdf: Buffer) => pdfText(pdf).split("\n").map((z) => z.replace(/\s+/g, " ").trim());
    const ergebnisse = () => m.appRouter.createCaller(leer).oeffentlich.ergebnisse({ slug: s0.slug });

    // ── in der Rasse eingereiht ──
    let s = await einstellen(false);
    for (const [art, pdf] of [
      ["zweispaltig", await katalogPdf(s, { vorschau: { aufteilung: "zweispaltig" } })],
      ["Tabelle", await katalogPdf(s, { vorschau: { aufteilung: "tabelle" } })],
      ["Kurzkatalog", await katalogPdf(s, { kurz: true })],
    ] as const) {
      const z = zeilen(pdf);
      // Beide Tiere des Jugendlichen tragen das Kürzel hinter dem Namen, in derselben Zeile (kein Umbruch).
      expect({ art, n: z.filter((x) => /^\d+ .*Junior, Jonas Jgd\.$/.test(x)).length }).toEqual({ art, n: 2 });
      expect({ art, n: z.filter((x) => /Verborgen, Vera Jgd\./.test(x)).length }).toEqual({ art, n: 1 });
      // Gegenprobe: Senioren nie.
      expect({ art, n: z.filter((x) => /Seniorin, Senta/.test(x) && /Jgd\./.test(x)).length }).toEqual({ art, n: 0 });
      expect({ art, n: z.filter((x) => /^\d+ .*Seniorin, Senta/.test(x)).length }).toEqual({ art, n: 2 }); // ohne das Ausstellerverzeichnis
      // Legende erklärt das Kürzel; keine eigene Abteilung „Jugend“.
      expect(z.some((x) => /^Jgd\. Tier der Jugend/.test(x))).toBe(true);
      expect(z.some((x) => /jugendabteilung/i.test(x))).toBe(false);
    }

    // Online-Katalog: nur mit Einwilligung ein Name – ohne steht die Zeile wie sonst mit „nicht veröffentlicht“.
    const online = zeilen(await katalogPdf(s, { online: true }));
    expect(online.filter((x) => /Junior, Jonas Jgd\./.test(x)).length).toBe(2);
    expect(online.filter((x) => /nicht veröffentlicht Jgd\./.test(x)).length).toBe(1);
    expect(online.some((x) => /Verborgen|Vera|Erika|Elternteil/.test(x))).toBe(false);
    // Der öffentliche Katalog unter /s/…/katalog.pdf ist derselbe Satz.
    const server = (await import("../index")).default;
    const r = await server.fetch(new Request(`http://test/s/${s0.slug}/katalog.pdf`));
    expect(r.status).toBe(200);
    expect(zeilen(Buffer.from(await r.arrayBuffer())).filter((x) => /Junior, Jonas Jgd\./.test(x)).length).toBe(2);

    // Öffentliche Ergebnisse: Kennzeichen je Tier, keine Namen ohne Einwilligung, kein Erziehungsberechtigter.
    const e1 = await ergebnisse();
    expect(e1.freigegeben).toBe(true);
    if (!e1.freigegeben) throw new Error("nicht freigegeben");
    const kenn = (aus: string) => e1.tiere.filter((t) => t.aussteller === aus).map((t) => t.jugendKennzeichen);
    expect(kenn("Jonas Junior")).toEqual([true, true]);
    expect(kenn("Senta Seniorin")).toEqual([false, false]);
    expect(kenn("nicht veröffentlicht")).toEqual([true]);
    expect(JSON.stringify(e1)).not.toMatch(/Verborgen|Vera|Erika|Elternteil|geburtsdatum/);

    // ── eigener Block am Ende: die Überschrift „Jugend“ kennzeichnet, nirgends ein Kürzel ──
    s = await einstellen(true);
    for (const pdf of [await katalogPdf(s), await katalogPdf(s, { vorschau: { aufteilung: "tabelle" } }), await katalogPdf(s, { kurz: true }), await katalogPdf(s, { online: true })]) {
      const text = pdfText(pdf);
      expect(text).not.toContain("Jgd.");
      expect(text).toMatch(/jugendabteilung/i);
    }
    const e2 = await ergebnisse();
    if (!e2.freigegeben) throw new Error("nicht freigegeben");
    expect(e2.tiere.map((t) => t.jugendKennzeichen)).toEqual(e2.tiere.map(() => false));
    expect(e2.tiere.filter((t) => t.istJugend).length).toBe(3);
  });
});
