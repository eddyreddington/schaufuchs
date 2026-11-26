/**
 * Gemeinsame Hilfen der Kasse: Beleg- und Quittungsnummern, SEPA-XML aus einem Lauf, die Abrechnungsliste aller
 * Aussteller, die erlaubten Phasen für Verkauf, Auszahlung und SEPA sowie die Prüfung des Kassenbestands.
 */
import { berechneAbrechnung, gefordertCent, erzeugeSepaUeberweisung, imEwr, pruefeIban, type Phase } from "@schau/domain";
import { and, asc, eq, inArray, isNull, max, sql } from "drizzle-orm";
import { db, type Tx } from "../../db/client";
import { inEigenerZeile, verlangeEigeneZeile } from "../../db/geheim";
import { aenderung, aussteller, auszahlung, katalogeintrag, meldung, schau, verkauf, verkaufZahlungseingang } from "../../db/schema";
import { ladeEintraege, meldebetrag } from "../../services/eintraege";
import { offeneLastschrift, offenerLauf, type UeberweisungsLauf } from "../../services/kasse";
import { sollBestand } from "../../services/kassenbuch";
import { fehler } from "../../trpc";

type Schau = typeof schau.$inferSelect;

/** Nächste Belegnummer. Stornierte Belege stehen im Protokoll und werden nicht wieder vergeben. */
export async function naechsteBelegNr(tx: Tx, schauId: number) {
  const [mx] = await tx
    .select({ n: max(verkauf.belegNr) })
    .from(verkauf)
    .innerJoin(katalogeintrag, eq(katalogeintrag.id, verkauf.katalogeintragId))
    .where(eq(katalogeintrag.schauId, schauId));
  const [st] = await tx
    .select({ n: sql<number | null>`max((${aenderung.alt}->>'belegNr')::int)` })
    .from(aenderung)
    .where(and(eq(aenderung.schauId, schauId), eq(aenderung.tabelle, "verkauf"), eq(aenderung.aktion, "storniert")));
  // Auch Belege, deren Verkauf ohne Storno verschwand (Tier aus der Meldung gelöscht), stehen im Protokoll.
  const [vk] = await tx
    .select({ n: sql<number | null>`max((${aenderung.neu}->>'belegNr')::int)` })
    .from(aenderung)
    .where(and(eq(aenderung.schauId, schauId), eq(aenderung.tabelle, "verkauf"), eq(aenderung.aktion, "verkauft")));
  return Math.max(mx?.n ?? 0, Number(st?.n ?? 0), Number(vk?.n ?? 0)) + 1;
}

/**
 * Nächste Quittungsnummer. Stornierte Buchungen bleiben in der Tabelle; früher gelöschte (zurückgenommene)
 * stehen im Protokoll – beide werden nicht wieder vergeben.
 */
export async function naechsteQuittungNr(tx: Tx, schauId: number) {
  const [mx] = await tx.select({ n: max(auszahlung.quittungNr) }).from(auszahlung).where(eq(auszahlung.schauId, schauId));
  const [st] = await tx
    .select({ n: sql<number | null>`max((${aenderung.alt}->>'quittungNr')::int)` })
    .from(aenderung)
    .where(and(eq(aenderung.schauId, schauId), eq(aenderung.tabelle, "auszahlung"), eq(aenderung.aktion, "zurückgenommen")));
  return Math.max(mx?.n ?? 0, Number(st?.n ?? 0)) + 1;
}


/** XML (pain.001.001.09) aus einem gespeicherten Lauf – bei jedem Download derselbe Inhalt. */
export function sepaXml(s: Schau, lauf: UeberweisungsLauf): string {
  return erzeugeSepaUeberweisung({
    nachrichtId: lauf.nachrichtId,
    erstelltAm: new Date(lauf.erstelltAm),
    ausfuehrungAm: lauf.ausfuehrungAm,
    auftraggeber: lauf.auftraggeber,
    posten: lauf.posten.map((p) => ({
      // Eindeutig je Datei: eine Nachzahlung an denselben Aussteller bekommt eine eigene Kennung.
      endToEndId: `S${s.id}-A${p.ausstellerId}-${lauf.nachrichtId.split("-").pop()}`,
      name: p.kontoinhaber,
      iban: p.iban,
      betragCent: p.betragCent,
      verwendungszweck: `${s.name} Preisgeld/Tierverkauf ${p.name}`,
    })),
  });
}

/** Abrechnung aller Aussteller einer Schau – oder nur eines Ausstellers (Quittung, Auszahlung: ohne alle anderen neu zu rechnen). */
/** Datum des jüngsten abgeschlossenen Kassentags ("" ohne Abschluss). */
export function letzterAbschluss(tage: { datum: string; abschluss: unknown }[]): string {
  return tage.filter((t) => t.abschluss).reduce((m, t) => (t.datum > m ? t.datum : m), "");
}

export async function abrechnungListe(schauId: number, ex: Tx = db, opts: { nurAusstellerId?: number; nurAusstellerIds?: number[] } = {}) {
  const [eintraege, meldungen, auszahlungen, lauf, lastschrift] = await Promise.all([
    ladeEintraege(schauId, { nurBestaetigt: true, ex }),
    ex
      .select({
        id: meldung.id,
        ausstellerId: meldung.ausstellerId,
        vorname: aussteller.vorname,
        nachname: aussteller.nachname,
        ort: aussteller.ort,
        iban: aussteller.iban,
        kontoinhaber: aussteller.kontoinhaber,
        inEigenerZeile: inEigenerZeile([aussteller.iban, aussteller.kontoinhaber], aussteller.id),
      })
      .from(meldung)
      .innerJoin(aussteller, eq(aussteller.id, meldung.ausstellerId))
      .where(and(eq(meldung.schauId, schauId), eq(meldung.status, "bestaetigt"), opts.nurAusstellerId ? eq(meldung.ausstellerId, opts.nurAusstellerId) : undefined, opts.nurAusstellerIds ? inArray(meldung.ausstellerId, opts.nurAusstellerIds.length ? opts.nurAusstellerIds : [-1]) : undefined)),
    ex.select().from(auszahlung).where(eq(auszahlung.schauId, schauId)).orderBy(asc(auszahlung.id)),
    offenerLauf(ex, schauId),
    offeneLastschrift(ex, schauId),
  ]);
  // Überweisungen gehen an diese IBAN: eine aus einer anderen Zeile kopierte fällt hier auf (db/geheim.ts).
  verlangeEigeneZeile(meldungen, "Abrechnung");
  const alleVerkaeufe = await ex
    .select({ v: verkauf, schauId: katalogeintrag.schauId, eingang: verkaufZahlungseingang.id })
    .from(verkauf)
    .innerJoin(katalogeintrag, eq(katalogeintrag.id, verkauf.katalogeintragId))
    .leftJoin(verkaufZahlungseingang, eq(verkaufZahlungseingang.verkaufId, verkauf.id))
    .where(and(eq(katalogeintrag.schauId, schauId), isNull(verkauf.storniertAm)));
  // Per Überweisung verkauft: der Erlös zählt erst mit gebuchtem Zahlungseingang (sonst stünde Geld zur Auszahlung
  // bereit, das noch nicht da ist). Bis dahin als „ausstehend“ ausgewiesen.
  const bezahlt = (x: (typeof alleVerkaeufe)[number]) => x.v.zahlart !== "ueberweisung" || x.eingang != null;
  const verkaeufe = alleVerkaeufe.filter(bezahlt);

  const zeilen = await Promise.all(
    meldungen.map(async (m) => {
      const tiere = eintraege.filter((e) => e.meldungId === m.id);
      const betrag = await meldebetrag(ex, m.id);
      const verkauft = verkaeufe.filter((v) => tiere.some((t) => t.id === v.v.katalogeintragId));
      // Zugesagte Ehrenpreisstiftung und Spende gehören zu dem, was der Aussteller zahlt – bezahlt sind sie keine
      // Überzahlung, offen werden sie wie offenes Meldegeld verrechnet.
      const a = berechneAbrechnung({
        meldebetragCent: gefordertCent(betrag),
        bezahltCent: betrag.bezahltCent,
        preisgelderCent: tiere.flatMap((t) => t.preise.map((p) => p.betragCent)),
        verkaeufe: verkauft.map((v) => v.v),
      });
      // Alle Buchungen des Ausstellers; stornierte bleiben sichtbar, zählen aber nicht.
      const buchungen = auszahlungen.filter((x) => x.ausstellerId === m.ausstellerId);
      const gueltig = buchungen.filter((x) => !x.storniertAm);
      const ausgezahltCent = gueltig.reduce((n, x) => n + x.betragCent, 0);
      const aus = gueltig[gueltig.length - 1] ?? null;
      const posten = lauf?.posten.find((p) => p.ausstellerId === m.ausstellerId);
      const inUeberweisung = lauf && posten ? { nachrichtId: lauf.nachrichtId, betragCent: posten.betragCent } : null;
      // Meldegeld in der offenen Lastschriftdatei: die Bank zieht es ein – an der Kasse nicht noch einmal verrechnen.
      const einzug = lastschrift?.daten.posten.find((p) => p.meldungId === m.id);
      const imEinzug = lastschrift && einzug ? { nachrichtId: lastschrift.nachrichtId, betragCent: einzug.betragCent } : null;
      // Was noch zu zahlen ist (positiv) oder zurückzufordern (negativ) – nach allen gültigen Buchungen.
      const nochOffenCent = a.saldoCent - ausgezahltCent - (inUeberweisung?.betragCent ?? 0);
      return {
        meldungId: m.id,
        ausstellerId: m.ausstellerId,
        name: `${m.nachname}, ${m.vorname}`,
        ort: m.ort,
        iban: m.iban,
        kontoinhaber: m.kontoinhaber || `${m.vorname} ${m.nachname}`,
        tiere: tiere.length,
        verkaufAusstehendCent: alleVerkaeufe.filter((x) => !bezahlt(x) && tiere.some((t) => t.id === x.v.katalogeintragId)).reduce((n, x) => n + x.v.preisCent, 0),
        meldebetragCent: betrag.summeCent,
        stiftungCent: betrag.stiftungCent,
        spendeCent: betrag.spendeCent,
        bezahltCent: betrag.bezahltCent,
        ...a,
        // Zu viel gezahlt (über Meldegeld, Stiftung und Spende hinaus): steckt wie in berechneAbrechnung im Saldo und wird für die Belege ausgewiesen.
        ueberzahltCent: Math.max(0, betrag.bezahltCent - gefordertCent(betrag)),
        /** Letzte gültige Buchung (für Anzeige und Quittung). */
        auszahlung: aus,
        buchungen,
        ausgezahltCent,
        inUeberweisung,
        imEinzug,
        nochOffenCent,
        // Nicht 0 heißt: nach einer Buchung oder SEPA-Datei nachträglich geändert – auszugleichen über eine Differenzbuchung.
        differenzCent: gueltig.length || inUeberweisung ? nochOffenCent : 0,
        // Überweisbar: Guthaben (auch Nachzahlung), gültige IBAN und in keiner offenen SEPA-Datei.
        // Konten außerhalb des EWR (z. B. Schweiz) nicht in die Sammelüberweisung – dort fehlen BIC und Anschrift.
        ueberweisbar: !inUeberweisung && !imEinzug && nochOffenCent > 0 && !!m.iban && !pruefeIban(m.iban) && imEwr(m.iban),
      };
    }),
  );
  return zeilen.sort((x, y) => x.name.localeCompare(y.name, "de"));
}

/**
 * Verkauf nur, wenn das Tier ausgestellt und bewertet ist (HMLU-Erlass 28.08.2026: sonst wäre die Schau ein Markt) –
 * also nach der Bewertung, solange die Schau läuft.
 */
export const VERKAUF_PHASEN: Phase[] = ["preise", "schau"];

/**
 * Ausgezahlt wird nach der Bewertung – vorher sperrte eine Auszahlung Preise und Verkauf des Ausstellers. Nach dem
 * Abschluss wird nichts mehr gebucht (sonst entstünden offene Beträge, deren IBAN die Bereinigung löscht).
 */
export const AUSZAHLUNG_PHASEN: Phase[] = ["schau", "abrechnung"];
/** Die SEPA-Sammelüberweisung gehört in die Abrechnung nach der Schau. */
export const SEPA_PHASEN: Phase[] = ["abrechnung"];

/** Kalenderdatum JJJJ-MM-TT, das es wirklich gibt (kein 31.02.). */
export const istKalenderdatum = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d) && new Date(`${d}T12:00:00Z`).toISOString().slice(0, 10) === d;

/** Bargeld, das nach einer Ausgabe noch in der Kasse wäre; negativ heißt: so viel ist gar nicht da. */
export async function pruefeKassenbestand(tx: Tx, schauId: number, ausgabeCent: number, wer: { rolle: string }, trotzdem: boolean) {
  const soll = await sollBestand(schauId, tx);
  if (soll - ausgabeCent >= 0) return;
  const text = `Laut Kassenbuch sind nur ${(soll / 100).toFixed(2).replace(".", ",")} € in der Kasse – danach wären es ${((soll - ausgabeCent) / 100).toFixed(2).replace(".", ",")} €.`;
  if (wer.rolle !== "admin") throw fehler("BAD_REQUEST", `${text} Bitte Betrag prüfen oder die Ausstellungsleitung holen.`);
  if (!trotzdem) throw fehler("PRECONDITION_FAILED", `${text} Trotzdem buchen?`);
}
