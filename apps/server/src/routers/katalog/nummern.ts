/** Katalognummern: Liste, Stand des Hallenplans, Nummern vergeben, nach Hallenplan nummerieren, Festschreibung der Nummern. */
import { mitBelegung, planeHalle, stabilerText, vergleicheFolge, nachmeldungsNummern, planFolge, vergebeKatalognummern } from "@schau/domain";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { db, type Tx } from "../../db/client";
import { katalogeintrag, prEinteilung, schau } from "../../db/schema";
import { alsFolge, ladeEintraege } from "../../services/eintraege";
import { rassenEinteilungAnwenden, sperreEinteilung } from "../../services/einteilung";
import { pruefeNichtAbgeschlossen, sperreKasse } from "../../services/kasse";
import { bindungen } from "../../services/meldung";
import { protokolliere } from "../../services/protokoll";
import { adminProcedure, benutzerProcedure, fehler, ladeSchau, dbId } from "../../trpc";
import { hallenStand, planTiere } from "./gemeinsam";

/**
 * Sperren vor dem Prüfen, ob etwas an den Nummern hängt (Entscheidung 033): zuerst die Kasse (Verkauf und Preisvergabe
 * nehmen sie auch zuerst), dann die Schau-Zeile ohne Schlüsselsperre („no key update“ – ein Protokolleintrag einer
 * gleichzeitigen Note wartet so nicht auf uns, während wir auf ihr Tier warten), dann alle Tiere der Schau nach id. Eine
 * gleichzeitige Note, Preisvergabe oder ein Verkauf (Fremdschlüssel auf das Tier) ist danach entweder sichtbar oder wartet.
 */
async function sperreSchau(tx: Tx, schauId: number) {
  const [z] = await tx.select({ gedruckt: schau.katalogGedruckt, halle: schau.halle, fest: schau.hallenplanFest, phase: schau.phase }).from(schau).where(eq(schau.id, schauId)).for("no key update");
  return z!;
}
const sperreTiere = (tx: Tx, schauId: number) => tx.select({ id: katalogeintrag.id }).from(katalogeintrag).where(eq(katalogeintrag.schauId, schauId)).orderBy(asc(katalogeintrag.id)).for("update");

export const katalogNummern = {
  liste: benutzerProcedure.input(z.object({ schauId: dbId })).query(async ({ ctx, input }) => {
    await ladeSchau(ctx.benutzer.organisationId, input.schauId);
    return ladeEintraege(input.schauId, { nurBestaetigt: true });
  }),

  /**
   * Stand des Hallenplans für die Seite „Katalognummern“: Steht ein fester Plan mit Tieren, ist „Nach Hallenplan vergeben“
   * (`nummernNachPlan`) der empfohlene Weg – der Hallenplan kommt vor den Katalognummern.
   */
  nummernStand: benutzerProcedure.input(z.object({ schauId: dbId })).query(async ({ ctx, input }) => hallenStand(await ladeSchau(ctx.benutzer.organisationId, input.schauId))),

  /**
   * Vor dem Festschreiben: alle Nummern lückenlos neu.
   * Danach (Bewertungskarten sind gedruckt): nur Tiere ohne Nummer bekommen eine Unternummer (Nachmeldung), nichts verschiebt sich.
   */
  nummernVergeben: adminProcedure.input(z.object({ schauId: dbId })).mutation(async ({ ctx, input }) => {
    const s = pruefeNichtAbgeschlossen(await ladeSchau(ctx.benutzer.organisationId, input.schauId));
    if (!s.stammdatenVersionId) throw fehler("BAD_REQUEST", "Bitte zuerst Stammdaten wählen.");
    const alle = await ladeEintraege(s.id, { nurBestaetigt: true });
    if (alle.length === 0) throw fehler("BAD_REQUEST", "Es gibt keine bestätigten Meldungen.");
    const opts = { start: s.katalogStart, jugendSeparat: s.jugendSeparat, staemmeVorn: s.staemmeVorn, kaefigFolge: s.kaefigFolge, sortierung: s.katalogSortierung };
    const folge = (e: Parameters<typeof alsFolge>[0]) => alsFolge(e, s.kaefigRegeln ?? []);

    return db.transaction(async (tx) => {
      await sperreKasse(tx, s.id);
      // Gleichzeitig darf niemand die Preisrichter einteilen (die Bereiche hängen an diesen Nummern).
      await sperreEinteilung(tx, s.id);
      // Festgeschrieben oder nicht: unter Zeilensperre frisch lesen. Schreibt ein zweiter Admin gerade fest, wartet der
      // Aufruf und nummeriert danach nur nach (statt den festgeschriebenen Katalog neu zu nummerieren).
      const { gedruckt } = await sperreSchau(tx, s.id);
      // Vor dem Festschreiben wird umnummeriert: alle Tiere sperren, bevor die Bindungen geprüft werden.
      if (!gedruckt) await sperreTiere(tx, s.id);
      // Unter der Sperre frisch laden (eine Meldung kann inzwischen bestätigt worden sein).
      const alle = await ladeEintraege(s.id, { nurBestaetigt: true, ex: tx });
      let geaendert = 0;
      const verletzt: string[] = [];
      if (!gedruckt) {
        const gebunden = await bindungen(tx, alle.map((e) => e.id));
        if (gebunden.length) throw fehler("BAD_REQUEST", `Neu nummerieren geht nicht mehr – es gibt schon Bewertungen, Preise oder Verkäufe (z. B. ${gebunden[0]}). Bitte die Nummern festschreiben; neue Tiere bekommen dann Unternummern.`);
        const nummern = vergebeKatalognummern(alle.map(folge), opts);
        // Erst alle Nummern lösen, sonst kollidiert der eindeutige Index beim Umnummerieren.
        await tx.update(katalogeintrag).set({ katalogNr: null, suffix: "" }).where(eq(katalogeintrag.schauId, s.id));
        for (const e of alle) {
          const k = nummern.get(e.id)!;
          await tx
            .update(katalogeintrag)
            .set({ katalogNr: k.nr, suffix: k.suffix, kaefig: String(k.nr), kaefigBlock: folge(e).kaefigTyp ?? null, status: e.status === "gemeldet" ? "katalogisiert" : e.status })
            .where(eq(katalogeintrag.id, e.id));
          geaendert++;
        }
      } else {
        // Nachmeldungen in Ausstellungsfolge nummerieren, damit sie untereinander richtig stehen. Belegt sind alle
        // Nummern der Schau – auch die einer Meldung, die wieder auf „offen“ steht (eindeutiger Index).
        // Vorhandene Nummern stehen im Block von damals (gespeichert), nicht nach einer später geänderten Regel.
        const nummeriert = (await ladeEintraege(s.id, { ex: tx }))
          .filter((e) => e.katalogNr != null)
          .map((e) => ({ ...folge(e), ...(e.kaefigBlock ? { kaefigTyp: e.kaefigBlock } : {}), nr: e.katalogNr!, suffix: e.suffix }));
        const neu = alle.filter((x) => x.katalogNr == null);
        const nummern = nachmeldungsNummern(neu.map(folge), nummeriert, opts);
        // Zählen die Käfige nach dem Hallenplan („Käfigplätze nach Plan“), bekommt eine Nachmeldung keine Käfignummer aus
        // ihrer Katalognummer (die gibt es dort für ein anderes Tier) – „Käfigplätze nach Plan“ vergibt ihr den Platz.
        const kaefigeNachPlan = (await ladeEintraege(s.id, { ex: tx })).some((e) => e.katalogNr != null && e.kaefig !== "" && e.kaefig !== `${e.katalogNr}${e.suffix}`);
        for (const e of neu) {
          const k = nummern.get(e.id)!;
          await tx
            .update(katalogeintrag)
            .set({ katalogNr: k.nr, suffix: k.suffix, kaefig: kaefigeNachPlan ? "" : `${k.nr}${k.suffix}`, kaefigBlock: folge(e).kaefigTyp ?? null, status: "katalogisiert" })
            .where(eq(katalogeintrag.id, e.id));
          if (k.reihenfolgeVerletzt) verletzt.push(`${k.nr}${k.suffix}`);
          geaendert++;
        }
      }
      // Einteilung nach Rassen: die Nummernbereiche der Preisrichter folgen den neuen Nummern.
      const einteilung = await rassenEinteilungAnwenden(tx, s.id, ctx);
      await protokolliere(tx, {
        schauId: s.id,
        tabelle: "katalogeintrag",
        datensatzId: null,
        aktion: gedruckt ? "Nachmeldungen nummeriert" : "Katalognummern vergeben",
        neu: { anzahl: geaendert, ...(verletzt.length ? { ausserhalbDerFolge: verletzt } : {}) },
        akteur: ctx,
      });
      return { geaendert, nachmeldungen: gedruckt, ausserhalbDerFolge: verletzt, ohnePreisrichter: einteilung?.ohne ?? null, einteilung };
    });
  }),

  /**
   * Nach dem Umstellen im Hallenplan: Nummern in der Reihenfolge, in der die Käfige jetzt im (festgeschriebenen) Plan stehen
   * (siehe `planFolge`). Vor dem Festschreiben der Katalognummern bekommen alle bestätigten Tiere neue Katalognummern ab dem
   * Katalogstart (Käfig = Katalognummer; Tiere ohne Platz danach in Katalogfolge) – nur solange nichts an den Nummern hängt.
   * Danach (Katalog gedruckt) bleiben die Katalognummern; vergeben werden nur die Käfigplätze 1, 2, 3 … (Tiere ohne Platz
   * ohne Käfignummer). Nur nummerieren: kein Tier wechselt dabei den Käfig, freie Plätze bleiben frei (Rückmeldung 21.11.2026).
   */
  nummernNachPlan: adminProcedure.input(z.object({ schauId: dbId })).mutation(async ({ ctx, input }) => {
    const geladen = pruefeNichtAbgeschlossen(await ladeSchau(ctx.benutzer.organisationId, input.schauId));
    return db.transaction(async (tx) => {
      // Reihenfolge wie bei „Katalognummern vergeben“: Kasse, Einteilung (die Bereiche hängen an den Nummern), Schau-Zeile
      // (ADR 033), sonst verklemmen sie sich mit den Tablets.
      await sperreKasse(tx, geladen.id);
      await sperreEinteilung(tx, geladen.id);
      // Halle, fester Plan und Druckstand frisch und gesperrt: ein gleichzeitiges Speichern der Halle oder Festschreiben der
      // Nummern wartet, statt mit einem älteren Stand nummeriert zu werden.
      const frisch = await sperreSchau(tx, geladen.id);
      // Vor dem Festschreiben wird umnummeriert: alle Tiere sperren, bevor die Bindungen geprüft werden.
      if (!frisch.gedruckt) await sperreTiere(tx, geladen.id);
      const s = pruefeNichtAbgeschlossen({ ...geladen, phase: frisch.phase, halle: frisch.halle, hallenplanFest: frisch.fest, katalogGedruckt: frisch.gedruckt });
      if (!s.halle) throw fehler("BAD_REQUEST", "Erst unter „Hallenplan“ die Halle anlegen.");
      if (!s.hallenplanFest)
        throw fehler("BAD_REQUEST", "Erst den Plan festschreiben (im Halleneditor eine Reihe oder Platte verschieben) – sonst stellt die Software die Käfige nach den neuen Nummern wieder um.");
      const { tiere } = await planTiere(s, undefined, tx);
      const gerechnet = planeHalle(s.halle, tiere, s.kaefigMasse, s.hallenplanFest);
      if (gerechnet.fest?.veraltet) throw fehler("BAD_REQUEST", "Der feste Plan passt nicht mehr zu Halle oder Käfigmaßen – erst „Plan neu setzen“ und den Plan wieder festschreiben.");
      // Nur nummerieren, kein Tier wechselt den Käfig: Tiere, die (noch) nicht im festen Plan stehen (Nachmeldungen), stehen
      // dort, wo ihre Nummer sie hinstellt – mit neuen Nummern woanders. Deshalb die jetzige Belegung vorher festschreiben.
      const verankert = mitBelegung(s.hallenplanFest, gerechnet);
      const festNeu = stabilerText(verankert) !== stabilerText(s.hallenplanFest);
      if (festNeu) await tx.update(schau).set({ hallenplanFest: verankert }).where(eq(schau.id, s.id));
      const plan = festNeu ? planeHalle(s.halle, tiere, s.kaefigMasse, verankert) : gerechnet;
      const richtung = s.halle.richtung ?? "quer";
      const folge = planFolge(plan, richtung, s.halle.nummerFolge);
      const opts = { start: s.katalogStart, jugendSeparat: s.jugendSeparat, staemmeVorn: s.staemmeVorn, kaefigFolge: s.kaefigFolge, sortierung: s.katalogSortierung };
      const regeln = s.kaefigRegeln ?? [];
      // Nummern: nur bestätigte Tiere (wie „Katalognummern vergeben“). Käfigplätze: jedes Tier, das im Plan einen Käfig
      // belegt – auch eine offene Meldung (wie im Plan).
      const alle = (await ladeEintraege(s.id, { ex: tx })).filter((e) => (s.katalogGedruckt ? e.meldungStatus === "offen" || e.meldungStatus === "bestaetigt" : e.meldungStatus === "bestaetigt"));
      // Vor dem Festschreiben zählen nur bestätigte Tiere – stehen im Plan nur offene Meldungen, gibt es nichts zu nummerieren.
      if (!s.katalogGedruckt && alle.length === 0) throw fehler("BAD_REQUEST", "Es gibt keine bestätigten Meldungen.");
      const nachId = new Map(alle.map((e) => [e.id, e]));
      const imPlan = folge.filter((x) => nachId.has(x)).map((x) => nachId.get(x)!);
      const drin = new Set(imPlan.map((e) => e.id));
      // Ohne Platz: in bisheriger Folge (Nummer, sonst Katalogfolge).
      const ohnePlatz = alle
        .filter((e) => !drin.has(e.id))
        .sort((a, b) => (a.katalogNr ?? Infinity) - (b.katalogNr ?? Infinity) || vergleicheFolge(alsFolge(a, regeln), alsFolge(b, regeln), opts));
      const aenderungen: [number, string, string][] = [];
      if (!s.katalogGedruckt) {
        const gebunden = await bindungen(tx, alle.map((e) => e.id));
        if (gebunden.length) throw fehler("BAD_REQUEST", `Neu nummerieren geht nicht mehr – es gibt schon Bewertungen, Preise oder Verkäufe (z. B. ${gebunden[0]}). Bitte die Nummern festschreiben; dann folgen nur die Käfigplätze dem Plan.`);
        const reihe = [...imPlan, ...ohnePlatz];
        const neu = new Map(reihe.map((e, i) => [e.id, s.katalogStart + i]));
        for (const e of reihe) if (e.katalogNr !== neu.get(e.id) || e.suffix !== "" || e.kaefig !== String(neu.get(e.id))) aenderungen.push([e.id, `${e.katalogNr ?? "–"}${e.suffix}`, String(neu.get(e.id))]);
        if (aenderungen.length) {
          // Erst alle Nummern lösen, sonst kollidiert der eindeutige Index beim Umnummerieren.
          await tx.update(katalogeintrag).set({ katalogNr: null, suffix: "" }).where(eq(katalogeintrag.schauId, s.id));
          for (const e of reihe) {
            const nr = neu.get(e.id)!;
            await tx
              .update(katalogeintrag)
              .set({ katalogNr: nr, suffix: "", kaefig: String(nr), kaefigBlock: alsFolge(e, regeln).kaefigTyp ?? null, status: e.status === "gemeldet" ? "katalogisiert" : e.status })
              .where(eq(katalogeintrag.id, e.id));
          }
        }
      } else {
        const platz = new Map(imPlan.map((e, i) => [e.id, String(i + 1)]));
        for (const e of [...imPlan, ...ohnePlatz]) {
          const k = platz.get(e.id) ?? "";
          if (e.kaefig === k) continue;
          aenderungen.push([e.id, e.kaefig || "–", k || "–"]);
          await tx.update(katalogeintrag).set({ kaefig: k }).where(eq(katalogeintrag.id, e.id));
        }
      }
      // Einteilung nach Rassen: die Nummernbereiche der Preisrichter folgen den neuen Nummern. Ist von Hand nach
      // Nummernbereichen eingeteilt (ohne Regeln nach Rassen), bleiben die Bereiche stehen – das sagt die Antwort.
      const einteilung = !s.katalogGedruckt && aenderungen.length ? await rassenEinteilungAnwenden(tx, s.id, ctx) : null;
      const einteilungVonHand =
        !s.katalogGedruckt && aenderungen.length > 0 && !einteilung && (await tx.select({ id: prEinteilung.id }).from(prEinteilung).where(eq(prEinteilung.schauId, s.id)).limit(1)).length > 0;
      await protokolliere(tx, {
        schauId: s.id,
        tabelle: "katalogeintrag",
        datensatzId: null,
        aktion: s.katalogGedruckt ? "Käfigplätze nach Hallenplan vergeben" : "Katalognummern nach Hallenplan vergeben",
        // Je geänderter Eintrag: [Id, vorher, nachher] – Grundlage für Rückfragen zu Karten und Käfigen.
        neu: { anzahl: aenderungen.length, ohnePlatz: ohnePlatz.length, ...(festNeu ? { belegungFestgeschrieben: true } : {}), aenderungen, ...(einteilungVonHand ? { einteilungVonHand } : {}) },
        akteur: ctx,
      });
      return {
        modus: s.katalogGedruckt ? ("plaetze" as const) : ("nummern" as const),
        geaendert: aenderungen.length,
        ohnePlatz: ohnePlatz.length,
        ohnePreisrichter: einteilung?.ohne ?? null,
        /** Wie bei `nummernVergeben`: was beim Übertragen der Einteilung nach Rassen auf die Nummern auffiel (null: keine). */
        einteilung,
        einteilungVonHand,
      };
    });
  }),

  gedrucktSetzen: adminProcedure
    .input(z.object({ schauId: dbId, gedruckt: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      pruefeNichtAbgeschlossen(await ladeSchau(ctx.benutzer.organisationId, input.schauId));
      await db.transaction(async (tx) => {
        await sperreKasse(tx, input.schauId);
        // Aufheben: alle Tiere sperren, bevor die Bindungen geprüft werden (wie beim Umnummerieren).
        await sperreSchau(tx, input.schauId);
        if (!input.gedruckt) await sperreTiere(tx, input.schauId);
        if (!input.gedruckt) {
          // Aufheben heißt: beim nächsten Vergeben verschieben sich alle Nummern. Das darf nur, solange nichts
          // an den Nummern hängt – sonst passen Bewertungskarten, Kaufbelege und Preisrichter-Einteilung nicht mehr.
          const ids = (await tx.select({ id: katalogeintrag.id }).from(katalogeintrag).where(eq(katalogeintrag.schauId, input.schauId))).map((x) => x.id);
          const gebunden = await bindungen(tx, ids);
          if (gebunden.length)
            throw fehler("BAD_REQUEST", `Die Festschreibung lässt sich nicht mehr aufheben – es gibt schon Bewertungen, Preise oder Verkäufe (${gebunden.length} Tiere, z. B. ${gebunden[0]}). Neue Tiere bekommen Unternummern.`);
        }
        await tx.update(schau).set({ katalogGedruckt: input.gedruckt }).where(eq(schau.id, input.schauId));
        await protokolliere(tx, {
          schauId: input.schauId,
          tabelle: "schau",
          datensatzId: input.schauId,
          aktion: input.gedruckt ? "Katalognummern festgeschrieben" : "Festschreibung der Katalognummern aufgehoben",
          akteur: ctx,
        });
      });
      return { ok: true };
    }),
};
