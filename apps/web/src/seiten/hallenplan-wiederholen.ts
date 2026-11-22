// Automatisches Wiederholen beim Speichern im Hallenplan-Editor (hallenplan-entwurf.ts): rein, mit eingesetztem Senden und Warten.
import { type Hallenplan, plattenStand } from "@schau/domain";

/**
 * Art eines Fehlers beim Senden. „verbindung“: keine Antwort – das Netz war weg (fetch scheitert mit einem TypeError,
 * je Browser mit anderem Text: „Failed to fetch“, „Load failed“ …) oder ein Proxy meldete 502/503/504. „unlesbar“: eine
 * Antwort, die kein JSON ist (tRPC-Fehler ohne `data`, z. B. Text-500 des Servers oder Fehlerseite des Proxys) – das kann
 * ein Neustart sein, aber auch ein bleibender Fehler, deshalb nur begrenzt wiederholen. Alles andere ist „echt“.
 */
export type FehlerArt = "verbindung" | "unlesbar" | "echt";
export function fehlerArt(e: unknown): FehlerArt {
  if (!e || typeof e !== "object") return "echt";
  const x = e as { name?: string; message?: string; data?: { httpStatus?: number } | null; cause?: unknown };
  const status = x.data?.httpStatus;
  if (status === 502 || status === 503 || status === 504) return "verbindung";
  if (x.message === "Failed to fetch") return "verbindung";
  if (x.name !== "TRPCClientError" || x.data != null) return "echt";
  return x.cause instanceof TypeError ? "verbindung" : "unlesbar";
}

/** Keine Antwort vom Server (siehe `fehlerArt`): wird ohne Obergrenze wiederholt. */
export const istVerbindungsfehler = (e: unknown) => fehlerArt(e) === "verbindung";

/** So oft wird eine unlesbare Antwort höchstens wiederholt (Wartezeit zusammen gut 30 s), dann gilt sie als Fehler. */
export const UNLESBAR_HOECHSTENS = 5;

const istKonflikt = (e: unknown) => (e as { data?: { code?: string } | null } | null)?.data?.code === "CONFLICT";

/** Wartezeit vor dem n-ten erneuten Senden (n ab 1): 1 s, 2 s, 4 s … höchstens 30 s. */
export function wartezeit(n: number): number {
  return Math.min(1000 * 2 ** (n - 1), 30_000);
}

/**
 * Sendet, bis es gelingt oder ein echter Fehler kommt (der wird geworfen). Nach einem Verbindungsfehler wird dieselbe
 * Speicherung nach `wartezeit` erneut gesendet, nach einer unlesbaren Antwort höchstens `UNLESBAR_HOECHSTENS`-mal. Bekommt eine Wiederholung CONFLICT, kam die erste Anfrage womöglich doch an
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
  let unlesbar = 0;
  let weg = false;
  /** Wiederholen? Verbindungsfehler immer, unlesbare Antworten nur bis zur Obergrenze. */
  const nochmal = (g: unknown) => {
    const art = fehlerArt(g);
    return art === "verbindung" || (art === "unlesbar" && ++unlesbar <= UNLESBAR_HOECHSTENS);
  };
  try {
    for (;;) {
      try {
        return { wert: await x.senden() };
      } catch (f) {
        if (fehlversuche > 0 && istKonflikt(f)) {
          // null: Serverstand nicht zu holen – wieder warten und noch einmal senden (der nächste Konflikt fragt erneut).
          const da = await x.schonAngekommen().catch((g: unknown) => {
            if (nochmal(g)) return null;
            throw f;
          });
          if (da) return { schonAngekommen: true };
          if (da === false) throw f;
        } else if (!nochmal(f)) throw f;
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

type Ref<T> = { current: T };

/**
 * Festschreiben in die Reihe der Speicherungen (`kette`) stellen – läuft schon eins (`laeuft`), dasselbe zurückgeben statt
 * ein zweites. Was den festen Plan braucht (Verschieben, Leeres entfernen, Tier versetzen), hängt sich an das Ergebnis:
 * so kommt es auch nach langem Wiederholen ohne Verbindung erst nach dem Festschreiben an den Server, und scheitert das
 * Festschreiben, wird es nicht gesendet. Die Reihe selbst läuft danach weiter.
 */
export function festEinreihen(kette: Ref<Promise<unknown>>, laeuft: Ref<Promise<unknown> | null>, festMachen: () => Promise<unknown>): Promise<unknown> {
  if (laeuft.current) return laeuft.current;
  const p = kette.current.catch(() => {}).then(festMachen);
  laeuft.current = p;
  const fertig = () => {
    if (laeuft.current === p) laeuft.current = null;
  };
  kette.current = p.then(fertig, fertig);
  return p;
}

/**
 * Nach CONFLICT bei der Wiederholung des Festschreibens: kam die erste Anfrage an? Nur, wenn der Plan am Server fest ist
 * und mit denselben Grundplatten wie im Editor (`stand` = `plattenStand`, null bei „Automatisch planen“ aus) – hat
 * inzwischen jemand anders mit anderen Grundplatten festgeschrieben, bleibt es ein Konflikt.
 */
export function festSchonAngekommen(server: (Pick<Hallenplan, "reihen"> & { fest?: unknown }) | null | undefined, stand: string | null): boolean {
  if (!server?.fest) return false;
  return stand == null || plattenStand(server) === stand;
}
