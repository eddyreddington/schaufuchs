/** Phase der Schau: absagen und Phase wechseln (mit den Prüfungen vor Meldephase, Schau und Abschluss). */
import { PHASEN, PHASEN_LABEL, fehlendeVereinsangaben, datumKurz, istSprache, texte } from "@schau/domain";
import { and, count, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../db/client";
import { aussteller, gebuehr, katalogeintrag, meldung, preisrichter, schau, sitzung } from "../../db/schema";
import { ladeEintraege } from "../../services/eintraege";
import { inOffenerLastschrift, offeneLastschrift, offeneStornoZahlungen, offeneUeberweisungsverkaeufe, offenerLauf, sperreKasse } from "../../services/kasse";
import { ladeKassenbuch } from "../../services/kassenbuch";
import { sendeMail } from "../../services/post";
import { protokolliere } from "../../services/protokoll";
import { checkliste } from "../../services/pruefung";
import { ladeVereinsangaben } from "../../services/datenschutz";
import { heuteDe } from "../../services/tiergesundheit";
import { adminProcedure, fehler, ladeSchau, dbId } from "../../trpc";

/** Was einem Abschluss der Schau noch entgegensteht (leer: abschließbar). */
async function abschlussHindernisse(schauId: number): Promise<string[]> {
  const { abrechnungListe } = await import("../kasse");
  const [zeilen, tage, lauf, lastschrift, stornos, ueberweisungen] = await Promise.all([
    abrechnungListe(schauId),
    ladeKassenbuch(schauId),
    offenerLauf(db, schauId),
    offeneLastschrift(db, schauId),
    offeneStornoZahlungen(db, schauId),
    offeneUeberweisungsverkaeufe(db, schauId),
  ]);
  const offen = zeilen.filter((z) => z.nochOffenCent !== 0);
  return [
    offen.length ? `${offen.length} Aussteller nicht vollständig abgerechnet` : "",
    // Geld einer stornierten oder abgelehnten Meldung: erstatten oder als Verfall buchen – sonst fiele es aus jeder Abrechnung.
    stornos.length ? `${stornos.length} stornierte oder abgelehnte Meldung(en) mit Zahlungseingang (${stornos.map((x) => x.name).join(", ")}) – erstatten oder Verfall buchen` : "",
    ueberweisungen.length ? `${ueberweisungen.length} Verkauf/Verkäufe per Überweisung ohne Zahlungseingang (Beleg ${ueberweisungen.map((v) => v.belegNr).join(", ")})` : "",
    lauf ? "SEPA-Datei noch offen (buchen oder verwerfen)" : "",
    lastschrift ? "Lastschriftdatei noch offen (buchen oder verwerfen)" : "",
    ...tage.filter((t) => (t.bewegungen.length && !t.abschluss) || t.nachtragOffen).map((t) => `Kassentag ${datumKurz(t.datum)} ${t.abschluss ? "mit offenem Nachtrag" : "ohne Tagesabschluss"}`),
  ].filter(Boolean);
}

export const phasen = {
  /**
   * Phase wechseln. Zurück nur mit Grund. Abschließen nur, wenn alles abgerechnet ist, keine SEPA-Datei offen ist und
   * jeder Kassentag einen Tagesabschluss hat – sonst nur ausdrücklich („trotzdem“) mit Grund. Mit dem Abschluss beginnt
   * die Karenzzeit, nach der die Bereinigung IBAN, Geburtsdatum und PINs löscht.
   */
  /**
   * Schau absagen (z. B. Ausstellungsverbot wegen Tierseuche, § 7 Abs. 5 GeflPestSchV): nur bis vor der Einlieferung.
   * Alle offenen und bestätigten Meldungen werden storniert (gedruckte Nummern bleiben reserviert), die Schau geht in
   * die Abrechnung – dort zeigt sie, wem Meldegeld zu erstatten ist; vorher lässt sie sich nicht abschließen. Die
   * Aussteller bekommen eine E-Mail. Alles im Protokoll.
   */
  absagen: adminProcedure.input(z.object({ id: dbId, grund: z.string().trim().min(3, "Bitte den Grund angeben.").max(500) })).mutation(async ({ ctx, input }) => {
    const s = await ladeSchau(ctx.benutzer.organisationId, input.id);
    if (s.abgesagtAm) throw fehler("BAD_REQUEST", "Die Schau ist schon abgesagt.");
    if (!["vorbereitung", "meldung", "katalog"].includes(s.phase))
      throw fehler("BAD_REQUEST", "Absagen geht nur bis vor der Einlieferung. Sind schon Tiere in der Halle, bitte mit dem Veterinäramt abstimmen und über die normale Abrechnung abschließen.");
    const betroffen = await db.transaction(async (tx) => {
      await sperreKasse(tx, s.id);
      const ms = await tx
        .select({ id: meldung.id, status: meldung.status, ausstellerId: meldung.ausstellerId, sprache: meldung.sprache })
        .from(meldung)
        .where(and(eq(meldung.schauId, s.id), inArray(meldung.status, ["offen", "bestaetigt"])));
      // Wie beim einzelnen Storno: was in der offenen Lastschriftdatei steht, zieht die Bank ein – erst verwerfen.
      if (await inOffenerLastschrift(tx, s.id, { meldungIds: ms.map((x) => x.id) })) throw fehler("BAD_REQUEST", "Es gibt eine offene Lastschriftdatei mit Meldegeldern dieser Schau – erst verwerfen (oder nach dem Einzug buchen), dann absagen.");
      for (const x of ms) {
        await tx.update(meldung).set({ status: "storniert" }).where(eq(meldung.id, x.id));
        // Wie beim einzelnen Storno: vor dem Festschreiben verlieren die Tiere ihre Nummer, danach bleiben sie reserviert.
        if (!s.katalogGedruckt) await tx.update(katalogeintrag).set({ katalogNr: null, suffix: "", status: "gemeldet" }).where(eq(katalogeintrag.meldungId, x.id));
        await protokolliere(tx, { schauId: s.id, tabelle: "meldung", datensatzId: x.id, aktion: "Status", alt: x.status, neu: "storniert", grund: `Schau abgesagt: ${input.grund}`, akteur: ctx });
      }
      await tx.update(schau).set({ abgesagtAm: new Date(), absageGrund: input.grund, phase: "abrechnung" }).where(eq(schau.id, s.id));
      await protokolliere(tx, { schauId: s.id, tabelle: "schau", datensatzId: s.id, aktion: "Schau abgesagt", alt: { phase: s.phase }, neu: { phase: "abrechnung", stornierteMeldungen: ms.length }, grund: input.grund, akteur: ctx });
      return ms;
    });
    // Nachricht an die Aussteller (nach dem Speichern; ein Mailfehler macht die Absage nicht rückgängig).
    const empfaenger = betroffen.length
      ? await db.select({ id: aussteller.id, email: aussteller.email, vorname: aussteller.vorname, nachname: aussteller.nachname }).from(aussteller).where(inArray(aussteller.id, [...new Set(betroffen.map((x) => x.ausstellerId))]))
      : [];
    for (const a of empfaenger.filter((x) => x.email)) {
      // In der Sprache der Meldung (Entscheidung 020); der Grund steht, wie die Ausstellungsleitung ihn geschrieben hat.
      const sprache = betroffen.find((x) => x.ausstellerId === a.id)?.sprache;
      const t = texte(istSprache(sprache) ? sprache : "de").mail;
      await sendeMail(
        s.organisationId,
        a.email,
        t.betreffAbsage(s.name),
        `${t.gutenTag(`${a.vorname} ${a.nachname}`.trim())}\n\n${t.absage(s.name, input.grund)}\n\n${t.gruesse}\n${s.veranstalter || s.name}`,
        a.id,
      );
    }
    return { ok: true, storniert: betroffen.length, benachrichtigt: empfaenger.filter((x) => x.email).length };
  }),

  phaseSetzen: adminProcedure
    .input(z.object({ id: dbId, phase: z.enum(PHASEN), grund: z.string().trim().max(500).default(""), trotzdem: z.boolean().default(false) }))
    .mutation(async ({ ctx, input }) => {
      const alt = await ladeSchau(ctx.benutzer.organisationId, input.id);
      if (input.phase === alt.phase) return { ok: true };
      const zurueck = PHASEN.indexOf(input.phase) < PHASEN.indexOf(alt.phase);
      if (zurueck && input.grund.length < 3) throw fehler("BAD_REQUEST", `Zurück zur Phase „${PHASEN_LABEL[input.phase]}“ nur mit Grund.`);
      const ziel = PHASEN.indexOf(input.phase);
      const von = PHASEN.indexOf(alt.phase);
      // Meldephase: Ohne Gebühren und Meldeschluss stünden Meldungen über 0,00 € und ein Formular ohne Termine im Netz.
      // Gilt auch beim Überspringen (Vorbereitung direkt zum Katalog), sonst ließe sich die Prüfung umgehen.
      if (!zurueck && von < PHASEN.indexOf("meldung") && ziel >= PHASEN.indexOf("meldung") && input.phase !== "abgeschlossen" && !input.trotzdem) {
        const [g] = (await db.select({ n: count() }).from(gebuehr).where(and(eq(gebuehr.schauId, alt.id), sql`${gebuehr.betragCent} > 0`))) as [{ n: number }];
        // Das Meldeformular ist öffentlich: ohne Impressum (§ 5 DDG) und Datenschutzhinweise (Art. 13 DSGVO) nicht online stellen.
        const verein = fehlendeVereinsangaben(await ladeVereinsangaben(alt.organisationId));
        const fehlt = [
          !g.n && "keine Gebühren (Einstellungen › Gebühren)",
          !alt.meldeschluss && "kein Meldeschluss (Einstellungen)",
          verein.length > 0 && `Impressum und Datenschutz unvollständig: ${verein.join(", ")} (Verein und Datenschutz)`,
        ].filter(Boolean);
        if (fehlt.length) throw fehler("PRECONDITION_FAILED", `Vor der Meldephase fehlt: ${fehlt.join(", ")}.`);
      }
      if (input.phase === "abgeschlossen") {
        // Eine offene SEPA-Datei hält IBANs fest, die nach dem Abschluss gelöscht würden: nie „trotzdem“.
        if (await offenerLauf(db, alt.id)) throw fehler("BAD_REQUEST", "Es gibt noch eine offene SEPA-Datei. Bitte erst buchen oder verwerfen, dann abschließen.");
        // Ebenso die Lastschriftdatei: nach dem Abschluss ließe sich der Einzug nicht mehr buchen, die IBANs blieben liegen.
        if (await offeneLastschrift(db, alt.id)) throw fehler("BAD_REQUEST", "Es gibt noch eine offene Lastschriftdatei. Bitte erst buchen oder verwerfen, dann abschließen.");
      }
      // Nach vorn (außer Vorbereitung → Meldephase, dafür gilt die Prüfung oben): rote Punkte der Prüfliste, unbewertete
      // Tiere und die fehlende Freigabe vor „Schau & Verkauf“, beim Abschluss die offenen Kassenpunkte und die laufende
      // Reklamationsfrist halten den Wechsel auf – auch beim Überspringen; „trotzdem“ nur mit Grund (steht im Protokoll).
      if (!zurueck && (von >= PHASEN.indexOf("meldung") || ziel > PHASEN.indexOf("meldung"))) {
        // Eine abgesagte Schau braucht nur noch die Kasse (Erstattungen) – Prüfliste, Freigabe und Frist gelten dann nicht.
        const offen = !alt.abgesagtAm ? (await checkliste(alt.id)).filter((p) => p.art === "fehler" && p.bis && PHASEN.indexOf(p.bis) < ziel).map((p) => (p.zusatz ? `${p.text} (${p.zusatz})` : p.text)) : [];
        // Vor dem Meldeschluss nennt die Prüfliste Tiere ohne Katalognummer nicht – beim Überspringen der Katalogphase hier zählen.
        if (ziel > PHASEN.indexOf("katalog") && von < PHASEN.indexOf("katalog") && !alt.abgesagtAm) {
          const ohneNr = (await ladeEintraege(alt.id, { nurBestaetigt: true })).filter((e) => e.katalogNr == null).length;
          if (ohneNr) offen.push(`${ohneNr} Tiere ohne Katalognummer`);
        }
        if (ziel >= PHASEN.indexOf("schau") && !alt.abgesagtAm) {
          // Die Prüfliste nennt unbewertete Tiere nur in den Bewertungsphasen – beim Überspringen hier selbst zählen.
          const tiere = (await ladeEintraege(alt.id, { nurBestaetigt: true })).filter((e) => e.katalogNr != null && e.status !== "fehlt");
          const unbewertet = tiere.filter((e) => !e.bewertet).length;
          if (unbewertet && !["bewertung", "preise", "schau"].includes(alt.phase)) offen.push(`${unbewertet} Tiere sind noch nicht bewertet`);
          if (tiere.length && !alt.ergebnisseFreigegeben) offen.push("Ergebnisse sind noch nicht freigegeben (Preise › Freigabe)");
        }
        if (input.phase === "abgeschlossen") {
          if (alt.reklamationsfrist && heuteDe() <= alt.reklamationsfrist && !alt.abgesagtAm) offen.push(`Reklamationsfrist läuft noch bis ${datumKurz(alt.reklamationsfrist)}`);
          offen.push(...(await abschlussHindernisse(alt.id)));
        }
        if (offen.length && !(input.trotzdem && input.grund.length >= 3)) {
          throw fehler(
            "PRECONDITION_FAILED",
            input.phase === "abgeschlossen" ? `Noch nicht abschließbar: ${offen.join("; ")}.` : `Vor „${PHASEN_LABEL[input.phase]}“ ist noch offen: ${offen.join("; ")}.`,
          );
        }
      }
      await db.transaction(async (tx) => {
        if (input.phase === "abgeschlossen") {
          // Unter der Kassensperre noch einmal: eine gleichzeitig erstellte SEPA- oder Lastschriftdatei bliebe sonst mit
          // IBANs in der abgeschlossenen Schau liegen (erstellen nimmt dieselbe Sperre und liest die Phase frisch).
          await sperreKasse(tx, alt.id);
          if ((await offenerLauf(tx, alt.id)) || (await offeneLastschrift(tx, alt.id))) throw fehler("CONFLICT", "Inzwischen wurde eine SEPA- oder Lastschriftdatei erstellt – bitte erst buchen oder verwerfen, dann abschließen.");
        }
        // Zeile sperren und mit dem geprüften Stand vergleichen (Entscheidung 033): eine gleichzeitige Absage oder ein
        // zweiter Wechsel wird gesehen, statt überschrieben. Schon gesetzt (Doppelklick, zweiter Tab): nichts zu tun.
        const [jetzt] = await tx.select({ phase: schau.phase, abgesagtAm: schau.abgesagtAm }).from(schau).where(eq(schau.id, alt.id)).for("update");
        const gleichAbgesagt = !!jetzt?.abgesagtAm === !!alt.abgesagtAm;
        if (jetzt?.phase === input.phase && gleichAbgesagt) return;
        if (jetzt?.phase !== alt.phase || !gleichAbgesagt) throw fehler("CONFLICT", "Die Phase wurde inzwischen geändert (z. B. Schau abgesagt oder von einer zweiten Ausstellungsleitung gewechselt). Bitte die Seite neu laden.");
        if (input.phase === "abgeschlossen" && !(input.trotzdem && input.grund.length >= 3)) {
          // Unter der Kassensperre noch einmal: eine Buchung, die vor der Sperre noch lief, hätte sonst einen Kassentag
          // ohne Abschluss in der abgeschlossenen Schau hinterlassen.
          const offen = await abschlussHindernisse(alt.id);
          if (offen.length) throw fehler("PRECONDITION_FAILED", `Noch nicht abschließbar: ${offen.join("; ")}.`);
        }
        await tx
          .update(schau)
          .set({ phase: input.phase, abgeschlossenAm: input.phase === "abgeschlossen" ? new Date() : null })
          .where(eq(schau.id, input.id));
        // Mit dem Abschluss alle Preisrichter abmelden (keine Sitzungen, die wochenlang gelten). Vorher nicht: ein
        // Tablet mit noch nicht übertragenen Noten bekommt so beim Abgleich „Bewertung geschlossen“ und zeigt sie dem
        // Preisrichter zum Nachtragen durch die Ausstellungsleitung, statt sie still im Gerät zu behalten.
        const abgemeldet =
          input.phase !== "abgeschlossen"
            ? []
            : await tx
                .delete(sitzung)
                .where(inArray(sitzung.preisrichterId, tx.select({ id: preisrichter.id }).from(preisrichter).where(eq(preisrichter.schauId, input.id))))
                .returning({ id: sitzung.id });
        await protokolliere(tx, {
          schauId: input.id,
          tabelle: "schau",
          datensatzId: input.id,
          aktion: "Phase",
          alt: alt.phase,
          neu: abgemeldet.length ? { phase: input.phase, tabletsAbgemeldet: abgemeldet.length } : input.phase,
          grund: input.grund,
          akteur: ctx,
        });
      });
      return { ok: true };
    }),
};
