import { describe, expect, test } from "bun:test";
import { plattenStand } from "@schau/domain";
import { fehlerArt, festEinreihen, festSchonAngekommen, istVerbindungsfehler, mitWiederholen, UNLESBAR_HOECHSTENS, wartenOderOnline, wartezeit } from "./hallenplan-wiederholen";

/**
 * Fehler, wie der tRPC-Client (11.x) sie liefert: mit `data`, wenn der Server mit JSON geantwortet hat; sonst nur mit
 * `cause` – ein TypeError, wenn keine Antwort kam, ein SyntaxError, wenn die Antwort kein JSON war.
 */
const trpcFehler = (message: string, data?: { code: string; httpStatus: number }, cause?: Error) => Object.assign(new Error(message), { name: "TRPCClientError", data, cause });
const weg = (meldung = "Failed to fetch") => trpcFehler(meldung, undefined, new TypeError(meldung));
const unlesbar = () => trpcFehler("JSON Parse error: Unrecognized token '<'", undefined, new SyntaxError("JSON Parse error: Unrecognized token '<'"));
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
    expect(fehlerArt(weg())).toBe("verbindung");
    // Safari und Firefox melden das fehlende Netz mit anderem Text – maßgeblich ist der TypeError von fetch.
    expect(fehlerArt(weg("Load failed"))).toBe("verbindung");
    expect(fehlerArt(weg("NetworkError when attempting to fetch resource."))).toBe("verbindung");
    expect(fehlerArt(new TypeError("Failed to fetch"))).toBe("verbindung");
    expect(fehlerArt(trpcFehler("Bad Gateway", { code: "INTERNAL_SERVER_ERROR", httpStatus: 502 }))).toBe("verbindung");
    expect(fehlerArt(trpcFehler("x", { code: "INTERNAL_SERVER_ERROR", httpStatus: 503 }))).toBe("verbindung");
    expect(fehlerArt(trpcFehler("x", { code: "TIMEOUT", httpStatus: 504 }))).toBe("verbindung");
    expect(istVerbindungsfehler(weg())).toBe(true);
  });
  test("unlesbare Antwort (kein JSON: Text-500 des Servers, Fehlerseite des Proxys): nur begrenzt wiederholen", () => {
    expect(fehlerArt(unlesbar())).toBe("unlesbar");
    // Ohne cause (unbekannte Form) ebenso – lieber begrenzt wiederholen als endlos.
    expect(fehlerArt(trpcFehler("Unknown error"))).toBe("unlesbar");
    expect(istVerbindungsfehler(unlesbar())).toBe(false);
    // Ein TypeError im eigenen Code ist kein fehlendes Netz.
    expect(fehlerArt(new TypeError("x is undefined"))).toBe("echt");
  });
  test("echte Fehler: der Server hat geantwortet", () => {
    expect(fehlerArt(konflikt())).toBe("echt");
    expect(fehlerArt(abgelehnt())).toBe("echt");
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

  test("unlesbare Antwort: einige Male wiederholen, dann als Fehler melden (die Reihe steht nicht still)", async () => {
    const f = unlesbar();
    const { z, senden } = antworten([...Array.from({ length: UNLESBAR_HOECHSTENS }, unlesbar), f, { ok: true }]);
    const w = ohneWarten();
    const stand: boolean[] = [];
    await expect(mitWiederholen({ senden, warten: w.warten, schonAngekommen: nieAngekommen, beiVerbindung: (x) => stand.push(x) })).rejects.toBe(f);
    expect(z.versuche).toBe(UNLESBAR_HOECHSTENS + 1);
    expect(w.gewartet).toHaveLength(UNLESBAR_HOECHSTENS);
    expect(stand).toEqual([true, false]);
  });

  test("unlesbare Antworten zwischen Verbindungsfehlern: gezählt werden nur die unlesbaren", async () => {
    const folge = [...Array.from({ length: UNLESBAR_HOECHSTENS }, () => [unlesbar(), weg()]).flat(), { ok: true }];
    const { z, senden } = antworten(folge);
    const r = await mitWiederholen({ senden, warten: ohneWarten().warten, schonAngekommen: nieAngekommen });
    expect(r).toEqual({ wert: { ok: true } });
    expect(z.versuche).toBe(folge.length);
  });

  test("Serverstand nach CONFLICT immer wieder unlesbar: nicht endlos, der Konflikt wird gemeldet", async () => {
    const f = konflikt();
    const { senden } = antworten([weg(), ...Array.from({ length: UNLESBAR_HOECHSTENS + 1 }, konflikt), f]);
    const r = mitWiederholen({
      senden,
      warten: ohneWarten().warten,
      schonAngekommen: async () => {
        throw unlesbar();
      },
    });
    await expect(r).rejects.toMatchObject({ data: { code: "CONFLICT" } });
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

describe("Festschreiben in der Reihe", () => {
  const ref = <T>(current: T) => ({ current });
  const nieAngekommen = async () => false;
  /** Server, der nur antwortet, wenn das Netz da ist; das Festschreiben braucht dort länger als das Speichern der Halle. */
  function aufbau() {
    const netz = new EventTarget();
    const z = { online: false, server: [] as string[] };
    const senden = (was: string, dauer: number) => async () => {
      if (!z.online) throw weg();
      await new Promise((r) => setTimeout(r, dauer));
      z.server.push(was);
      return was;
    };
    const wiederholt = (was: string, dauer = 0) => mitWiederholen({ senden: senden(was, dauer), warten: (ms) => wartenOderOnline(ms, netz), schonAngekommen: nieAngekommen });
    const wiederDa = () => {
      z.online = true;
      netz.dispatchEvent(new Event("online"));
    };
    return { z, wiederholt, wiederDa, kette: ref<Promise<unknown>>(Promise.resolve()), laeuft: ref<Promise<unknown> | null>(null) };
  }
  const kurz = () => new Promise((r) => setTimeout(r, 10));

  test("beide warten auf die Verbindung: am Server kommt das Festschreiben vor dem Verschieben an", async () => {
    const a = aufbau();
    // „Leeres entfernen“ schreibt fest (außerhalb einer Änderung), die Verbindung ist weg.
    const fest = festEinreihen(a.kette, a.laeuft, () => a.wiederholt("fest", 20));
    await kurz();
    // Währenddessen verschiebt die Ausstellungsleitung eine Reihe: dasselbe Festschreiben, kein zweites.
    const vorher = festEinreihen(a.kette, a.laeuft, () => Promise.reject(new Error("zweites Festschreiben")));
    expect(vorher).toBe(fest);
    const setzen = (a.kette.current = a.kette.current.then(() => vorher).then(() => a.wiederholt("setzen")));
    await kurz();
    expect(a.z.server).toEqual([]);
    a.wiederDa();
    await Promise.all([fest, setzen]);
    expect(a.z.server).toEqual(["fest", "setzen"]);
    // Danach ist nichts mehr unterwegs: das nächste Festschreiben wird wieder gesendet.
    expect(a.laeuft.current).toBeNull();
  });

  test("Festschreiben scheitert: die angehängte Änderung wird nicht gesendet, die Reihe läuft weiter", async () => {
    const a = aufbau();
    a.z.online = true;
    const f = abgelehnt();
    const fest = festEinreihen(a.kette, a.laeuft, () => Promise.reject(f));
    const setzen = (a.kette.current = a.kette.current.then(() => fest).then(() => a.wiederholt("setzen")));
    await expect(setzen).rejects.toBe(f);
    expect(a.z.server).toEqual([]);
    expect(a.laeuft.current).toBeNull();
    // Die Reihe selbst ist nicht kaputt: das nächste Festschreiben läuft.
    a.kette.current = Promise.resolve();
    await festEinreihen(a.kette, a.laeuft, () => a.wiederholt("fest"));
    expect(a.z.server).toEqual(["fest"]);
  });

  test("wartet auf das, was schon in der Reihe ist", async () => {
    const a = aufbau();
    const z: string[] = [];
    let frei = () => {};
    a.kette.current = new Promise<void>((r) => (frei = r)).then(() => void z.push("setzen davor"));
    const fest = festEinreihen(a.kette, a.laeuft, async () => void z.push("fest"));
    await kurz();
    expect(z).toEqual([]);
    frei();
    await fest;
    expect(z).toEqual(["setzen davor", "fest"]);
  });
});

describe("Festschreiben schon angekommen", () => {
  const reihen = (x: number) => [{ nr: 1, platten: [{ x, y: 0, laenge: 210, typ: "standard", entfernt: false }] }] as never;
  const fest = { am: "2026-11-22T10:00:00.000Z", veraltet: false };
  test("fest mit denselben Grundplatten wie im Editor: kam an", () => {
    expect(festSchonAngekommen({ fest, reihen: reihen(0) }, festStand(0))).toBe(true);
  });
  test("fest, aber mit anderen Grundplatten (jemand anders hat inzwischen festgeschrieben): Konflikt", () => {
    expect(festSchonAngekommen({ fest, reihen: reihen(300) }, festStand(0))).toBe(false);
  });
  test("noch lose: kam nicht an", () => {
    expect(festSchonAngekommen({ fest: null, reihen: reihen(0) }, festStand(0))).toBe(false);
    expect(festSchonAngekommen(null, festStand(0))).toBe(false);
  });
  test("„Automatisch planen“ aus (ohne Grundplatten-Prüfung): jeder feste Plan genügt", () => {
    expect(festSchonAngekommen({ fest, reihen: reihen(300) }, null)).toBe(true);
  });
  function festStand(x: number) {
    return plattenStand({ reihen: reihen(x) });
  }
});
