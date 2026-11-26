/**
 * Betrieb: Was `/api/gesund` Besuchern über den Proxy zeigt (Entscheidung 024, Nachtrag) und die Ersteinrichtung im
 * Browser ohne gesetzten EINRICHTUNG_CODE (Entscheidung 034).
 */
import { describe, expect, test } from "bun:test";
import { config } from "../config";
import { einrichtungsCode } from "../services/einrichtungscode";
import { leer, m } from "./kontext";

const gesund = async (kopf: Record<string, string> = {}) => {
  const server = (await import("../index")).default;
  const r = await server.fetch(new Request("http://test/api/gesund", { headers: kopf }));
  return { status: r.status, j: (await r.json()) as Record<string, unknown> };
};

describe("Gesundheitsprüfung über den Proxy", () => {
  test("über den Proxy (X-Forwarded-For, Forwarded) nur ok – keine Version, Sicherung, Schautage", async () => {
    const proxys: Record<string, string>[] = [{ "x-forwarded-for": "203.0.113.5" }, { forwarded: "for=203.0.113.5" }, { "x-real-ip": "203.0.113.5" }];
    for (const kopf of proxys) {
      const { status, j } = await gesund(kopf);
      expect(status).toBe(200);
      expect(j).toEqual({ ok: true });
    }
  });

  test("direkt (Docker-Prüfung, Befehl schaufuchs) weiter alle Angaben", async () => {
    const { j } = await gesund();
    expect(Object.keys(j)).toEqual(expect.arrayContaining(["ok", "version", "nurLesen", "letzteSicherung", "sicherungAlterStunden", "migrationenOffen", "schautage"]));
  });

  test("über den Proxy mit GESUND_TOKEN alle Angaben, mit falschem nur ok", async () => {
    process.env.GESUND_TOKEN = "ein-langer-zufallswert-fuer-die-ueberwachung";
    try {
      const mit = await gesund({ "x-forwarded-for": "203.0.113.5", authorization: "Bearer ein-langer-zufallswert-fuer-die-ueberwachung" });
      expect(typeof mit.j.version).toBe("string");
      expect(Object.keys(mit.j)).toEqual(expect.arrayContaining(["letzteSicherung", "sicherungAlterStunden", "migrationenOffen", "schautage"]));
      const falsch = await gesund({ "x-forwarded-for": "203.0.113.5", authorization: "Bearer falsch" });
      expect(falsch.j).toEqual({ ok: true });
    } finally {
      delete process.env.GESUND_TOKEN;
    }
    // Ohne gesetztes Token hilft auch eine leere Angabe nicht.
    expect((await gesund({ "x-forwarded-for": "203.0.113.5", authorization: "Bearer " })).j).toEqual({ ok: true });
  });
});

describe("Ersteinrichtung ohne EINRICHTUNG_CODE", () => {
  test("in Produktion gilt ein beim Start erzeugter Code; ohne ihn wird niemand Administrator", async () => {
    const vorher = { production: config.production, code: config.einrichtungsCode };
    config.production = true;
    config.einrichtungsCode = "";
    try {
      const code = einrichtungsCode();
      expect(code).toMatch(/^[0-9a-f]{6}-[0-9a-f]{6}-[0-9a-f]{6}$/);
      expect(einrichtungsCode()).toBe(code);
      const pub = m.appRouter.createCaller({ ...leer, ip: "einrichtung-ohne-code" });
      expect((await pub.auth.status()).einrichtungsCodeNoetig).toBe(true);
      const angaben = { organisation: "Fremder Verein", name: "Fremd", email: "fremd@example.org", passwort: "sehr-geheim-123" };
      await expect(pub.auth.einrichten(angaben)).rejects.toThrow("Der Einrichtungscode stimmt nicht.");
      // Mit dem Code aus dem Log kommt man bis zur Einrichtung (hier schon erfolgt).
      await expect(pub.auth.einrichten({ ...angaben, code })).rejects.toThrow(/bereits/);
      // Ein gesetzter Code gilt wie bisher.
      config.einrichtungsCode = "gesetzter-code";
      expect(einrichtungsCode()).toBe("gesetzter-code");
    } finally {
      config.production = vorher.production;
      config.einrichtungsCode = vorher.code;
    }
    // Entwicklung und Tests: wie bisher ohne Code.
    expect(einrichtungsCode()).toBe("");
  });
});
