/**
 * Testdaten für eine vorhandene, leere Schau: füllt sie wie eine echte Lokalschau bis nach der Einlieferung, damit die
 * Ausstellungsleitung den Rest (Bewertung, Preise, Verkauf, Abrechnung) selbst durchspielen kann. Die Schau wird dabei
 * Testschau. Aus der Oberfläche: beim Anlegen einer Testschau und mit „Demodaten neu einspielen“ (routers/schau.ts).
 *
 *   bun src/testschau.ts --schau <slug> [--tiere 270]   füllen (nur eine Schau ohne Meldungen; wird dabei Testschau)
 *   bun src/testschau.ts --schau <slug> --zuruecksetzen [--tiere 270]   Testdaten entfernen (Schau bleibt), ggf. neu füllen
 *   bun src/testschau.ts --schau <slug> --entfernen  Schau samt Testdaten und Test-Ausstellern löschen
 *
 * Alles läuft über die normalen Programmwege (wie ein Administrator am Bildschirm): Prüfungen und Protokoll greifen.
 * Die Aussteller sind erfunden und haben keine E-Mail-Adresse (es geht keine Post hinaus). Erkennungsmerkmal: die
 * Registriernummer beginnt mit „276 16 999“ (Kreis 999 gibt es nicht) – daran findet --entfernen sie wieder.
 */
import { halleOhneFestenPlan, standardBesatz } from "@schau/domain";
import { and, asc, eq, inArray, like, notExists, sql as sqlText } from "drizzle-orm";
import { db, sql } from "./db/client";
import { aussteller, benutzer, farbenschlag, gebuehr, katalogBeitrag, katalogGestaltung, meldung, preisrichter, rasse, schau, sparte, verkauf, katalogeintrag } from "./db/schema";
import { meldebetrag } from "./services/eintraege";
import { protokolliere } from "./services/protokoll";
import { sperreTestschauExklusiv } from "./services/testschau";

export const MERKMAL = "276 16 999";

// Deterministischer Zufall: jeder Lauf ergibt dieselbe Schau.
let saat = 2026;
const zufall = () => ((saat = (saat * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
const wahl = <T>(a: readonly T[]): T => a[Math.floor(zufall() * a.length)]!;
const zwischen = (a: number, b: number) => a + Math.floor(zufall() * (b - a + 1));

const VORNAMEN = ["Klaus", "Bernd", "Rainer", "Uwe", "Steffen", "Jens", "Andreas", "Thomas", "Frank", "Mario", "Heike", "Kerstin", "Silke", "Ralf", "Dieter", "Gerd", "Matthias", "Sven", "Ines", "Torsten", "Lothar", "Wolfgang", "Manuela", "René"];
const NACHNAMEN = ["Schröter", "Möller", "Kühn", "Heyder", "Fischer", "Ritter", "Hellmann", "Gräser", "Bauer", "Schellhorn", "Kämpf", "Reinhardt", "Luck", "Henning", "Ziegler", "Werner", "Arnold", "Siebert", "Knoth", "Hartung", "Jahn", "Wagner", "Börner", "Engelhardt", "Scheffler"];
const JUGEND_VORNAMEN = ["Lena", "Max", "Paul", "Emma", "Finn"];
const STRASSEN = ["Hauptstraße", "Bahnhofstraße", "Am Anger", "Bergstraße", "Schulstraße", "Lindenweg", "Am Steinbruch", "Waldstraße", "Kirchgasse", "Feldweg"];
const ORTE: [string, string, string][] = [
  // PLZ, Ort, Verein (Kreisverband Musterkreis)
  ["12345", "Musterdorf", "GZV Musterdorf-Lindenau"],
  ["12345", "Lindenau", "GZV Musterdorf-Lindenau"],
  ["12345", "Bergheim", "GZV Bergheim"],
  ["12346", "Waldbach", "GZV Waldbach"],
  ["12347", "Talheim", "GZV Talheim"],
  ["12348", "Neustadt", "GZV Neustadt"],
  ["12349", "Feldberg", "GZV Feldberg 1896"],
  ["12350", "Seehausen", "GZV Seehausen"],
];
/** Rassen einer Lokalschau, nach Sparte; gewählt wird nur, was im Verzeichnis der Schau steht. */
const RASSEN = {
  huehner: ["Deutsche Wyandotten", "Orpington", "Rhodeländer", "Sussex", "Italiener", "Marans", "Brahma", "Thüringer Barthühner", "Deutsche Reichshühner", "Vorwerkhühner"],
  zwerghuehner: ["Deutsche Zwerg-Wyandotten", "Zwerg-Cochin", "Zwerg-Orpington", "Federfüßige Zwerghühner", "Zwerg-Thüringer Barthühner", "Sebright", "Deutsche Zwerg-Reichshühner", "Zwerg-Welsumer", "Zwerg-Sussex"],
  tauben: ["Strasser", "Kingtauben", "Deutsche Modeneser", "Altdeutsche Mövchen", "Indische Pfautauben", "Thüringer Schildtauben", "Thüringer Flügeltauben", "Thüringer Weißlätze", "Coburger Lerchen"],
  enten: ["Laufenten", "Deutsche Pekingenten", "Warzenenten", "Zwergenten", "Pommernenten"],
  // Keine Puten: die werden auf der Lokalschau nicht ausgestellt.
  sonst: ["Perlhühner"],
  gaense: ["Pommerngänse", "Diepholzer Gänse", "Deutsche Legegänse"],
} as const;
type Gruppe = keyof typeof RASSEN;
// Wie auf einer Lokalschau: Tauben am meisten, Zwerghühner mehr als große Hühner, Gänse am wenigsten.
const GRUPPEN_GEWICHT: [Gruppe, number][] = [["tauben", 38], ["zwerghuehner", 29], ["huehner", 18], ["enten", 9], ["sonst", 4], ["gaense", 2]];
const gruppe = (): Gruppe => {
  let r = zufall() * 100;
  for (const [g, w] of GRUPPEN_GEWICHT) if ((r -= w) < 0) return g;
  return "huehner";
};

/** Gültige deutsche IBAN zu einer erfundenen Kontonummer (Bankleitzahl der Beispiel-IBAN). */
function testIban(n: number): string {
  const bban = `37040044${String(2_000_000 + n * 7919).padStart(10, "0")}`;
  const pruef = 98n - (BigInt(`${bban}131400`) % 97n);
  return `DE${String(pruef).padStart(2, "0")}${bban}`;
}

const heute = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(new Date());
/** Datum `n` Tage von heute (negativ: zurück) – die Demodaten altern so nicht. */
const tag = (n: number) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(new Date(Date.now() + n * 86_400_000));
/** Laufendes Jahr zweistellig, für Ringnummern (Jungtiere dieses Jahres, Alttiere des Vorjahres). */
let jahrKurz = 26;

/** Höchstens so viele Tiere aus der Hallenkapazität (größere Mengen nur ausdrücklich, z. B. per --tiere). */
export const DEMO_TIERE_HOECHSTENS = 300;
const DEMO_SPERRE = 0x44454d4f; // "DEMO"
/**
 * Immer nur ein Demodaten-Lauf zur Zeit, über alle Prozesse (Sitzungssperre in der Datenbank): Die Zufallsfolge ist
 * gemeinsam, und zwei Läufe in dieselbe Schau gingen durcheinander.
 */
export async function mitDemoSperre<T>(fn: () => Promise<T>): Promise<T> {
  const c = await sql.reserve();
  try {
    const [r] = (await c`select pg_try_advisory_lock(${DEMO_SPERRE}::int) as ok`) as unknown as { ok: boolean }[];
    if (!r?.ok) throw new Error("Es werden gerade schon Demodaten eingespielt – bitte gleich noch einmal versuchen.");
    try {
      return await fn();
    } finally {
      await c`select pg_advisory_unlock(${DEMO_SPERRE}::int)`;
    }
  } finally {
    c.release();
  }
}

/** Wer die Demodaten einspielt (aus der Oberfläche: der angemeldete Administrator). */
export type Einspieler = { id: number; organisationId: number; name: string; email: string };

async function ladeZiel(slug: string, wer?: Einspieler) {
  const [s] = await db.select().from(schau).where(eq(schau.slug, slug));
  if (!s) throw new Error(`Keine Schau mit dem Kurznamen „${slug}“.`);
  if (wer && wer.organisationId !== s.organisationId) throw new Error("Schau nicht gefunden.");
  const [admin] = wer ? [wer] : await db.select().from(benutzer).where(and(eq(benutzer.organisationId, s.organisationId), eq(benutzer.rolle, "admin"))).orderBy(asc(benutzer.id));
  if (!admin) throw new Error("Der Verein hat keinen Administrator.");
  const { appRouter } = await import("./router");
  const ctx = { richter: null, cookieTokens: { benutzer: undefined, richter: undefined }, ip: "testdaten", setCookie: () => {} };
  // Im Protokoll erkennbar: Benutzer des Administrators, Name mit Zusatz.
  const api = appRouter.createCaller({ ...ctx, benutzer: { id: admin.id, organisationId: admin.organisationId, name: `${admin.name} (Testdaten)`, email: admin.email, rolle: "admin" } });
  return { s, api, akteur: { benutzer: { id: admin.id, name: `${admin.name} (Testdaten)` } } };
}

type Pos = { farbenschlagId: number; rasseId: null; freitext: ""; art: "einzeltier" | "stamm" | "voliere"; geschlecht: string; alter: "jung" | "alt"; istAoc: false; istNeuzuechtung: false; eigeneZucht: boolean; verkaufspreisCent: number | null; ringnummern: string };

/** `ziel`: so viele Käfige (Einzeltiere, Stämme, Volieren) werden gemeldet; ohne Angabe knapp unter der Hallenkapazität. */
export async function fuellen(slug: string, ziel?: number, opts: { wer?: Einspieler; leise?: boolean } = {}) {
  // Jedes Mal dieselben Demodaten.
  saat = 2026;
  jahrKurz = Number(heute().slice(2, 4));
  const { s, api, akteur } = await ladeZiel(slug, opts.wer);
  const [schon] = await db.select({ id: meldung.id }).from(meldung).where(eq(meldung.schauId, s.id)).limit(1);
  if (schon) throw new Error(`„${s.name}“ hat schon Meldungen – Testdaten nur in eine leere Schau (nichts wird überschrieben).`);
  if (!s.stammdatenVersionId) throw new Error("Der Schau fehlt das Rassenverzeichnis.");
  if (s.phase !== "vorbereitung" && s.phase !== "meldung") throw new Error(`Die Schau steht in der Phase „${s.phase}“ – erwartet: Vorbereitung oder Meldung.`);
  const log = (t: string) => (opts.leise ? undefined : console.log(`· ${t}`));
  // Erfundene Aussteller nur in einer Testschau: dort gehören sie nur ihr und tauchen nie in echten Schauen auf.
  if (!s.test) {
    await api.schau.alsTestschau({ id: s.id, name: s.name, anzahl: 0 });
    log("als Testschau gekennzeichnet");
  }

  // Farbenschläge je Rasse (die ersten des Verzeichnisses sind die verbreiteten).
  const farben = await db
    .select({ id: farbenschlag.id, rasse: rasse.name, sparte: sparte.name })
    .from(farbenschlag)
    .innerJoin(rasse, eq(rasse.id, farbenschlag.rasseId))
    .innerJoin(sparte, eq(sparte.id, rasse.sparteId))
    .where(eq(farbenschlag.versionId, s.stammdatenVersionId))
    .orderBy(asc(farbenschlag.folge));
  const jeRasse = new Map<string, typeof farben>();
  for (const f of farben) if ((jeRasse.get(f.rasse)?.length ?? 0) < 3) jeRasse.set(f.rasse, [...(jeRasse.get(f.rasse) ?? []), f]);
  const verfuegbar = Object.fromEntries(Object.entries(RASSEN).map(([g, l]) => [g, l.filter((r) => jeRasse.has(r))])) as Record<Gruppe, string[]>;
  if (!verfuegbar.huehner.length || !verfuegbar.tauben.length) throw new Error("Im Verzeichnis fehlen die üblichen Rassen.");

  // Preisrichter (ohne PIN – die vergibt die Ausstellungsleitung unter „Preisrichter“).
  const vorhandenePr = await db.select({ id: preisrichter.id }).from(preisrichter).where(eq(preisrichter.schauId, s.id));
  if (!vorhandenePr.length) {
    for (const [name, obmann] of [["Rainer Testmann", true], ["Gisela Probe", false], ["Holger Beispiel", false]] as const) {
      await api.preisrichter.speichern({ schauId: s.id, name, anschrift: "Testanschrift (erfunden)", email: "", telefon: "", istObmann: obmann });
    }
    log("3 Preisrichter angelegt (Obmann: Rainer Testmann), noch ohne PIN");
  }

  // Käfige und Halle: Stamm- und Volierenmaße, Brahma im Großkäfig; Halle der letzten Schau des Vereins übernehmen.
  const masse = (s.kaefigMasse ?? {}) as Record<string, unknown>;
  if (!masse.stamm) await api.katalog.kaefigMassSetzen({ schauId: s.id, typ: "stamm", mass: { breite: 120, tiefe: 70, hoehe: 70 } });
  if (!masse.voliere) await api.katalog.kaefigMassSetzen({ schauId: s.id, typ: "voliere", mass: { breite: 200, tiefe: 100, hoehe: 180 } });
  if (!(s.kaefigRegeln ?? []).length && jeRasse.has("Brahma")) await api.katalog.kaefigRegelSetzen({ schauId: s.id, rasse: "Brahma", typ: "grosskaefig" });
  if (!s.halle) {
    const [andere] = await db.select({ halle: schau.halle }).from(schau).where(and(eq(schau.organisationId, s.organisationId), sqlText`${schau.halle} is not null`)).orderBy(asc(schau.id));
    if (andere?.halle) {
      // Ohne verschobene Platten und entfernte leere Plätze (sie gehören zum festen Plan der anderen Schau).
      await api.katalog.halleSetzen({ schauId: s.id, halle: halleOhneFestenPlan(andere.halle) as never });
      log("Halle aus der ersten Schau des Vereins übernommen");
    } else {
      // Turnhalle 27 × 15 m, Eingang an einer Stirnseite, Bereich für Volieren und Cafeteria.
      await api.katalog.halleSetzen({
        schauId: s.id,
        halle: {
          breite: 1500, laenge: 2700, gang: 150, wandreihen: true, richtung: "quer", quergang: true, wandBuendig: true,
          hauptgang: { breite: 250, lage: "anfang" }, platte: { laenge: 210, tiefe: 70 }, jePlatte: {},
          flaechen: [
            { name: "Eingang", art: "eingang", x: 600, y: 0, breite: 300, tiefe: 50 },
            { name: "Cafeteria", art: "sperre", x: 0, y: 0, breite: 400, tiefe: 400 },
            { name: "Volieren", art: "volieren", x: 1000, y: 2200, breite: 500, tiefe: 500 },
          ],
        },
      });
      log("Halle angelegt: Turnhalle 27 × 15 m");
    }
  }

  // Katalog-Vorspann (nur wenn noch keiner da ist).
  const [gestaltet] = await db.select({ id: katalogGestaltung.schauId }).from(katalogGestaltung).where(eq(katalogGestaltung.schauId, s.id));
  if (!gestaltet) {
    await db.insert(katalogGestaltung).values({
      schauId: s.id,
      format: "A5",
      untertitel: "mit Jugendschau (Testdaten)",
      ausstellungsleitung: ["Ausstellungsleiter: Test Leiter", "Meldestelle und Katalog: Test Meldestelle", "Kasse und Tierverkauf: Test Kasse", "Einlieferung: Test Einlieferung", "Tierarzt: Dr. Test"].join("\n"),
      eintritt: "Erwachsene 3 €, Kinder frei, Katalog 3 €",
    });
    await db.insert(katalogBeitrag).values({ schauId: s.id, art: "grusswort", folge: 1, titel: "Willkommen", unterzeile: "Testdaten – frei erfunden", text: "Liebe Zuchtfreunde, liebe Gäste,\n\nherzlich willkommen zu unserer Schau. Dieser Text gehört zu den Testdaten." });
  }

  // Eine frisch angelegte Testschau hat noch keine Gebühren und Termine: Demowerte, damit die Meldephase beginnen kann.
  const gebuehren = await db.select().from(gebuehr).where(eq(gebuehr.schauId, s.id));
  if (!gebuehren.some((g) => g.betragCent > 0)) {
    // Über das Programm (mit Protokoll), wie die Ausstellungsleitung unter „Gebühren“.
    const demo: Record<string, number> = { einzeltier: 300, stamm: 900, voliere: 900, katalog: 300, kostenanteil: 200 };
    const zeilen = gebuehren.length ? gebuehren : [{ art: "einzeltier", jugend: false, befreitPreisrichter: false }, { art: "einzeltier", jugend: true, befreitPreisrichter: false }];
    await api.schau.gebuehrenSetzen({
      schauId: s.id,
      gebuehren: zeilen.map((g) => ({ art: g.art as never, jugend: g.jugend, befreitPreisrichter: g.befreitPreisrichter, betragCent: g.art === "einzeltier" && g.jugend ? 150 : (demo[g.art] ?? 0) })),
    });
    log("Demo-Gebühren gesetzt (Einzeltier 3 €, Jugend 1,50 €, Katalog 3 €)");
  }
  if (!s.meldeschluss || !s.bewertungAm) {
    const neu = { meldeschluss: s.meldeschluss ?? tag(7), bewertungAm: s.bewertungAm ?? tag(14) };
    await db.transaction(async (tx) => {
      await tx.update(schau).set(neu).where(eq(schau.id, s.id));
      await protokolliere(tx, { schauId: s.id, tabelle: "schau", datensatzId: s.id, aktion: "Demo-Termine gesetzt", alt: { meldeschluss: s.meldeschluss, bewertungAm: s.bewertungAm }, neu, akteur });
    });
    log("Demo-Termine gesetzt (Meldeschluss in einer Woche, Bewertung in zwei Wochen)");
  }

  // Bewusst (trotzdem): Demodaten sollen auch ohne vollständige Vereinsangaben (Impressum) einspielbar sein.
  if (s.phase === "vorbereitung") await api.schau.phaseSetzen({ id: s.id, phase: "meldung", trotzdem: true });

  // Aussteller und Meldungen. Fälle: Jugend, Stämme, Volieren, Verkaufspreise, Papier und online, einige mit Konto,
  // vorab überwiesen oder bar bei der Einlieferung; dazu die Sonderfälle unten.
  const anzahl = ziel ?? Math.min(DEMO_TIERE_HOECHSTENS, Math.max(20, (s.kapazitaet ?? 200) - 12));
  const meldungen: { meldungId: number; name: string; nr: number; gruppe: Gruppe; tiere: number }[] = [];
  let tiereGesamt = 0;
  for (let i = 0; tiereGesamt < anzahl; i++) {
    const istJugend = i % 11 === 4;
    const [plz, ort, verein] = i < 10 ? ORTE[i % 2]! : wahl(ORTE);
    // Jeder Name nur einmal (sonst verwechselt man beim Durchspielen die Aussteller).
    // Höchstens 50 Versuche; danach (sehr viele Meldungen) ein Zusatz, statt endlos zu suchen.
    let nachname = "", vorname = "";
    for (let versuch = 0; ; versuch++) {
      nachname = wahl(NACHNAMEN);
      vorname = istJugend ? wahl(JUGEND_VORNAMEN) : wahl(VORNAMEN);
      if (versuch >= 50) nachname = `${nachname}-${i}`;
      if (!meldungen.some((m) => m.name === `${vorname} ${nachname}`)) break;
    }
    // Gänse sind selten, aber dabei: ein Gänsezüchter fest, sonst nach Gewicht.
    const g = i === 30 ? "gaense" : gruppe();
    const rassen = [...new Set(Array.from({ length: zwischen(1, 2) }, () => wahl(verfuegbar[g].length ? verfuegbar[g] : verfuegbar.huehner)))];
    const positionen: Pos[] = [];
    for (const r of rassen) {
      const f = wahl(jeRasse.get(r)!);
      // Gänse nur einzeln oder als Paar, Tauben oft ein paar mehr.
      const tiere = g === "gaense" ? zwischen(1, 2) : g === "tauben" ? zwischen(3, 6) : zwischen(2, 5);
      for (let t = 0; t < tiere; t++) {
        const alter = zufall() < 0.8 ? "jung" : "alt";
        const geschlecht = t % 2 === 0 ? "1,0" : "0,1";
        positionen.push({ farbenschlagId: f.id, rasseId: null, freitext: "", art: "einzeltier", geschlecht, alter, istAoc: false, istNeuzuechtung: false, eigeneZucht: true, verkaufspreisCent: zufall() < 0.25 ? wahl([1500, 2000, 2500, 3000, 4000]) : null, ringnummern: ring(alter, g) });
      }
      // Keine Stämme in Käfigen: Gruppen stellt man auf der Lokalschau in Volieren aus (siehe unten).
    }
    // Drei Volieren (Zwergenten bzw. Zwerghühner) – Gruppen stehen nur dort, nicht als Stamm im Käfig.
    if (i === 7 || i === 21 || i === 40) {
      const r = i === 7 && jeRasse.has("Zwergenten") ? "Zwergenten" : wahl(verfuegbar.zwerghuehner);
      const f = jeRasse.get(r)![0]!;
      const besatz = standardBesatz("voliere", `${f.sparte} ${f.rasse}`) ?? "1,2";
      positionen.push({ farbenschlagId: f.id, rasseId: null, freitext: "", art: "voliere", geschlecht: besatz, alter: "jung", istAoc: false, istNeuzuechtung: false, eigeneZucht: true, verkaufspreisCent: zufall() < 0.5 ? 6000 : null, ringnummern: "" });
    }
    // Die letzte Meldung so kürzen, dass genau die gewünschte Zahl gemeldet ist.
    if (tiereGesamt + positionen.length > anzahl) positionen.length = anzahl - tiereGesamt;
    tiereGesamt += positionen.length;
    const r = await api.meldung.speichern({
      schauId: s.id,
      aussteller: {
        vorname,
        nachname,
        strasse: `${wahl(STRASSEN)} ${zwischen(1, 60)}`,
        plz,
        ort,
        telefon: i % 3 === 0 ? `0362${zwischen(1, 9)} ${zwischen(10000, 99999)}` : "",
        email: "",
        verein,
        kreisverband: "KV Musterkreis",
        registriernummer: `${MERKMAL} ${String(100 + i).padStart(3, "0")} ${String(1000 + i * 37).padStart(4, "0")}`,
        geburtsdatum: istJugend ? `${Number(heute().slice(0, 4)) - zwischen(11, 14)}-0${zwischen(1, 9)}-1${zwischen(0, 9)}` : null,
        istPreisrichter: false,
        iban: i % 5 < 2 ? testIban(i) : "",
        kontoinhaber: "",
      },
      eingang: i % 3 === 0 ? "papier" : "online",
      istJugend,
      bemerkung: i === 12 ? "Bitte Käfige nebeneinander, Tiere sind Geschwister." : "",
      zustimmung: true,
      onlineZustimmung: i % 6 !== 5,
      erziehungsberechtigter: istJugend ? `${wahl(VORNAMEN)} ${nachname}` : "",
      erklaerungen: true,
      positionen,
      // Ein Züchter stiftet einen Ehrenpreis.
      stiftung: i === 9 ? { betragCent: 2000, vorgabe: "für die beste Zwerg-Wyandotte" } : null,
    });
    meldungen.push({ meldungId: r.meldungId, name: `${vorname} ${nachname}`, nr: i, gruppe: g, tiere: positionen.length });
  }
  log(`${meldungen.length} Meldungen mit ${tiereGesamt} Tieren erfasst`);

  // Vorab überwiesen (gut ein Drittel); bestätigt wird dabei automatisch.
  const ueberwiesen = meldungen.filter((m) => m.nr % 3 === 1);
  for (const m of ueberwiesen) {
    const b = await meldebetrag(db, m.meldungId);
    await api.meldung.zahlungErfassen({ meldungId: m.meldungId, betragCent: b.summeCent + b.stiftungCent, datum: tag(-zwischen(1, 8)), art: "ueberweisung" });
  }
  log(`${ueberwiesen.length} Meldungen vorab überwiesen`);

  // Sonderfälle in der Meldephase.
  const storniert = meldungen[5]!;
  await api.meldung.statusSetzen({ id: storniert.meldungId, status: "storniert", grund: "Aussteller hat vor Meldeschluss telefonisch abgesagt (Testdaten)" });
  log(`Meldung von ${storniert.name} storniert (Absage vor Meldeschluss)`);
  // Die Meldestelle nimmt die übrigen Meldungen an (bestätigt), bezahlt wird bei der Einlieferung.
  for (const m of meldungen) {
    if (m === storniert) continue;
    const [st] = await db.select({ status: meldung.status }).from(meldung).where(eq(meldung.id, m.meldungId));
    if (st?.status === "offen") await api.meldung.statusSetzen({ id: m.meldungId, status: "bestaetigt" });
  }

  // Katalog: Nummern, Einteilung der Preisrichter, Bewertungskarten gedruckt.
  await api.schau.phaseSetzen({ id: s.id, phase: "katalog", trotzdem: true, grund: "Demodaten einspielen" });
  await api.katalog.nummernVergeben({ schauId: s.id });
  await api.preisrichter.einteilungSetzen({ schauId: s.id, einteilung: (await api.preisrichter.einteilungVorschlagen({ schauId: s.id })).einteilung });
  await api.katalog.gedrucktSetzen({ schauId: s.id, gedruckt: true });
  log("Katalognummern vergeben, Preisrichter eingeteilt, Katalog festgeschrieben");

  // Einlieferung.
  await api.schau.phaseSetzen({ id: s.id, phase: "einlieferung", trotzdem: true, grund: "Demodaten einspielen" });
  const alle = await api.katalog.liste({ schauId: s.id });
  const jeMeldung = new Map<number, typeof alle>();
  for (const e of alle) jeMeldung.set(e.meldungId, [...(jeMeldung.get(e.meldungId) ?? []), e]);

  const garNicht = meldungen[14]!; // hat vorab überwiesen? siehe unten – kommt gar nicht
  const nichtGekommenBezahlt = meldungen.find((m) => ueberwiesen.includes(m) && m !== storniert && m.nr > 20)!;
  const nachweisFehlt = meldungen[18]!; // Impfnachweis vergessen – Tiere warten noch
  const zahltSpaeter = meldungen[26] ?? meldungen.at(-2)!; // kein Bargeld dabei
  const teilzahlung = meldungen[23] ?? meldungen.at(-3)!; // zahlt nur einen Teil
  const fehlen: number[] = [];
  const eingeliefert: number[] = [];
  const nachweisTage = { nd: { datum: tag(-60), impfstoff: "Nobilis ND Clone 30", tierarzt: "TA Praxis Bergheim (Test)" }, pmv: { datum: tag(-80), impfstoff: "Colombovac PMV", tierarzt: "TA Praxis Bergheim (Test)" } };
  let bar = 0;
  for (const m of meldungen) {
    if (m === storniert) continue;
    const tiere = jeMeldung.get(m.meldungId) ?? [];
    if (!tiere.length) continue;
    if (m === garNicht || m === nichtGekommenBezahlt) {
      fehlen.push(...tiere.map((t) => t.id));
      continue;
    }
    const kein = { datum: null, impfstoff: "", tierarzt: "" };
    await api.halle.vetSetzen({
      meldungId: m.meldungId,
      nd: m === nachweisFehlt ? kein : nachweisTage.nd,
      pmv: m === nachweisFehlt ? kein : nachweisTage.pmv,
      wg: { datum: null, sentinel: false, stelle: "" },
      geprueft: m !== nachweisFehlt,
    });
    if (m === nachweisFehlt) continue;
    // Einzelne Tiere fehlen (krank, verendet, in der Mauser): etwa jedes 15. Tier.
    for (const [k, t] of tiere.entries()) ((m.nr * 7 + k) % 15 === 3 && tiere.length > 1 ? fehlen : eingeliefert).push(t.id);
    // Bar kassieren, was offen ist (wie an der Einlieferung: mit dem angezeigten offenen Betrag).
    if (m === zahltSpaeter) continue;
    const b = await meldebetrag(db, m.meldungId);
    const offen = b.summeCent + b.stiftungCent - b.bezahltCent;
    if (offen > 0) {
      const betrag = m === teilzahlung ? Math.round(offen / 2 / 100) * 100 : offen;
      await api.meldung.zahlungErfassen({ meldungId: m.meldungId, betragCent: betrag, erwartetOffenCent: offen, datum: heute(), art: "bar" });
      bar++;
    }
  }
  if (eingeliefert.length) await api.halle.statusSetzen({ schauId: s.id, ids: eingeliefert, status: "eingeliefert" });
  if (fehlen.length) await api.halle.statusSetzen({ schauId: s.id, ids: fehlen, status: "fehlt" });
  log(`${eingeliefert.length} Tiere eingeliefert, ${fehlen.length} fehlen; ${bar} Aussteller haben bar bezahlt`);

  // Ein Aussteller bringt bei der Einlieferung noch zwei Tiere mit (Nachmeldung → Unternummern).
  const g = wahl(verfuegbar.zwerghuehner);
  const f = jeRasse.get(g)![0]!;
  const nach = await api.meldung.speichern({
    schauId: s.id,
    aussteller: { vorname: "Erich", nachname: "Spätling", strasse: "Am Anger 3", plz: "12345", ort: "Musterdorf", telefon: "", email: "", verein: "GZV Musterdorf-Lindenau", kreisverband: "KV Musterkreis", registriernummer: `${MERKMAL} 199 9999`, geburtsdatum: null, istPreisrichter: false, iban: "", kontoinhaber: "" },
    eingang: "papier",
    istJugend: false,
    bemerkung: "Nachmeldung bei der Einlieferung",
    zustimmung: true,
    onlineZustimmung: true,
    erziehungsberechtigter: "",
    erklaerungen: true,
    positionen: (["1,0", "0,1"] as const).map((geschlecht) => ({ farbenschlagId: f.id, rasseId: null, freitext: "", art: "einzeltier" as const, geschlecht, alter: "jung" as const, istAoc: false as const, istNeuzuechtung: false as const, eigeneZucht: true, verkaufspreisCent: null, ringnummern: ring("jung", "zwerghuehner") })),
    stiftung: null,
  });
  await api.meldung.statusSetzen({ id: nach.meldungId, status: "bestaetigt" });
  await api.katalog.nummernVergeben({ schauId: s.id });
  await api.halle.vetSetzen({ meldungId: nach.meldungId, nd: nachweisTage.nd, pmv: { datum: null, impfstoff: "", tierarzt: "" }, wg: { datum: null, sentinel: false, stelle: "" }, geprueft: true });
  const b = await meldebetrag(db, nach.meldungId);
  await api.meldung.zahlungErfassen({ meldungId: nach.meldungId, betragCent: b.summeCent, erwartetOffenCent: b.summeCent, datum: heute(), art: "bar" });
  const neu = (await api.katalog.liste({ schauId: s.id })).filter((e) => e.meldungId === nach.meldungId);
  await api.halle.statusSetzen({ schauId: s.id, ids: neu.map((e) => e.id), status: "eingeliefert" });
  log(`Nachmeldung von Erich Spätling: ${neu.map((e) => `${e.katalogNr}${e.suffix}`).join(", ")}`);

  const faelle = [
    `${garNicht.name}: nicht gekommen, Meldegeld offen`,
    `${nichtGekommenBezahlt.name}: nicht gekommen, hatte vorab überwiesen`,
    `${nachweisFehlt.name}: Impfnachweis fehlt, Tiere noch nicht eingeliefert`,
    `${zahltSpaeter.name}: Tiere da, Meldegeld noch offen`,
    `${teilzahlung.name}: nur einen Teil bar bezahlt`,
    `${storniert.name}: Meldung vor Meldeschluss storniert`,
    `Erich Spätling: Nachmeldung bei der Einlieferung`,
  ];
  if (!opts.leise) {
    console.log(`\nFertig: „${s.name}“ steht in der Phase „Einlieferung“. Offene Fälle zum Durchspielen:`);
    for (const f of faelle) console.log(`- ${f}`);
  }
  return { meldungen: meldungen.length + 1, tiere: tiereGesamt + 2, faelle };
}

function ring(alter: "jung" | "alt", g: Gruppe) {
  const jahr = String(alter === "jung" ? jahrKurz : (jahrKurz + 99) % 100).padStart(2, "0");
  const buchstabe = g === "tauben" ? wahl(["0123", "0456", "0789"]) : wahl(["A", "B", "C", "E", "G", "K"]);
  return g === "tauben" ? `DV ${buchstabe}-${jahr}-${zwischen(100, 999)}` : `D ${jahr} ${buchstabe} ${zwischen(100, 999)}`;
}

/**
 * Entfernt nur die Testdaten aus der Schau (Meldungen, Geld, Katalog, Preisrichter und Katalog-Vorspann der Testdaten,
 * Protokoll ab dem ersten Testdaten-Eintrag) und stellt sie zurück auf „Vorbereitung“. Einstellungen, Gebühren,
 * Preisarten, Halle und Käfigmaße bleiben. Test-Aussteller ohne andere Meldungen werden gelöscht.
 */
export async function zuruecksetzen(slug: string, opts: { leise?: boolean } = {}) {
  const [s] = await db.select().from(schau).where(eq(schau.slug, slug));
  if (!s) throw new Error(`Keine Schau mit dem Kurznamen „${slug}“.`);
  // In einer Testschau ist alles Testdaten (auch von Hand geübte Meldungen) – sonst nur die Erfundenen.
  if (!s.test) await pruefeNurTestdaten(s.id, s.name);
  await db.transaction(async (tx) => {
    // Laufende Meldungen dieser Schau abwarten, neue warten (wie beim Kennzeichnen und Löschen einer Testschau).
    await sperreTestschauExklusiv(tx, s.id);
    await tx.execute(sqlText`set local schau.loeschen = 'ja'`);
    const id = s.id;
    await tx.execute(sqlText`delete from verkauf where katalogeintrag_id in (select id from katalogeintrag where schau_id = ${id})`);
    // Vergaben gestifteter Preise zeigen auf ihre Stiftung (RESTRICT): vor den Stiftungen löschen.
    await tx.execute(sqlText`delete from preisvergabe where katalogeintrag_id in (select id from katalogeintrag where schau_id = ${id})`);
    for (const t of ["gesundheit", "stiftung", "auszahlung", "beleg", "kassenbewegung", "kassenabschluss", "sepa_lauf", "pr_einteilung", "pr_zuteilung"]) {
      await tx.execute(sqlText`delete from ${sqlText.identifier(t)} where schau_id = ${id}`);
    }
    await tx.execute(sqlText`delete from meldung where schau_id = ${id}`);
    await tx.execute(sqlText`delete from aenderung where schau_id = ${id} and id >= (select coalesce(min(id), 2147483647) from aenderung where schau_id = ${id} and wer like '%(Testdaten)%')`);
    await tx.execute(sqlText`delete from preisrichter where schau_id = ${id} and anschrift = 'Testanschrift (erfunden)'`);
    await tx.execute(sqlText`delete from katalog_beitrag where schau_id = ${id} and unterzeile = 'Testdaten – frei erfunden'`);
    await tx.execute(sqlText`delete from katalog_gestaltung where schau_id = ${id} and untertitel like '%(Testdaten)%'`);
    await tx.execute(sqlText`update schau set phase = 'vorbereitung', katalog_gedruckt = false, ergebnisse_freigegeben = false, hallenplan_fest = null where id = ${id}`);
    await tx
      .delete(aussteller)
      .where(and(eq(aussteller.organisationId, s.organisationId), like(aussteller.registriernummer, `${MERKMAL}%`), notExists(tx.select({ id: meldung.id }).from(meldung).where(eq(meldung.ausstellerId, aussteller.id)))));
    // Test-Aussteller dieser Testschau gehören nur ihr: alle weg, noch wartende Mails an sie auch.
    if (s.test) {
      await tx.execute(sqlText`delete from postausgang where status = 'wartet' and aussteller_id in (select id from aussteller where test_schau_id = ${id})`);
      await tx.delete(aussteller).where(eq(aussteller.testSchauId, id));
    }
  });
  if (!opts.leise) console.log(`„${s.name}“: Testdaten entfernt, Schau steht wieder in der Vorbereitung.`);
}

async function pruefeNurTestdaten(schauId: number, name: string) {
  const fremde = await db
    .select({ id: meldung.id })
    .from(meldung)
    .innerJoin(aussteller, eq(aussteller.id, meldung.ausstellerId))
    .where(and(eq(meldung.schauId, schauId), sqlText`${aussteller.registriernummer} not like ${MERKMAL + "%"}`));
  if (fremde.length) throw new Error(`„${name}“ hat ${fremde.length} Meldungen echter Aussteller – nichts geändert.`);
}

/** Löscht die Schau samt allem und die Test-Aussteller (Merkmal) ohne Meldungen in anderen Schauen. */
export async function entfernen(slug: string) {
  const [s] = await db.select().from(schau).where(eq(schau.slug, slug));
  if (!s) throw new Error(`Keine Schau mit dem Kurznamen „${slug}“.`);
  await pruefeNurTestdaten(s.id, s.name);
  await db.transaction(async (tx) => {
    // Protokoll und Kassendaten sind gegen Löschen geschützt (db/schutz.sql) – nur hier, in dieser Transaktion, frei.
    await tx.execute(sqlText`set local schau.loeschen = 'ja'`);
    await tx.delete(verkauf).where(inArray(verkauf.katalogeintragId, tx.select({ id: katalogeintrag.id }).from(katalogeintrag).where(eq(katalogeintrag.schauId, s.id))));
    await tx.delete(schau).where(eq(schau.id, s.id));
    await tx
      .delete(aussteller)
      .where(and(eq(aussteller.organisationId, s.organisationId), like(aussteller.registriernummer, `${MERKMAL}%`), notExists(tx.select({ id: meldung.id }).from(meldung).where(eq(meldung.ausstellerId, aussteller.id)))));
  });
  console.log(`„${s.name}“ mit allen Testdaten gelöscht.`);
}

if (import.meta.main) {
  const i = process.argv.indexOf("--schau");
  const slug = i > 0 ? process.argv[i + 1] : undefined;
  try {
    if (!slug) throw new Error("Aufruf: bun src/testschau.ts --schau <kurzname> [--tiere <anzahl>] [--zuruecksetzen] [--entfernen]");
    const t = process.argv.indexOf("--tiere");
    const ziel = t > 0 ? Number(process.argv[t + 1]) : undefined;
    if (ziel !== undefined && !(Number.isInteger(ziel) && ziel >= 20 && ziel <= 2000)) throw new Error("--tiere: eine Zahl von 20 bis 2000.");
    await mitDemoSperre(async () => {
      if (process.argv.includes("--entfernen")) await entfernen(slug);
      else if (process.argv.includes("--zuruecksetzen")) {
        await zuruecksetzen(slug);
        if (ziel) await fuellen(slug, ziel);
      } else await fuellen(slug, ziel);
    });
  } catch (e) {
    console.error(`Abgebrochen: ${e instanceof Error ? e.message : e}`);
    process.exitCode = 1;
  }
  await sql.end();
}
