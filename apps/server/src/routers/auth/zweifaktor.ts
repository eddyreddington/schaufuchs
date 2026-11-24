/** Zwei-Faktor-Anmeldung: Status, Einrichten, Bestätigen, Abschalten, Zurücksetzen durch die Ausstellungsleitung. */
import { and, eq, isNull, ne } from "drizzle-orm";
import { z } from "zod";
import { pruefePasswort, sitzungsId } from "../../auth";
import { config } from "../../config";
import { db } from "../../db/client";
import { benutzer, organisation, sitzung } from "../../db/schema";
import { protokolliere } from "../../services/protokoll";
import { hashNotfallcode, lesbar, neueNotfallcodes, neuesGeheimnis, otpauthAdresse, pruefeTotp } from "../../services/zweifaktor";
import { adminProcedure, benutzerProcedure, fehler, dbId } from "../../trpc";
import { codeBremse, zweiFaktorBremse, eigenerZugang, verwalte, hinweisMail } from "./gemeinsam";

export const zweiFaktor = {
  zweiFaktorStatus: benutzerProcedure.query(async ({ ctx }) => {
    const [b] = await db.select({ aktiv: benutzer.totpAktivSeit, notfall: benutzer.totpNotfall }).from(benutzer).where(eq(benutzer.id, ctx.benutzer.id));
    return { aktiv: !!b?.aktiv, seit: b?.aktiv ?? null, notfallUebrig: b?.notfall.length ?? 0 };
  }),

  /** Schritt 1 der Einrichtung: neuen Schlüssel erzeugen (noch nicht aktiv). Verlangt das Passwort. */
  zweiFaktorEinrichten: benutzerProcedure.input(z.object({ passwort: z.string().max(200) })).mutation(async ({ ctx, input }) => {
    const zurueck = zweiFaktorBremse.versuch([`konto:${ctx.benutzer.id}`]);
    const [b] = await db.select().from(benutzer).where(eq(benutzer.id, ctx.benutzer.id));
    if (!b || !(await pruefePasswort(input.passwort, b.passwortHash))) throw fehler("BAD_REQUEST", "Das Passwort stimmt nicht.");
    zurueck();
    if (b.totpAktivSeit) throw fehler("BAD_REQUEST", "Die Zwei-Faktor-Anmeldung ist schon eingerichtet.");
    const geheim = neuesGeheimnis();
    // Nur solange nicht eingerichtet: bestätigt ein zweiter Tab gerade, bliebe sonst ein Geheimnis, das keine App kennt.
    const ok = await db.update(benutzer).set({ totpGeheim: geheim, totpLetzterSchritt: 0 }).where(and(eq(benutzer.id, b.id), isNull(benutzer.totpAktivSeit))).returning({ id: benutzer.id });
    if (!ok.length) throw fehler("BAD_REQUEST", "Die Zwei-Faktor-Anmeldung ist schon eingerichtet.");
    const [o] = await db.select({ name: organisation.name }).from(organisation).where(eq(organisation.id, b.organisationId));
    return { geheim: lesbar(geheim), adresse: otpauthAdresse(geheim, b.email, o?.name ? `SchauFUCHS ${o.name}` : config.appName) };
  }),

  /** Schritt 2: mit einem Code aus der App bestätigen – erst dann ist der zweite Faktor aktiv. Liefert die Notfallcodes. */
  zweiFaktorBestaetigen: benutzerProcedure.input(z.object({ code: z.string().trim().max(20) })).mutation(async ({ ctx, input }) => {
    const zurueck = codeBremse.versuch([`konto:${ctx.benutzer.id}`]);
    const [b] = await db.select().from(benutzer).where(eq(benutzer.id, ctx.benutzer.id));
    if (!b?.totpGeheim || b.totpAktivSeit) throw fehler("BAD_REQUEST", "Bitte die Einrichtung neu beginnen.");
    const schritt = pruefeTotp(b.totpGeheim, input.code, 0);
    if (schritt == null) throw fehler("BAD_REQUEST", "Der Code stimmt nicht. Bitte prüfen, ob die Uhr des Telefons richtig geht, und den aktuellen Code eingeben.");
    zurueck();
    const notfall = neueNotfallcodes();
    await db.transaction(async (tx) => {
      // Nur für genau das geprüfte Geheimnis und nur einmal (Entscheidung 033): ein zweiter Tab, ein neues Einrichten oder
      // das Zurücksetzen durch die Ausstellungsleitung dazwischen – dann gilt diese Bestätigung nicht. Gesperrt gelesen und
      // in JavaScript verglichen: das Geheimnis liegt verschlüsselt (mit Zufallswert) in der Datenbank.
      const [jetzt] = await tx.select({ geheim: benutzer.totpGeheim, aktiv: benutzer.totpAktivSeit }).from(benutzer).where(eq(benutzer.id, b.id)).for("update");
      if (!jetzt || jetzt.aktiv || jetzt.geheim !== b.totpGeheim) throw fehler("BAD_REQUEST", "Bitte die Einrichtung neu beginnen.");
      await tx.update(benutzer).set({ totpAktivSeit: new Date(), totpLetzterSchritt: schritt, totpNotfall: notfall.hashes }).where(eq(benutzer.id, b.id));
      // Andere Geräte melden sich neu an – dann schon mit zweitem Faktor.
      const eigene = ctx.cookieTokens.benutzer ? sitzungsId(ctx.cookieTokens.benutzer) : "";
      await tx.delete(sitzung).where(and(eq(sitzung.benutzerId, b.id), ne(sitzung.id, eigene)));
      await protokolliere(tx, { schauId: null, tabelle: "benutzer", datensatzId: b.id, aktion: "Zwei-Faktor-Anmeldung eingerichtet", akteur: ctx });
    });
    await hinweisMail(ctx.benutzer, b.email, "Zwei-Faktor-Anmeldung eingerichtet", [`Guten Tag ${b.name},`, "", "für Ihren Zugang zu SchauFUCHS wurde soeben die Zwei-Faktor-Anmeldung eingerichtet."], true);
    return { notfallcodes: notfall.klar };
  }),

  /** Abschalten durch den Benutzer selbst: Passwort und aktueller Code (oder Notfallcode). */
  zweiFaktorAbschalten: benutzerProcedure.input(z.object({ passwort: z.string().max(200), code: z.string().trim().max(20) })).mutation(async ({ ctx, input }) => {
    const zurueck = zweiFaktorBremse.versuch([`konto:${ctx.benutzer.id}`]);
    const [b] = await db.select().from(benutzer).where(eq(benutzer.id, ctx.benutzer.id));
    if (!b?.totpAktivSeit || !b.totpGeheim) throw fehler("BAD_REQUEST", "Die Zwei-Faktor-Anmeldung ist nicht eingerichtet.");
    const codeOk = pruefeTotp(b.totpGeheim, input.code, b.totpLetzterSchritt) != null || b.totpNotfall.includes(hashNotfallcode(input.code));
    if (!(await pruefePasswort(input.passwort, b.passwortHash)) || !codeOk) throw fehler("BAD_REQUEST", "Passwort oder Code stimmt nicht.");
    zurueck();
    await db.transaction(async (tx) => {
      await tx.update(benutzer).set({ totpGeheim: null, totpAktivSeit: null, totpLetzterSchritt: 0, totpNotfall: [] }).where(eq(benutzer.id, b.id));
      await protokolliere(tx, { schauId: null, tabelle: "benutzer", datensatzId: b.id, aktion: "Zwei-Faktor-Anmeldung abgeschaltet", akteur: ctx });
    });
    await hinweisMail(ctx.benutzer, b.email, "Zwei-Faktor-Anmeldung abgeschaltet", [`Guten Tag ${b.name},`, "", "für Ihren Zugang zu SchauFUCHS wurde soeben die Zwei-Faktor-Anmeldung abgeschaltet."], true);
    return { ok: true };
  }),

  /** Telefon verloren und keine Notfallcodes mehr: die Ausstellungsleitung setzt den zweiten Faktor zurück. */
  zweiFaktorZuruecksetzen: adminProcedure.input(z.object({ id: dbId })).mutation(async ({ ctx, input }) => {
    const b = await verwalte(ctx, input.id, async (tx, b) => {
      if (!b.totpAktivSeit && !b.totpGeheim) throw fehler("BAD_REQUEST", "Die Zwei-Faktor-Anmeldung ist für diesen Benutzer nicht eingerichtet.");
      await tx.update(benutzer).set({ totpGeheim: null, totpAktivSeit: null, totpLetzterSchritt: 0, totpNotfall: [] }).where(eq(benutzer.id, b.id));
      await protokolliere(tx, { schauId: null, tabelle: "benutzer", datensatzId: b.id, aktion: "Zwei-Faktor-Anmeldung zurückgesetzt", neu: { benutzer: b.name }, akteur: ctx });
      return b;
    });
    await hinweisMail(ctx.benutzer, b.email, "Ihre Zwei-Faktor-Anmeldung wurde zurückgesetzt", [
      `Guten Tag ${b.name},`,
      "",
      `${ctx.benutzer.name} hat die Zwei-Faktor-Anmeldung Ihres Zugangs zu SchauFUCHS zurückgesetzt. Sie melden sich jetzt nur mit dem Passwort an und können die Zwei-Faktor-Anmeldung ${eigenerZugang(b.rolle)} neu einrichten.${b.rolle === "admin" ? " Als Administrator kommen Sie erst danach wieder an die Verwaltung." : ""}`,
    ]);
    return { ok: true };
  }),

};
