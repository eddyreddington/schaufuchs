/**
 * Lesemodus (Entscheidung 025): Mit NUR_LESEN=1 nimmt der Server keine Änderungen an – außer Anmelden, Abmelden,
 * Zwei-Faktor einrichten, eigenes Passwort, Konto abmelden oder sperren, Sprache und dem Widerruf der
 * Online-Veröffentlichung. Lesen und PDF-Vorschauen gehen weiter; Belege werden beim Abruf nicht abgelegt.
 */
import { describe, expect, test } from "bun:test";
import { NUR_LESEN_MELDUNG } from "@schau/domain";
import { config } from "../config";
import { IM_LESEMODUS_ERLAUBT } from "../lesemodus";
import { adminKontext, leer, m } from "./kontext";

type Prozedur = { _def: { type: string } };
const prozeduren = () => (m.appRouter._def as unknown as { procedures: Record<string, Prozedur> }).procedures;
const mutationen = () => Object.entries(prozeduren()).filter(([, p]) => p._def.type === "mutation").map(([pfad]) => pfad);

/** Ruft eine Prozedur über ihren Pfad auf („auth.anmelden“) und liefert den Fehlertext (leer bei Erfolg). */
async function fehlerVon(kontext: typeof leer | typeof adminKontext, pfad: string, eingabe: unknown = {}): Promise<string> {
  let ziel: unknown = m.appRouter.createCaller(kontext);
  for (const teil of pfad.split(".")) ziel = (ziel as Record<string, unknown>)[teil];
  try {
    await (ziel as (e: unknown) => Promise<unknown>)(eingabe);
    return "";
  } catch (e) {
    return (e as Error).message;
  }
}

async function imLesemodus<T>(f: () => Promise<T>, hinweis = ""): Promise<T> {
  const vorher = { nurLesen: config.nurLesen, nurLesenHinweis: config.nurLesenHinweis };
  config.nurLesen = true;
  config.nurLesenHinweis = hinweis;
  try {
    return await f();
  } finally {
    Object.assign(config, vorher);
  }
}

describe("Lesemodus", () => {
  test("genau diese Ausnahmen, und es gibt sie als Mutation", () => {
    // Fest aufgezählt: wer eine Ausnahme streicht oder hinzufügt, ändert diesen Test mit (Entscheidung 025).
    expect([...IM_LESEMODUS_ERLAUBT].sort()).toEqual(
      [
        "auth.abmelden",
        "auth.anmelden",
        "auth.anmeldenCode",
        "auth.benutzerAbmelden",
        "auth.benutzerAktiv",
        "auth.passwortAendern",
        "auth.spracheSetzen",
        "auth.zweiFaktorBestaetigen",
        "auth.zweiFaktorEinrichten",
        "oeffentlich.onlineVeroeffentlichung",
        "richter.abmelden",
        "richter.anmelden",
      ].sort(),
    );
    const alle = mutationen();
    for (const pfad of IM_LESEMODUS_ERLAUBT) expect(alle).toContain(pfad);
  });

  test("jede andere Mutation wird abgewiesen, bevor sie etwas prüft oder ändert", async () => {
    const gesperrt = mutationen().filter((p) => !IM_LESEMODUS_ERLAUBT.has(p));
    expect(gesperrt.length).toBeGreaterThan(100);
    const vorher = await m.db.select({ n: m.schema.schau.id }).from(m.schema.schau);
    await imLesemodus(async () => {
      for (const pfad of gesperrt) expect(`${pfad}: ${await fehlerVon(adminKontext, pfad)}`).toBe(`${pfad}: ${NUR_LESEN_MELDUNG}`);
      // Mit gültigen Angaben ebenso – und es entsteht nichts.
      expect(await fehlerVon(adminKontext, "schau.anlegen", { name: "Lesemodus", ort: "Halle" })).toBe(NUR_LESEN_MELDUNG);
    });
    expect(await m.db.select({ n: m.schema.schau.id }).from(m.schema.schau)).toHaveLength(vorher.length);
  });

  test("Ausnahmen und Lesen gehen weiter", async () => {
    await imLesemodus(async () => {
      for (const pfad of IM_LESEMODUS_ERLAUBT) expect(await fehlerVon(leer, pfad)).not.toBe(NUR_LESEN_MELDUNG);
      expect(await fehlerVon(adminKontext, "auth.spracheSetzen", { sprache: "de" })).toBe("");
      expect(await fehlerVon(adminKontext, "schau.liste", undefined)).toBe("");
    });
  });

  test("in den Ausnahmen nur die eine Richtung: Widerruf und Sperren ja, Erteilen und Entsperren nein", async () => {
    await imLesemodus(async () => {
      const einwilligung = (erlaubt: boolean) => fehlerVon(leer, "oeffentlich.onlineVeroeffentlichung", { slug: "gibt-es-nicht", token: "x".repeat(20), erlaubt });
      expect(await einwilligung(true)).toBe(NUR_LESEN_MELDUNG);
      expect(await einwilligung(false)).not.toBe(NUR_LESEN_MELDUNG);
      expect(await fehlerVon(adminKontext, "auth.benutzerAktiv", { id: 2_000_000_000, aktiv: true })).toBe(NUR_LESEN_MELDUNG);
      expect(await fehlerVon(adminKontext, "auth.benutzerAktiv", { id: 2_000_000_000, aktiv: false })).not.toBe(NUR_LESEN_MELDUNG);
    });
  });

  test("Belege, die erst beim Abruf entstehen, werden gezeigt, aber nicht abgelegt", async () => {
    const { archiviereBeleg } = await import("../services/kassenbuch");
    const [s] = await m.db.select({ id: m.schema.schau.id }).from(m.schema.schau).limit(1);
    const zahl = async () => (await m.db.select({ id: m.schema.beleg.id }).from(m.schema.beleg)).length;
    const vorher = await zahl();
    const b = await imLesemodus(() => archiviereBeleg(s!.id, "einzahlung", 1_999_999_999, Buffer.from("%PDF-Probe")));
    expect(b?.pdf.toString()).toBe("%PDF-Probe");
    expect(await zahl()).toBe(vorher);
  });

  test("ohne NUR_LESEN keine Sperre", async () => {
    expect(await fehlerVon(adminKontext, "auth.spracheSetzen", { sprache: "de" })).toBe("");
    expect(await fehlerVon(adminKontext, "schau.anlegen", {})).not.toBe(NUR_LESEN_MELDUNG);
  });

  test("Zustand für die Oberfläche: Hinweis des Betreibers nur für Angemeldete", async () => {
    await imLesemodus(async () => {
      expect(await m.appRouter.createCaller(adminKontext).betrieb.lesemodus()).toEqual({ nurLesen: true, hinweis: "Bis 18 Uhr Wartung" });
      expect(await m.appRouter.createCaller(leer).betrieb.lesemodus()).toEqual({ nurLesen: true, hinweis: "" });
    }, "Bis 18 Uhr Wartung");
    expect(await m.appRouter.createCaller(leer).betrieb.lesemodus()).toEqual({ nurLesen: false, hinweis: "" });
  });

  test("Adressen außerhalb von tRPC: Schreiben gesperrt, PDF-Vorschauen und Lesen offen; /api/gesund meldet es", async () => {
    const server = (await import("../index")).default;
    const post = (pfad: string) => server.fetch(new Request(`http://test${pfad}`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }));
    await imLesemodus(async () => {
      const r = await post("/datei/irgendwas");
      expect(r.status).toBe(403);
      expect(await r.text()).toBe(NUR_LESEN_MELDUNG);
      for (const methode of ["PUT", "DELETE", "PATCH"]) {
        const x = await server.fetch(new Request("http://test/datei/irgendwas", { method: methode }));
        expect(`${methode} ${x.status}`).toBe(`${methode} 403`);
      }
      // Nur genau die PDF-Vorschauen (ohne Anmeldung abgewiesen – aber nicht vom Lesemodus).
      for (const pfad of ["/datei/druckvorlage/vorschau.pdf", "/datei/druckvorlage/probedruck.pdf", "/datei/druckvorlage/brief.pdf", "/datei/serienbrief.pdf", "/datei/1/katalog-vorschau.pdf"]) {
        expect(`${pfad}: ${await (await post(pfad)).text()}`).not.toBe(`${pfad}: ${NUR_LESEN_MELDUNG}`);
      }
      expect(await (await post("/datei/1/katalog-vorschau.pdfx")).text()).toBe(NUR_LESEN_MELDUNG);
      const g = (await (await server.fetch(new Request("http://test/api/gesund"))).json()) as { ok: boolean; nurLesen: boolean };
      expect(g).toMatchObject({ ok: true, nurLesen: true });
    });
    const g = (await (await server.fetch(new Request("http://test/api/gesund"))).json()) as { nurLesen: boolean };
    expect(g.nurLesen).toBe(false);
  });
});
