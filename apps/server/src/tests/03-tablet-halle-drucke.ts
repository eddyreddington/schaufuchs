/** Tablet-Abgleich, Impfnachweis bei der Einlieferung, PDF-Drucke. Teil des Schau-Ablaufs: ablauf.test.ts bindet die Teile in fester Reihenfolge ein, sie bauen aufeinander auf. */
import { describe, expect, test } from "bun:test";
import { adminKontext, leer, m } from "./kontext";

describe("Tablet-Abgleich: Vertrag für den Ausgang am Tablet", () => {
  // Das Tablet ordnet die Antworten dem Ausgang über die Reihenfolge zu und sendet bei BAD_REQUEST einzeln.
  test("Ergebnisse in Eingabereihenfolge, zu langer Text lässt den ganzen Stapel scheitern", async () => {
    const [s] = await m.db.select().from(m.schema.schau).where(m.eq(m.schema.schau.slug, "testschau-2026"));
    const [pr] = await m.db.select().from(m.schema.preisrichter).where(m.eq(m.schema.preisrichter.schauId, s!.id));
    const richter = m.appRouter.createCaller({ ...leer, richter: { id: pr!.id, schauId: s!.id, name: pr!.name, istObmann: pr!.istObmann } });
    const eigen = (await richter.richter.daten()).tiere[0]!.id;
    const fremd = 999_999;
    const eintrag = (katalogeintragId: number, maengel = "") => ({ katalogeintragId, punkte: 95, sondernote: null, vorzuege: "", wuensche: "", maengel, geraetZeit: new Date() });

    const r = await richter.richter.abgleich({ bewertungen: [eintrag(fremd), eintrag(eigen), eintrag(fremd)] });
    expect(r.ergebnisse.map((e) => e.katalogeintragId)).toEqual([fremd, eigen, fremd]);
    expect(r.ergebnisse[0]).toMatchObject({ status: "fehler", meldung: "Tier ist Ihnen nicht zugeteilt." });
    expect(r.ergebnisse[1]).not.toMatchObject({ meldung: "Tier ist Ihnen nicht zugeteilt." });

    const fehler = await richter.richter.abgleich({ bewertungen: [eintrag(eigen, "x".repeat(501)), eintrag(eigen)] }).catch((e: unknown) => e);
    expect(fehler).toMatchObject({ code: "BAD_REQUEST" });
    const grenze = await richter.richter.abgleich({ bewertungen: [eintrag(eigen, "x".repeat(500))] });
    expect(grenze.ergebnisse).toHaveLength(1);
  });
});

describe("Einlieferung: Impfnachweis (Audit Paket d)", () => {
  test("Angaben werden auch nach dem Haken gespeichert und protokolliert", async () => {
    const admin = m.appRouter.createCaller(adminKontext);
    const [mel] = await m.db.select().from(m.schema.meldung).limit(1);
    const id = mel!.id;
    const lese = async () => (await m.db.select().from(m.schema.meldung).where(m.eq(m.schema.meldung.id, id)))[0]!;
    const impfEintraege = async () => (await admin.schau.protokoll({ schauId: mel!.schauId, limit: 500 })).filter((x) => x.aktion === "Impfnachweis");

    const leer = { datum: null, impfstoff: "", tierarzt: "" };
    const wg = { datum: null, sentinel: false, stelle: "" };
    // Ohne Datum lässt sich ein nötiger Nachweis nicht als geprüft markieren.
    await admin.halle.vetSetzen({ meldungId: id, nd: leer, pmv: leer, wg, geprueft: false });
    await expect(admin.halle.vetSetzen({ meldungId: id, nd: leer, pmv: leer, wg, geprueft: true })).rejects.toThrow("Datum fehlt");
    await expect(admin.halle.vetSetzen({ meldungId: id, nd: { ...leer, datum: "2099-01-01" }, pmv: leer, wg, geprueft: true })).rejects.toThrow("Zukunft");
    const nd = { datum: "2026-09-01", impfstoff: "Nobilis ND", tierarzt: "Dr. Huhn" };
    const r = await admin.halle.vetSetzen({ meldungId: id, nd, pmv: leer, wg, geprueft: true });
    expect(r.geaendert).toBe(true);
    const nachher = await lese();
    expect(nachher.vetImpfdatum).toBe("2026-09-01");
    expect(nachher.vetImpfstoff).toBe("Nobilis ND");
    expect(nachher.vetTierarzt).toBe("Dr. Huhn");
    expect(nachher.vetGeprueftAm).not.toBeNull();

    // Unverändert erneut gesendet: nichts schreiben, kein weiterer Protokolleintrag
    const vorher = (await impfEintraege()).length;
    expect(vorher).toBeGreaterThanOrEqual(1);
    const gleich = await admin.halle.vetSetzen({ meldungId: id, nd, pmv: leer, wg, geprueft: true });
    expect(gleich.geaendert).toBe(false);
    expect((await impfEintraege()).length).toBe(vorher);

    await expect(admin.halle.vetSetzen({ meldungId: id, nd: { ...nd, datum: "1.9.2026" }, pmv: leer, wg, geprueft: true })).rejects.toThrow("Datum ungültig");
  });
});

describe("PDF-Drucke: Bewertungskarte und Bewertungsliste", () => {
  /**
   * Liest die Textzeilen aus einem pdfkit-PDF: Inhaltsströme entpacken, je TJ-Befehl die Glyphen
   * über die ToUnicode-Tabelle der gerade gesetzten Schrift (Tf) zurück in Text wandeln.
   */
  const textAusPdf = (pdf: Buffer) => {
    const { inflateSync } = require("node:zlib") as typeof import("node:zlib");
    const roh = pdf.toString("latin1");
    const objekte = new Map<number, string>();
    for (const o of roh.matchAll(/(\d+) 0 obj\r?\n([\s\S]*?)\r?\nendobj/g)) objekte.set(Number(o[1]), o[2]!);
    const strom = (inhalt: string) => {
      const s = /stream\r?\n([\s\S]*?)\r?\nendstream/.exec(inhalt);
      if (!s) return null;
      try {
        return inflateSync(Buffer.from(s[1]!, "latin1")).toString("latin1");
      } catch {
        return null;
      }
    };
    const utf16 = (hex: string) => new TextDecoder("utf-16be").decode(Buffer.from(hex, "hex"));
    // Schriftname (F1, F2 …) → Glyph-Code → Text.
    const tabellen = new Map<string, Map<number, string>>();
    for (const r of roh.matchAll(/\/(F\d+) (\d+) 0 R/g)) {
      if (tabellen.has(r[1]!)) continue;
      const font = objekte.get(Number(r[2])) ?? "";
      const tu = /\/ToUnicode (\d+) 0 R/.exec(font);
      const tabelle = new Map<number, string>();
      const cmap = tu ? strom(objekte.get(Number(tu[1])) ?? "") : null;
      if (cmap) {
        for (const b of cmap.matchAll(/<([0-9a-fA-F]+)> <([0-9a-fA-F]+)> \[([^\]]*)\]/g)) {
          const ziele = [...b[3]!.matchAll(/<([0-9a-fA-F]+)>/g)].map((h) => utf16(h[1]!));
          ziele.forEach((t, i) => tabelle.set(parseInt(b[1]!, 16) + i, t));
        }
        // Bereiche ohne Liste (eine Zeile „<von> <bis> <ziel>“) – nicht die Einträge innerhalb einer Liste.
        for (const b of cmap.matchAll(/^<([0-9a-fA-F]+)> <([0-9a-fA-F]+)> <([0-9a-fA-F]+)>$/gm)) {
          for (let c = parseInt(b[1]!, 16), u = parseInt(b[3]!, 16); c <= parseInt(b[2]!, 16); c++, u++) tabelle.set(c, String.fromCharCode(u));
        }
      }
      tabellen.set(r[1]!, tabelle);
    }
    const winAnsi = new TextDecoder("windows-1252");
    const zeilen: string[] = [];
    for (const inhalt of objekte.values()) {
      const text = strom(inhalt);
      if (!text) continue;
      let tabelle: Map<number, string> | undefined;
      for (const t of text.matchAll(/\/(F\d+) [\d.]+ Tf|\[(.*?)\] TJ/g)) {
        if (t[1]) {
          tabelle = tabellen.get(t[1]);
          continue;
        }
        zeilen.push(
          [...t[2]!.matchAll(/<([0-9a-f]+)>/g)]
            .map((h) =>
              tabelle?.size
                ? (h[1]!.match(/.{4}/g) ?? []).map((g) => tabelle!.get(parseInt(g, 16)) ?? "").join("")
                : winAnsi.decode(Buffer.from(h[1]!, "hex")),
            )
            .join(""),
        );
      }
    }
    return zeilen;
  };
  const seiten = (pdf: Buffer) => (pdf.toString("latin1").match(/\/Type \/Page\b(?!s)/g) ?? []).length;

  test("Bewertungsliste nennt nur Preisrichter der eigenen Schau", async () => {
    const { preisrichterListePdf } = await import("../pdf/dokumente");
    const [s] = await m.db.select().from(m.schema.schau).where(m.eq(m.schema.schau.slug, "testschau-2026"));
    const [eigener] = await m.db.select().from(m.schema.preisrichter).where(m.eq(m.schema.preisrichter.schauId, s!.id));
    const admin = m.appRouter.createCaller(adminKontext);
    const fremd = await admin.schau.anlegen({ name: "Fremde Schau PDF", ort: "Anderswo" });
    const f = await admin.preisrichter.speichern({ schauId: fremd.id, name: "Fremder Richter", anschrift: "", email: "", telefon: "", istObmann: false });

    const eigen = await preisrichterListePdf(s!, eigener!.id);
    const eigenText = textAusPdf(eigen);
    expect(eigenText).toContain("BEWERTUNGSLISTE");
    expect(eigenText).toContain(eigener!.name);

    const anfrage = await preisrichterListePdf(s!, f.id);
    expect(anfrage.toString("latin1")).not.toContain("Fremder Richter");
    const text = textAusPdf(anfrage);
    expect(text.join("\n")).not.toContain("Fremder Richter");
    expect(text).toContain("Preisrichter nicht gefunden");
    expect(textAusPdf(await preisrichterListePdf(s!, Number.NaN))).toContain("Preisrichter nicht gefunden");
  });

  test("Bewertungskarte: Schauort, Bewertungstag, Obmann-Feld und lange Texte", async () => {
    const { bewertungskartenPdf } = await import("../pdf/dokumente");
    const { ladeEintraege } = await import("../services/eintraege");
    const [s] = await m.db.select().from(m.schema.schau).where(m.eq(m.schema.schau.slug, "testschau-2026"));
    const schauMitTag = { ...s!, bewertungAm: "2026-11-07" };
    const eintraege = (await ladeEintraege(s!.id, { nurBestaetigt: true })).filter((e) => e.katalogNr != null);
    const v = eintraege.find((e) => e.punkte === 97)!;
    expect(v.obmannBestaetigtAm).not.toBeNull();
    // Bestätigt hat der zweite Obmann (die eigene Note bestätigt niemand selbst).
    const [obmann] = await m.db.select().from(m.schema.preisrichter).where(m.eq(m.schema.preisrichter.id, (await m.db.select().from(m.schema.bewertung).where(m.eq(m.schema.bewertung.katalogeintragId, v.id)))[0]!.obmannBestaetigtVon!));

    // Vorzüge mit der erlaubten Höchstlänge (500 Zeichen) – nur für diesen Druck, danach wiederherstellen.
    const anderes = eintraege.find((e) => e.bewertet && e.id !== v.id)!;
    const lang = "sehr gute Form, kräftiger Körper, breite Brust, ".repeat(11).slice(0, 496) + "ENDE";
    expect(lang).toHaveLength(500);
    await m.db.update(m.schema.bewertung).set({ vorzuege: lang }).where(m.eq(m.schema.bewertung.katalogeintragId, anderes.id));
    let pdf: Buffer;
    try {
      pdf = await bewertungskartenPdf(schauMitTag);
    } finally {
      await m.db.update(m.schema.bewertung).set({ vorzuege: anderes.vorzuege ?? "" }).where(m.eq(m.schema.bewertung.katalogeintragId, anderes.id));
    }
    const text = textAusPdf(pdf);
    // Kein Überlauf auf zusätzliche Seiten: vier A6-Karten je Blatt.
    expect(seiten(pdf)).toBe(Math.ceil(eintraege.length / 4));
    expect(text).toContain("Testschau 2026 · Halle · Bewertung am 07.11.2026");
    // Der lange Text wird verkleinert, nicht abgeschnitten.
    expect(text.join(" ")).toContain("ENDE");
    expect(text.join("")).not.toContain("…");
    // Bei v: Obmann mit Namen über der Unterschriftslinie.
    expect(text.some((t, i) => t === "Unterschrift Obmann" && text[i - 1] === obmann!.name)).toBe(true);
    // Karten ohne v/u.M. bekommen kein Obmann-Feld, leere Karten schon.
    const mitObmannFeld = text.filter((t) => t.startsWith("Unterschrift Obmann")).length;
    expect(mitObmannFeld).toBe(eintraege.filter((e) => !e.bewertet || e.punkte === 97 || e.sondernote === "uM").length);
  });

  test("Felder der Karte: Schrift wird verkleinert, Überlänge mit Auslassungszeichen gekürzt", async () => {
    const { textImFeld, MM, registriereSchriften } = await import("../pdf/basis");
    const PDFDocument = (await import("pdfkit")).default;
    const doc = new PDFDocument({ size: "A4" });
    registriereSchriften(doc);
    const breite = 164 * MM;
    const hoehe = 17 * MM - 2;
    const text = "gute Form ".repeat(50);
    const gr = textImFeld(doc, text, 30, 100, { breite, hoehe, groesse: 10 });
    expect(gr).toBeLessThan(10);
    expect(gr).toBeGreaterThanOrEqual(7);
    expect(doc.fontSize(gr).heightOfString(text, { width: breite })).toBeLessThanOrEqual(hoehe);
    // Kurzer Text bleibt in Originalgröße.
    expect(textImFeld(doc, "gute Form", 30, 200, { breite, hoehe, groesse: 10 })).toBe(10);
    // Einzeiliges Feld (Preise): erst kleiner, dann gekürzt – nie mehr als eine Zeile.
    expect(textImFeld(doc, "E VB LVEB SZB", 30, 300, { breite: 43 * MM, groesse: 14, min: 8, schrift: "Helvetica-Bold" })).toBe(14);
    const klein = textImFeld(doc, "LVEB1 SZB12 KVB123 ZB1234 E123456789", 30, 320, { breite: 43 * MM, groesse: 14, min: 8, schrift: "Helvetica-Bold" });
    expect(klein).toBeLessThan(14);
    expect(klein).toBeGreaterThanOrEqual(8);
    const zuLang = textImFeld(doc, "LVEB1 SZB12 KVB123 ZB1234 E123456789 ".repeat(3), 30, 400, { breite: 43 * MM, groesse: 14, min: 8, schrift: "Helvetica-Bold" });
    expect(zuLang).toBe(8);
    expect(doc.y - 400).toBeLessThanOrEqual(doc.currentLineHeight(true) + 0.01);
    doc.end();
  });
});
