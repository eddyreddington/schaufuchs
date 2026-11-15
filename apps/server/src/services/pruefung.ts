import { type Phase, gefordertCent, frontFehler, halleNormal, planeHalle, planUnordnung, gewichteteTierzahl, passtZuPreisart, ringjahrPasst, brauchtObmann, fehlendeVereinsangaben, formatKatalognummer, MELDEART_LABEL, normalisiereRegistriernummer, kontingent, type KontingentBasis, type Preisart, istAuslaendisch } from "@schau/domain";
import { and, asc, count, eq, ne, sql } from "drizzle-orm";
import { db } from "../db/client";
import { aussteller, auszahlung, gebuehr, katalogeintrag, meldung, preisart, preisrichter, prEinteilung, schau, stiftung } from "../db/schema";
import { ladeVereinsangaben } from "./datenschutz";
import { ladeEintraege, meldebetrag, skalaVon, type Eintrag } from "./eintraege";
import { offeneStornoZahlungen } from "./kasse";
import { ladeKassenbuch } from "./kassenbuch";
import { heuteDe, nachweisStand } from "./tiergesundheit";
import { ladeGestaltung } from "../routers/katalog-gestaltung";

export interface Punkt {
  /** "fehler" blockiert den nächsten Schritt fachlich, "hinweis" nicht. */
  art: "fehler" | "hinweis" | "ok";
  /** Kurz, ohne Erklärung – Hintergründe stehen im Handbuch. */
  text: string;
  /** Kurzer Zusatz rechts daneben (Frist, Beispielnummern). */
  zusatz?: string;
  /** Unterseite der Schau, auf der man es erledigt. */
  ziel?: string;
  /** Ein „fehler“ muss spätestens in dieser Phase erledigt sein: Er hält den Wechsel in eine spätere Phase auf. */
  bis?: Phase;
}

/**
 * Unbezahlte Online-Meldungen belegen die Halle so lange wie ein übliches Zahlungsziel – lange genug, dass die AL
 * Überweisungen buchen kann (sonst würde überbucht), aber nicht für immer (sonst sperrte eine Scheinmeldung die Halle;
 * die AL kann sie auch vorher ablehnen). Die Prüfliste nennt es, wenn solche Meldungen die Online-Meldung schließen.
 */
export const ONLINE_RESERVIERUNG_STUNDEN = 14 * 24;

/** Belegte Käfige: bestätigte und noch reservierte Meldungen. */
export async function belegteKaefige(schauId: number) {
  const [r] = await db
    .select({ n: count() })
    .from(katalogeintrag)
    .innerJoin(meldung, eq(meldung.id, katalogeintrag.meldungId))
    .where(
      and(
        eq(katalogeintrag.schauId, schauId),
        ne(meldung.status, "abgelehnt"),
        ne(meldung.status, "storniert"),
        sql`(${meldung.status} = 'bestaetigt' or ${meldung.eingang} <> 'online' or ${meldung.eingegangenAm} > now() - make_interval(hours => ${ONLINE_RESERVIERUNG_STUNDEN}))`,
      ),
    );
  return r?.n ?? 0;
}

/** Eingelieferte Einträge, die einem Preisrichter zugeteilt sind (über Katalognummernbereiche). */
export function zuteilung(eintraege: Eintrag[], einteilung: { preisrichterId: number; vonNr: number; bisNr: number }[]) {
  const map = new Map<number, number>();
  for (const e of eintraege) {
    if (e.katalogNr == null) continue;
    const z = einteilung.find((x) => e.katalogNr! >= x.vonNr && e.katalogNr! <= x.bisNr);
    if (z) map.set(e.id, z.preisrichterId);
  }
  return map;
}

/** Stiftungen mit Preisart, aus denen noch nicht alle Preise vergeben sind: „Stifter: 1 von 2 PE frei“. */
export function offeneStiftungen(
  stiftungen: { id: number; stifter: string; anzahl: number; preisartId: number | null }[],
  eintraege: { preise: { stiftungId: number | null }[] }[],
) {
  return stiftungen
    .filter((st) => st.preisartId != null)
    .flatMap((st) => {
      const benutzt = eintraege.reduce((n, e) => n + e.preise.filter((p) => p.stiftungId === st.id).length, 0);
      return benutzt < st.anzahl ? [`${st.stifter}: ${st.anzahl - benutzt} von ${st.anzahl} frei`] : [];
    });
}

/** Kennung der Zeile „Gesamte Schau“, wenn das Kontingent für alle Preisrichter gemeinsam gilt. */
export const GESAMT = 0;

/**
 * Preiskontingente aus der Zahl der ausgestellten Tiere: eingeliefert oder bewertet, nicht fehlend.
 * Ein bewertetes Tier war nachweislich da, auch wenn die Einlieferung nicht abgehakt ist.
 * Je nach Einstellung der Schau eine Zeile je Preisrichter oder eine gemeinsame Zeile (preisrichterId = GESAMT).
 * „vergeben“ zählt alle Preise auf zugeteilten Tieren, auch auf als fehlend gemeldeten – sonst ließe sich das Kontingent überschreiten.
 */
export function kontingente(
  eintraege: Eintrag[],
  zuteil: Map<number, number>,
  richter: { id: number; name: string }[],
  arten: Preisart[],
  je: KontingentBasis,
) {
  const zeile = (preisrichterId: number, name: string, tiere: Eintrag[], zugeteilt: Eintrag[], anzahlRichter: number) => ({
    preisrichterId,
    name,
    tiere: tiere.length,
    bewertet: tiere.filter((e) => e.punkte != null).length,
    arten: arten
      .filter((a) => a.quelle === "standgeld")
      .map((a) => ({
        preisartId: a.id,
        kuerzel: a.kuerzel,
        verfuegbar: kontingent(a, tiere.filter((e) => passtZuPreisart(a, e)).length, anzahlRichter),
        vergeben: zugeteilt.reduce((n, e) => n + e.preise.filter((p) => p.preisartId === a.id).length, 0),
      })),
  });
  const ausgestellt = (e: Eintrag) => e.status !== "fehlt" && (e.status !== "katalogisiert" || e.bewertet);
  if (je === "schau") {
    const alle = eintraege.filter((e) => zuteil.has(e.id));
    return [zeile(GESAMT, "Gesamte Schau", alle.filter(ausgestellt), alle, richter.length)];
  }
  return richter.map((r) => {
    const seine = eintraege.filter((e) => zuteil.get(e.id) === r.id);
    return zeile(r.id, r.name, seine.filter(ausgestellt), seine, 1);
  });
}

export async function checkliste(schauId: number): Promise<Punkt[]> {
  const [s] = await db.select().from(schau).where(eq(schau.id, schauId));
  if (!s) return [];
  const [eintraege, meldungenRoh, gebuehren, arten, richter, einteilung, auszahlungen, stiftungen] = await Promise.all([
    ladeEintraege(schauId),
    db.select({ m: meldung, registriernummer: aussteller.registriernummer, geburtsdatum: aussteller.geburtsdatum }).from(meldung).innerJoin(aussteller, eq(aussteller.id, meldung.ausstellerId)).where(eq(meldung.schauId, schauId)),
    db.select().from(gebuehr).where(eq(gebuehr.schauId, schauId)),
    db.select().from(preisart).where(eq(preisart.schauId, schauId)).orderBy(asc(preisart.folge)),
    db.select().from(preisrichter).where(eq(preisrichter.schauId, schauId)),
    db.select().from(prEinteilung).where(eq(prEinteilung.schauId, schauId)),
    db.select().from(auszahlung).where(eq(auszahlung.schauId, schauId)),
    db.select().from(stiftung).where(eq(stiftung.schauId, schauId)),
  ]);
  const meldungen = meldungenRoh.map((x) => x.m);
  const meldungenMitAussteller = meldungen;
  const punkte: Punkt[] = [];
  const add = (art: Punkt["art"], text: string, ziel?: string, bis?: Phase, zusatz?: string) => punkte.push({ art, text, ziel, bis, ...(zusatz ? { zusatz } : {}) });
  /** „1 Meldung“, „3 Meldungen“. */
  const anz = (n: number, einzahl: string, mehrzahl: string) => `${n} ${n === 1 ? einzahl : mehrzahl}`;
  const zB = (liste: Eintrag[]) => `z. B. Nr. ${liste.slice(0, 5).map((e) => formatKatalognummer(e)).join(", ")}`;
  const aktiv = eintraege.filter((e) => e.meldungStatus === "bestaetigt");

  // Vorbereitung
  if (!s.stammdatenVersionId) add("fehler", "Rassen und Farbenschläge nicht gewählt", "einstellungen", "vorbereitung");
  if (!gebuehren.some((g) => g.art === "einzeltier" && g.betragCent > 0)) add("hinweis", "Kein Standgeld für Einzeltiere", "einstellungen");
  if (arten.length === 0) add("hinweis", "Keine Preisarten angelegt", "einstellungen");
  // Geldpreise mindestens so hoch wie das Standgeld für ein Einzeltier (PV-Hinweise); gestiftete mindestens wie die
  // Geldpreise der Ausstellungsleitung (AAB XI 1e, f) – nur Hinweise.
  const standgeld = gebuehren.find((g) => g.art === "einzeltier" && !g.jugend)?.betragCent ?? 0;
  const niedrig = arten.filter((a) => a.quelle === "standgeld" && a.betragCent > 0 && a.betragCent < standgeld);
  if (niedrig.length) add("hinweis", `Geldpreis unter dem Standgeld: ${niedrig.map((a) => a.kuerzel).join(", ")}`, "einstellungen");
  const kleinsterGeldpreis = Math.min(...arten.filter((a) => a.quelle === "standgeld" && a.betragCent > 0).map((a) => a.betragCent));
  // Ohne Geldpreis der AL (Minimum der leeren Liste = Infinity) gibt es keinen Vergleich.
  const kleineStiftung = Number.isFinite(kleinsterGeldpreis) ? stiftungen.filter((st) => st.betragCent > 0 && st.anzahl > 0 && st.betragCent / st.anzahl < kleinsterGeldpreis) : [];
  if (kleineStiftung.length) add("hinweis", `Gestiftete Geldpreise unter dem kleinsten Geldpreis der Ausstellungsleitung: ${kleineStiftung.map((st) => st.stifter).join(", ")}`, "preise");
  if (!s.meldeschluss) add("hinweis", "Kein Meldeschluss", "einstellungen");
  // Veterinäramt: Anzeige spätestens 4 Wochen vor der Schau (HMLU-Erlass Nr. 1), Registrierung der Veranstaltung.
  if (s.phase !== "abgeschlossen" && !s.vetAnzeigeAm) {
    const frist = s.bewertungAm ? new Date(Date.parse(`${s.bewertungAm}T12:00:00Z`) - 28 * 86_400_000).toISOString().slice(0, 10) : null;
    const [j, mo, t] = (frist ?? "").split("-");
    if (frist && heuteDe() >= frist) add("fehler", "Veterinäramt-Anzeige fehlt", "einstellungen", "katalog", `fällig ${t}.${mo}.${j}`);
    else add("hinweis", "Schau beim Veterinäramt anzeigen", "einstellungen", undefined, frist ? `bis ${t}.${mo}.${j}` : "Bewertungstag fehlt");
  }
  if (!s.vetRegistriernummer.trim()) add("hinweis", "Registriernummer der Veranstaltung fehlt", "einstellungen");
  // Gemeldete Meldearten ohne Tarif kosten nichts – meist ein vergessener Eintrag.
  const ohneTarif = [...new Set(eintraege.filter((e) => e.meldungStatus !== "abgelehnt" && e.meldungStatus !== "storniert").map((e) => e.art))].filter(
    (art) => !gebuehren.some((g) => g.art === art),
  );
  if (ohneTarif.length) add("hinweis", `Gemeldet ohne Tarif: ${ohneTarif.map((a) => MELDEART_LABEL[a]).join(", ")}`, "einstellungen");
  // Öffentliche Seiten und Meldeformular brauchen Impressum (§ 5 DDG) und Datenschutzhinweise (Art. 13 DSGVO).
  const fehlt = fehlendeVereinsangaben(await ladeVereinsangaben(s.organisationId));
  if (fehlt.length) add(s.phase === "vorbereitung" ? "hinweis" : "fehler", `Impressum und Datenschutz unvollständig: ${fehlt.join(", ")}`, "/verein", "meldung");
  // Tiergesundheit: klinische Untersuchung nach § 7 Abs. 1 GeflPestSchV festlegen (regional, Einlass oder Bescheinigung).
  // Bis zum Katalog festlegen (rot ab der Katalogphase, hält den Wechsel zur Einlieferung auf).
  const frueh = s.phase === "vorbereitung" || s.phase === "meldung";
  if (!s.untersuchung) add(frueh ? "hinweis" : "fehler", "Klinische Untersuchung nicht festgelegt", "einstellungen", "katalog");
  if (s.untersuchung === "einlass" && !s.einlassUntersuchungAm && !frueh && s.phase !== "katalog")
    add("fehler", "Einlassuntersuchung: Datum und Tierarzt fehlen", "einstellungen", "einlieferung");
  {
    const ausland = (await db.select({ r: aussteller.registriernummer }).from(meldung).innerJoin(aussteller, eq(aussteller.id, meldung.ausstellerId)).where(and(eq(meldung.schauId, schauId), ne(meldung.status, "storniert"), ne(meldung.status, "abgelehnt")))).filter((x) => istAuslaendisch(x.r));
    if (ausland.length)
      add(
        "hinweis",
        `${anz(ausland.length, "Meldung", "Meldungen")} aus dem Ausland: mit dem Veterinäramt abstimmen`,
        "meldungen",
      );
  }
  // Impressum des gedruckten Katalogs (Landespressegesetz): Herausgeber mit Anschrift (Vereinsangaben) und Druckerei.
  const gestaltung = await ladeGestaltung(schauId);
  if (!gestaltung.druck.trim())
    add(
      s.phase === "vorbereitung" || s.phase === "meldung" ? "hinweis" : "fehler",
      "Katalog-Impressum: Angabe „Druck“ fehlt",
      "katalog/gestalten",
      "katalog",
    );

  // Meldung
  // Bestätigt, aber nachträglich teurer geworden oder Zahlung storniert: Restbetrag offen.
  // Nach der Abrechnung ist offenes Meldegeld verrechnet – dann zählt nur noch, was die Abrechnung offen zeigt.
  const abgerechnet = new Set(auszahlungen.filter((a) => !a.storniertAm).map((a) => a.ausstellerId));
  const rest = (
    await Promise.all(meldungen.filter((m) => m.status === "bestaetigt" && !abgerechnet.has(m.ausstellerId)).map(async (m) => ({ m, b: await meldebetrag(db, m.id) })))
  ).filter((x) => x.b.bezahltCent < gefordertCent(x.b));
  if (rest.length) add("hinweis", `${anz(rest.length, "Meldung", "Meldungen")} mit offenem Restbetrag`, "meldungen");
  // Hallenkapazität: bestätigte Meldungen werden ohne Rücksicht auf die Kapazität bestätigt (bezahlt ist bezahlt).
  if (s.kapazitaet) {
    const kaefige = aktiv.length;
    if (kaefige > s.kapazitaet) add("hinweis", `${kaefige} Tiere bestätigt, Halle fasst ${s.kapazitaet}`, "einstellungen");
    if (s.phase === "meldung" && kaefige < s.kapazitaet) {
      const belegt = await belegteKaefige(schauId);
      if (belegt >= s.kapazitaet) add("hinweis", `Online-Meldung ist geschlossen: ${belegt} von ${s.kapazitaet} Käfigen belegt, ${belegt - kaefige} unbestätigt`, "meldungen");
    }
  }
  // Barkasse: Tage mit Bargeld, aber ohne Tagesabschluss (heute zählt erst am Abend).
  const kasse = (await ladeKassenbuch(schauId)).filter((t) => t.datum < heuteDe() && ((t.bewegungen.length && !t.abschluss) || t.nachtragOffen));
  if (kasse.length) add("hinweis", `Kassenbuch: ${anz(kasse.length, "Tag", "Tage")} ohne Abschluss oder mit offenem Nachtrag`, "kassenbuch");
  // Storniert oder abgelehnt, aber bezahlt: das Geld fällt aus der Abrechnung.
  // In der Abrechnung ein Fehler: der Abschluss bleibt gesperrt, bis erstattet oder Verfall gebucht ist.
  const zuErstatten = await offeneStornoZahlungen(db, schauId);
  if (zuErstatten.length)
    add(
      s.phase === "abrechnung" ? "fehler" : "hinweis",
      `${anz(zuErstatten.length, "stornierte oder abgelehnte Meldung", "stornierte oder abgelehnte Meldungen")} mit Zahlung`,
      "meldungen",
      undefined,
      zuErstatten.map((x) => x.name).join(", "),
    );
  const offen = meldungen.filter((m) => m.status === "offen");
  if (offen.length) add("hinweis", `${anz(offen.length, "Meldung", "Meldungen")} nicht bestätigt`, "meldungen");
  // Jugendtarif und Katalogbefreiung kommen online aus der Selbstauskunft.
  const selbst = meldungenMitAussteller.filter((m) => m.eingang === "online" && m.status !== "abgelehnt" && m.status !== "storniert" && (m.istJugend || m.istPreisrichter));
  if (selbst.length) add("hinweis", `${anz(selbst.length, "Online-Meldung", "Online-Meldungen")} mit Jugend oder Preisrichter prüfen`, "meldungen");
  const ohneBogen = meldungen.filter((m) => m.status !== "abgelehnt" && m.status !== "storniert" && !m.zustimmungAm);
  if (ohneBogen.length) add("hinweis", `${anz(ohneBogen.length, "Meldung", "Meldungen")} ohne unterschriebenen Meldebogen`, "meldungen");
  // Registriernummer nach § 26 ViehVerkV: ohne sie keine Aufzeichnung der Herkunft.
  const regFalsch = meldungenRoh.filter((x) => x.m.status === "bestaetigt" && !normalisiereRegistriernummer(x.registriernummer));
  if (regFalsch.length) add("fehler", `${anz(regFalsch.length, "Meldung", "Meldungen")} ohne gültige Registriernummer`, "meldungen", "preise");
  if (s.erklaerungen.trim()) {
    const ohneErkl = meldungen.filter((m) => m.status !== "abgelehnt" && m.status !== "storniert" && !m.erklaerungenAm);
    if (ohneErkl.length) add("hinweis", `${anz(ohneErkl.length, "Meldung", "Meldungen")} ohne Pflichterklärungen`, "meldungen");
  }
  // Jugendtarif ohne Geburtsdatum (Papiermeldung): Alter nicht belegt.
  const jugendOhneGeburt = meldungenRoh.filter((x) => x.m.istJugend && x.m.status !== "abgelehnt" && x.m.status !== "storniert" && !x.geburtsdatum);
  if (jugendOhneGeburt.length) add("hinweis", `${anz(jugendOhneGeburt.length, "Jugendmeldung", "Jugendmeldungen")} ohne Geburtsdatum`, "meldungen");
  const jugendOhneEltern = meldungen.filter((m) => m.istJugend && m.status !== "abgelehnt" && m.status !== "storniert" && !m.erziehungsberechtigter.trim());
  if (jugendOhneEltern.length) add("hinweis", `${anz(jugendOhneEltern.length, "Jugendmeldung", "Jugendmeldungen")} ohne Erziehungsberechtigten`, "meldungen");

  // Katalog – nach dem Meldeschluss. Vorher kommen laufend Meldungen dazu; die Nummern vergibt man danach (beim
  // Überspringen der Katalogphase zählt der Phasenwechsel selbst nach).
  const ohneNr = aktiv.filter((e) => e.katalogNr == null);
  if (ohneNr.length && !frueh) add("fehler", `${anz(ohneNr.length, "Tier", "Tiere")} ohne Katalognummer`, "katalog", "katalog");
  if (richter.length === 0) add("hinweis", "Keine Preisrichter angelegt", "preisrichter");
  const zuteil = zuteilung(aktiv, einteilung);
  const ohnePr = aktiv.filter((e) => e.katalogNr != null && !zuteil.has(e.id));
  if (ohnePr.length) {
    add("fehler", `${anz(ohnePr.length, "Tier", "Tiere")} ohne Preisrichter`, "preisrichter", "einlieferung", zB(ohnePr));
  }
  // Eigene v/u.M.-Bewertungen des Obmanns bestätigt ein anderer Obmann – bei nur einem ein anderer Preisrichter.
  const obleute = richter.filter((r) => r.istObmann);
  if (richter.length && !obleute.length) add("hinweis", "Kein Obmann bestimmt", "preisrichter");
  else if (obleute.length === 1 && richter.length > 1)
    add("hinweis", "Nur ein Obmann", "preisrichter", undefined, "seine v und u.M. bestätigt ein anderer Preisrichter");
  else if (obleute.length === 1) add("hinweis", "Nur ein Preisrichter: zweiten anlegen", "preisrichter");
  // Höchstzahl je Preisrichter (gewichtet nach Meldeart) – Hinweis, keine Sperre.
  for (const r of richter) {
    const zahl = gewichteteTierzahl(aktiv.filter((e) => zuteil.get(e.id) === r.id).map((e) => e.art));
    const grenze = r.istObmann ? s.obmannHoechstzahl : s.prHoechstzahl;
    if (zahl > grenze) add("hinweis", `${r.name}: ${zahl} Tiere, höchstens ${grenze}${r.istObmann ? " als Obmann" : ""}`, "preisrichter");
  }
  // Hallenplan – nach dem Meldeschluss, bis die Käfige stehen (Katalog & Halle, Einlieferung). Nur Hinweise: sie halten
  // keinen Phasenwechsel auf. Gerechnet wie die Seite „Hallenplan“ (dieselben Tiere, derselbe Plan).
  if (s.halle && (s.phase === "katalog" || s.phase === "einlieferung")) {
    try {
      const { planTiere } = await import("../routers/katalog");
      const { tiere } = await planTiere(s);
      const plan = planeHalle(s.halle, tiere, s.kaefigMasse, s.hallenplanFest);
      if (plan.nichtPlatziert.length) add("hinweis", `${anz(plan.nichtPlatziert.length, "Tier", "Tiere")} ohne Platz`, "hallenplan");
      const front = frontFehler(halleNormal(s.halle), plan);
      if (front.length) add("hinweis", "Käfigfront zur Wand oder zu einer Reihe", "hallenplan", undefined, `${front.slice(0, 3).join(", ")}${front.length > 3 ? " …" : ""}`);
      if (s.hallenplanFest) {
        if (planUnordnung(plan, s.halle.richtung ?? "quer", s.katalogGedruckt).nichtInFolge > 0) add("hinweis", `${s.katalogGedruckt ? "Käfignummern" : "Nummern"} nicht in Planfolge`, "hallenplan");
      } else if (s.katalogGedruckt) add("hinweis", "Hallenplan nicht festgeschrieben", "hallenplan");
    } catch (e) {
      // Die Prüfliste soll nie am Plan scheitern; der Hallenplan zeigt den Fehler selbst.
      console.error("[pruefung] Hallenplan nicht berechnet:", e);
    }
  }
  // PINs braucht es erst am Tablet; vor dem Meldeschluss wäre das nur Rauschen.
  const ohnePin = richter.filter((r) => !r.pinHash);
  if (ohnePin.length && !frueh) add("hinweis", `${ohnePin.length} Preisrichter ohne Tablet-PIN`, "preisrichter");

  // Einlieferung
  if (["einlieferung", "bewertung", "preise", "schau", "abrechnung"].includes(s.phase)) {
    const nichtDa = aktiv.filter((e) => e.status === "katalogisiert" && !e.bewertet);
    if (nichtDa.length) add("hinweis", `${anz(nichtDa.length, "Tier", "Tiere")} weder eingeliefert noch fehlend`, "einlieferung");
    // Bewertet, aber nie eingeliefert: meist fehlt der geprüfte Nachweis – die Tierliste braucht die Einlieferung.
    const bewertetNichtEingeliefert = aktiv.filter((e) => e.status === "katalogisiert" && e.bewertet);
    if (bewertetNichtEingeliefert.length) {
      add("fehler", `${anz(bewertetNichtEingeliefert.length, "Tier", "Tiere")} bewertet, aber nicht als eingeliefert abgehakt`, "einlieferung", "preise", zB(bewertetNichtEingeliefert));
    }
    // Nur wer impfpflichtige Tiere eingeliefert hat, braucht den geprüften Nachweis – dann ist es ein Fehler.
    const ohneVet = meldungen.filter((m) => {
      if (m.status !== "bestaetigt" || m.vetGeprueftAm) return false;
      const tiere = aktiv.filter((e) => e.meldungId === m.id && (e.status === "eingeliefert" || e.status === "ausgesetzt"));
      return tiere.length > 0 && nachweisStand(m, tiere.map((t) => t.tierart), s, tiere[0]?.registriernummer).noetig.length > 0;
    });
    // Kennzeichnung der Tiere (Fußring) gehört in die Liste für das Veterinäramt.
    const daOhneRing = aktiv.filter((e) => (e.status === "eingeliefert" || e.status === "ausgesetzt") && !e.ringnummern.trim());
    if (daOhneRing.length)
      add("fehler", `${anz(daOhneRing.length, "eingeliefertes Tier", "eingelieferte Tiere")} ohne Ringnummer`, "einlieferung", "preise", zB(daOhneRing));
    const schauJahr = Number((s.bewertungAm ?? heuteDe()).slice(0, 4));
    const ringjahr = aktiv.filter((e) => e.status !== "fehlt" && !ringjahrPasst(e.ringnummern, e.alter, schauJahr));
    if (ringjahr.length) add("hinweis", `${anz(ringjahr.length, "Jungtier", "Jungtiere")}, ${ringjahr.length === 1 ? "dessen" : "deren"} Ring nicht zu ${schauJahr} passt`, "einlieferung", undefined, zB(ringjahr));
    if (ohneVet.length) add("fehler", `${anz(ohneVet.length, "Aussteller", "Aussteller")}: Impf- oder Untersuchungsnachweis nicht geprüft`, "einlieferung", "preise");
  }

  // Bewertung
  const zuBewerten = aktiv.filter((e) => e.status !== "fehlt" && e.katalogNr != null);
  const unbewertet = zuBewerten.filter((e) => !e.bewertet);
  if (["bewertung", "preise", "schau"].includes(s.phase) && unbewertet.length) {
    add("fehler", `${anz(unbewertet.length, "Tier", "Tiere")} nicht bewertet`, "bewertung", "preise");
  }
  const skala = skalaVon(s);
  const obmannOffen = aktiv.filter((e) => brauchtObmann({ punkte: e.punkte, sondernote: e.sondernote }, skala) && !e.obmannBestaetigtAm);
  if (obmannOffen.length) add("fehler", `${anz(obmannOffen.length, "Bewertung wartet", "Bewertungen warten")} auf den Obmann`, "bewertung", "preise");

  // Preise
  if (["preise", "schau", "abrechnung"].includes(s.phase)) {
    const k = kontingente(aktiv, zuteil, richter, arten, s.kontingentJe);
    const rest = k.flatMap((r) => r.arten.filter((a) => a.vergeben < a.verfuegbar).map((a) => `${r.name}: ${a.verfuegbar - a.vergeben} ${a.kuerzel}`));
    if (rest.length) add("hinweis", `Nicht vergebene Preise: ${rest.join("; ")}`, "preise");
    // Überzogen z. B. nach einer Änderung des Kontingents oder fehlenden Tieren.
    const ueber = k.flatMap((r) => r.arten.filter((a) => a.vergeben > a.verfuegbar).map((a) => `${r.name}: ${a.vergeben} von ${a.verfuegbar} ${a.kuerzel}`));
    if (ueber.length) add("fehler", `Kontingent überschritten: ${ueber.join("; ")}`, "preise", "preise");
    // Stiftungspreise: gestiftete Zahl muss die Vergaben decken.
    for (const a of arten.filter((x) => x.quelle === "stiftung")) {
      const vergeben = aktiv.reduce((n, e) => n + e.preise.filter((p) => p.preisartId === a.id).length, 0);
      // Wie bei der Vergabe: gestiftete Anzahl plus „zusätzlich je Preisrichter“.
      const verfuegbar = stiftungen.filter((st) => st.preisartId === a.id).reduce((n, st) => n + st.anzahl, 0) + a.anzahlProPreisrichter * richter.length;
      if (vergeben > verfuegbar) add("fehler", `Stiftungspreis ${a.kuerzel}: ${vergeben} vergeben, ${verfuegbar} verfügbar`, "preise", "preise");
    }
    if (!s.ergebnisseFreigegeben) add("hinweis", "Ergebnisse nicht freigegeben", "preise");
    const offen = offeneStiftungen(stiftungen, aktiv);
    if (offen.length) add("hinweis", `Gestiftete Preise nicht vergeben: ${offen.join("; ")}`, "preise");
  }
  // Stiftung ohne Preisart (z. B. online mit der Meldung zugesagt): zählt für keinen Preis, das Geld läge still beim Verein.
  const ohneArt = stiftungen.filter((st) => st.preisartId == null);
  if (ohneArt.length) {
    const spaet = ["preise", "schau", "abrechnung"].includes(s.phase);
    add(spaet ? "fehler" : "hinweis", `${anz(ohneArt.length, "Stiftung", "Stiftungen")} ohne Preisart`, "preise", "preise", ohneArt.map((st) => st.stifter).join(", "));
  }

  // Abrechnung
  if (s.phase === "abrechnung" || s.phase === "abgeschlossen") {
    // Wie beim Abschluss: offen ist, wer noch etwas bekommt oder zahlen muss (Saldo 0 braucht keine Quittung).
    const { abrechnungListe } = await import("../routers/kasse");
    const fehlt = (await abrechnungListe(schauId)).filter((z) => z.nochOffenCent !== 0).length;
    if (fehlt) add("hinweis", `${fehlt} Aussteller nicht abgerechnet`, "abrechnung");
  }

  // Erst der Abschluss lässt die Speicherfristen laufen (IBAN, Geburtsdaten, PINs 30 Tage danach).
  // Abschluss empfehlen: 8 Wochen nach der Schau, bei einer späteren Reklamationsfrist erst nach deren Ende.
  if (s.phase !== "abgeschlossen" && s.bewertungAm) {
    const achtWochen = new Date(Date.parse(`${s.bewertungAm}T12:00:00Z`) + 56 * 86_400_000).toISOString().slice(0, 10);
    const ab = s.reklamationsfrist && s.reklamationsfrist > achtWochen ? s.reklamationsfrist : achtWochen;
    if (heuteDe() > ab)
      add("hinweis", "Schau nach der Abrechnung abschließen", undefined, undefined, s.reklamationsfrist ? "Reklamationsfrist abgelaufen" : "über 8 Wochen her");
  }

  if (!punkte.some((p) => p.art !== "ok")) add("ok", "Alles erledigt für diese Phase");
  return punkte;
}
