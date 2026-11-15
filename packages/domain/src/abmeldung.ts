/**
 * Automatische Abmeldung nach Untätigkeit, je Rolle vom Administrator einstellbar (Verein und Datenschutz).
 * Untätig heißt: keine Eingabe (Tippen, Klicken, Tastatur). Die Oberfläche meldet bei jedem Aufruf, wie lange die letzte
 * Eingabe her ist, und schickt bei Eingaben regelmäßig ein Lebenszeichen; der Server prüft die Frist bei jedem Aufruf.
 */
export const ABMELDUNG_MINUTEN = [5, 10, 15, 30, 60, 120] as const;
export type AbmeldungRolle = "admin" | "mitarbeiter" | "preisrichter";
export type Abmeldung = Record<AbmeldungRolle, number>;

export const ABMELDUNG_ROLLEN: { rolle: AbmeldungRolle; label: string }[] = [
  { rolle: "admin", label: "Administratoren" },
  { rolle: "mitarbeiter", label: "Mitarbeiter" },
  { rolle: "preisrichter", label: "Preisrichter (Bewertung)" },
];

export const ABMELDUNG_VORGABE: Abmeldung = { admin: 60, mitarbeiter: 120, preisrichter: 120 };

/** Spielraum für das Lebenszeichen (kommt höchstens jede Minute) und Uhrabweichungen. */
export const ABMELDUNG_KULANZ_MS = 90_000;

/** Gespeicherter Wert (jsonb, ggf. alt oder unvollständig) → gültige Einstellung; Unbekanntes gilt als Vorgabe. */
export function abmeldungLesen(wert: unknown): Abmeldung {
  const roh = (wert && typeof wert === "object" ? wert : {}) as Record<string, unknown>;
  const aus = { ...ABMELDUNG_VORGABE };
  for (const { rolle } of ABMELDUNG_ROLLEN) {
    const m = roh[rolle];
    if (typeof m === "number" && (ABMELDUNG_MINUTEN as readonly number[]).includes(m)) aus[rolle] = m;
  }
  return aus;
}

/**
 * Letzte Eingabe, wie sie für die Sitzung gilt. `eingabeVorMs`: Angabe der Oberfläche, wie lange die letzte Eingabe her ist
 * (fehlt sie, zählt der Aufruf selbst als Eingabe, z. B. ein Download per Link). Die gespeicherte Zeit wird nie
 * zurückgesetzt und nie in die Zukunft verschoben.
 */
export function letzteEingabe(gespeichert: Date, jetzt: Date, eingabeVorMs: number | null | undefined): Date {
  const vor = eingabeVorMs == null || !Number.isFinite(eingabeVorMs) ? 0 : Math.max(0, eingabeVorMs);
  const gemeldet = Math.min(jetzt.getTime(), jetzt.getTime() - vor);
  return new Date(Math.max(gespeichert.getTime(), gemeldet));
}

/** Ist die Sitzung wegen Untätigkeit abgelaufen? `seit`: letzte Eingabe, die für die Prüfung zählt. */
export function untaetigAbgelaufen(seit: Date, jetzt: Date, minuten: number): boolean {
  return jetzt.getTime() - seit.getTime() > minuten * 60_000 + ABMELDUNG_KULANZ_MS;
}
