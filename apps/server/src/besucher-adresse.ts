/**
 * Adresse des Besuchers für die Bremsen (tRPC-Kontext und öffentliche Dateien), auch hinter einem eigenen Proxy
 * (TRUST_PROXY).
 */
import type { Context as HonoContext } from "hono";
import { getConnInfo } from "hono/bun";
import { config } from "./config";
import { adressSchluessel } from "./services/bremse";

let proxyWarnung = false;
/** Adresse des Besuchers für die Bremsen (IPv6 je /64 zusammengefasst). */
export function clientIp(c: HonoContext): string {
  return adressSchluessel(rohAdresse(c));
}

function rohAdresse(c: HonoContext): string {
  if (!config.trustProxy && c.req.header("x-forwarded-for") && !proxyWarnung) {
    proxyWarnung = true;
    console.warn("[betrieb] Anfragen kommen über einen Proxy (X-Forwarded-For), TRUST_PROXY ist aber aus – alle Besucher zählen für die Bremsen als eine Adresse. Bitte TRUST_PROXY=1 setzen.");
  }
  if (config.trustProxy) {
    // Der eigene Proxy hängt die echte Adresse hinten an – der letzte Eintrag ist vertrauenswürdig.
    const kette = c.req.header("x-forwarded-for")?.split(",").map((s) => s.trim()).filter(Boolean);
    if (kette?.length) return kette[kette.length - 1]!;
  }
  try {
    return getConnInfo(c).remote.address ?? "unbekannt";
  } catch {
    return "unbekannt";
  }
}
