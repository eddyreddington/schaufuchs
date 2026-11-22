// Automatisches Wiederholen beim Speichern im Hallenplan-Editor (hallenplan-entwurf.ts): rein, mit eingesetztem Senden und Warten.

/**
 * Verbindungsfehler: Der Server hat nicht geantwortet – das Netz war weg („Failed to fetch“), ein Proxy meldete 502/503/504
 * oder die Antwort war unlesbar (tRPC-Fehler ohne `data`). Alles andere ist eine Antwort des Servers und ein echter Fehler.
 */
export function istVerbindungsfehler(e: unknown): boolean {
  if (!e || typeof e !== "object") return false;
  const x = e as { name?: string; message?: string; data?: { httpStatus?: number } | null; meta?: { response?: { status?: number } } };
  const status = x.data?.httpStatus ?? x.meta?.response?.status;
  if (status === 502 || status === 503 || status === 504) return true;
  if (x.message === "Failed to fetch") return true;
  return x.name === "TRPCClientError" && x.data == null;
}

const istKonflikt = (e: unknown) => (e as { data?: { code?: string } | null } | null)?.data?.code === "CONFLICT";

/** Wartezeit vor dem n-ten erneuten Senden (n ab 1): 1 s, 2 s, 4 s … höchstens 30 s. */
export function wartezeit(n: number): number {
  return Math.min(1000 * 2 ** (n - 1), 30_000);
}

/**
 * Sendet, bis es gelingt oder ein echter Fehler kommt (der wird geworfen). Nach einem Verbindungsfehler wird dieselbe
 * Speicherung nach `wartezeit` erneut gesendet. Bekommt eine Wiederholung CONFLICT, kam die erste Anfrage womöglich doch an
 * (nur die Antwort ging verloren): `schonAngekommen` prüft am Server, ob dort schon der neue Stand ist – dann gilt die
 * Speicherung als gelungen. `beiVerbindung(true)` beim ersten Verbindungsfehler, `(false)` am Ende; `weiter` false (Seite
 * verlassen) beendet das Warten mit dem letzten Fehler.
 */
export async function mitWiederholen<T>(x: {
  senden: () => Promise<T>;
  warten: (ms: number) => Promise<void>;
  schonAngekommen: () => Promise<boolean>;
  beiVerbindung?: (weg: boolean) => void;
  weiter?: () => boolean;
}): Promise<{ wert: T } | { schonAngekommen: true }> {
  let fehlversuche = 0;
  let weg = false;
  try {
    for (;;) {
      try {
        return { wert: await x.senden() };
      } catch (f) {
        if (fehlversuche > 0 && istKonflikt(f)) {
          // null: Serverstand nicht zu holen – wieder warten und noch einmal senden (der nächste Konflikt fragt erneut).
          const da = await x.schonAngekommen().catch((g: unknown) => {
            if (istVerbindungsfehler(g)) return null;
            throw f;
          });
          if (da) return { schonAngekommen: true };
          if (da === false) throw f;
        } else if (!istVerbindungsfehler(f)) throw f;
        if (x.weiter && !x.weiter()) throw f;
        fehlversuche++;
        if (!weg) x.beiVerbindung?.((weg = true));
        await x.warten(wartezeit(fehlversuche));
        if (x.weiter && !x.weiter()) throw f;
      }
    }
  } finally {
    if (weg) x.beiVerbindung?.(false);
  }
}

/** Warten bis zum nächsten Versuch – sofort weiter, sobald der Browser wieder Netz meldet (Ereignis „online“). */
export function wartenOderOnline(ms: number, ziel: EventTarget = window): Promise<void> {
  return new Promise((fertig) => {
    const ende = () => {
      clearTimeout(uhr);
      ziel.removeEventListener("online", ende);
      fertig();
    };
    const uhr = setTimeout(ende, ms);
    ziel.addEventListener("online", ende);
  });
}
