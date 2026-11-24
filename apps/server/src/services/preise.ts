import { bindungText, hatKontingent, passtZuPreisart, pruefeVergabe, stiftungsanteil } from "@schau/domain";
import { and, asc, eq, sql } from "drizzle-orm";
import type { Tx } from "../db/client";
import { katalogeintrag, meldung, preisart, preisrichter, preisvergabe, prEinteilung, schau, stiftung } from "../db/schema";
import { fehler } from "../trpc";
import { RICHTER_PHASEN } from "./bewertung";
import { ladeEintraege } from "./eintraege";
import { pruefeNichtAbgerechnet, pruefeNichtAbgeschlossen, sperreKasse } from "./kasse";
import { protokolliere, type Akteur } from "./protokoll";
import { kontingente, zuteilung } from "./pruefung";

/** Am Tablet nur in den Bewertungsphasen und bis zur Freigabe – wie bei den Noten. */
function pruefeTablet(s: { phase: string; ergebnisseFreigegeben: boolean }, istAL: boolean) {
  if (!istAL && (s.ergebnisseFreigegeben || !RICHTER_PHASEN.includes(s.phase))) {
    throw fehler("BAD_REQUEST", "Bewertung ist geschlossen. Änderungen nur über die Ausstellungsleitung.");
  }
}

/** Nach der Freigabe sind die Preise veröffentlicht: Änderungen nur mit Grund, wie bei den Noten. */
function pruefeGrundNachFreigabe(s: { ergebnisseFreigegeben: boolean }, grund: string | undefined) {
  if (s.ergebnisseFreigegeben && !grund?.trim()) throw fehler("CONFLICT", "Die Ergebnisse sind freigegeben: Preise ändern sich nur noch als Reklamation mit Grund.");
}

/**
 * Vergibt einen Preis. Standgeldpreise gehen über das Kontingent des Preisrichters, dem das Tier zugeteilt ist;
 * Stiftungspreise über die Anzahl der gestifteten Preise ihrer Stiftung, Zusatzpreise ohne Stiftung („zusätzlich je
 * Preisrichter“) wie Standgeld über das Kontingent des Preisrichters (bei Kontingent „je Schau“ der ganzen Schau).
 */
export async function vergebePreis(
  tx: Tx,
  a: {
    schauId: number;
    katalogeintragId: number;
    preisartId: number;
    /** Gestifteter Preis: aus dieser Stiftung (ohne Angabe die erste mit freien Preisen). */
    stiftungId?: number | null;
    /** Gestifteter Preis bewusst aus „zusätzlich je Preisrichter“, nicht aus einer Stiftung (Betrag der Preisart). */
    ohneStiftung?: boolean;
    preisrichterId: number | null;
    akteur: Akteur;
    istAL: boolean;
    istAdmin?: boolean;
    grund?: string;
  },
) {
  // Erst sperren, dann lesen: gleichzeitige Vergaben (Tablet und Ausstellungsleitung) laufen nacheinander und sehen
  // jeweils den neuesten Stand – sonst ließen sich Kontingent und „ein Geldpreis je Tier“ überschreiten.
  await sperreKasse(tx, a.schauId);
  // Sperrfolge Kasse → Schau → Tier (ADR 033): Das Tier gesperrt, damit die Note bis zum Eintragen des Preises gilt –
  // eine gleichzeitige Bewertung wartet, oder die Vergabe wartet auf sie und liest danach die neue Note.
  const [s] = await tx.select().from(schau).where(eq(schau.id, a.schauId)).for("share");
  if (!s) throw fehler("NOT_FOUND", "Schau nicht gefunden.");
  pruefeNichtAbgeschlossen(s);
  pruefeTablet(s, a.istAL);
  pruefeGrundNachFreigabe(s, a.grund);
  await tx.select({ id: katalogeintrag.id }).from(katalogeintrag).where(and(eq(katalogeintrag.id, a.katalogeintragId), eq(katalogeintrag.schauId, a.schauId))).for("update");
  const [art] = await tx.select().from(preisart).where(and(eq(preisart.id, a.preisartId), eq(preisart.schauId, a.schauId)));
  if (!art) throw fehler("NOT_FOUND", "Preisart nicht gefunden.");
  // Gestiftete Preise (Betrag und Vorgabe des Stifters) vergibt die Ausstellungsleitung – das Tablet zeigt sie nicht.
  if (!a.istAL && art.quelle !== "standgeld") throw fehler("FORBIDDEN", "Gestiftete Preise vergibt die Ausstellungsleitung.");

  const alle = await ladeEintraege(a.schauId, { nurBestaetigt: true, ex: tx });
  const e = alle.find((x) => x.id === a.katalogeintragId);
  if (!e) throw fehler("NOT_FOUND", "Tier nicht gefunden.");
  // Fehlende Tiere zählen nicht zum Kontingent, also bekommen sie auch keinen Preis.
  if (e.status === "fehlt") throw fehler("BAD_REQUEST", "Tier ist als fehlend gemeldet – erst die Einlieferung korrigieren.");
  if (e.gesperrt) throw fehler("BAD_REQUEST", "Tier ist im Gesundheitsjournal gesperrt (krank oder verdächtig) und bekommt keinen Preis.");
  if (!passtZuPreisart(art, e)) throw fehler("BAD_REQUEST", `„${art.kuerzel}“ gilt ${bindungText(art)} – dieses Tier passt nicht dazu.`);
  const einteilung = await tx.select().from(prEinteilung).where(eq(prEinteilung.schauId, a.schauId));
  const zu = zuteilung(alle, einteilung);
  const zustaendig = zu.get(e.id) ?? null;
  if (a.preisrichterId != null && zustaendig !== a.preisrichterId) {
    throw fehler("FORBIDDEN", "Dieses Tier ist einem anderen Preisrichter zugeteilt.");
  }

  let vergeben: number;
  let verfuegbar: number;
  // Betrag dieser Vergabe: bei Standgeld der Betrag der Preisart, bei einer Stiftung ihr Anteil je Preis.
  let betragCent = art.betragCent;
  let stiftungId: number | null = null;
  let stifter: string | null = null;
  /** Kontingent des zuständigen Preisrichters (bzw. der Schau) – dieselbe Zählung wie die Seite „Preise“ (`kontingente`). */
  const ausKontingent = async () => {
    if (zustaendig == null) throw fehler("BAD_REQUEST", "Das Tier ist keinem Preisrichter zugeteilt.");
    const richterListe = await tx.select({ id: preisrichter.id, name: preisrichter.name }).from(preisrichter).where(eq(preisrichter.schauId, a.schauId));
    const k = kontingente(alle, zu, richterListe, [art], s.kontingentJe);
    const zeile = s.kontingentJe === "schau" ? k[0] : k.find((x) => x.preisrichterId === zustaendig);
    return { verfuegbar: zeile?.arten[0]?.verfuegbar ?? 0, vergeben: zeile?.arten[0]?.vergeben ?? 0 };
  };
  if (art.quelle === "standgeld") {
    ({ verfuegbar, vergeben } = await ausKontingent());
  } else {
    // Welche Stiftung: die gewählte oder die erste mit freien Preisen. Ohne freie Stiftung zählt der Preis zu
    // „zusätzlich je Preisrichter“ (Betrag der Preisart) – im Kontingent des zuständigen Preisrichters wie Standgeld.
    const stiftungen = await tx.select().from(stiftung).where(and(eq(stiftung.schauId, a.schauId), eq(stiftung.preisartId, art.id))).orderBy(asc(stiftung.id));
    const benutzt = (id: number) => alle.reduce((n, x) => n + x.preise.filter((p) => p.stiftungId === id).length, 0);
    const gewaehlt = a.ohneStiftung ? undefined : a.stiftungId != null ? stiftungen.find((st) => st.id === a.stiftungId) : stiftungen.find((st) => benutzt(st.id) < st.anzahl);
    if (a.stiftungId != null && !gewaehlt) throw fehler("BAD_REQUEST", "Diese Stiftung gehört nicht zu dieser Preisart.");
    if (gewaehlt) {
      const frei = gewaehlt.anzahl - benutzt(gewaehlt.id);
      if (frei <= 0) throw fehler("BAD_REQUEST", `Die Stiftung von ${gewaehlt.stifter} ist schon vollständig vergeben.`);
      // Preise aus einer Stiftung zählen nur gegen die Stiftung, nicht gegen die Zusatzpreise des Preisrichters.
      vergeben = benutzt(gewaehlt.id);
      verfuegbar = gewaehlt.anzahl;
      stiftungId = gewaehlt.id;
      stifter = gewaehlt.stifter;
      // Anteil aus dem noch nicht vergebenen Rest: nie mehr als gestiftet, auch nach Entfernen oder geänderter Anzahl.
      if (gewaehlt.betragCent > 0) {
        const schon = alle.reduce((n, x) => n + x.preise.filter((p) => p.stiftungId === gewaehlt.id).reduce((m, p) => m + p.betragCent, 0), 0);
        betragCent = stiftungsanteil(gewaehlt.betragCent - schon, frei);
      }
    } else if (hatKontingent(art)) {
      ({ verfuegbar, vergeben } = await ausKontingent());
    } else {
      // Ohne „zusätzlich je Preisrichter“ gibt es ohne Stiftung keinen Preis.
      throw fehler("BAD_REQUEST", "Diesen Preis gibt es nur aus einer Stiftung.");
    }
  }

  const problem = pruefeVergabe({
    preisart: art,
    punkte: e.punkte,
    istGeldpreis: art.quelle === "standgeld" && art.betragCent > 0,
    hatGeldpreis: e.preise.some((p) => p.quelle === "standgeld" && p.betragCent > 0),
    hatDiesePreisart: e.preise.some((p) => p.preisartId === art.id),
    vergeben,
    verfuegbar,
  });
  if (problem) throw fehler("BAD_REQUEST", problem);
  // Geldpreise ändern den Saldo – nach Auszahlung oder in der offenen SEPA-Datei nicht mehr still.
  // Nach der Abrechnung nur als Reklamation durch die AL mit Grund (z. B. ein versehentlich entzogener Preis).
  if (betragCent > 0) await pruefeNichtAbgerechnet(tx, a.schauId, e.ausstellerId, a.istAL && a.istAdmin ? { istAdmin: true, grund: a.grund ?? "" } : undefined);

  // Betrag festhalten: eine spätere Änderung der Preisart ändert weder Abrechnung noch Quittung.
  await tx.insert(preisvergabe).values({ katalogeintragId: e.id, preisartId: art.id, preisrichterId: zustaendig, betragCent, stiftungId });
  await protokolliere(tx, {
    schauId: a.schauId,
    tabelle: "preisvergabe",
    datensatzId: e.id,
    aktion: "vergeben",
    neu: { nr: `${e.katalogNr}${e.suffix}`, preis: art.kuerzel, betragCent, ...(stifter != null ? { stiftungId, stifter } : {}) },
    grund: a.grund ?? "",
    akteur: a.akteur,
  });
}

export async function entfernePreis(
  tx: Tx,
  a: { schauId: number; preisvergabeId: number; preisrichterId: number | null; akteur: Akteur; istAL: boolean; istAdmin?: boolean; grund?: string },
) {
  await sperreKasse(tx, a.schauId);
  const [s] = await tx.select().from(schau).where(eq(schau.id, a.schauId));
  if (!s) throw fehler("NOT_FOUND", "Schau nicht gefunden.");
  pruefeNichtAbgeschlossen(s);
  pruefeTablet(s, a.istAL);
  pruefeGrundNachFreigabe(s, a.grund);
  const [p] = await tx
    .select({ v: preisvergabe, schauId: preisart.schauId, kuerzel: preisart.kuerzel, betragCent: sql<number>`coalesce(${preisvergabe.betragCent}, ${preisart.betragCent})`, katalogNr: katalogeintrag.katalogNr, ausstellerId: meldung.ausstellerId })
    .from(preisvergabe)
    .innerJoin(preisart, eq(preisart.id, preisvergabe.preisartId))
    .innerJoin(katalogeintrag, eq(katalogeintrag.id, preisvergabe.katalogeintragId))
    .innerJoin(meldung, eq(meldung.id, katalogeintrag.meldungId))
    .where(eq(preisvergabe.id, a.preisvergabeId));
  if (!p || p.schauId !== a.schauId) throw fehler("NOT_FOUND", "Preis nicht gefunden.");
  if (p.betragCent > 0) await pruefeNichtAbgerechnet(tx, a.schauId, p.ausstellerId, a.istAL && a.istAdmin ? { istAdmin: true, grund: a.grund ?? "" } : undefined);
  if (a.preisrichterId != null) {
    // Wie beim Kontingent zählt die aktuelle Einteilung, nicht wer den Preis damals vergeben hat.
    const nr = p.katalogNr;
    const einteilung = await tx.select().from(prEinteilung).where(eq(prEinteilung.schauId, a.schauId));
    const zustaendig = nr == null ? undefined : einteilung.find((x) => nr >= x.vonNr && nr <= x.bisNr)?.preisrichterId;
    if (zustaendig !== a.preisrichterId) throw fehler("FORBIDDEN", "Nicht Ihr Preis.");
  }
  await tx.delete(preisvergabe).where(eq(preisvergabe.id, p.v.id));
  await protokolliere(tx, {
    schauId: a.schauId,
    tabelle: "preisvergabe",
    datensatzId: p.v.katalogeintragId,
    aktion: "entfernt",
    alt: { preis: p.kuerzel, betragCent: p.betragCent },
    grund: a.grund ?? "",
    akteur: a.akteur,
  });
}
