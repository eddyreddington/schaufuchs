/**
 * Demo-Daten für Entwicklung, Tests und Vorführung.
 * Legt einen Demo-Verein mit Administrator, Demo-Stammdaten und eine Vereinsschau mit Ausstellern,
 * Meldungen, Zahlungen und Preisrichtern an. Mit --bis-bewertung oder --komplett wird ein vorhandener
 * Demo-Verein vorher entfernt – nur dieser, Daten anderer Vereine bleiben unberührt.
 * Zugangsdaten: siehe README, Abschnitt „Demo“.
 */
import { legeTextbausteineAn } from "./services/textbausteine";
import { HALLE_STANDARD, MELDEARTEN, standardBesatz, tierzahl } from "@schau/domain";
import { and, asc, eq, inArray, isNull, notExists, sql as sqlText } from "drizzle-orm";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { hashPasswort, zufallsToken } from "./auth";
import { config } from "./config";
import { neuePin } from "./routers/preisrichter";
import { db, sql } from "./db/client";
import {
  aenderung,
  aussteller,
  importlauf,
  hallenentwurf,
  benutzer,
  bild,
  farbenschlag,
  gebuehr,
  katalogBeitrag,
  katalogeintrag,
  katalogGestaltung,
  meldung,
  organisation,
  preisart,
  preisrichter,
  rasse,
  schau,
  sparte,
  spender,
  stammdatenVersion,
  textbaustein,
  verkauf,
  zahlung,
  zuwendungsbestaetigung,
} from "./db/schema";
import { meldebetrag } from "./services/eintraege";
import { speichereMeldung } from "./services/meldung";
import { importiereStammdaten } from "./routers/stammdaten";

export const DEMO = { email: "demo@schau.test", passwort: "Demo-Schau-2026", pin: "20262026" };

/** Gültige deutsche IBAN zu einer Demo-Kontonummer (Bankleitzahl der Beispiel-IBAN). */
function demoIban(n: number): string {
  const bban = `37040044${String(1_000_000 + n * 7919).padStart(10, "0")}`;
  const pruef = 98n - (BigInt(`${bban}131400`) % 97n);
  return `DE${String(pruef).padStart(2, "0")}${bban}`;
}

// Deterministischer Zufall, damit die Demo bei jedem Lauf gleich aussieht.
let saat = 42;
const zufall = () => ((saat = (saat * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
const wahl = <T>(a: T[]): T => a[Math.floor(zufall() * a.length)]!;

const VORNAMEN = ["Karl", "Heinz", "Jürgen", "Monika", "Peter", "Sabine", "Uwe", "Lena", "Frank", "Gerd", "Petra", "Tim", "Hans", "Anja", "Lukas"];
const NACHNAMEN = ["Müller", "Schmidt", "Schneider", "Fischer", "Weber", "Meyer", "Wagner", "Becker", "Hoffmann", "Schäfer", "Koch", "Richter", "Klein", "Wolf", "Neumann", "Krüger", "Braun", "Zimmermann"];
const ORTE = ["Alsfeld", "Lauterbach", "Schotten", "Grünberg", "Homberg", "Romrod", "Kirtorf", "Ulrichstein"];
const VEREINE = ["GZV Alsfeld", "KTZV Lauterbach", "GZV Schotten 1904", "RGZV Grünberg"];

/** Lokales, vollständiges Verzeichnis (nicht im Repo, siehe README „Vollständiges Verzeichnis“). */
const LOKALES_VERZEICHNIS = join(import.meta.dir, "../../../lokal/verzeichnis/rassenverzeichnis-2024.csv");

/**
 * Verzeichnis für die Demo: SCHAU_VERZEICHNIS oder die lokale Datei, wenn vorhanden – sonst der kleine Demo-Auszug.
 * Es gehört dem Demo-Verein und verschwindet mit ihm (demoEntfernen).
 */
function demoVerzeichnis() {
  const datei = [process.env.SCHAU_VERZEICHNIS, LOKALES_VERZEICHNIS].find((d) => d && existsSync(d));
  if (!datei) {
    const csv = readFileSync(join(import.meta.dir, "../seed/demo-stammdaten.csv"), "utf8");
    return { name: "Demo-Verzeichnis", jahr: 2026, quelle: "Demo, nicht offiziell", csv, vollstaendig: false, datei: "" };
  }
  const csv = readFileSync(datei, "utf8");
  return { name: "Rassen- und Farbenschläge 2024 (inoffiziell)", jahr: 2024, quelle: "Aus öffentlichen Quellen zusammengestellt, nicht offiziell", csv, vollstaendig: true, datei };
}

// Gängige Rassen für die Demo-Meldungen. Bei Tausenden Farbenschlägen sähe reiner Zufall nicht nach einer Vereinsschau aus.
const GAENGIGE_RASSEN = [
  "Pommerngänse", "Laufenten", "Deutsche Pekingenten", "Warzenenten", "Deutsche Puten", "Perlhühner",
  "Deutsche Wyandotten", "Orpington", "Brahma", "Sussex", "Italiener", "Marans", "Rhodeländer",
  "Deutsche Zwerg-Wyandotten", "Zwerg-Cochin", "Zwerg-Orpington", "Federfüßige Zwerghühner", "Seidenhühner", "Sebright",
  "Deutsche Zwerg-Reichshühner",
  "Strasser", "Kingtauben", "Deutsche Modeneser", "Altdeutsche Mövchen", "Indische Pfautauben", "Thüringer Schildtauben",
];

/** Je gängiger Rasse die ersten Farbenschläge des Verzeichnisses (dort stehen die verbreiteten zuerst). */
function gaengigeFarben<T extends { rasse: string }>(alle: T[]): T[] {
  const auswahl = GAENGIGE_RASSEN.flatMap((r) => alle.filter((f) => f.rasse === r).slice(0, 4));
  return auswahl.length ? auswahl : alle;
}

/** Vorspann des Demo-Katalogs: Logo, Ausstellungsleitung, Grußworte, Vereinsseite, Anzeigen (alles erfunden). */
async function demoKatalog(schauId: number) {
  await db.insert(katalogGestaltung).values({
    schauId,
    format: "A4",
    untertitel: "mit Jugendschau",
    // Impressum des gedruckten Katalogs (Prüfliste vor der Bewertung).
    druck: "Druckerei Beispiel, Musterstadt (Demo)",
    schirmherr: "Bürgermeisterin Anna Beispiel",
    ausstellungsleitung: [
      "Ausstellungsleiter: Karl Muster",
      "Stellvertreter: Jürgen Probe",
      "Meldestelle und Katalog: Sabine Beispiel",
      "Kasse und Tierverkauf: Petra Demo",
      "Einlieferung und Käfigbau: Uwe Muster",
      "Tierarzt: Dr. Lena Beispiel",
      "Bewirtung: Frauengruppe des Vereins",
    ].join("\n"),
    eintritt: "Erwachsene 3 €, Kinder bis 14 Jahre frei, Katalog 4 €",
  });
  const [logo] = await db
    .insert(bild)
    .values({ schauId, rolle: "logo", mime: "image/png", name: "demo-logo.png", daten: readFileSync(join(import.meta.dir, "../seed/demo-logo.png")) })
    .returning({ id: bild.id });
  const grusswort = (titel: string, unterzeile: string, text: string) => ({ schauId, art: "grusswort" as const, titel, unterzeile, text });
  await db.insert(katalogBeitrag).values([
    {
      ...grusswort(
        "Grußwort der Schirmherrin",
        "Anna Beispiel, Bürgermeisterin der Stadt Musterstadt",
        "Liebe Züchterinnen und Züchter, liebe Gäste,\n\nich freue mich sehr, auch in diesem Jahr die Schirmherrschaft über die Vereinsschau übernehmen zu dürfen. Was die Mitglieder des Geflügelzuchtvereins hier Jahr für Jahr auf die Beine stellen, verdient große Anerkennung: Monatelange Pflege, viel Wissen über Rassen und Zucht und unzählige Stunden ehrenamtlicher Arbeit stecken in dieser Schau.\n\nDie Rassegeflügelzucht bewahrt alte Haustierrassen und damit ein Stück unserer ländlichen Kultur. Gerade die Jugendabteilung zeigt, dass dieses Wissen weitergegeben wird.\n\nIch wünsche allen Ausstellern viel Erfolg und den Besuchern schöne Stunden in der Mehrzweckhalle.",
      ),
      folge: 1,
    },
    {
      ...grusswort(
        "Grußwort des Kreisverbandes",
        "Heinz Probe, Vorsitzender des Kreisverbandes der Rassegeflügelzüchter",
        "Liebe Zuchtfreunde,\n\nVereinsschauen sind das Fundament unseres Verbandes. Hier zeigen Züchter ihre Tiere zum ersten Mal einem Preisrichter, hier tauschen sie sich aus, und hier finden neue Mitglieder den Weg zu uns.\n\nIch danke dem ausrichtenden Verein für die Mühe und allen Preisrichtern für ihre sorgfältige Arbeit. Allen Ausstellern wünsche ich gute Bewertungen und viel Freude an ihren Tieren.",
      ),
      folge: 2,
    },
    {
      ...grusswort(
        "Willkommen",
        "Karl Muster, 1. Vorsitzender und Ausstellungsleiter",
        "Liebe Besucherinnen und Besucher,\n\nherzlich willkommen zu unserer Vereinsschau! Über 170 Tiere von mehr als 30 Ausstellern warten auf Sie – von der Pommerngans bis zur Kingtaube.\n\nUnser Dank gilt allen Helferinnen und Helfern, den Stiftern der Ehrenpreise und den Firmen, die diesen Katalog mit ihren Anzeigen möglich machen. Tiere mit Verkaufspreis können Sie an unserer Verkaufsstelle erwerben – sprechen Sie uns an.\n\nViel Vergnügen beim Rundgang!",
      ),
      folge: 3,
    },
    {
      schauId,
      art: "seite",
      folge: 1,
      titel: "Unser Verein",
      unterzeile: "Demo-Geflügelzuchtverein, gegründet 1904",
      text: "Gegründet wurde der Verein im Jahr 1904 von zwölf Züchtern aus Musterstadt und Umgebung. Die erste Schau fand im Saal einer Gastwirtschaft statt, mit 86 Tieren.\n\nHeute zählt der Verein 48 Mitglieder, darunter elf Jugendliche. Zuchtschwerpunkte sind Wyandotten, Orpington und Strasser. Jeden ersten Freitag im Monat treffen wir uns im Vereinsheim – Gäste sind willkommen.\n\n(Demo-Text – frei erfunden.)",
      bildId: logo!.id,
    },
    { schauId, art: "anzeige", folge: 1, groesse: "halb", titel: "Landhandel Beispiel", unterzeile: "Musterstraße 1 · 12345 Musterstadt", text: "Futter, Einstreu und Zubehör für Geflügel und Tauben.\nMo–Fr 8–18 Uhr, Sa 8–13 Uhr" },
    { schauId, art: "anzeige", folge: 2, groesse: "viertel", titel: "Tierarztpraxis Dr. Beispiel", unterzeile: "Kleintiere und Geflügel", text: "Termine nach Vereinbarung" },
    { schauId, art: "anzeige", folge: 3, groesse: "viertel", titel: "Bäckerei Muster", unterzeile: "seit 1951", text: "Wir backen für die Schau-Cafeteria." },
  ]);
}

/** Entfernt den Demo-Verein mit allen seinen Daten. Andere Vereine bleiben unberührt. */
export async function demoEntfernen(): Promise<boolean> {
  const [demo] = await db.select().from(benutzer).where(eq(benutzer.email, DEMO.email));
  if (!demo) return false;
  const orgId = demo.organisationId;
  await db.transaction(async (tx) => {
    // Protokoll und Kassendaten sind gegen Löschen geschützt (db/schutz.sql) – nur für das Entfernen
    // des ganzen Demo-Vereins in dieser Transaktion freigegeben.
    await tx.execute(sqlText`set local schau.loeschen = 'ja'`);
    const nutzerIds = (await tx.select({ id: benutzer.id }).from(benutzer).where(eq(benutzer.organisationId, orgId))).map((b) => b.id);
    // Schauen zuerst: hängen Meldungen, Katalog, Bewertungen, Preise, Verkäufe, Abrechnung und Protokoll per Kaskade dran.
    // Verkäufe hängen mit RESTRICT an den Tieren – vor der Schau löschen.
    await tx.delete(verkauf).where(
      inArray(verkauf.katalogeintragId, tx.select({ id: katalogeintrag.id }).from(katalogeintrag).innerJoin(schau, eq(schau.id, katalogeintrag.schauId)).where(eq(schau.organisationId, orgId))),
    );
    // Zuwendungsbestätigungen hängen mit RESTRICT am Spender, Spenden an der Schau.
    await tx.delete(zuwendungsbestaetigung).where(eq(zuwendungsbestaetigung.organisationId, orgId));
    await tx.delete(schau).where(eq(schau.organisationId, orgId));
    await tx.delete(spender).where(eq(spender.organisationId, orgId));
    if (nutzerIds.length) await tx.delete(aenderung).where(and(isNull(aenderung.schauId), inArray(aenderung.benutzerId, nutzerIds)));
    await tx.delete(importlauf).where(eq(importlauf.organisationId, orgId));
    await tx.delete(hallenentwurf).where(eq(hallenentwurf.organisationId, orgId));
    await tx.delete(aussteller).where(eq(aussteller.organisationId, orgId));
    await tx.delete(textbaustein).where(eq(textbaustein.organisationId, orgId));
    await tx.delete(benutzer).where(eq(benutzer.organisationId, orgId));
    await tx.delete(organisation).where(eq(organisation.id, orgId));
    // Demo-Verzeichnis nur entfernen, wenn keine Schau (auch keines anderen Vereins) es nutzt.
    await tx
      .delete(stammdatenVersion)
      .where(
        and(
          eq(stammdatenVersion.name, "Demo-Verzeichnis"),
          eq(stammdatenVersion.quelle, "Demo, nicht offiziell"),
          notExists(tx.select({ id: schau.id }).from(schau).where(eq(schau.stammdatenVersionId, stammdatenVersion.id))),
        ),
      );
  });
  return true;
}

/**
 * Zugang zur Demo: in der Entwicklung fest (README), auf einem Server (NODE_ENV=production) zufällig – dort wird er
 * nur einmal beim Einspielen angezeigt, damit kein dokumentiertes Passwort auf einer erreichbaren Installation steht.
 */
const zugang = config.production ? { passwort: zufallsToken(12), pin: neuePin() } : { passwort: DEMO.passwort, pin: DEMO.pin };

export async function seed(opts: { neu: boolean } = { neu: false }) {
  const [vorhanden] = await db.select().from(benutzer).where(eq(benutzer.email, DEMO.email));
  if (vorhanden && !opts.neu) {
    console.log("Demo-Daten sind schon vorhanden. „bun run db:demo“ oder „bun run db:demo:komplett“ baut sie neu auf.");
    return false;
  }
  if (vorhanden && (await demoEntfernen())) console.log("Vorhandene Demo-Daten entfernt.");
  // Erfundene Angaben für Impressum und Datenschutzhinweise der Demo.
  const [org] = await db
    .insert(organisation)
    .values({
      name: "Demo-Geflügelzuchtverein e. V.",
      anschrift: "Am Hühnerhof 1\n36304 Alsfeld",
      email: "info@demo.test",
      telefon: "06631 000000",
      vertretung: "Erika Beispiel (1. Vorsitzende)\nMax Muster (2. Vorsitzender)",
      register: "Amtsgericht Musterstadt, VR 0000 (Demo)",
    })
    .returning();
  await db.insert(benutzer).values({ organisationId: org!.id, email: DEMO.email, name: "Demo-Ausstellungsleitung", passwortHash: await hashPasswort(zugang.passwort), rolle: "admin" });

  const verzeichnis = demoVerzeichnis();
  const { versionId } = await importiereStammdaten({ ...verzeichnis, organisationId: org!.id });
  if (verzeichnis.vollstaendig) console.log(`Vollständiges Verzeichnis aus ${verzeichnis.datei} eingespielt.`);
  const alleFarben = await db
    .select({ id: farbenschlag.id, rasse: rasse.name, sparte: sparte.name })
    .from(farbenschlag)
    .innerJoin(rasse, eq(rasse.id, farbenschlag.rasseId))
    .innerJoin(sparte, eq(sparte.id, rasse.sparteId))
    .where(eq(farbenschlag.versionId, versionId))
    .orderBy(asc(farbenschlag.folge));
  const farben = verzeichnis.vollstaendig ? gaengigeFarben(alleFarben) : alleFarben;

  const [s] = await db
    .insert(schau)
    .values({
      organisationId: org!.id,
      slug: "demo-schau-2026",
      name: "Demo-Vereinsschau 2026",
      veranstalter: "Demo-Geflügelzuchtverein",
      ort: "Mehrzweckhalle Musterstadt",
      meldeschluss: "2026-12-31",
      einlieferung: "Donnerstag 15–20 Uhr",
      bewertungAm: "2026-11-13",
      oeffnungszeiten: "Sa 8–18 Uhr, So 8–14 Uhr",
      aussetzen: "Sonntag ab 14 Uhr",
      kapazitaet: 600,
      phase: "meldung",
      stammdatenVersionId: versionId,
      bestimmungen: "Es gelten die AAB des BDRG in der neuesten Fassung sowie diese Sonderbestimmungen (Demo).",
      bankverbindung: "Demo-Bank, IBAN DE89 3704 0044 0532 0130 00",
      vereinKontoinhaber: "Demo-Geflügelzuchtverein",
      vereinIban: "DE89370400440532013000",
      kontaktEmail: "ausstellung@demo.test",
      // Erfundene Angaben zur Registrierung und Anzeige beim Veterinäramt.
      vetRegistriernummer: "276 06 535 012 9001",
      vetAmt: "Veterinäramt Vogelsbergkreis (Demo)",
      vetAnzeigeAm: "2026-10-09",
      vetAktenzeichen: "VET-2026-0815 (Demo)",
      // Klinische Untersuchung nach § 7 Abs. 1 GeflPestSchV (Prüfliste ab dem Katalog).
      untersuchung: "regional",
      // Maße der Stammkäfige und Volieren (für Hallenplan und Käfigbedarf).
      kaefigMasse: { stamm: { breite: 100, tiefe: 70, hoehe: 80 }, voliere: { breite: 200, tiefe: 100, hoehe: 160 } },
      erklaerungen:
        "Meine Tiere stammen nicht aus einem Sperrbezirk, Beobachtungsgebiet oder einem Bestand mit Seuchenverdacht.\nIn den letzten 21 Tagen habe ich keine Tiere zugekauft und auf keiner anderen Schau ausgestellt.",
    })
    .returning();
  await db.insert(gebuehr).values([
    { schauId: s!.id, art: "einzeltier", jugend: false, betragCent: 1100 },
    { schauId: s!.id, art: "einzeltier", jugend: true, betragCent: 650 },
    { schauId: s!.id, art: "stamm", jugend: false, betragCent: 1800 },
    { schauId: s!.id, art: "bruteier", jugend: false, betragCent: 1100 },
    { schauId: s!.id, art: "katalog", jugend: false, betragCent: 900, befreitPreisrichter: true },
    { schauId: s!.id, art: "katalog", jugend: true, betragCent: 0, befreitPreisrichter: true },
    { schauId: s!.id, art: "kostenanteil", jugend: false, betragCent: 800 },
  ]);
  await db.insert(preisart).values([
    { schauId: s!.id, kuerzel: "E", name: "Ehrenpreis", betragCent: 1100, quelle: "standgeld", schluesselProTiere: 10, anzahlProSchluessel: 1, mindestpunkte: 94, folge: 1 },
    { schauId: s!.id, kuerzel: "Z", name: "Zuschlagspreis", betragCent: 600, quelle: "standgeld", schluesselProTiere: 10, anzahlProSchluessel: 2, mindestpunkte: 93, folge: 2 },
    { schauId: s!.id, kuerzel: "VB", name: "Vereinsband", betragCent: 0, sachpreis: "Band", quelle: "standgeld", anzahlProPreisrichter: 2, mindestpunkte: 95, folge: 3 },
  ]);
  const pinHash = await hashPasswort(zugang.pin);
  await db.insert(preisrichter).values([
    { schauId: s!.id, name: "Ralf Beispiel", istObmann: true, pinHash },
    // Zwei Obleute: die eigene „v“-Note bestätigt jeweils der andere.
    { schauId: s!.id, name: "Doris Muster", istObmann: true, pinHash },
    { schauId: s!.id, name: "Tobias Probe", pinHash },
  ]);
  await demoKatalog(s!.id);
  await legeTextbausteineAn(db, org!.id);


  for (let i = 0; i < 40; i++) {
    const istJugend = i % 9 === 0;
    const anzahl = 2 + Math.floor(zufall() * 8);
    const positionen = Array.from({ length: anzahl }, () => {
      const art = zufall() < 0.08 ? MELDEARTEN[1] : MELDEARTEN[0];
      const f = wahl(farben);
      const geschlecht = standardBesatz(art, `${f.sparte} ${f.rasse}`) ?? wahl(["1,0", "0,1"]);
      const alter = zufall() < 0.75 ? ("jung" as const) : ("alt" as const);
      // Demo-Ringe im Muster der Bundesringe: Land, Jahrgang, Kennbuchstabe, laufende Nummer – je Tier ein Ring.
      const ringe = Array.from({ length: tierzahl(geschlecht) }, () => `D ${alter === "jung" ? 26 : 25} ${wahl(["A", "B", "C", "E", "G", "K"])} ${100 + Math.floor(zufall() * 900)}`);
      return {
        farbenschlagId: f.id,
        rasseId: null,
        freitext: "",
        art,
        geschlecht,
        alter,
        istAoc: false,
        istNeuzuechtung: false,
        eigeneZucht: true,
        verkaufspreisCent: zufall() < 0.3 ? wahl([2500, 3000, 4000, 5000]) : null,
        ringnummern: ringe.join(", "),
      };
    });
    const vorname = wahl(VORNAMEN);
    const nachname = wahl(NACHNAMEN);
    const r = await db.transaction((tx) =>
      speichereMeldung(
        tx,
        org!.id,
        {
          schauId: s!.id,
          aussteller: {
            vorname,
            nachname,
            strasse: `Hauptstraße ${i + 1}`,
            plz: "36304",
            ort: wahl(ORTE),
            telefon: "",
            email: `aussteller${i + 1}@demo.test`,
            verein: wahl(VEREINE),
            kreisverband: "KV Vogelsberg",
            // Erfundene, aber richtig aufgebaute Registriernummern (12 Ziffern nach § 26 ViehVerkV).
            registriernummer: `276 06 535 ${String(10 + (i % 90)).padStart(3, "0")} ${String(1 + i).padStart(4, "0")}`,
            geburtsdatum: istJugend ? "2011-05-04" : null,
            istPreisrichter: false,
            // Gut die Hälfte gibt ein Konto für die Überweisung an (Demo-IBANs mit gültiger Prüfziffer).
            iban: i % 5 < 3 ? demoIban(i) : "",
            kontoinhaber: "",
          },
          eingang: i % 3 === 0 ? "papier" : "online",
          istJugend,
          bemerkung: "",
          zustimmung: true,
          // Die meisten willigen in die Online-Veröffentlichung ein; die übrigen stehen online ohne Namen.
          onlineZustimmung: i % 6 !== 5,
          erklaerungen: true,
          erziehungsberechtigter: istJugend ? `${wahl(VORNAMEN)} ${nachname}` : "",
          positionen,
        },
        { text: "Demo-Daten" },
      ),
    );
    // Die meisten haben bezahlt, einige noch nicht.
    if (i % 7 !== 3) {
      const b = await meldebetrag(db, r.meldungId);
      await db.insert(zahlung).values({ meldungId: r.meldungId, betragCent: b.summeCent, datum: "2026-10-01", art: "ueberweisung" });
      await db.update(meldung).set({ status: "bestaetigt" }).where(eq(meldung.id, r.meldungId));
    }
  }
  console.log(`Demo-Schau angelegt: ${s!.name} (/s/${s!.slug})`);
  return true;
}

/** Bringt die Demo-Schau bis zur Bewertung: Katalognummern, Preisrichter-Einteilung, Phase „Bewertung“. */
export async function bisZurBewertung() {
  const { appRouter } = await import("./router");
  const [b] = await db.select().from(benutzer).where(eq(benutzer.email, DEMO.email));
  const [s] = await db.select().from(schau).where(eq(schau.slug, "demo-schau-2026"));
  if (!b || !s) throw new Error("Erst die Demo-Daten anlegen.");
  const admin = appRouter.createCaller({
    benutzer: { id: b.id, organisationId: b.organisationId, name: b.name, email: b.email, rolle: "admin" },
    richter: null,
    cookieTokens: { benutzer: undefined, richter: undefined },
    ip: "seed",
    setCookie: () => {},
  });
  await admin.katalog.nummernVergeben({ schauId: s.id });
  await admin.preisrichter.einteilungSetzen({ schauId: s.id, einteilung: (await admin.preisrichter.einteilungVorschlagen({ schauId: s.id })).einteilung });
  // Beispielhalle für den Hallenplan: 16 × 28 m, Reihen quer, Hauptgang an der Stirnseite, Einzelreihen an den Wänden.
  await admin.katalog.halleSetzen({
    schauId: s.id,
    halle: {
      ...HALLE_STANDARD,
      breite: 1600,
      laenge: 2800,
      flaechen: [
        { name: "Eingang", art: "eingang", x: 650, y: 2750, breite: 300, tiefe: 50 },
        { name: "Notausgang", art: "eingang", x: 0, y: 200, breite: 50, tiefe: 120 },
        { name: "Cafeteria", art: "sperre", x: 1000, y: 2300, breite: 600, tiefe: 500 },
      ],
    },
  });
  // Bewertungskarten sind gedruckt: Nummern festschreiben wie vor einer echten Einlieferung.
  await admin.katalog.gedrucktSetzen({ schauId: s.id, gedruckt: true });
  await admin.schau.phaseSetzen({ id: s.id, phase: "bewertung" });
  console.log("Demo-Schau steht in der Phase „Bewertung“.");
}

/** Spielt die Demo-Schau komplett durch: Einlieferung, Bewertung, Obmann, Preise, Freigabe, Verkauf, Abrechnung. */
export async function komplett() {
  const { appRouter } = await import("./router");
  const [b] = await db.select().from(benutzer).where(eq(benutzer.email, DEMO.email));
  const [s] = await db.select().from(schau).where(eq(schau.slug, "demo-schau-2026"));
  if (!b || !s) throw new Error("Erst die Demo-Daten anlegen.");
  const ctx = { richter: null, cookieTokens: { benutzer: undefined, richter: undefined }, ip: "seed", setCookie: () => {} };
  const admin = appRouter.createCaller({ ...ctx, benutzer: { id: b.id, organisationId: b.organisationId, name: b.name, email: b.email, rolle: "admin" } });

  // Einlieferung: fast alle Tiere da, einzelne fehlen.
  // Die Grunddemo steht schon in der Bewertung – zurück nur mit Grund (steht im Protokoll).
  await admin.schau.phaseSetzen({ id: s.id, phase: "einlieferung", grund: "Demo: Einlieferung durchspielen" });
  const alle = await admin.katalog.liste({ schauId: s.id });
  // Nachweise (ND für Hühner und Puten, PMV für Tauben) vorgelegt und geprüft.
  for (const meldungId of new Set(alle.map((e) => e.meldungId))) {
    await admin.halle.vetSetzen({
      meldungId,
      nd: { datum: "2026-09-02", impfstoff: "Nobilis ND Clone 30 (Demo)", tierarzt: "Dr. Beispiel" },
      pmv: { datum: "2026-08-20", impfstoff: "Colombovac PMV (Demo)", tierarzt: "Dr. Beispiel" },
      wg: { datum: null, sentinel: false, stelle: "" },
      geprueft: true,
    });
  }
  const fehlen = alle.filter((_, i) => i % 41 === 7).map((e) => e.id);
  await admin.halle.statusSetzen({ schauId: s.id, ids: alle.filter((e) => !fehlen.includes(e.id)).map((e) => e.id), status: "eingeliefert" });
  if (fehlen.length) await admin.halle.statusSetzen({ schauId: s.id, ids: fehlen, status: "fehlt" });

  // Bewertung am „Tablet“ durch jeden Preisrichter.
  await admin.schau.phaseSetzen({ id: s.id, phase: "bewertung" });
  const richter = await db.select().from(preisrichter).where(eq(preisrichter.schauId, s.id));
  const verteilung: (number | "oB" | "u")[] = [97, 96, 96, 95, 95, 95, 94, 94, 94, 94, 93, 93, 93, 93, 92, 92, 92, 91, 91, 90, "oB", 93, 94, 95, 92, 93, 94, "u", 93, 94];
  const bausteine = await db.select().from(textbaustein).where(eq(textbaustein.organisationId, b.organisationId));
  const texte = (k: string) => bausteine.filter((x) => x.kategorie === k).map((x) => x.text);
  const pr = (r: (typeof richter)[number]) => appRouter.createCaller({ ...ctx, benutzer: null, richter: { id: r.id, schauId: s.id, name: r.name, istObmann: r.istObmann } });
  for (const r of richter) {
    const d = await pr(r).richter.daten();
    await pr(r).richter.abgleich({
      bewertungen: d.tiere
        .filter((t) => !t.fehlt)
        .map((t) => {
          const w = wahl(verteilung);
          return {
            katalogeintragId: t.id,
            punkte: typeof w === "number" ? w : null,
            sondernote: typeof w === "number" ? null : w,
            vorzuege: [wahl(texte("vorzug")), wahl(texte("vorzug"))].filter((x, i, a) => a.indexOf(x) === i).join(", "),
            wuensche: zufall() < 0.7 ? wahl(texte("wunsch")) : "",
            maengel: typeof w === "number" && w <= 92 ? wahl(texte("mangel")) : "",
            geraetZeit: new Date(),
          };
        }),
    });
  }
  // Jeder Obmann bestätigt die „v“-Noten der anderen; die eigenen bestätigt der zweite Obmann.
  for (const obmann of richter.filter((r) => r.istObmann)) {
    for (const t of (await pr(obmann).richter.daten()).obmannListe) {
      await pr(obmann).richter.obmannBestaetigen({ katalogeintragId: t.id }).catch(() => {});
    }
  }

  // Preise: jeder Preisrichter vergibt sein Kontingent an seine besten Tiere.
  await admin.schau.phaseSetzen({ id: s.id, phase: "preise" });
  for (const r of richter) {
    const d = await pr(r).richter.daten();
    const beste = d.tiere.filter((t) => t.punkte != null).sort((x, y) => y.punkte! - x.punkte!);
    for (const art of d.preisarten) {
      for (const t of beste) {
        try {
          await pr(r).richter.preisVergeben({ katalogeintragId: t.id, preisartId: art.id });
        } catch {
          // Kontingent erschöpft, Mindestpunkte nicht erreicht oder schon ein Standgeldpreis – nächstes Tier.
        }
      }
    }
  }
  await admin.preise.freigeben({ schauId: s.id, freigegeben: true, trotzdem: true });

  // Besuchertage: einige Tiere werden verkauft.
  await admin.schau.phaseSetzen({ id: s.id, phase: "schau" });
  // Barkasse: Wechselgeld zu Beginn der Verkaufsstelle.
  await admin.kasse.kassenbewegung({ schauId: s.id, art: "anfangsbestand", betragCent: 20_000, grund: "Wechselgeld aus der Vereinskasse" });
  // Ein Tier fällt am Samstag mit Atemwegssymptomen auf: abgesondert, für Verkauf und Preise gesperrt.
  const imKatalog = await admin.katalog.liste({ schauId: s.id });
  const krank = imKatalog.find((e) => e.status === "eingeliefert" && e.verkaufspreisCent);
  if (krank) {
    await admin.halle.gesundheitErfassen({
      schauId: s.id,
      nr: `${krank.katalogNr}${krank.suffix}`,
      befund: "Niesen, leichter Augenausfluss",
      massnahme: "Abgesondert, Aussteller informiert, nicht verkaufen",
      tierarzt: "Dr. Beispiel (Demo)",
    });
  }
  const verkaeuflich = (await admin.kasse.angebot({ schauId: s.id })).filter((_, i) => i % 3 === 0);
  for (const [i, e] of verkaeuflich.entries()) {
    const jung = i === 2; // eine Jugendliche kauft mit Einwilligung ihrer Mutter (§ 11c TierSchG)
    await admin.kasse.verkaufen({
      schauId: s.id,
      katalogeintragId: e.id,
      kaeuferName: jung ? "Lea Käuferin" : `Käufer ${i + 1}`,
      kaeuferAnschrift: "Musterweg 1, 36304 Alsfeld",
      kaeuferRegistriernummer: `276 06 535 099 ${String(1 + i).padStart(4, "0")}`,
      kaeuferAlter: jung ? "unter16" : "ab16",
      kaeuferErziehungsberechtigter: jung ? "Sabine Käuferin (Mutter)" : "",
    });
  }

  // Abrechnung beginnt: die ersten Barzahler sind schon abgerechnet.
  await admin.schau.phaseSetzen({ id: s.id, phase: "abrechnung" });
  const ab = await admin.kasse.abrechnung({ schauId: s.id });
  for (const z of ab.filter((x) => !x.iban && x.saldoCent > 0).slice(0, 3)) await admin.kasse.auszahlen({ schauId: s.id, ausstellerId: z.ausstellerId, art: "bar" });
  console.log("Demo-Schau komplett durchgespielt (Phase „Abrechnung“).");
}

if (import.meta.main) {
  if (process.argv.includes("--entfernen")) {
    console.log((await demoEntfernen()) ? "Demo-Verein mit allen Daten entfernt. Andere Vereine sind unberührt." : "Kein Demo-Verein vorhanden.");
    await sql.end();
    process.exit(0);
  }
  // Auf einem Server nur bewusst: der Demo-Verein bringt einen Administrator mit und blockiert auf einer frischen
  // Installation die Ersteinrichtung des echten Vereins.
  if (config.production && process.env.SCHAU_DEMO_ERLAUBT !== "ja") {
    console.error(
      "Die Demo ist für Test- und Vorführinstallationen gedacht und wird hier nicht eingespielt.\n" +
        "Auf einer Testinstallation: bun run docker:demo -- --testinstallation (entfernen mit bun run docker:demo:entfernen).",
    );
    await sql.end();
    process.exit(1);
  }
  const komplettLauf = process.argv.includes("--komplett");
  const weiter = komplettLauf || process.argv.includes("--bis-bewertung");
  // Wer die Demo weiterspielen will, bekommt immer einen frischen Stand – sonst kollidiert der Ablauf mit alten Daten.
  const angelegt = await seed({ neu: weiter });
  if (angelegt && weiter) await bisZurBewertung();
  if (angelegt && komplettLauf) await komplett();
  if (angelegt && config.production) {
    console.log(`\nAnmeldung: ${DEMO.email} mit dem Passwort ${zugang.passwort}`);
    console.log(`Tablet-PIN aller Demo-Preisrichter: ${zugang.pin}`);
    console.log("Beides wird nur jetzt angezeigt. Entfernen: bun run docker:demo:entfernen\n");
  }
  await sql.end();
}
