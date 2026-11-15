/**
 * Nachbesserungen aus der Gesamtprüfung vom 13.11.2026 (interne Prüfung): Sperren nach Festschreiben und
 * Abschluss, Geld-Lücken, Protokoll, rechtssicherer Katalog. Teil des Schau-Ablaufs.
 */
import { describe, expect, test } from "bun:test";
import { adminKontext, leer, m, pdfText } from "./kontext";

const ausstellerDaten = (nachname: string, extra: object = {}) => ({
  vorname: "Prüf", nachname, strasse: "", plz: "", ort: "", telefon: "", email: "", verein: "", kreisverband: "", registriernummer: "065350150099", geburtsdatum: null, istPreisrichter: false, ...extra,
});

/** Schau mit einer bestätigten Meldung über `n` Wyandotten mit Katalognummern. */
async function schauMitTieren(name: string, n: number) {
  const al = m.appRouter.createCaller(adminKontext);
  const { id } = await al.schau.anlegen({ name, ort: "Halle" });
  const s = await al.schau.get({ id });
  const [wy] = await al.stammdaten.suche({ versionId: s.stammdatenVersionId!, q: "Wyandotten weiß" });
  const [br] = await al.stammdaten.suche({ versionId: s.stammdatenVersionId!, q: "Brahma" });
  const pos = { farbenschlagId: wy!.id, freitext: "", art: "einzeltier" as const, geschlecht: "1,0", alter: "jung" as const, istAoc: false, istNeuzuechtung: false, eigeneZucht: true, verkaufspreisCent: null };
  const r = await al.meldung.speichern({ schauId: s.id, aussteller: ausstellerDaten(name), eingang: "papier", istJugend: false, bemerkung: "", zustimmung: true, positionen: Array.from({ length: n }, () => pos) });
  await al.meldung.statusSetzen({ id: r.meldungId, status: "bestaetigt" });
  await al.katalog.nummernVergeben({ schauId: s.id });
  const tiere = (await al.katalog.liste({ schauId: s.id })).sort((a, b) => a.katalogNr! - b.katalogNr!);
  return { al, s, meldungId: r.meldungId, tiere, pos, brahmaId: br!.id };
}
const phase = (id: number, p: string) => m.db.update(m.schema.schau).set({ phase: p as never }).where(m.eq(m.schema.schau.id, id));

describe("Nachbesserung Gesamtprüfung: Sperren", () => {
  test("abgeschlossene Schau ist nur zu lesen: Bewertung, Einteilung, Nummern, Festschreiben, Tierstatus, Impfnachweis, Freigabe, Zahlungsstorno", async () => {
    const { al, s, meldungId, tiere } = await schauMitTieren("Abschluss Sperre", 2);
    await al.preisrichter.speichern({ schauId: s.id, name: "PR Sperre", anschrift: "", telefon: "", email: "", istObmann: true, sparten: [] });
    const prId = (await m.db.select().from(m.schema.preisrichter).where(m.eq(m.schema.preisrichter.schauId, s.id)))[0]!.id;
    await phase(s.id, "abrechnung");
    const z = await al.meldung.zahlungErfassen({ meldungId, betragCent: 500, datum: "2026-11-13", art: "bar" });
    await m.db.update(m.schema.katalogeintrag).set({ status: "eingeliefert" }).where(m.inArray(m.schema.katalogeintrag.id, tiere.map((t) => t.id)));
    await phase(s.id, "abgeschlossen");
    const zahlungen = await m.db.select().from(m.schema.zahlung).where(m.eq(m.schema.zahlung.meldungId, meldungId));
    expect(z).toBeTruthy();
    const t = tiere[0]!.id;
    const gesperrt = /abgeschlossen/i;
    await expect(al.bewertung.setzen({ schauId: s.id, katalogeintragId: t, punkte: 94, sondernote: null, vorzuege: "", wuensche: "", maengel: "", geraetZeit: new Date(), grund: "Test" } as never)).rejects.toThrow(gesperrt);
    await expect(al.bewertung.zuruecksetzen({ schauId: s.id, katalogeintragId: t, grund: "Test" })).rejects.toThrow(gesperrt);
    await expect(al.bewertung.obmannBestaetigen({ schauId: s.id, katalogeintragId: t, obmannId: prId })).rejects.toThrow(gesperrt);
    await expect(al.preisrichter.einteilungSetzen({ schauId: s.id, einteilung: [{ preisrichterId: prId, vonNr: 1, bisNr: 2 }] } as never)).rejects.toThrow(gesperrt);
    await expect(al.preisrichter.zuteilungSetzen({ schauId: s.id, regeln: [] })).rejects.toThrow(gesperrt);
    await expect(al.katalog.nummernVergeben({ schauId: s.id })).rejects.toThrow(gesperrt);
    await expect(al.katalog.gedrucktSetzen({ schauId: s.id, gedruckt: true })).rejects.toThrow(gesperrt);
    await expect(al.halle.statusSetzen({ schauId: s.id, ids: [t], status: "fehlt", uebersteuern: "Test" })).rejects.toThrow(gesperrt);
    const leer = { datum: null, impfstoff: "", tierarzt: "" };
    await expect(al.halle.vetSetzen({ meldungId, nd: leer, pmv: leer, wg: { datum: null, sentinel: false, stelle: "" }, geprueft: false })).rejects.toThrow(gesperrt);
    await expect(al.preise.freigeben({ schauId: s.id, freigegeben: true, trotzdem: true })).rejects.toThrow(gesperrt);
    await expect(al.preise.freigeben({ schauId: s.id, freigegeben: false, trotzdem: true })).rejects.toThrow(gesperrt);
    await expect(al.meldung.zahlungStornieren({ id: zahlungen[0]!.id, grund: "Test nach Abschluss" })).rejects.toThrow(gesperrt);
    // Nach dem Zurückstellen geht es wieder.
    await phase(s.id, "abrechnung");
    await al.meldung.zahlungStornieren({ id: zahlungen[0]!.id, grund: "Test nach Rückstellung" });
  });

  test("nach dem Festschreiben: Tiermerkmale nummerierter Tiere gesperrt, gedruckte Nummern nie neu vergeben; Nachmeldung geht", async () => {
    const { al, s, meldungId, tiere, pos, brahmaId } = await schauMitTieren("Festschreiben Sperre", 3);
    await al.katalog.gedrucktSetzen({ schauId: s.id, gedruckt: true });
    const meldung = await al.meldung.get({ id: meldungId });
    const positionen = meldung.eintraege.map((e) => ({ ...pos, id: e.id }));
    const daten = { schauId: s.id, meldungId, aussteller: { ...ausstellerDaten("Festschreiben Sperre"), id: meldung.meldung.ausstellerId }, eingang: "papier" as const, istJugend: false, bemerkung: "", zustimmung: true };
    // Geschlecht, Rasse oder Alter eines nummerierten Tiers ändern: gesperrt.
    await expect(al.meldung.speichern({ ...daten, positionen: positionen.map((p, i) => (i === 0 ? { ...p, geschlecht: "0,1" } : p)) } as never)).rejects.toThrow(/festgeschrieben/);
    await expect(al.meldung.speichern({ ...daten, positionen: positionen.map((p, i) => (i === 0 ? { ...p, farbenschlagId: brahmaId } : p)) } as never)).rejects.toThrow(/festgeschrieben/);
    await expect(al.meldung.speichern({ ...daten, positionen: positionen.map((p, i) => (i === 0 ? { ...p, alter: "alt" } : p)) } as never)).rejects.toThrow(/festgeschrieben/);
    // Ein nummeriertes Tier entfernen: gesperrt (die gedruckte Nummer gehörte sonst bald einem anderen Tier).
    await expect(al.meldung.speichern({ ...daten, positionen: positionen.slice(0, 2) } as never)).rejects.toThrow(/festgeschrieben/);
    // Nachmeldung eines weiteren Tiers geht und bekommt eine neue Unternummer.
    await al.meldung.speichern({ ...daten, positionen: [...positionen, pos] } as never);
    await al.katalog.nummernVergeben({ schauId: s.id });
    const nachher = (await al.katalog.liste({ schauId: s.id })).map((e) => `${e.katalogNr}${e.suffix}`);
    expect(nachher).toEqual(expect.arrayContaining(tiere.map((t) => `${t.katalogNr}${t.suffix}`)));
    expect(new Set(nachher).size).toBe(4);
  });
});

describe("Nachbesserung Gesamtprüfung: Geld und Protokoll", () => {
  const helferKontext = () => ({ ...adminKontext, benutzer: { ...adminKontext.benutzer!, rolle: "mitarbeiter" as const } });
  const meldegeld = async (al: ReturnType<typeof m.appRouter.createCaller>, schauId: number, cent: number) =>
    al.schau.gebuehrenSetzen({ schauId, gebuehren: [{ art: "einzeltier", jugend: false, betragCent: cent, befreitPreisrichter: false }] } as never);
  const protokoll = async (tabelle: string, id: number) => (await m.db.select().from(m.schema.aenderung)).filter((a) => a.tabelle === tabelle && a.datensatzId === id);

  test("stornierte, aber bezahlte Meldung hält den Abschluss auf, bis erstattet oder Verfall mit Grund gebucht ist", async () => {
    const { al, s, meldungId } = await schauMitTieren("Storno Verfall", 1);
    await al.meldung.zahlungErfassen({ meldungId, betragCent: 1200, datum: "2026-11-13", art: "ueberweisung" });
    await al.meldung.statusSetzen({ id: meldungId, status: "storniert", grund: "Aussteller abgesprungen" } as never);
    await phase(s.id, "abrechnung");
    await expect(al.schau.phaseSetzen({ id: s.id, phase: "abgeschlossen" })).rejects.toThrow(/storniert|Verfall/);
    await expect(al.meldung.verfallBuchen({ id: meldungId, grund: "" })).rejects.toThrow();
    await expect(m.appRouter.createCaller(helferKontext()).meldung.verfallBuchen({ id: meldungId, grund: "Laut AAB verfallen" })).rejects.toThrow();
    await al.meldung.verfallBuchen({ id: meldungId, grund: "Laut AAB verfällt das Meldegeld bei Rücktritt nach Meldeschluss" });
    expect((await protokoll("meldung", meldungId)).some((a) => a.aktion === "Verfall")).toBe(true);
    await expect(al.meldung.verfallBuchen({ id: meldungId, grund: "noch einmal" })).rejects.toThrow(/nichts/i);
    // Mit gebuchtem Verfall lässt sich die Meldung nicht wieder bestätigen (der Betrag gehört dann dem Verein).
    await expect(al.meldung.statusSetzen({ id: meldungId, status: "bestaetigt", grund: "doch" } as never)).rejects.toThrow(/Verfall/);
    // Das Geld hält den Abschluss nicht mehr auf; offen bleibt hier nur die Prüfliste (nie bewertet, nie freigegeben).
    const rest = await al.schau.phaseSetzen({ id: s.id, phase: "abgeschlossen" }).then(() => "", (e: Error) => e.message);
    expect(rest).not.toMatch(/storniert|Verfall/);
    await al.schau.phaseSetzen({ id: s.id, phase: "abgeschlossen", trotzdem: true, grund: "Test: Prüfliste hier nicht Thema" });
  });

  test("Helfer bucht bar höchstens den offenen Betrag; die Überzahlung bucht nur die Ausstellungsleitung", async () => {
    const { al, s, meldungId } = await schauMitTieren("Helfer Ueberzahlung", 2);
    await meldegeld(al, s.id, 500);
    const helfer = m.appRouter.createCaller(helferKontext());
    await expect(helfer.meldung.zahlungErfassen({ meldungId, betragCent: 50_000, datum: "2026-11-13", art: "bar" })).rejects.toThrow(/offen|Ausstellungsleitung/);
    await helfer.meldung.zahlungErfassen({ meldungId, betragCent: 600, datum: "2026-11-13", art: "bar" });
    await expect(helfer.meldung.zahlungErfassen({ meldungId, betragCent: 500, datum: "2026-11-13", art: "bar" })).rejects.toThrow(/offen|Ausstellungsleitung/);
    await helfer.meldung.zahlungErfassen({ meldungId, betragCent: 400, datum: "2026-11-13", art: "bar" });
    await al.meldung.zahlungErfassen({ meldungId, betragCent: 100, datum: "2026-11-13", art: "bar" });
  });

  test("Verkauf per Überweisung: Erlös erst nach Zahlungseingang in der Abrechnung, Ausgabe erst danach", async () => {
    const { al, s, tiere } = await schauMitTieren("Ueberweisung Verkauf", 1);
    const { verkaufsbereit } = await import("./kontext");
    await m.db.update(m.schema.katalogeintrag).set({ verkaufspreisCent: 2500 }).where(m.eq(m.schema.katalogeintrag.id, tiere[0]!.id));
    await verkaufsbereit(s.id, [tiere[0]!.id]);
    const v = await al.kasse.verkaufen({ schauId: s.id, katalogeintragId: tiere[0]!.id, kaeuferName: "Käufer Test", kaeuferAnschrift: "", kaeuferRegistriernummer: "065350150011", kaeuferAlter: "ab16", zahlart: "ueberweisung" });
    const belegNr = (v as { belegNr: number }).belegNr;
    const zeile = async () => (await al.kasse.abrechnung({ schauId: s.id })).find((z) => z.tiere === 1)!;
    expect((await zeile()).verkaufCent ?? 0).toBe(0);
    await expect(al.halle.statusSetzen({ schauId: s.id, ids: [tiere[0]!.id], status: "ausgesetzt", belegNr })).rejects.toThrow(/Überweisung|Zahlungseingang/);
    const verkaufId = (await m.db.select().from(m.schema.verkauf).where(m.eq(m.schema.verkauf.katalogeintragId, tiere[0]!.id)))[0]!.id;
    await expect(m.appRouter.createCaller(helferKontext()).kasse.zahlungseingangVerkauf({ schauId: s.id, verkaufId, datum: "2026-11-13" })).rejects.toThrow();
    await al.kasse.zahlungseingangVerkauf({ schauId: s.id, verkaufId, datum: "2026-11-13" });
    await expect(al.kasse.zahlungseingangVerkauf({ schauId: s.id, verkaufId, datum: "2026-11-13" })).rejects.toThrow(/schon/);
    expect((await zeile()).verkaufCent).toBe(2500);
    await al.halle.statusSetzen({ schauId: s.id, ids: [tiere[0]!.id], status: "ausgesetzt", belegNr });
    expect((await protokoll("verkauf", verkaufId)).some((a) => a.aktion === "Zahlungseingang")).toBe(true);
  });

  test("Protokoll: geänderte Texte der Bewertungskarte und die automatische Bestätigung nach Zahlung", async () => {
    const { al, s, meldungId, tiere } = await schauMitTieren("Protokoll Texte", 1);
    await phase(s.id, "bewertung");
    const t = tiere[0]!.id;
    await m.db.update(m.schema.katalogeintrag).set({ status: "eingeliefert" }).where(m.eq(m.schema.katalogeintrag.id, t));
    const karte = { schauId: s.id, katalogeintragId: t, punkte: 94, sondernote: null, wuensche: "", maengel: "", geraetZeit: new Date(), grund: "" };
    await al.bewertung.setzen({ ...karte, vorzuege: "gute Form" } as never);
    await al.bewertung.setzen({ ...karte, vorzuege: "sehr gute Form, Kopf" } as never);
    const eintraege = (await protokoll("bewertung", t)).sort((a, b) => a.id - b.id);
    const letzte = eintraege.at(-1)!;
    expect(JSON.stringify(letzte.alt)).toContain("gute Form");
    expect(JSON.stringify(letzte.neu)).toContain("sehr gute Form, Kopf");
    // Automatische Bestätigung: eine offene Meldung wird mit der vollen Zahlung bestätigt – mit Protokolleintrag.
    const zweite = await schauMitTieren("Protokoll Bestaetigung", 1);
    await meldegeld(zweite.al, zweite.s.id, 700);
    await zweite.al.meldung.statusSetzen({ id: zweite.meldungId, status: "offen", grund: "Test" } as never);
    await zweite.al.meldung.zahlungErfassen({ meldungId: zweite.meldungId, betragCent: 700, datum: "2026-11-13", art: "ueberweisung" });
    expect((await zweite.al.meldung.get({ id: zweite.meldungId })).meldung.status).toBe("bestaetigt");
    expect((await protokoll("meldung", zweite.meldungId)).some((a) => a.aktion === "Status" && /automatisch/.test(String(a.grund)))).toBe(true);
  });
});

describe("Nachbesserung Gesamtprüfung: rechtssicherer Katalog", () => {
  const JPG = "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDABALDA4MChAODQ4SERATGCgaGBYWGDEjJR0oOjM9PDkzODdASFxOQERXRTc4UG1RV19iZ2hnPk1xeXBkeFxlZ2P/2wBDARESEhgVGC8aGi9jQjhCY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2P/wAARCAACAAQDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAABQb/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCKALXj/9k=";
  const flach = (t: string) => t.replace(/\s+/g, " ");

  test("Impressum mit Anschrift und Druck, Bildnachweis der Vereinsbilder, Widerspruch, Preisrichter-Anschrift nur mit Einverständnis", async () => {
    const { pdfText } = await import("./kontext");
    const { katalogPdf } = await import("../pdf/katalog");
    const { checkliste } = await import("../services/pruefung");
    const { al, s } = await schauMitTieren("Impressum Schau", 2);
    const [org] = await m.db.select().from(m.schema.organisation).where(m.eq(m.schema.organisation.id, adminKontext.benutzer!.organisationId));
    try {
      await m.db.update(m.schema.organisation).set({ name: "GZV Prüfverein e. V.", anschrift: "Hauptstraße 1\n12345 Musterdorf", vertretung: "Max Muster (1. Vorsitzender)" }).where(m.eq(m.schema.organisation.id, org!.id));
      await phase(s.id, "katalog");
      const basis = { format: "A4" as const, untertitel: "", schirmherr: "", ausstellungsleitung: "", eintritt: "", farbe: "#2f5d3a" };
      await al.katalogGestaltung.speichern({ schauId: s.id, daten: basis });
      // Ohne Angabe „Druck“: Fehler in der Prüfliste.
      expect((await checkliste(s.id)).some((p) => p.art === "fehler" && /Druck/.test(p.text))).toBe(true);
      await al.katalogGestaltung.speichern({ schauId: s.id, daten: { ...basis, druck: "Eigendruck" } });
      expect((await checkliste(s.id)).some((p) => /Angabe „Druck“/.test(p.text))).toBe(false);

      // Vereinsbild mit fremdem Urheber; NC-Lizenz wird abgelehnt.
      await expect(al.katalogGestaltung.bildHochladen({ schauId: s.id, rolle: "titel", name: "t.jpg", base64: JPG, angaben: { urheber: "X", lizenz: "CC BY-NC 4.0", quelle: "" } })).rejects.toThrow(/kommerziell/);
      await al.katalogGestaltung.bildHochladen({ schauId: s.id, rolle: "titel", name: "t.jpg", base64: JPG, angaben: { urheber: "Foto Muster", lizenz: "CC BY-SA 4.0", quelle: "" } });

      // Preisrichter mit Anschrift: im Katalog nur mit Einverständnis.
      await al.preisrichter.speichern({ schauId: s.id, name: "PR Anschrift", anschrift: "Richterweg 7, 12345 Prüfstadt", telefon: "", email: "", istObmann: true, sparten: [] });
      const zeile = async () => (await m.db.select().from(m.schema.schau).where(m.eq(m.schema.schau.id, s.id)))[0]!;
      let text = flach(pdfText(await katalogPdf(await zeile())));
      expect(text).toContain("Herausgeber: GZV Prüfverein e. V., Hauptstraße 1, 12345 Musterdorf");
      expect(text).toContain("Druck: Eigendruck");
      expect(text).toContain("Bildnachweis");
      expect(text).toContain("Foto Muster");
      expect(text).toContain("creativecommons.org/licenses/by-sa/4.0");
      expect(text).not.toContain("Richterweg 7");
      const prId = (await m.db.select().from(m.schema.preisrichter).where(m.eq(m.schema.preisrichter.schauId, s.id)))[0]!.id;
      await al.preisrichter.speichern({ schauId: s.id, id: prId, name: "PR Anschrift", anschrift: "Richterweg 7, 12345 Prüfstadt", telefon: "", email: "", istObmann: true, sparten: [], anschriftImKatalog: true });
      text = flach(pdfText(await katalogPdf(await zeile())));
      expect(text).toContain("Richterweg 7");

      // Widerspruch gegen die Nennung: Name weg, AAB-Zustimmung bleibt.
      expect(text).toContain("Impressum Schau, Prüf");
      const mid = (await m.db.select().from(m.schema.meldung).where(m.eq(m.schema.meldung.schauId, s.id)))[0]!;
      const meld = await al.meldung.get({ id: mid.id });
      await al.meldung.speichern({
        schauId: s.id, meldungId: mid.id, aussteller: { ...ausstellerDaten("Impressum Schau"), id: mid.ausstellerId }, eingang: "papier", istJugend: false, bemerkung: "", zustimmung: true,
        namenWiderspruch: true, positionen: meld.eintraege.map((e) => ({ id: e.id, farbenschlagId: e.farbenschlagId, freitext: "", art: e.art, geschlecht: e.geschlecht, alter: e.alter, istAoc: false, istNeuzuechtung: false, eigeneZucht: true, verkaufspreisCent: null })),
      } as never);
      const nachher = (await m.db.select().from(m.schema.meldung).where(m.eq(m.schema.meldung.id, mid.id)))[0]!;
      expect(nachher.namenWiderspruchAm).not.toBeNull();
      expect(nachher.zustimmungAm).not.toBeNull();
      text = flach(pdfText(await katalogPdf(await zeile())));
      expect(text).not.toContain("Impressum Schau, Prüf");
      expect(text).toContain("nicht veröffentlicht");
    } finally {
      await m.db.update(m.schema.organisation).set({ name: org!.name, anschrift: org!.anschrift, vertretung: org!.vertretung }).where(m.eq(m.schema.organisation.id, org!.id));
    }
  });

  test("Rassebild: „Passt“ nur mit katalogtauglicher Lizenz", async () => {
    const al = m.appRouter.createCaller(adminKontext);
    const { id } = await al.schau.anlegen({ name: "Lizenz Schau", ort: "Halle" });
    const versionId = (await al.schau.get({ id })).stammdatenVersionId!;
    const z = (await al.rassebild.liste({ versionId })).find((x) => x.rasse.includes("Brahma"))!;
    const r = await al.rassebild.hochladen({ rasse: z.rasse, base64: JPG });
    expect(r.geprueft).toBe(false);
    const bildId = (await al.rassebild.liste({ versionId })).find((x) => x.rasse === z.rasse)!.bild!.id;
    const leer = { urheber: "", lizenz: "", lizenzUrl: "", quelle: "" };
    await expect(al.rassebild.angabenSetzen({ id: bildId, ...leer, geprueft: true })).rejects.toThrow(/Lizenz fehlt/);
    await expect(al.rassebild.angabenSetzen({ id: bildId, ...leer, urheber: "X", lizenz: "CC BY-NC-SA 4.0", geprueft: true })).rejects.toThrow(/kommerziell/);
    await expect(al.rassebild.angabenSetzen({ id: bildId, ...leer, lizenz: "CC BY 4.0", geprueft: true })).rejects.toThrow(/Urheber/);
    await al.rassebild.angabenSetzen({ id: bildId, ...leer, urheber: "Foto Muster", lizenz: "CC BY 4.0", geprueft: true });
    const b = (await al.rassebild.liste({ versionId })).find((x) => x.rasse === z.rasse)!.bild!;
    expect(b).toMatchObject({ geprueft: true, lizenzUrl: "https://creativecommons.org/licenses/by/4.0/" });
    // Aufräumen: das Testbild soll keine anderen Tests beeinflussen.
    await al.rassebild.loeschen({ id: bildId });
  });
});

describe("Nachbesserung Gesamtprüfung: Tierseuchenrecht und Absage", () => {
  const leer = { datum: null, impfstoff: "", tierarzt: "" };
  test("klinische Untersuchung, ND-Fristen und ausländische Herkunft bestimmen, ob der Nachweis „geprüft“ sein kann", async () => {
    const { al, s, meldungId } = await schauMitTieren("Seuchenrecht Schau", 1);
    const daten = await al.schau.get({ id: s.id });
    const setze = (teil: object) => al.schau.aktualisieren({ id: s.id, daten: { ...daten, ...teil } as never });
    // Bescheinigung verlangt: ohne Datum nicht prüfbar, mit aktueller Bescheinigung schon.
    await setze({ untersuchung: "bescheinigung", untersuchungTage: 6, bewertungAm: null });
    const heute = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(new Date());
    const vor = (tage: number) => new Date(Date.parse(`${heute}T12:00:00Z`) - tage * 86_400_000).toISOString().slice(0, 10);
    const nd = { datum: vor(30), impfstoff: "Nobilis", tierarzt: "Dr. Test" };
    await expect(al.halle.vetSetzen({ meldungId, nd, pmv: leer, wg: { datum: null, sentinel: false, stelle: "" }, kl: { datum: null, tierarzt: "" }, geprueft: true })).rejects.toThrow(/Klinische Untersuchung/);
    await expect(al.halle.vetSetzen({ meldungId, nd, pmv: leer, wg: { datum: null, sentinel: false, stelle: "" }, kl: { datum: vor(10), tierarzt: "Dr. Test" }, geprueft: true })).rejects.toThrow(/älter als 6 Tage/);
    await al.halle.vetSetzen({ meldungId, nd, pmv: leer, wg: { datum: null, sentinel: false, stelle: "" }, kl: { datum: vor(2), tierarzt: "Dr. Test" }, geprueft: true });
    // ND-Frist nach Merkblatt: höchstens 20 Tage → die 30 Tage alte Impfung reicht nicht mehr.
    await setze({ untersuchung: "regional", ndTageMax: 20 });
    await expect(al.halle.vetSetzen({ meldungId, nd, pmv: leer, wg: { datum: null, sentinel: false, stelle: "" }, geprueft: false })).resolves.toBeTruthy();
    await expect(al.halle.vetSetzen({ meldungId, nd, pmv: leer, wg: { datum: null, sentinel: false, stelle: "" }, geprueft: true })).rejects.toThrow(/höchstens 20/);
    // Ausländische Herkunft: nur wenn zugelassen.
    await setze({ ndTageMax: null, auslandZugelassen: false });
    const [wy] = await al.stammdaten.suche({ versionId: s.stammdatenVersionId!, q: "Wyandotten weiß" });
    const pos = { farbenschlagId: wy!.id, freitext: "", art: "einzeltier" as const, geschlecht: "1,0", alter: "jung" as const, istAoc: false, istNeuzuechtung: false, eigeneZucht: true, verkaufspreisCent: null };
    const meldungAusland = (n: string) => ({ schauId: s.id, aussteller: ausstellerDaten(n, { registriernummer: "NL 1234567" }), eingang: "papier" as const, istJugend: false, bemerkung: "", zustimmung: true, positionen: [pos] });
    await expect(al.meldung.speichern(meldungAusland("Ausland Eins"))).rejects.toThrow(/Ausland/);
    await setze({ auslandZugelassen: true });
    const r = await al.meldung.speichern(meldungAusland("Ausland Zwei"));
    await al.meldung.statusSetzen({ id: r.meldungId, status: "bestaetigt" });
    await expect(al.halle.vetSetzen({ meldungId: r.meldungId, nd, pmv: leer, wg: { datum: null, sentinel: false, stelle: "" }, geprueft: true })).rejects.toThrow(/TRACES/);
    await al.halle.vetSetzen({ meldungId: r.meldungId, nd, pmv: leer, wg: { datum: null, sentinel: false, stelle: "" }, gz: { datum: vor(3), nummer: "INTRA.NL.2026.0001" }, geprueft: true });
  });

  test("Schau absagen: Meldungen storniert, Online-Meldung zu, Erstattungen gesammelt gebucht, dann abschließbar", async () => {
    const { al, s, meldungId } = await schauMitTieren("Absage Schau", 1);
    await al.meldung.zahlungErfassen({ meldungId, betragCent: 900, datum: "2026-11-13", art: "ueberweisung" });
    await phase(s.id, "einlieferung");
    await expect(al.schau.absagen({ id: s.id, grund: "Seuchenverbot" })).rejects.toThrow(/Einlieferung/);
    await phase(s.id, "meldung");
    const r = await al.schau.absagen({ id: s.id, grund: "Ausstellungsverbot des Landkreises (Geflügelpest)" });
    expect(r.storniert).toBe(1);
    const nach = await al.schau.get({ id: s.id });
    expect(nach.phase).toBe("abrechnung");
    expect(nach.abgesagtAm).not.toBeNull();
    expect((await al.meldung.get({ id: meldungId })).meldung.status).toBe("storniert");
    const offen = await al.meldung.zuErstatten({ schauId: s.id });
    expect(offen.map((x) => x.restCent)).toEqual([900]);
    await expect(al.schau.phaseSetzen({ id: s.id, phase: "abgeschlossen" })).rejects.toThrow(/erstatten/);
    await al.meldung.erstattungenBuchen({ schauId: s.id, datum: "2026-11-14", meldungIds: [meldungId] });
    expect(await al.meldung.zuErstatten({ schauId: s.id })).toEqual([]);
    await al.schau.phaseSetzen({ id: s.id, phase: "abgeschlossen" });
  });
});

describe("Nachbesserung Gesamtprüfung: Phasen und Freigabe", () => {
  const protokoll = async (tabelle: string, id: number) => (await m.db.select().from(m.schema.aenderung)).filter((a) => a.tabelle === tabelle && a.datensatzId === id);
  const eintrag = (id: number, werte: object) => m.db.update(m.schema.katalogeintrag).set(werte as never).where(m.eq(m.schema.katalogeintrag.id, id));

  test("Phasenwechsel: Meldephasen-Prüfung auch beim Überspringen, fehlende Freigabe und rote Punkte nur mit Grund", async () => {
    const al = m.appRouter.createCaller(adminKontext);
    const { id } = await al.schau.anlegen({ name: "Phasen Sprung", ort: "Halle" });
    await expect(al.schau.phaseSetzen({ id, phase: "katalog" })).rejects.toThrow(/Meldephase/);

    const { s, tiere } = await schauMitTieren("Phasen Freigabe", 1);
    await phase(s.id, "bewertung");
    const t = tiere[0]!.id;
    await eintrag(t, { status: "eingeliefert" });
    await al.bewertung.setzen({ schauId: s.id, katalogeintragId: t, punkte: 94, sondernote: null, vorzuege: "", wuensche: "", maengel: "", geraetZeit: new Date(), grund: "" } as never);
    await expect(al.schau.phaseSetzen({ id: s.id, phase: "schau" })).rejects.toThrow(/nicht freigegeben/);
    await expect(al.schau.phaseSetzen({ id: s.id, phase: "schau", trotzdem: true })).rejects.toThrow(/nicht freigegeben/);
    await al.schau.phaseSetzen({ id: s.id, phase: "schau", trotzdem: true, grund: "Test: Freigabe folgt" });
    const letzte = (await protokoll("schau", s.id)).filter((a) => a.aktion === "Phase").at(-1)!;
    expect(letzte.grund).toBe("Test: Freigabe folgt");

    // Rote Punkte der Prüfliste, die bis zur verlassenen Phase erledigt sein müssen: Tiere ohne Preisrichter vor der Bewertung.
    const zwei = await schauMitTieren("Phasen Einteilung", 1);
    await phase(zwei.s.id, "einlieferung");
    await expect(al.schau.phaseSetzen({ id: zwei.s.id, phase: "bewertung" })).rejects.toThrow(/ohne Preisrichter/);
  });

  test("Abschluss wartet auf das Ende der Reklamationsfrist", async () => {
    const { al, s } = await schauMitTieren("Reklamation offen", 1);
    await m.db.update(m.schema.schau).set({ phase: "abrechnung", reklamationsfrist: "2099-12-31" }).where(m.eq(m.schema.schau.id, s.id));
    await expect(al.schau.phaseSetzen({ id: s.id, phase: "abgeschlossen" })).rejects.toThrow(/Reklamationsfrist läuft noch bis 31\.12\.2099/);
  });

  test("Freigabe: bestätigte Tiere ohne Nummer sperren; Rücknahme nur mit Grund, ab „Schau“ nur bestätigt", async () => {
    const { al, s, tiere } = await schauMitTieren("Freigabe Sperren", 2);
    await phase(s.id, "preise");
    const [a, b] = [tiere[0]!, tiere[1]!];
    await eintrag(a.id, { status: "fehlt" });
    await eintrag(b.id, { katalogNr: null });
    await expect(al.preise.freigeben({ schauId: s.id, freigegeben: true, trotzdem: true })).rejects.toThrow(/keine Katalognummer/);
    await eintrag(b.id, { katalogNr: b.katalogNr, status: "fehlt" });
    await al.preise.freigeben({ schauId: s.id, freigegeben: true, trotzdem: true });
    await expect(al.preise.freigeben({ schauId: s.id, freigegeben: false })).rejects.toThrow(/Grund/);
    await phase(s.id, "schau");
    await expect(al.preise.freigeben({ schauId: s.id, freigegeben: false, grund: "Fehler in der Liste" })).rejects.toThrow(/Phase/);
    await al.preise.freigeben({ schauId: s.id, freigegeben: false, grund: "Fehler in der Liste", trotzdem: true });
    expect((await al.schau.get({ id: s.id })).ergebnisseFreigegeben).toBe(false);
    const r = (await protokoll("schau", s.id)).filter((x) => x.aktion === "Freigabe zurückgenommen").at(-1)!;
    expect(r.grund).toBe("Fehler in der Liste");
  });
});

describe("Nachbesserung Gesamtprüfung: Stiftungen an der Vergabe", () => {
  const eintrag = (id: number, werte: object) => m.db.update(m.schema.katalogeintrag).set(werte as never).where(m.eq(m.schema.katalogeintrag.id, id));

  test("gestifteter Preis: Anteil der Stiftung je Preis, gewählte Stiftung, nicht am Tablet, nach der Vergabe fest, Katalog nennt Gewinner", async () => {
    const { al, s, tiere } = await schauMitTieren("Stiftung Vergabe", 3);
    await phase(s.id, "bewertung");
    for (const t of tiere) {
      await eintrag(t.id, { status: "eingeliefert" });
      await al.bewertung.setzen({ schauId: s.id, katalogeintragId: t.id, punkte: 94, sondernote: null, vorzuege: "", wuensche: "", maengel: "", geraetZeit: new Date(), grund: "" } as never);
    }
    await phase(s.id, "preise");
    await al.schau.preisartSpeichern({ schauId: s.id, kuerzel: "PE", name: "Ehrenpreis", betragCent: 0, sachpreis: "Plakette", quelle: "stiftung", schluesselProTiere: null, anzahlProSchluessel: 0, anzahlProPreisrichter: 0, mindestpunkte: null, rundung: "voll", folge: 90 });
    const pe = (await al.preise.uebersicht({ schauId: s.id })).preisarten.find((p) => p.kuerzel === "PE")!;
    await al.preise.stiftungSpeichern({ schauId: s.id, stifter: "Kreisverband Nord", preisartId: pe.id, anzahl: 3, betragCent: 2000, vorgabe: "beste Wyandotten", eingegangenAm: null });
    await al.preise.stiftungSpeichern({ schauId: s.id, stifter: "Firma Futter", preisartId: pe.id, anzahl: 1, betragCent: 500, vorgabe: "", eingegangenAm: null });
    const [kv, futter] = (await al.preise.uebersicht({ schauId: s.id })).stiftungen.sort((a, b) => a.id - b.id);

    // Preisrichter dürfen gestiftete Preise nicht vergeben (auch nicht über die Schnittstelle).
    const [pr] = await m.db.insert(m.schema.preisrichter).values({ schauId: s.id, name: "PR Stiftung" }).returning();
    const tablet = m.appRouter.createCaller({ ...leer, richter: { id: pr!.id, schauId: s.id, name: pr!.name, istObmann: false } });
    await expect(tablet.richter.preisVergeben({ katalogeintragId: tiere[0]!.id, preisartId: pe.id })).rejects.toThrow(/vergibt die Ausstellungsleitung/);

    await al.preise.vergeben({ schauId: s.id, katalogeintragId: tiere[0]!.id, preisartId: pe.id });
    await al.preise.vergeben({ schauId: s.id, katalogeintragId: tiere[1]!.id, preisartId: pe.id, stiftungId: futter!.id });
    await expect(al.preise.vergeben({ schauId: s.id, katalogeintragId: tiere[2]!.id, preisartId: pe.id, stiftungId: futter!.id })).rejects.toThrow(/vollständig vergeben/);
    const vergaben = await m.db.select().from(m.schema.preisvergabe).where(m.eq(m.schema.preisvergabe.preisartId, pe.id));
    const von = (id: number) => vergaben.find((v) => v.katalogeintragId === id)!;
    expect([von(tiere[0]!.id).stiftungId, von(tiere[0]!.id).betragCent]).toEqual([kv!.id, 667]);
    expect([von(tiere[1]!.id).stiftungId, von(tiere[1]!.id).betragCent]).toEqual([futter!.id, 500]);

    await expect(al.preise.stiftungSpeichern({ schauId: s.id, id: kv!.id, stifter: kv!.stifter, preisartId: pe.id, anzahl: 3, betragCent: 3000, vorgabe: "", eingegangenAm: null })).rejects.toThrow(/Preisart und Betrag/);
    await expect(al.preise.stiftungLoeschen({ schauId: s.id, id: futter!.id })).rejects.toThrow(/schon 1 Preise vergeben/);
    const punkte = (await al.schau.uebersicht({ id: s.id })).checkliste.map((p) => p.text).join(" ");
    expect(punkte).toContain("Kreisverband Nord: 2 von 3 frei");
    await expect(al.preise.freigeben({ schauId: s.id, freigegeben: true })).rejects.toThrow(/Gestiftete Preise noch nicht vergeben/);
  });
});

describe("Nachbesserung Gesamtprüfung: Kurzadresse, Jugend, Ring, Fristen", () => {
  const eintrag = (id: number, werte: object) => m.db.update(m.schema.katalogeintrag).set(werte as never).where(m.eq(m.schema.katalogeintrag.id, id));

  test("Kurzadresse bleibt nach „Zurück zur Vorbereitung“ fest, sobald es Meldungen gibt", async () => {
    const { al, s } = await schauMitTieren("Kurzadresse fest", 1);
    await phase(s.id, "vorbereitung");
    const g = await al.schau.get({ id: s.id });
    await expect(al.schau.aktualisieren({ id: s.id, daten: { ...g, slug: "kurzadresse-neu-fest" } })).rejects.toThrow(/Meldungen oder Tablet-PINs/);
  });

  test("Jugendmeldung: Online-Veröffentlichung im Formular der Ausstellungsleitung nur mit Erziehungsberechtigtem", async () => {
    const al = m.appRouter.createCaller(adminKontext);
    const { id } = await al.schau.anlegen({ name: "Jugend Online", ort: "Halle" });
    const basis = { schauId: id, aussteller: ausstellerDaten("Jugendlich", { geburtsdatum: "2013-05-05" }), eingang: "papier" as const, istJugend: true, bemerkung: "", zustimmung: true, positionen: [] };
    await expect(al.meldung.speichern({ ...basis, onlineZustimmung: true })).rejects.toThrow(/Erziehungsberechtigten/);
    const r = await al.meldung.speichern({ ...basis, onlineZustimmung: true, erziehungsberechtigter: "Erika Muster" });
    expect((await al.meldung.get({ id: r.meldungId })).meldung.onlineZustimmungAm).not.toBeNull();
  });

  test("eingelieferte Tiere ohne Ring: roter Punkt bis zur Freigabe, Tierliste zeigt „fehlt“; Ringjahr als Hinweis", async () => {
    const { al, s, tiere } = await schauMitTieren("Ring Pflicht", 2);
    await m.db.update(m.schema.schau).set({ phase: "einlieferung", bewertungAm: "2026-12-12" }).where(m.eq(m.schema.schau.id, s.id));
    await eintrag(tiere[0]!.id, { status: "eingeliefert", ringnummern: "" });
    await eintrag(tiere[1]!.id, { status: "eingeliefert", ringnummern: "DE 25 0815" });
    const punkte = (await al.schau.uebersicht({ id: s.id })).checkliste;
    expect(punkte.find((p) => p.text.includes("ohne Ringnummer"))?.art).toBe("fehler");
    expect(punkte.some((p) => p.art === "hinweis" && p.text.includes("nicht zu 2026 passt"))).toBe(true);
    const { ladeTierliste } = await import("../services/tierliste");
    const liste = JSON.stringify(await ladeTierliste((await al.schau.get({ id: s.id })) as never));
    expect(liste).toContain('"ringnummern":"fehlt"');
  });

  test("Bankdaten und Geburtsdatum bleiben bis 30 Tage nach dem Ende der Reklamationsfrist", async () => {
    const { al, s, meldungId } = await schauMitTieren("Reklamation IBAN", 1);
    const { ausstellerId } = (await al.meldung.get({ id: meldungId })).meldung;
    await m.db.update(m.schema.aussteller).set({ iban: "DE02120300000000202051" }).where(m.eq(m.schema.aussteller.id, ausstellerId));
    const abgeschlossen = new Date(Date.UTC(2026, 0, 10));
    await m.db.update(m.schema.schau).set({ phase: "abgeschlossen", abgeschlossenAm: abgeschlossen, reklamationsfrist: "2026-03-01" }).where(m.eq(m.schema.schau.id, s.id));
    const { bereinige } = await import("../services/datenschutz");
    const iban = async () => (await m.db.select().from(m.schema.aussteller).where(m.eq(m.schema.aussteller.id, ausstellerId)))[0]!.iban;
    await bereinige(new Date(Date.UTC(2026, 2, 15)), { organisationId: s.organisationId }); // 64 Tage nach dem Abschluss, 14 nach der Frist
    expect(await iban()).not.toBe("");
    await bereinige(new Date(Date.UTC(2026, 3, 2)), { organisationId: s.organisationId }); // 32 Tage nach der Frist
    expect(await iban()).toBe("");
  });
});

describe("Nachbesserung Gesamtprüfung: Preisarten mit Bindung", () => {
  test("Jugendpreis: Kontingent nur über Jugendtiere, Vergabe an Senioren abgelehnt, Bindung nach der Vergabe fest", async () => {
    const { al, s, tiere } = await schauMitTieren("Bindung Jugendpreis", 2);
    await phase(s.id, "bewertung");
    for (const t of tiere) {
      await m.db.update(m.schema.katalogeintrag).set({ status: "eingeliefert" }).where(m.eq(m.schema.katalogeintrag.id, t.id));
      await al.bewertung.setzen({ schauId: s.id, katalogeintragId: t.id, punkte: 94, sondernote: null, vorzuege: "", wuensche: "", maengel: "", geraetZeit: new Date(), grund: "" } as never);
    }
    await phase(s.id, "preise");
    const art = { schauId: s.id, kuerzel: "JE", name: "Jugend-Ehrenpreis", betragCent: 0, sachpreis: "Band", quelle: "standgeld" as const, schluesselProTiere: 1, anzahlProSchluessel: 1, anzahlProPreisrichter: 0, mindestpunkte: null, rundung: "voll" as const, folge: 80, zielgruppe: "jugend" as const, sparte: "" };
    await al.schau.preisartSpeichern(art);
    const je = (await al.preise.uebersicht({ schauId: s.id })).preisarten.find((p) => p.kuerzel === "JE")!;
    expect(je.zielgruppe).toBe("jugend");
    await expect(al.preise.vergeben({ schauId: s.id, katalogeintragId: tiere[0]!.id, preisartId: je.id })).rejects.toThrow(/nur Jugend/);

    const { kontingente } = await import("../services/pruefung");
    const tier = (istJugend: boolean) => ({ id: istJugend ? 1 : 2, status: "eingeliefert", bewertet: true, punkte: 94, istJugend, sparte: "Hühner", preise: [] });
    const k = kontingente([tier(true), tier(false), tier(false)] as never, new Map([[1, 9], [2, 9]]), [{ id: 9, name: "PR" }], [je as never], "schau");
    expect(k[0]!.arten[0]!.verfuegbar).toBe(1);

    // Schon vergeben (hier direkt gesetzt): Bindung bleibt fest.
    await m.db.insert(m.schema.preisvergabe).values({ katalogeintragId: tiere[1]!.id, preisartId: je.id, betragCent: 0 });
    await expect(al.schau.preisartSpeichern({ ...art, id: je.id, zielgruppe: "alle" })).rejects.toThrow(/Bindung/);
  });
});

describe("Nachbesserung Gesamtprüfung: Zweitschrift", () => {
  test("ein erst beim Abruf erzeugter Beleg trägt den Vermerk „Zweitschrift“, ein sofort erzeugter nicht", async () => {
    const { zweitschrift } = await import("../services/kassenbuch");
    const { erzeugePdf, mitVermerk } = await import("../pdf/basis");
    const jetzt = new Date();
    expect(zweitschrift(new Date(jetzt.getTime() - 60_000), jetzt)).toBeNull();
    const text = zweitschrift(new Date(jetzt.getTime() - 3 * 3_600_000), jetzt);
    expect(text).toMatch(/^ZWEITSCHRIFT – erzeugt am .*gebucht am/);
    const mit = pdfText(await mitVermerk(text, () => erzeugePdf("Beleg", (doc) => void doc.text("Inhalt"))));
    const ohne = pdfText(await mitVermerk(null, () => erzeugePdf("Beleg", (doc) => void doc.text("Inhalt"))));
    expect(mit.replace(/\s/g, "")).toContain("ZWEITSCHRIFT");
    expect(ohne).not.toContain("ZWEITSCHRIFT");
  });
});

describe("Nachbesserung Gesamtprüfung: Hinweise Höchstzahl und Mindestwerte", () => {
  test("Prüfliste warnt bei zu vielen Tieren je Preisrichter und bei Geldpreisen unter dem Standgeld", async () => {
    const { al, s, tiere } = await schauMitTieren("Hinweise Hoechstzahl", 3);
    const [pr] = await m.db.insert(m.schema.preisrichter).values({ schauId: s.id, name: "PR Viel" }).returning();
    await m.db.insert(m.schema.prEinteilung).values({ schauId: s.id, preisrichterId: pr!.id, vonNr: tiere[0]!.katalogNr!, bisNr: tiere[2]!.katalogNr! });
    await m.db.update(m.schema.schau).set({ prHoechstzahl: 2 }).where(m.eq(m.schema.schau.id, s.id));
    await al.schau.gebuehrenSetzen({ schauId: s.id, gebuehren: [{ art: "einzeltier", jugend: false, betragCent: 500, befreitPreisrichter: false }] });
    // Ohne Geldpreis der AL kein Vergleich für Stiftungen (früher: jede Geldstiftung gemeldet).
    await al.preise.stiftungSpeichern({ schauId: s.id, stifter: "Ohne Vergleich", preisartId: null, anzahl: 1, betragCent: 100, vorgabe: "", eingegangenAm: null });
    expect((await al.schau.uebersicht({ id: s.id })).checkliste.some((p) => p.text.includes("Gestiftete Geldpreise unter"))).toBe(false);
    await al.schau.preisartSpeichern({ schauId: s.id, kuerzel: "E", name: "Ehrenpreis", betragCent: 600, sachpreis: "", quelle: "standgeld", schluesselProTiere: 10, anzahlProSchluessel: 1, anzahlProPreisrichter: 0, mindestpunkte: null, rundung: "voll", folge: 0 });
    await al.schau.preisartSpeichern({ schauId: s.id, kuerzel: "EK", name: "Kleiner Ehrenpreis", betragCent: 300, sachpreis: "", quelle: "standgeld", schluesselProTiere: 10, anzahlProSchluessel: 1, anzahlProPreisrichter: 0, mindestpunkte: null, rundung: "voll", folge: 1 });
    const texte = (await al.schau.uebersicht({ id: s.id })).checkliste.map((p) => p.text).join(" | ");
    expect(texte).toContain("PR Viel: 3 Tiere, höchstens");
    expect(texte).toContain("Gestiftete Geldpreise unter dem kleinsten Geldpreis der Ausstellungsleitung: Ohne Vergleich");
    expect(texte).toContain("Geldpreis unter dem Standgeld: EK");
  });
});

describe("Nachbesserung Gesamtprüfung: Stiftung bar erhalten", () => {
  test("Stiftung ohne Meldung: Einlage im Kassenbuch mit Eigenbeleg, danach Betrag fest und nicht löschbar", async () => {
    const { al, s } = await schauMitTieren("Stiftung Kasse", 1);
    await al.preise.stiftungSpeichern({ schauId: s.id, stifter: "Sparkasse Nord", preisartId: null, anzahl: 2, betragCent: 4000, vorgabe: "", eingegangenAm: null });
    const st = (await al.preise.uebersicht({ schauId: s.id })).stiftungen.find((x) => x.stifter === "Sparkasse Nord")!;
    const r = await al.preise.stiftungBarErhalten({ schauId: s.id, id: st.id });
    const [k] = await m.db.select().from(m.schema.kassenbewegung).where(m.eq(m.schema.kassenbewegung.id, r.kassenbewegungId));
    expect([k!.art, k!.betragCent, k!.grund]).toEqual(["einlage", 4000, "Stiftung von Sparkasse Nord"]);
    const belege = await m.db.select().from(m.schema.beleg).where(m.eq(m.schema.beleg.schauId, s.id));
    expect(belege.some((b) => b.art === "eigenbeleg" && b.nummer === r.kassenbewegungId)).toBe(true);
    const nach = (await al.preise.uebersicht({ schauId: s.id })).stiftungen.find((x) => x.id === st.id)!;
    expect(nach.eingegangenAm).not.toBeNull();
    await expect(al.preise.stiftungBarErhalten({ schauId: s.id, id: st.id })).rejects.toThrow(/schon im Kassenbuch/);
    await expect(al.preise.stiftungSpeichern({ schauId: s.id, id: st.id, stifter: st.stifter, preisartId: null, anzahl: 2, betragCent: 5000, vorgabe: "", eingegangenAm: null })).rejects.toThrow(/Kassenbuch/);
    await expect(al.preise.stiftungLoeschen({ schauId: s.id, id: st.id })).rejects.toThrow(/Kassenbuch/);
  });
});

describe("Nachbesserung nach der Gegenprüfung", () => {
  const eintrag = (id: number, werte: object) => m.db.update(m.schema.katalogeintrag).set(werte as never).where(m.eq(m.schema.katalogeintrag.id, id));
  const bewerte = (al: ReturnType<typeof m.appRouter.createCaller>, schauId: number, id: number) =>
    al.bewertung.setzen({ schauId, katalogeintragId: id, punkte: 94, sondernote: null, vorzuege: "", wuensche: "", maengel: "", geraetZeit: new Date(), grund: "" } as never);

  test("Überspringen: auch aus der Vorbereitung und dem Katalog gelten unbewertete Tiere und die Freigabe", async () => {
    const { al, s } = await schauMitTieren("Sprung Vorbereitung", 1);
    await m.db.update(m.schema.schau).set({ phase: "vorbereitung", meldeschluss: "2026-12-01" }).where(m.eq(m.schema.schau.id, s.id));
    await al.schau.gebuehrenSetzen({ schauId: s.id, gebuehren: [{ art: "einzeltier", jugend: false, betragCent: 500, befreitPreisrichter: false }] });
    await expect(al.schau.phaseSetzen({ id: s.id, phase: "schau" })).rejects.toThrow(/nicht bewertet.*nicht freigegeben/);
    await expect(al.schau.phaseSetzen({ id: s.id, phase: "schau", trotzdem: true })).rejects.toThrow(/nicht freigegeben/);
    await phase(s.id, "katalog");
    await expect(al.schau.phaseSetzen({ id: s.id, phase: "abgeschlossen", trotzdem: true })).rejects.toThrow(/nicht freigegeben/);
  });

  test("abgesagte Schau wartet beim Abschluss nicht auf die Reklamationsfrist", async () => {
    const { al, s } = await schauMitTieren("Absage Frist", 1);
    await al.schau.absagen({ id: s.id, grund: "Ausstellungsverbot (Test)" });
    await m.db.update(m.schema.schau).set({ reklamationsfrist: "2099-12-31" }).where(m.eq(m.schema.schau.id, s.id));
    await al.schau.phaseSetzen({ id: s.id, phase: "abgeschlossen" });
  });

  test("Stiftungsanteil aus dem Rest: höhere Anzahl zahlt nicht mehr aus als gestiftet; „ohne Stiftung“ nimmt den Betrag der Preisart", async () => {
    const { al, s, tiere } = await schauMitTieren("Stiftung Rest", 4);
    await phase(s.id, "bewertung");
    for (const t of tiere) {
      await eintrag(t.id, { status: "eingeliefert" });
      await bewerte(al, s.id, t.id);
    }
    await phase(s.id, "preise");
    await m.db.insert(m.schema.preisrichter).values({ schauId: s.id, name: "PR Rest" });
    const art = { schauId: s.id, kuerzel: "PR", name: "Rest-Ehrenpreis", betragCent: 0, sachpreis: "Plakette", quelle: "stiftung" as const, schluesselProTiere: null, anzahlProSchluessel: 0, anzahlProPreisrichter: 1, mindestpunkte: null, rundung: "voll" as const, folge: 90 };
    await al.schau.preisartSpeichern(art);
    const pr = (await al.preise.uebersicht({ schauId: s.id })).preisarten.find((p) => p.kuerzel === "PR")!;
    await al.preise.stiftungSpeichern({ schauId: s.id, stifter: "Rest Stifter", preisartId: pr.id, anzahl: 2, betragCent: 2000, vorgabe: "", eingegangenAm: null });
    const st = (await al.preise.uebersicht({ schauId: s.id })).stiftungen.find((x) => x.stifter === "Rest Stifter")!;
    await al.preise.vergeben({ schauId: s.id, katalogeintragId: tiere[0]!.id, preisartId: pr.id });
    await al.preise.vergeben({ schauId: s.id, katalogeintragId: tiere[1]!.id, preisartId: pr.id });
    await al.preise.stiftungSpeichern({ schauId: s.id, id: st.id, stifter: st.stifter, preisartId: pr.id, anzahl: 3, betragCent: 2000, vorgabe: "", eingegangenAm: null });
    await al.preise.vergeben({ schauId: s.id, katalogeintragId: tiere[2]!.id, preisartId: pr.id, stiftungId: st.id });
    await al.preise.vergeben({ schauId: s.id, katalogeintragId: tiere[3]!.id, preisartId: pr.id, ohneStiftung: true });
    const v = await m.db.select().from(m.schema.preisvergabe).where(m.eq(m.schema.preisvergabe.preisartId, pr.id));
    const ausStiftung = v.filter((x) => x.stiftungId === st.id);
    expect(ausStiftung.reduce((n, x) => n + (x.betragCent ?? 0), 0)).toBe(2000);
    const ohne = v.find((x) => x.katalogeintragId === tiere[3]!.id)!;
    expect([ohne.stiftungId, ohne.betragCent]).toEqual([null, 0]);
  });

  test("Bar erhaltene Stiftung behält ihren Eingang beim Bearbeiten", async () => {
    const { al, s } = await schauMitTieren("Stiftung Eingang", 1);
    await al.preise.stiftungSpeichern({ schauId: s.id, stifter: "Eingang fest", preisartId: null, anzahl: 1, betragCent: 1500, vorgabe: "", eingegangenAm: null });
    const st = (await al.preise.uebersicht({ schauId: s.id })).stiftungen.find((x) => x.stifter === "Eingang fest")!;
    await al.preise.stiftungBarErhalten({ schauId: s.id, id: st.id });
    await al.preise.stiftungSpeichern({ schauId: s.id, id: st.id, stifter: "Eingang fest", preisartId: null, anzahl: 1, betragCent: 1500, vorgabe: "neu", eingegangenAm: null });
    expect((await al.preise.uebersicht({ schauId: s.id })).stiftungen.find((x) => x.id === st.id)!.eingegangenAm).not.toBeNull();
  });

  test("Testschau neu einspielen geht auch mit einem vergebenen gestifteten Preis", async () => {
    const { al, s: start, tiere } = await schauMitTieren("Stiftung Testschau", 1);
    const id = start.id;
    await m.db.update(m.schema.schau).set({ test: true }).where(m.eq(m.schema.schau.id, id));
    const s = await al.schau.get({ id });
    const t = tiere[0];
    await phase(id, "bewertung");
    await eintrag(t!.id, { status: "eingeliefert" });
    await bewerte(al, id, t!.id);
    await phase(id, "preise");
    await al.schau.preisartSpeichern({ schauId: id, kuerzel: "TS", name: "Test-Stiftungspreis", betragCent: 0, sachpreis: "Band", quelle: "stiftung", schluesselProTiere: null, anzahlProSchluessel: 0, anzahlProPreisrichter: 0, mindestpunkte: null, rundung: "voll", folge: 95 });
    const ts = (await al.preise.uebersicht({ schauId: id })).preisarten.find((p) => p.kuerzel === "TS")!;
    await al.preise.stiftungSpeichern({ schauId: id, stifter: "Test-Stifter", preisartId: ts.id, anzahl: 1, betragCent: 1000, vorgabe: "", eingegangenAm: null });
    await al.preise.vergeben({ schauId: id, katalogeintragId: t!.id, preisartId: ts.id });
    await al.schau.demodatenNeu({ id, name: s.name });
  });
});
