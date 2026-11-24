/** Einladungslink: prüfen und annehmen (Passwort selbst festlegen). */
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { cookieHeader, hashPasswort, neueSitzung } from "../../auth";
import { db } from "../../db/client";
import { benutzer, organisation } from "../../db/schema";
import { protokolliere } from "../../services/protokoll";
import { publicProcedure } from "../../trpc";
import { passwort, MAX_AGE, einladungBremse, einladungFehler, OHNE_PASSWORT, ladeEinladung, ohneEinladung } from "./gemeinsam";

export const einladung = {
  /**
   * Einladungslink öffnen: wer ist eingeladen? Als POST, damit der Link in keinem Zugriffsprotokoll steht. Falsche
   * Links werden je Adresse gebremst; ein richtiger zählt nicht.
   */
  einladungPruefen: publicProcedure.input(z.object({ token: z.string().min(20).max(100) })).mutation(async ({ ctx, input }) => {
    const gutschrift = einladungBremse.versuch([`ip:${ctx.ip}`]);
    const b = await ladeEinladung(input.token);
    gutschrift();
    const [o] = await db.select({ name: organisation.name }).from(organisation).where(eq(organisation.id, b.organisationId));
    return { name: b.name, email: b.email, verein: o?.name ?? "" };
  }),

  /** Passwort über den Einladungslink festlegen. Der Link gilt danach nicht mehr; die Person ist gleich angemeldet. */
  einladungAnnehmen: publicProcedure.input(z.object({ token: z.string().min(20).max(100), passwort })).mutation(async ({ ctx, input }) => {
    const gutschrift = einladungBremse.versuch([`ip:${ctx.ip}`]);
    const b = await ladeEinladung(input.token);
    gutschrift();
    const hash = await hashPasswort(input.passwort);
    const sitzungToken = await db.transaction(async (tx) => {
      // Nur einmal und nur, solange noch kein Passwort gesetzt ist: zwei gleichzeitige Anfragen mit demselben Link –
      // die zweite findet ihn nicht mehr; ein von der AL gesetztes Passwort überschreibt der Link nicht.
      const ok = await tx
        .update(benutzer)
        .set({ passwortHash: hash, ...ohneEinladung })
        .where(and(eq(benutzer.id, b.id), eq(benutzer.einladungHash, b.einladungHash!), eq(benutzer.passwortHash, OHNE_PASSWORT), eq(benutzer.aktiv, true), isNull(benutzer.geloeschtAm)))
        .returning({ id: benutzer.id });
      if (!ok.length) throw await einladungFehler(tx);
      await protokolliere(tx, { schauId: null, tabelle: "benutzer", datensatzId: b.id, aktion: "Einladung angenommen, Passwort festgelegt", akteur: { benutzer: { id: b.id, name: b.name } } });
      // Sitzung in derselben Transaktion: eine Sperre oder ein Entfernen danach löscht sie mit.
      return neueSitzung({ benutzerId: b.id }, tx);
    });
    ctx.setCookie(cookieHeader(sitzungToken, MAX_AGE));
    return { ok: true };
  }),

};
