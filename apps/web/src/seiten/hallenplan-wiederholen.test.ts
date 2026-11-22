import { describe, expect, test } from "bun:test";
import { istVerbindungsfehler, mitWiederholen, wartenOderOnline, wartezeit } from "./hallenplan-wiederholen";

/** Fehler, wie der tRPC-Client sie liefert: mit `data`, wenn der Server geantwortet hat. */
const trpcFehler = (message: string, data?: { code: string; httpStatus: number }) => Object.assign(new Error(message), { name: "TRPCClientError", data });
const weg = () => trpcFehler("Failed to fetch");
const konflikt = () => trpcFehler("Die Halle wurde inzwischen von jemand anderem geändert", { code: "CONFLICT", httpStatus: 409 });
const abgelehnt = () => trpcFehler("Ein anderer Grundriss geht im festen Plan nur mit „Plan neu setzen“.", { code: "BAD_REQUEST", httpStatus: 400 });

/** Senden mit vorgegebenen Antworten der Reihe nach (Fehler werden geworfen); zählt die Versuche. */
function antworten(folge: unknown[]) {
  const z = { versuche: 0 };
  const senden = async () => {
    const a = folge[z.versuche++];
    if (a instanceof Error) throw a;
    return a;
  };
  return { z, senden };
}

describe("Fehler einordnen", () => {
  test("Verbindungsfehler: keine Antwort vom Server oder Proxy meldet 502/503/504", () => {
    expect(istVerbindungsfehler(weg())).toBe(true);
    expect(istVerbindungsfehler(new TypeError("Failed to fetch"))).toBe(true);
    // Antwort ohne lesbares JSON (z. B. Fehlerseite des Proxys): tRPC-Fehler ohne data.
    expect(istVerbindungsfehler(trpcFehler("JSON Parse error: Unrecognized token '<'"))).toBe(true);
    expect(istVerbindungsfehler(trpcFehler("Bad Gateway", { code: "INTERNAL_SERVER_ERROR", httpStatus: 502 }))).toBe(true);
    expect(istVerbindungsfehler(trpcFehler("x", { code: "INTERNAL_SERVER_ERROR", httpStatus: 503 }))).toBe(true);
    expect(istVerbindungsfehler(trpcFehler("x", { code: "TIMEOUT", httpStatus: 504 }))).toBe(true);
    expect(istVerbindungsfehler(Object.assign(trpcFehler("x", undefined), { meta: { response: { status: 502 } } }))).toBe(true);
  });
  test("echte Fehler: der Server hat geantwortet", () => {
    expect(istVerbindungsfehler(konflikt())).toBe(false);
    expect(istVerbindungsfehler(abgelehnt())).toBe(false);
    expect(istVerbindungsfehler(trpcFehler("x", { code: "INTERNAL_SERVER_ERROR", httpStatus: 500 }))).toBe(false);
    expect(istVerbindungsfehler(trpcFehler("Bitte anmelden", { code: "UNAUTHORIZED", httpStatus: 401 }))).toBe(false);
    // Kein tRPC-Fehler (Fehler im eigenen Code): nicht endlos wiederholen.
    expect(istVerbindungsfehler(new Error("kaputt"))).toBe(false);
    expect(istVerbindungsfehler(null)).toBe(false);
    expect(istVerbindungsfehler("Failed to fetch")).toBe(false);
  });
});

test("Wartezeit: 1 s, 2 s, 4 s … höchstens 30 s", () => {
  expect([1, 2, 3, 4, 5, 6, 7, 20].map(wartezeit)).toEqual([1000, 2000, 4000, 8000, 16000, 30000, 30000, 30000]);
});

describe("mitWiederholen", () => {
  const ohneWarten = () => {
    const gewartet: number[] = [];
    return { gewartet, warten: async (ms: number) => void gewartet.push(ms) };
  };
  const nieAngekommen = async () => false;

  test("gelingt gleich: ein Versuch, kein Warten, keine Anzeige „Keine Verbindung“", async () => {
    const { z, senden } = antworten([{ ok: true }]);
    const w = ohneWarten();
    const stand: boolean[] = [];
    const r = await mitWiederholen({ senden, warten: w.warten, schonAngekommen: nieAngekommen, beiVerbindung: (x) => stand.push(x) });
    expect(r).toEqual({ wert: { ok: true } });
    expect(z.versuche).toBe(1);
    expect(w.gewartet).toEqual([]);
    expect(stand).toEqual([]);
  });

  test("Verbindungsfehler: dieselbe Speicherung wieder senden, mit wachsender Wartezeit, bis sie gelingt", async () => {
    const { z, senden } = antworten([weg(), weg(), trpcFehler("x", { code: "INTERNAL_SERVER_ERROR", httpStatus: 502 }), { ok: true }]);
    const w = ohneWarten();
    const stand: boolean[] = [];
    const r = await mitWiederholen({ senden, warten: w.warten, schonAngekommen: nieAngekommen, beiVerbindung: (x) => stand.push(x) });
    expect(r).toEqual({ wert: { ok: true } });
    expect(z.versuche).toBe(4);
    expect(w.gewartet).toEqual([1000, 2000, 4000]);
    // „Keine Verbindung“ einmal an und am Ende wieder aus – nicht je Versuch.
    expect(stand).toEqual([true, false]);
  });

  test("echter Fehler beim ersten Versuch: sofort weitergeben, nichts wiederholen", async () => {
    const f = abgelehnt();
    const { z, senden } = antworten([f]);
    const w = ohneWarten();
    let gefragt = false;
    await expect(mitWiederholen({ senden, warten: w.warten, schonAngekommen: async () => (gefragt = true) })).rejects.toBe(f);
    expect(z.versuche).toBe(1);
    expect(w.gewartet).toEqual([]);
    expect(gefragt).toBe(false);
  });

  test("CONFLICT beim ersten Versuch ist ein echter Konflikt (jemand anders hat gespeichert)", async () => {
    const f = konflikt();
    const { senden } = antworten([f]);
    let gefragt = false;
    await expect(mitWiederholen({ senden, warten: ohneWarten().warten, schonAngekommen: async () => (gefragt = true) })).rejects.toBe(f);
    expect(gefragt).toBe(false);
  });

  test("echter Fehler nach Verbindungsfehlern: weitergeben, Anzeige wieder aus", async () => {
    const f = abgelehnt();
    const { z, senden } = antworten([weg(), f]);
    const stand: boolean[] = [];
    await expect(mitWiederholen({ senden, warten: ohneWarten().warten, schonAngekommen: nieAngekommen, beiVerbindung: (x) => stand.push(x) })).rejects.toBe(f);
    expect(z.versuche).toBe(2);
    expect(stand).toEqual([true, false]);
  });

  test("Antwort verloren, Wiederholung bekommt CONFLICT: gilt als gespeichert, wenn der Server schon den neuen Stand hat", async () => {
    const { z, senden } = antworten([weg(), konflikt()]);
    let gefragt = 0;
    const r = await mitWiederholen({ senden, warten: ohneWarten().warten, schonAngekommen: async () => (gefragt++, true) });
    expect(r).toEqual({ schonAngekommen: true });
    expect(z.versuche).toBe(2);
    expect(gefragt).toBe(1);
  });

  test("Wiederholung bekommt CONFLICT und der Server hat einen anderen Stand: echter Konflikt", async () => {
    const f = konflikt();
    const { senden } = antworten([weg(), f]);
    await expect(mitWiederholen({ senden, warten: ohneWarten().warten, schonAngekommen: nieAngekommen })).rejects.toBe(f);
  });

  test("Serverstand holen scheitert an der Verbindung: weiter warten und wieder senden", async () => {
    const { z, senden } = antworten([weg(), konflikt(), konflikt()]);
    const w = ohneWarten();
    const fragen = [weg(), true];
    let i = 0;
    const r = await mitWiederholen({
      senden,
      warten: w.warten,
      schonAngekommen: async () => {
        const a = fragen[i++];
        if (a instanceof Error) throw a;
        return a as boolean;
      },
    });
    expect(r).toEqual({ schonAngekommen: true });
    expect(z.versuche).toBe(3);
    expect(w.gewartet).toEqual([1000, 2000]);
  });

  test("Serverstand holen scheitert mit echtem Fehler: der Konflikt wird gemeldet", async () => {
    const f = konflikt();
    const { senden } = antworten([weg(), f]);
    await expect(
      mitWiederholen({
        senden,
        warten: ohneWarten().warten,
        schonAngekommen: async () => {
          throw abgelehnt();
        },
      }),
    ).rejects.toBe(f);
  });

  test("Seite verlassen (weiter = false): nicht mehr senden, den Verbindungsfehler weitergeben", async () => {
    const f = weg();
    const { z, senden } = antworten([weg(), f, { ok: true }]);
    let aktiv = true;
    const stand: boolean[] = [];
    const p = mitWiederholen({
      senden,
      warten: async () => {
        if (z.versuche === 2) aktiv = false;
      },
      schonAngekommen: nieAngekommen,
      weiter: () => aktiv,
      beiVerbindung: (x) => stand.push(x),
    });
    await expect(p).rejects.toBe(f);
    expect(z.versuche).toBe(2);
    expect(stand).toEqual([true, false]);
  });
});

describe("wartenOderOnline", () => {
  test("endet nach der Wartezeit", async () => {
    const ziel = new EventTarget();
    const start = Date.now();
    await wartenOderOnline(30, ziel);
    expect(Date.now() - start).toBeGreaterThanOrEqual(25);
  });
  test("endet sofort beim Ereignis „online“", async () => {
    const ziel = new EventTarget();
    let fertig = false;
    const p = wartenOderOnline(60_000, ziel).then(() => (fertig = true));
    await Promise.resolve();
    expect(fertig).toBe(false);
    ziel.dispatchEvent(new Event("online"));
    await p;
    expect(fertig).toBe(true);
  });
});
