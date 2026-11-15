import { formatKatalognummer, MELDEART_LABEL, NACHWEIS_LABEL, TIERART_LABEL, TIERARTEN, tierzahl, type Tierart } from "@schau/domain";
import { asc, eq, inArray } from "drizzle-orm";
import { db } from "../db/client";
import { aussteller, gesundheit, meldung, verkauf, type schau } from "../db/schema";
import { ladeEintraege } from "./eintraege";
import { nachweisStand } from "./tiergesundheit";

const STATUS: Record<string, string> = { gemeldet: "gemeldet", katalogisiert: "nicht eingeliefert", eingeliefert: "eingeliefert", fehlt: "fehlt", ausgesetzt: "ausgegeben" };

/**
 * Liste über die Ausstellenden für das Veterinäramt (Art. 105 VO (EU) 2016/429, Art. 22 und 25 DelVO (EU) 2019/2035,
 * HMLU-Erlass 28.08.2026 Nr. 5): je Aussteller Herkunftsbetrieb mit Registriernummer, je Tier Art, Anzahl, Ringnummer,
 * Status und Verbleib; dazu Übersicht nach Tierarten (auch für die Anzeige) und das Gesundheitsjournal.
 */
export async function ladeTierliste(s: typeof schau.$inferSelect) {
  // Alle Tiere, die auf der Schau waren – auch wenn die Meldung danach storniert wurde.
  const eintraege = (await ladeEintraege(s.id)).filter(
    (e) => e.katalogNr != null && (e.meldungStatus === "bestaetigt" || e.status === "eingeliefert" || e.status === "ausgesetzt"),
  );
  const mIds = [...new Set(eintraege.map((e) => e.meldungId))];
  const aIds = [...new Set(eintraege.map((e) => e.ausstellerId))];
  const [meldungen, personen, verkaeufe, journal] = await Promise.all([
    mIds.length ? db.select().from(meldung).where(inArray(meldung.id, mIds)) : [],
    aIds.length ? db.select().from(aussteller).where(inArray(aussteller.id, aIds)) : [],
    eintraege.length ? db.select().from(verkauf).where(inArray(verkauf.katalogeintragId, eintraege.map((e) => e.id))) : [],
    db.select().from(gesundheit).where(eq(gesundheit.schauId, s.id)).orderBy(asc(gesundheit.zeitpunkt)),
  ]);

  const ausstellerListe = mIds
    .map((mid) => {
      const m = meldungen.find((x) => x.id === mid)!;
      const a = personen.find((x) => x.id === m.ausstellerId)!;
      const tiere = eintraege.filter((e) => e.meldungId === mid).sort((x, y) => x.katalogNr! - y.katalogNr! || x.suffix.localeCompare(y.suffix));
      const n = nachweisStand(m, tiere.map((t) => t.tierart), s, a.registriernummer);
      const nachweise = n.noetig.map((art) => {
        const datum = art === "nd" ? m.vetImpfdatum : art === "pmv" ? m.pmvImpfdatum : art === "kl" ? m.klDatum : art === "gz" ? m.gzDatum : m.wgDatum;
        return `${NACHWEIS_LABEL[art].split(" (")[0]}${datum ? ` ${datum.split("-").reverse().join(".")}` : " fehlt"}`;
      });
      return {
        name: `${a.nachname}, ${a.vorname}`,
        anschrift: [a.strasse, `${a.plz} ${a.ort}`.trim()].filter(Boolean).join(", "),
        plz: a.plz,
        ort: a.ort,
        registriernummer: a.registriernummer,
        nachweise: [...nachweise, n.noetig.length ? (n.geprueft ? "geprüft" : "nicht geprüft") : ""].filter(Boolean).join(", "),
        tiere: tiere.map((e) => {
          const v = verkaeufe.find((x) => x.katalogeintragId === e.id && !x.storniertAm);
          // Storno nach der Ausgabe: das Tier ist vielleicht schon beim Käufer – Verbleib prüfen lassen.
          const storno = verkaeufe.filter((x) => x.katalogeintragId === e.id && x.storniertAm);
          const verendet = journal.some((g) => g.katalogeintragId === e.id && g.verendet);
          return {
            katalogNr: formatKatalognummer(e),
            tierart: e.tierart,
            tier: e.bezeichnung,
            klasse: `${e.geschlecht} ${e.alter}${e.art !== "einzeltier" ? ` (${MELDEART_LABEL[e.art]})` : ""}`,
            anzahl: tierzahl(e.geschlecht),
            // Eingeliefert ohne Ring: sichtbar machen (die Liste weist die Kennzeichnung der Tiere nach).
            ringnummern: e.ringnummern?.trim() || (e.status === "eingeliefert" || e.status === "ausgesetzt" ? "fehlt" : ""),
            // Bewertet war das Tier da, auch wenn die Einlieferung (Nachweis offen) nicht abgehakt ist.
            status: e.status === "katalogisiert" && e.bewertet ? "bewertet, Einlieferung nicht abgehakt" : (STATUS[e.status] ?? e.status),
            verbleib: verendet
              ? "verendet (Gesundheitsjournal)"
              : v
              ? `verkauft (Beleg ${v.belegNr}) an ${v.kaeuferName}, Reg.-Nr. ${v.kaeuferRegistriernummer || "fehlt"}`
              : e.status === "fehlt" || (e.status === "katalogisiert" && !e.bewertet)
                ? "nicht auf der Schau"
                : storno.length
                  ? `zurück an Herkunftsbetrieb (Verkauf Beleg ${storno.map((x) => x.belegNr).join(", ")} storniert – Verbleib prüfen)`
                  : "zurück an Herkunftsbetrieb",
            gesperrt: e.gesperrt,
          };
        }),
      };
    })
    .sort((x, y) => x.name.localeCompare(y.name, "de"));

  // Übersicht nach Tierarten: Tiere (eingeliefert bzw. gemeldet) und Aussteller.
  const da = (status: string) => status !== "fehlt" && status !== "nicht eingeliefert";
  // (bewertete, nicht abgehakte Tiere tragen einen eigenen Status und zählen damit als anwesend)
  const uebersicht = TIERARTEN.map((art: Tierart) => {
    const t = ausstellerListe.flatMap((a) => a.tiere.filter((x) => x.tierart === art));
    return {
      tierart: TIERART_LABEL[art],
      gemeldet: t.reduce((n, x) => n + x.anzahl, 0),
      anwesend: t.filter((x) => da(x.status)).reduce((n, x) => n + x.anzahl, 0),
      aussteller: ausstellerListe.filter((a) => a.tiere.some((x) => x.tierart === art)).length,
    };
  }).filter((z) => z.gemeldet > 0);

  // Herkunft nach Ort (Grundlage für „regional/überregional“ in der Anzeige).
  const orte = new Map<string, number>();
  for (const a of ausstellerListe) orte.set(`${a.plz} ${a.ort}`.trim() || "ohne Angabe", (orte.get(`${a.plz} ${a.ort}`.trim() || "ohne Angabe") ?? 0) + 1);
  const herkunft = [...orte.entries()].map(([ort, anzahl]) => ({ ort, anzahl })).sort((x, y) => x.ort.localeCompare(y.ort, "de"));

  const tierText = (id: number | null) => {
    const e = eintraege.find((x) => x.id === id);
    return e ? `${formatKatalognummer(e)} ${e.bezeichnung}, ${e.geschlecht} ${e.alter} (${e.ausstellerName})` : "";
  };
  return {
    aussteller: ausstellerListe,
    uebersicht,
    herkunft,
    gesundheit: journal.map((g) => ({ ...g, tier: tierText(g.katalogeintragId) || g.tierText })),
  };
}
export type Tierliste = Awaited<ReturnType<typeof ladeTierliste>>;
