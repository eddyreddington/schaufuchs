import { formatKatalognummer, MELDEART_LABEL, tierzahl } from "@schau/domain";
import { eq, inArray } from "drizzle-orm";
import { db } from "../db/client";
import { aussteller, katalogeintrag, verkauf } from "../db/schema";
import { ladeEintraege } from "./eintraege";

/**
 * Aufzeichnung über die auf der Schau abgegebenen Tiere für das Veterinäramt:
 * Art, Anzahl und Kennzeichnung der Tiere, Herkunfts- und Bestimmungsbetrieb mit Registriernummer.
 * Grundlage für PDF und CSV, nach Belegnummer sortiert; stornierte Abgaben stehen gekennzeichnet mit darin.
 */
export async function ladeVerkaufsliste(schauId: number) {
  const [verkaeufe, eintraege] = await Promise.all([
    db
      .select({ v: verkauf })
      .from(verkauf)
      .innerJoin(katalogeintrag, eq(katalogeintrag.id, verkauf.katalogeintragId))
      .where(eq(katalogeintrag.schauId, schauId)),
    ladeEintraege(schauId),
  ]);
  const zuEintrag = new Map(eintraege.map((e) => [e.id, e]));
  const ids = [...new Set(verkaeufe.map(({ v }) => zuEintrag.get(v.katalogeintragId)?.ausstellerId).filter((x): x is number => x != null))];
  const herkunft = ids.length ? await db.select().from(aussteller).where(inArray(aussteller.id, ids)) : [];
  const zuAussteller = new Map(herkunft.map((a) => [a.id, a]));
  return verkaeufe
    .map(({ v }) => {
      const e = zuEintrag.get(v.katalogeintragId)!;
      const a = zuAussteller.get(e.ausstellerId);
      return {
        belegNr: v.belegNr,
        datum: v.createdAt,
        katalogNr: formatKatalognummer(e),
        sparte: e.sparte ?? e.einordnungSparte ?? "",
        tier: e.bezeichnung,
        klasse: `${e.geschlecht} ${e.alter}${e.art !== "einzeltier" ? ` (${MELDEART_LABEL[e.art]})` : ""}`,
        anzahl: tierzahl(e.geschlecht),
        ringnummern: e.ringnummern ?? "",
        herkunftName: a ? `${a.vorname} ${a.nachname}` : `${e.vorname} ${e.nachname}`,
        herkunftAnschrift: a ? [a.strasse, `${a.plz} ${a.ort}`.trim()].filter(Boolean).join(", ") : e.ort,
        herkunftRegistriernummer: a?.registriernummer ?? "",
        bestimmungName: v.kaeuferName,
        bestimmungAnschrift: v.kaeuferAnschrift,
        bestimmungRegistriernummer: v.kaeuferRegistriernummer,
        preisCent: v.preisCent,
        kaeuferUnter16: v.kaeuferUnter16,
        kaeuferErziehungsberechtigter: v.kaeuferErziehungsberechtigter,
        // Stornierte Abgaben bleiben in der Aufzeichnung (3 Jahre), gekennzeichnet.
        storniertAm: v.storniertAm,
        stornoGrund: v.stornoGrund,
      };
    })
    .sort((x, y) => x.belegNr - y.belegNr);
}

export type Verkaufszeile = Awaited<ReturnType<typeof ladeVerkaufsliste>>[number];
