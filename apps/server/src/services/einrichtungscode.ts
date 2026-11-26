/**
 * Code für die Ersteinrichtung im Browser (auth.einrichten, Entscheidung 037). Wer den Verein anlegt, wird
 * Administrator. install.sh und die Cloud setzen EINRICHTUNG_CODE; fehlt er in Produktion (Selbstbau), gilt ein beim
 * Start erzeugter Zufallscode, den der Server einmal ins Log schreibt. So wird kein anonymer Besucher Administrator,
 * und die Einrichtung im Browser bleibt möglich. Entwicklung und Tests brauchen keinen Code.
 */
import { randomBytes } from "node:crypto";
import { count } from "drizzle-orm";
import { config } from "../config";
import { db } from "../db/client";
import { benutzer } from "../db/schema";

let erzeugt = "";

export function einrichtungsCode(): string {
  if (config.einrichtungsCode || !config.production) return config.einrichtungsCode;
  if (!erzeugt) erzeugt = [0, 1, 2].map(() => randomBytes(3).toString("hex")).join("-");
  return erzeugt;
}

/** Beim Start: Ist noch nichts eingerichtet und der Code erzeugt, ihn ins Log schreiben (docker compose logs app). */
export async function einrichtungsCodeMelden(): Promise<void> {
  if (config.einrichtungsCode || !config.production) return;
  const [r] = await db.select({ n: count() }).from(benutzer);
  if ((r?.n ?? 0) > 0) return;
  console.log(`[einrichtung] EINRICHTUNG_CODE ist nicht gesetzt. Einrichtungscode für die Ersteinrichtung im Browser (gilt bis zum nächsten Neustart): ${einrichtungsCode()}`);
}
