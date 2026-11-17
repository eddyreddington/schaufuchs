/**
 * Datei-Adressen der Listen und Exporte (angemeldete Benutzer der eigenen Schau): Kassenbuch (CSV), Protokoll mit
 * Hash-Kette (CSV, JSON), Verkaufsliste, Abrechnung und Ergebnisse (CSV), Hallenplan und Aufbauliste, Tierliste für
 * das Veterinäramt und die SEPA-Sammelüberweisung (nur Ausstellungsleitung).
 */
import { bewertungsText, EingabeFehler, formatKatalognummer } from "@schau/domain";
import { asc, eq, sql } from "drizzle-orm";
import type { Hono } from "hono";
import { db } from "./db/client";
import { aenderung } from "./db/schema";
import { tierlistePdf, verkaufslistePdf } from "./pdf/dokumente";
import { datumDe } from "./pdf/basis";
import { aufbaulistePdf, hallenplanPdf } from "./pdf/hallenplan";
import { abrechnungListe, offenerLauf, sepaXml } from "./routers/kasse";
import { csv } from "./csv";
import { ladeKassenbuch } from "./services/kassenbuch";
import { ladeEintraege, skalaVon, verdeckeNamen } from "./services/eintraege";
import { ladeTierliste } from "./services/tierliste";
import { ladeVerkaufsliste } from "./services/verkaufsliste";
import { datei, pdf, schauFuer } from "./datei-hilfen";

const euro = (cent: number) => ({ zahl: (cent / 100).toFixed(2).replace(".", ",") });

export function exportDateien(app: Hono<any>) {
  app.get("/datei/:schauId/kassenbuch.csv", async (c) => {
    const s = await schauFuer(c);
    if (!s) return c.text("Nicht angemeldet oder keine Berechtigung.", 403);
    const tage = await ladeKassenbuch(s.id);
    const zeit = (d: Date) => new Intl.DateTimeFormat("de-DE", { dateStyle: "short", timeStyle: "medium", timeZone: "Europe/Berlin" }).format(d);
    return datei(
      c,
      csv([
        ["Tag", "Zeit", "Vorgang", "Einnahme", "Ausgabe", "Bestand"],
        ...tage.flatMap((t) => {
          let bestand = t.anfangCent;
          return [
            [datumDe(t.datum), "", "Anfangsbestand", "", "", euro(t.anfangCent)],
            ...t.bewegungen.map((b) => {
              bestand += b.betragCent;
              return [datumDe(t.datum), zeit(b.zeit), b.nachtrag ? `Nachtrag: ${b.text}` : b.text, b.betragCent > 0 ? euro(b.betragCent) : "", b.betragCent < 0 ? euro(-b.betragCent) : "", euro(bestand)];
            }),
            [datumDe(t.datum), "", "Soll-Endbestand", "", "", euro(t.sollCent)],
            // Nach einer Zählung geht es mit dem gezählten Bestand weiter – Unterschied als Kassendifferenz ausweisen.
            ...(t.abschluss && t.endCent !== t.sollCent
              ? [
                  [datumDe(t.datum), "", "Kassendifferenz laut Abschluss", "", "", euro(t.endCent - t.sollCent)],
                  [datumDe(t.datum), "", "Endbestand (gezählt + Nachträge)", "", "", euro(t.endCent)],
                ]
              : []),
            ...t.abschluesse.map((a) => [datumDe(t.datum), zeit(a.createdAt), `${a.nachtrag ? `Nachtragsabschluss ${a.nachtrag}` : "Tagesabschluss"} gezählt (Soll ${euro(a.sollCent).zahl} €, Differenz ${(a.differenzCent / 100).toFixed(2).replace(".", ",")} €) ${a.bemerkung}`.trim(), "", "", euro(a.istCent)]),
          ];
        }),
      ]),
      `kassenbuch-${s.slug}.csv`,
      "text/csv; charset=utf-8",
    );
  });

  // Export des Protokolls mit Hash-Kette (GoBD: Nachvollziehbarkeit, maschinelle Auswertbarkeit).
  app.get("/datei/:schauId/protokoll.csv", async (c) => {
    const s = await schauFuer(c);
    if (!s) return c.text("Nicht angemeldet oder keine Berechtigung.", 403);
    // Mit allen Feldern, die in den Hash eingehen (Zeitpunkt in UTC auf die Mikrosekunde) – so lässt sich die Kette
    // auch außerhalb der Anwendung nachrechnen (Aufbau siehe README, Abschnitt Betrieb).
    const zeilen = await db
      .select({
        z: aenderung,
        utc: sql<string>`to_char(${aenderung.zeitpunkt} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US')`,
        // Textform wie in der Datenbank (jsonb) – genau sie geht in den Inhalts-Hash ein.
        altText: sql<string | null>`${aenderung.alt}::text`,
        neuText: sql<string | null>`${aenderung.neu}::text`,
      })
      .from(aenderung)
      .where(eq(aenderung.schauId, s.id))
      .orderBy(asc(aenderung.id));
    const zeit = (d: Date) => new Intl.DateTimeFormat("de-DE", { dateStyle: "short", timeStyle: "medium", timeZone: "Europe/Berlin" }).format(d);
    return datei(
      c,
      csv([
        ["Nr", "Zeitpunkt", "Wer", "Bereich", "Datensatz", "Aktion", "Grund", "Vorher", "Nachher", "Hash", "Vorgänger-Hash", "Vorgänger-Nr", "Schau", "Benutzer-ID", "Preisrichter-ID", "Zeitpunkt UTC", "Hash-Aufbau", "Inhalts-Hash"],
        ...zeilen.map(({ z, utc, altText, neuText }) => [
          z.id,
          zeit(z.zeitpunkt),
          z.wer,
          z.tabelle,
          z.datensatzId ?? "",
          z.aktion,
          z.grund,
          altText ?? "",
          neuText ?? "",
          z.hash ?? "",
          z.vorherHash ?? "",
          z.vorherId ?? "",
          z.schauId ?? "",
          z.benutzerId ?? "",
          z.preisrichterId ?? "",
          utc,
          z.hashVersion ?? 1,
          z.inhaltHash ?? "",
        ]),
      ]),
      `protokoll-${s.slug}.csv`,
      "text/csv; charset=utf-8",
    );
  });

  // Maschinenlesbar und unverändert (ohne den Formelschutz der CSV): genau die Felder, die in die Hash-Kette eingehen.
  app.get("/datei/:schauId/protokoll.json", async (c) => {
    const s = await schauFuer(c);
    if (!s) return c.text("Nicht angemeldet oder keine Berechtigung.", 403);
    const zeilen = await db
      .select({
        nr: aenderung.id,
        vorgaengerNr: aenderung.vorherId,
        vorgaengerHash: aenderung.vorherHash,
        schau: aenderung.schauId,
        bereich: aenderung.tabelle,
        datensatz: aenderung.datensatzId,
        aktion: aenderung.aktion,
        benutzerId: aenderung.benutzerId,
        preisrichterId: aenderung.preisrichterId,
        wer: aenderung.wer,
        grund: aenderung.grund,
        zeitpunktUtc: sql<string>`to_char(${aenderung.zeitpunkt} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US')`,
        vorherText: sql<string | null>`${aenderung.alt}::text`,
        nachherText: sql<string | null>`${aenderung.neu}::text`,
        hashAufbau: aenderung.hashVersion,
        inhaltsHash: aenderung.inhaltHash,
        hash: aenderung.hash,
      })
      .from(aenderung)
      .where(eq(aenderung.schauId, s.id))
      .orderBy(asc(aenderung.id));
    return datei(c, JSON.stringify(zeilen, null, 1), `protokoll-${s.slug}.json`, "application/json; charset=utf-8");
  });

  app.get("/datei/:schauId/verkaufsliste.pdf", async (c) => {
    const s = await schauFuer(c);
    if (!s) return c.text("Nicht angemeldet oder keine Berechtigung.", 403);
    return pdf(c, await verkaufslistePdf(s), `verkaufsliste-${s.slug}.pdf`);
  });


  app.get("/datei/:schauId/abrechnung.csv", async (c) => {
    const s = await schauFuer(c);
    if (!s) return c.text("Nicht angemeldet oder keine Berechtigung.", 403);
    const zeilen = await abrechnungListe(s.id);
    return datei(
      c,
      csv([
        ["Aussteller", "Ort", "Tiere", "Meldegeld", "Stiftung", "Spende", "bezahlt", "Preisgeld", "Verkauf", "Provision", "Saldo", "Quittung", "ausgezahlt", "Abweichung"],
        ...zeilen.map((z) => [
          z.name,
          z.ort,
          z.tiere,
          euro(z.meldebetragCent),
          euro(z.stiftungCent),
          euro(z.spendeCent),
          euro(z.bezahltCent),
          euro(z.preisgeldCent),
          euro(z.verkaufCent),
          euro(z.provisionCent),
          euro(z.saldoCent),
          z.buchungen.filter((b) => !b.storniertAm).map((b) => b.quittungNr).join(", "),
          z.buchungen.some((b) => !b.storniertAm) ? euro(z.ausgezahltCent) : "",
          z.differenzCent ? euro(z.differenzCent) : "",
        ]),
      ]),
      `abrechnung-${s.slug}.csv`,
      "text/csv; charset=utf-8",
    );
  });

  app.get("/datei/:schauId/ergebnisse.csv", async (c) => {
    const s = await schauFuer(c);
    if (!s) return c.text("Nicht angemeldet oder keine Berechtigung.", 403);
    // Wie im Druckkatalog: ohne unterschriebenen Meldebogen kein Name. Die Spalte „online“ zeigt, wer im Internet erscheinen darf.
    const e = verdeckeNamen(await ladeEintraege(s.id, { nurBestaetigt: true }), "druck");
    return datei(
      c,
      csv([
        ["Nr", "Sparte", "Rasse, Farbenschlag", "Art", "Geschlecht", "Alter", "Aussteller", "Ort", "Verein", "Online veröffentlichen", "Ergebnis", "Punkte", "Preise", "Verkauf"],
        ...e
          .filter((x) => x.katalogNr != null)
          .map((x) => [
            formatKatalognummer(x),
            x.sparte ?? "",
            x.bezeichnung,
            x.art,
            x.geschlecht,
            x.alter,
            x.ausstellerName,
            x.ort,
            x.verein,
            x.zustimmungAm && x.onlineZustimmungAm ? "ja" : "nein",
            x.status === "fehlt" ? "fehlt" : bewertungsText({ punkte: x.punkte, sondernote: x.sondernote }, skalaVon(s)),
            x.punkte ?? "",
            x.preise.map((p) => p.kuerzel).join(" "),
            x.verkauftAn ? "verkauft" : "",
          ]),
      ]),
      `ergebnisse-${s.slug}.csv`,
      "text/csv; charset=utf-8",
    );
  });

  /** Verkaufsliste für das Veterinäramt als Tabelle – gleiche Angaben wie das PDF. */
  // Hallenplan auf einem Blatt A4 und die Aufbauliste je Reihe (eigenes PDF).
  app.get("/datei/:schauId/hallenplan.pdf", async (c) => {
    const s = await schauFuer(c);
    if (!s) return c.text("Nicht angemeldet oder keine Berechtigung.", 403);
    return pdf(c, await hallenplanPdf(s), `hallenplan-${s.slug}.pdf`);
  });
  app.get("/datei/:schauId/aufbauliste.pdf", async (c) => {
    const s = await schauFuer(c);
    if (!s) return c.text("Nicht angemeldet oder keine Berechtigung.", 403);
    return pdf(c, await aufbaulistePdf(s), `aufbauliste-${s.slug}.pdf`);
  });

  // Aussteller- und Tierliste für das Veterinäramt (Art. 105 VO (EU) 2016/429, Aufbewahrung 3 Jahre).
  app.get("/datei/:schauId/tierliste.pdf", async (c) => {
    const s = await schauFuer(c);
    if (!s) return c.text("Nicht angemeldet oder keine Berechtigung.", 403);
    return pdf(c, await tierlistePdf(s), `tierliste-${s.slug}.pdf`);
  });

  app.get("/datei/:schauId/tierliste.csv", async (c) => {
    const s = await schauFuer(c);
    if (!s) return c.text("Nicht angemeldet oder keine Berechtigung.", 403);
    const t = await ladeTierliste(s);
    return datei(
      c,
      csv([
        ["Aussteller", "Anschrift", "Registriernummer", "Nachweise", "Katalog-Nr", "Tierart", "Tier", "Klasse", "Anzahl", "Ring-Nr", "Status", "Verbleib", "Gesperrt"],
        ...t.aussteller.flatMap((a) =>
          a.tiere.map((z) => [a.name, a.anschrift, a.registriernummer, a.nachweise, z.katalogNr, z.tierart, z.tier, z.klasse, z.anzahl, z.ringnummern, z.status, z.verbleib, z.gesperrt ? "ja" : ""]),
        ),
      ]),
      `tierliste-${s.slug}.csv`,
      "text/csv; charset=utf-8",
    );
  });

  app.get("/datei/:schauId/verkaufsliste.csv", async (c) => {
    const s = await schauFuer(c);
    if (!s) return c.text("Nicht angemeldet oder keine Berechtigung.", 403);
    const zeilen = await ladeVerkaufsliste(s.id);
    return datei(
      c,
      csv([
        [
          "Beleg",
          "Datum",
          "Katalog-Nr",
          "Sparte",
          "Tier",
          "Klasse",
          "Anzahl",
          "Ring-Nr",
          "Herkunft Name",
          "Herkunft Anschrift",
          "Herkunft Registriernummer",
          "Bestimmung Name",
          "Bestimmung Anschrift",
          "Bestimmung Registriernummer",
          "Käufer unter 16 (Einwilligung)",
          "Preis",
          "Storniert am",
          "Stornogrund",
        ],
        ...zeilen.map((z) => [
          z.belegNr,
          datumDe(z.datum),
          z.katalogNr,
          z.sparte,
          z.tier,
          z.klasse,
          z.anzahl,
          z.ringnummern,
          z.herkunftName,
          z.herkunftAnschrift,
          z.herkunftRegistriernummer,
          z.bestimmungName,
          z.bestimmungAnschrift,
          z.bestimmungRegistriernummer,
          z.kaeuferUnter16 ? z.kaeuferErziehungsberechtigter : "",
          euro(z.preisCent),
          z.storniertAm ? datumDe(z.storniertAm) : "",
          z.stornoGrund,
        ]),
      ]),
      `verkaufsliste-${s.slug}.csv`,
      "text/csv; charset=utf-8",
    );
  });

  /**
   * Sammelüberweisung (SEPA pain.001.001.09): die in der Abrechnung erstellte, noch offene Datei.
   * Bei jedem Abruf derselbe Inhalt – gebucht wird später genau dieser Stand.
   */
  app.get("/datei/:schauId/ueberweisungen.xml", async (c) => {
    // Enthält alle IBANs – nur für die Ausstellungsleitung, die die Überweisung auch erstellt und bucht.
    const s = await schauFuer(c, { nurAdmin: true });
    if (!s) return c.text("Nicht angemeldet oder keine Berechtigung.", 403);
    const lauf = await offenerLauf(db, s.id);
    if (!lauf) return c.text("Keine offene SEPA-Datei. Bitte zuerst in der Abrechnung erstellen.", 400);
    try {
      return c.body(sepaXml(s, lauf), 200, {
        "Content-Type": "application/xml; charset=utf-8",
        "Content-Disposition": `attachment; filename="ueberweisungen-${s.slug}-${lauf.ausfuehrungAm}.xml"`,
        "Cache-Control": "no-store",
      });
    } catch (err) {
      if (err instanceof EingabeFehler) return c.text(err.message, 400);
      throw err;
    }
  });
}
