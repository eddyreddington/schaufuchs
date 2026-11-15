/**
 * Kommende Schauen: Termine anderer Schauen für die Katalogseite „Kommende Schauen“, Austausch per iCal (RFC 5545).
 * Rein fachlich, ohne I/O – Abruf und Speichern stehen im Server (services/termine.ts).
 */
import { oeffnungszeitenZeilen } from "./termine";

export const TERMIN_EBENEN = ["kreis", "land", "bund", "europa"] as const;
export type TerminEbene = (typeof TERMIN_EBENEN)[number];

export const TERMIN_EBENE_INFO: Record<TerminEbene, { name: string; titel: string }> = {
  kreis: { name: "Kreis", titel: "Im Kreis" },
  land: { name: "Land", titel: "Landesverband" },
  bund: { name: "Bund", titel: "Deutschland" },
  europa: { name: "Europa", titel: "Europa" },
};

/** Höchstens so viele Termine je Ebene auf der Katalogseite (die frühesten). */
export const KOMMENDE_JE_EBENE = 10;

export interface KommenderTermin {
  name: string;
  ort: string;
  /** JJJJ-MM-TT */
  von: string;
  bis: string | null;
  ebene: TerminEbene;
  kreisverband: string;
  landesverband: string;
  /** Kurze Quellenangabe für den Katalog, z. B. „eigene Eintragung“ oder „Kalender KV Musterkreis“. */
  quelle: string;
  /** Eigene Schauen des Vereins gehören immer zum Kreis, auch ohne Kreisangabe. */
  eigene?: boolean;
}

// ── Datum ───────────────────────────────────────────────────────────────

const DATUM = /^\d{4}-\d{2}-\d{2}$/;

/** Gültiges Kalenderdatum JJJJ-MM-TT? */
export function istDatum(d: string): boolean {
  if (!DATUM.test(d)) return false;
  const t = Date.parse(`${d}T12:00:00Z`);
  return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === d;
}

export function plusTage(d: string, n: number): string {
  const t = new Date(`${d}T12:00:00Z`);
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
}

/** 0 = Sonntag … 6 = Samstag */
function wochentag(d: string): number {
  return new Date(`${d}T12:00:00Z`).getUTCDay();
}

/** „5.–7. Dezember 2026“, „30.11.–2.12.2026“, „6. Dezember 2026“ – für Katalog und Oberfläche. */
export function zeitraumDe(von: string, bis: string | null): string {
  const monate = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
  const [vj, vm, vt] = von.split("-").map(Number) as [number, number, number];
  if (!bis || bis <= von) return `${vt}. ${monate[vm - 1]} ${vj}`;
  const [bj, bm, bt] = bis.split("-").map(Number) as [number, number, number];
  if (vj === bj && vm === bm) return `${vt}.–${bt}. ${monate[bm - 1]} ${bj}`;
  if (vj === bj) return `${vt}. ${monate[vm - 1]} – ${bt}. ${monate[bm - 1]} ${bj}`;
  return `${vt}. ${monate[vm - 1]} ${vj} – ${bt}. ${monate[bm - 1]} ${bj}`;
}

// ── Tage der eigenen Schau ──────────────────────────────────────────────

const TAG_NR: Record<string, number> = { so: 0, mo: 1, di: 2, mi: 3, do: 4, fr: 5, sa: 6 };

/**
 * Öffnungstage einer Schau. Die Schau hat kein eigenes Feld dafür, nur den Bewertungstag und die Öffnungszeiten als Text:
 * stehen dort Daten („Sa. 12.12.2026 9–18 Uhr“, auch „12.12.“), zählen diese; sonst die genannten Wochentage nach dem
 * Bewertungstag (innerhalb einer Woche). Ohne beides der Bewertungstag selbst. null ohne Bewertungstag und ohne Datum.
 */
export function schauTage(bewertungAm: string | null, oeffnungszeiten: string): { von: string; bis: string } | null {
  const tage: string[] = [];
  const jahrVorgabe = bewertungAm ? Number(bewertungAm.slice(0, 4)) : null;
  for (const zeile of oeffnungszeitenZeilen(oeffnungszeiten)) {
    // Jahr vierstellig (auch nach Leerzeichen) oder zweistellig direkt dahinter – „1.1. 10–16 Uhr“ ist kein Jahr 10.
    const m = zeile.match(/(?<!\d)(\d{1,2})\.\s?(\d{1,2})\.(?:\s?(\d{4})|(\d{2}))?(?![\d:.–-])/) ?? zeile.match(/(?<!\d)(\d{1,2})\.\s?(\d{1,2})\./);
    if (m) {
      const jahrText = m[3] ?? m[4];
      let jahr = jahrText ? Number(jahrText.length === 2 ? `20${jahrText}` : jahrText) : jahrVorgabe;
      if (jahr == null) continue;
      let d = `${jahr}-${m[2]!.padStart(2, "0")}-${m[1]!.padStart(2, "0")}`;
      // Ohne Jahr über den Jahreswechsel: „2.1.“ nach einer Bewertung im Dezember gehört ins nächste Jahr.
      if (!jahrText && bewertungAm && istDatum(d) && d < bewertungAm) d = `${++jahr}-${m[2]!.padStart(2, "0")}-${m[1]!.padStart(2, "0")}`;
      if (istDatum(d)) tage.push(d);
      continue;
    }
    const w = zeile.match(/^(Mo|Di|Mi|Do|Fr|Sa|So)/i);
    if (w && bewertungAm) {
      const ziel = TAG_NR[w[1]!.toLowerCase()]!;
      for (let i = 1; i <= 7; i++) {
        const d = plusTage(bewertungAm, i);
        if (wochentag(d) === ziel) {
          tage.push(d);
          break;
        }
      }
    }
  }
  if (!tage.length) return bewertungAm ? { von: bewertungAm, bis: bewertungAm } : null;
  tage.sort();
  return { von: tage[0]!, bis: tage[tage.length - 1]! };
}

// ── Auswahl für den Katalog ─────────────────────────────────────────────

/** Vergleich von Verbandsnamen: klein, ohne Satzzeichen und Zusätze wie „KV“, „Kreisverband“, „e. V.“. */
export function verbandSchluessel(name: string): string {
  return name
    .toLocaleLowerCase("de")
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/ß/g, "ss")
    .replace(/\be\.?\s?v\.?/g, " ")
    .replace(/\b(kreisverband|kv|landesverband|lv|der|des|rassegefluegelzuechter|rassegeflugelzuchter|rassegefluegelzucht)\b/g, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** Wert der Auswahl „keine“ bei Kreis bzw. Landesverband: diese Ebene steht nicht im Katalog. */
export const TERMINE_KEINE = "(keine)";

export interface KommendeWahl {
  /** Termine ab diesem Tag (ausschließlich): Ende der eigenen Schau. */
  nach: string;
  /** Nur Kreisschauen dieses Kreisverbands; leer = alle, TERMINE_KEINE = keine (auch nicht die eigenen). */
  kreis: string;
  /** Nur Landesschauen dieses Landesverbands; leer = alle, TERMINE_KEINE = keine. */
  land: string;
  jeEbene?: number;
}

/**
 * Termine für die Katalogseite: nach der eigenen Schau, Kreis- und Landesebene auf den gewählten Verband begrenzt,
 * gruppiert nach Ebene (Kreis, Land, Bund, Europa), darin nach Datum; je Ebene höchstens `jeEbene` (die frühesten).
 * Doppelte Einträge (gleicher Name, gleicher Beginn) erscheinen einmal.
 */
export function kommendeSchauen(termine: KommenderTermin[], wahl: KommendeWahl): { ebene: TerminEbene; termine: KommenderTermin[]; gekuerzt: number }[] {
  const kreis = verbandSchluessel(wahl.kreis);
  const land = verbandSchluessel(wahl.land);
  const passt = (t: KommenderTermin) => {
    if (t.von <= wahl.nach) return false;
    if ((t.ebene === "kreis" && wahl.kreis === TERMINE_KEINE) || (t.ebene === "land" && wahl.land === TERMINE_KEINE)) return false;
    if (t.ebene === "kreis" && kreis && !t.eigene && verbandSchluessel(t.kreisverband) !== kreis) return false;
    if (t.ebene === "land" && land && verbandSchluessel(t.landesverband) !== land) return false;
    return true;
  };
  const gesehen = new Set<string>();
  const eindeutig = termine
    .filter(passt)
    .sort((a, b) => a.von.localeCompare(b.von) || a.name.localeCompare(b.name, "de"))
    .filter((t) => {
      const k = `${verbandSchluessel(t.name)}|${t.von}`;
      if (gesehen.has(k)) return false;
      gesehen.add(k);
      return true;
    });
  const max = wahl.jeEbene ?? KOMMENDE_JE_EBENE;
  return TERMIN_EBENEN.map((ebene) => {
    const alle = eindeutig.filter((t) => t.ebene === ebene);
    return { ebene, termine: alle.slice(0, max), gekuerzt: Math.max(0, alle.length - max) };
  }).filter((g) => g.termine.length);
}

// ── iCal lesen ──────────────────────────────────────────────────────────

export interface IcalTermin {
  uid: string;
  name: string;
  ort: string;
  von: string;
  bis: string | null;
  url: string;
}

/** Höchstens so viele Termine aus einer Datei (Schutz vor riesigen Kalendern). */
export const ICAL_MAX_TERMINE = 2000;

function icalText(wert: string): string {
  return wert.replace(/\\([\\;,nN])/g, (_, z: string) => (z === "n" || z === "N" ? "\n" : z));
}

/** Datum aus DTSTART/DTEND: „20261205“, „20261205T090000“, „20261205T090000Z“ (UTC → deutsche Zeit). */
function icalDatum(wert: string, utcNachBerlin: boolean): string | null {
  const m = wert.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/);
  if (!m) return null;
  let d = `${m[1]}-${m[2]}-${m[3]}`;
  if (m[7] && utcNachBerlin) {
    const t = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5])));
    d = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(t);
  }
  return istDatum(d) ? d : null;
}

/**
 * Termine (VEVENT) aus einer iCal-Datei: Name (SUMMARY), Ort (LOCATION), Beginn und Ende (ganztägig oder mit Uhrzeit),
 * UID und Link. Wiederholungen (RRULE) und abgesagte Termine (STATUS:CANCELLED) bleiben weg, ebenso Termine ohne
 * gültigen Beginn. Ganztägiges DTEND ist der Tag danach (RFC 5545) – `bis` ist der letzte Tag.
 */
export function leseIcal(text: string): IcalTermin[] {
  // Gefaltete Zeilen (Fortsetzung beginnt mit Leerzeichen oder Tab) zusammenfügen.
  const zeilen = text.replace(/\r\n|\r/g, "\n").replace(/\n[ \t]/g, "").split("\n");
  const termine: IcalTermin[] = [];
  let e: Record<string, { wert: string; param: string }> | null = null;
  for (const zeile of zeilen) {
    if (zeile === "BEGIN:VEVENT") {
      e = {};
      continue;
    }
    if (zeile === "END:VEVENT") {
      if (e) {
        const t = terminAus(e);
        if (t) termine.push(t);
        if (termine.length >= ICAL_MAX_TERMINE) break;
      }
      e = null;
      continue;
    }
    if (!e) continue;
    const doppelpunkt = suchDoppelpunkt(zeile);
    if (doppelpunkt < 0) continue;
    const kopf = zeile.slice(0, doppelpunkt);
    const [name, ...param] = kopf.split(";");
    const n = name!.toUpperCase();
    if (!(n in e)) e[n] = { wert: zeile.slice(doppelpunkt + 1), param: param.join(";").toUpperCase() };
  }
  return termine;
}

/** Erster Doppelpunkt außerhalb von Anführungszeichen (Parameter wie TZID="Europe/Berlin" oder ALTREP="http://…"). */
function suchDoppelpunkt(zeile: string): number {
  let inZitat = false;
  for (let i = 0; i < zeile.length; i++) {
    if (zeile[i] === '"') inZitat = !inZitat;
    else if (zeile[i] === ":" && !inZitat) return i;
  }
  return -1;
}

function terminAus(e: Record<string, { wert: string; param: string }>): IcalTermin | null {
  if (e.RRULE || e["STATUS"]?.wert.toUpperCase() === "CANCELLED") return null;
  const start = e.DTSTART;
  if (!start) return null;
  const ganztaegig = start.param.includes("VALUE=DATE") && !start.param.includes("VALUE=DATE-TIME");
  const von = icalDatum(start.wert.trim(), true);
  if (!von) return null;
  let bis: string | null = null;
  if (e.DTEND) {
    const ende = icalDatum(e.DTEND.wert.trim(), true);
    const ganztaegigEnde = ganztaegig || /^\d{8}$/.test(e.DTEND.wert.trim());
    if (ende) bis = ganztaegigEnde ? plusTage(ende, -1) : ende;
  } else if (e.DURATION) {
    const tage = e.DURATION.wert.match(/^P(\d+)D$/)?.[1];
    if (tage && Number(tage) > 0) bis = plusTage(von, Number(tage) - 1);
  }
  if (bis && bis <= von) bis = null;
  const name = icalText(e.SUMMARY?.wert ?? "").trim().replace(/\s+/g, " ").slice(0, 200);
  if (!name) return null;
  const url = (e.URL?.wert ?? "").trim();
  return {
    uid: (e.UID?.wert ?? "").trim().slice(0, 300) || `${von}|${name}`,
    name,
    ort: icalText(e.LOCATION?.wert ?? "").trim().replace(/\s+/g, " ").slice(0, 200),
    von,
    bis,
    url: /^https?:\/\/\S+$/i.test(url) ? url.slice(0, 500) : "",
  };
}

// ── iCal schreiben ──────────────────────────────────────────────────────

function icalEscape(t: string): string {
  return t.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** Zeilen über 75 Byte falten (RFC 5545, 3.1) – ohne ein Zeichen (UTF-8) zu zerteilen. */
function falte(zeile: string): string {
  const teile: string[] = [];
  let aktuell = "";
  let bytes = 0;
  for (const z of zeile) {
    const b = new TextEncoder().encode(z).length;
    if (bytes + b > (teile.length ? 74 : 75)) {
      teile.push(aktuell);
      aktuell = "";
      bytes = 0;
    }
    aktuell += z;
    bytes += b;
  }
  teile.push(aktuell);
  return teile.join("\r\n ");
}

/** iCal-Datei mit ganztägigen Terminen (eigene Schauen des Vereins zum Abonnieren). `stempel`: Zeitpunkt der Erzeugung. */
export function schreibeIcal(
  kalender: { name: string; prodid: string },
  termine: { uid: string; name: string; ort: string; von: string; bis: string | null; url?: string; beschreibung?: string }[],
  stempel: Date,
): string {
  const dtstamp = stempel.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const tag = (d: string) => d.replace(/-/g, "");
  const zeilen = ["BEGIN:VCALENDAR", "VERSION:2.0", `PRODID:${icalEscape(kalender.prodid)}`, "CALSCALE:GREGORIAN", "METHOD:PUBLISH", `X-WR-CALNAME:${icalEscape(kalender.name)}`];
  for (const t of termine) {
    zeilen.push(
      "BEGIN:VEVENT",
      `UID:${icalEscape(t.uid)}`,
      `DTSTAMP:${dtstamp}`,
      `DTSTART;VALUE=DATE:${tag(t.von)}`,
      `DTEND;VALUE=DATE:${tag(plusTage(t.bis && t.bis > t.von ? t.bis : t.von, 1))}`,
      `SUMMARY:${icalEscape(t.name)}`,
      ...(t.ort ? [`LOCATION:${icalEscape(t.ort)}`] : []),
      ...(t.url ? [`URL:${t.url}`] : []),
      ...(t.beschreibung ? [`DESCRIPTION:${icalEscape(t.beschreibung)}`] : []),
      "END:VEVENT",
    );
  }
  zeilen.push("END:VCALENDAR");
  return zeilen.map(falte).join("\r\n") + "\r\n";
}

// ── Abgleich mit einem abonnierten Kalender ─────────────────────────────

export type TerminStatus = "vorschlag" | "uebernommen" | "verworfen";

export interface GespeicherterTermin {
  id: number;
  uid: string;
  name: string;
  ort: string;
  von: string;
  bis: string | null;
  status: TerminStatus;
}

/** Angaben, die die Quelle anders meldet als übernommen; `entfallen`: steht nicht mehr im Kalender. */
export type Abweichung = { name: string; ort: string; von: string; bis: string | null } | { entfallen: true };

export interface Abgleich {
  /** Neu im Kalender: als Vorschlag anlegen. */
  neu: IcalTermin[];
  /** Noch nicht geprüfte Vorschläge: dürfen still aktualisiert werden (stehen noch nicht im Katalog). */
  vorschlagAktualisieren: { id: number; termin: IcalTermin }[];
  /** Vorschläge, die nicht mehr im Kalender stehen: entfernen. */
  vorschlagEntfernen: number[];
  /** Übernommene Termine, die die Quelle anders meldet: nicht überschreiben, sondern als Abweichung zeigen. */
  abweichung: { id: number; abweichung: Abweichung }[];
  /** Übernommene Termine, deren Abweichung sich erledigt hat (Quelle wieder gleich). */
  abweichungErledigt: number[];
}

const gleich = (a: { name: string; ort: string; von: string; bis: string | null }, b: { name: string; ort: string; von: string; bis: string | null }) =>
  a.name === b.name && a.ort === b.ort && a.von === b.von && (a.bis ?? null) === (b.bis ?? null);

/**
 * Vergleicht die gespeicherten Termine eines Abos mit dem neu abgerufenen Kalender. Vergangene Termine (vor `heute`)
 * bleiben unberührt – Kalender löschen alte Einträge oft. Verworfene Termine bleiben verworfen.
 */
export function gleicheAb(vorhanden: GespeicherterTermin[], abgerufen: IcalTermin[], heute: string): Abgleich {
  const r: Abgleich = { neu: [], vorschlagAktualisieren: [], vorschlagEntfernen: [], abweichung: [], abweichungErledigt: [] };
  const nachUid = new Map(vorhanden.map((v) => [v.uid, v]));
  const imKalender = new Set<string>();
  for (const t of abgerufen) {
    if (imKalender.has(t.uid)) continue;
    imKalender.add(t.uid);
    const v = nachUid.get(t.uid);
    if (!v) {
      if ((t.bis ?? t.von) >= heute) r.neu.push(t);
      continue;
    }
    if (v.status === "vorschlag") {
      if (!gleich(v, t)) r.vorschlagAktualisieren.push({ id: v.id, termin: t });
    } else if (v.status === "uebernommen") {
      if (gleich(v, t)) r.abweichungErledigt.push(v.id);
      else r.abweichung.push({ id: v.id, abweichung: { name: t.name, ort: t.ort, von: t.von, bis: t.bis } });
    }
  }
  for (const v of vorhanden) {
    if (imKalender.has(v.uid) || (v.bis ?? v.von) < heute) continue;
    if (v.status === "vorschlag") r.vorschlagEntfernen.push(v.id);
    else if (v.status === "uebernommen") r.abweichung.push({ id: v.id, abweichung: { entfallen: true } });
  }
  return r;
}
