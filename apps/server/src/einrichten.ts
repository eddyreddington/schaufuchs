/**
 * Ersteinrichtung über die Kommandozeile (Entscheidung 026), im Container aufgerufen von `schaufuchs einrichten`:
 *
 *   bun src/einrichten.ts --verein "GZV Musterstadt" --name "Erika Muster" --email erika@example.org [--link-zeigen]
 *
 * Legt Verein und ersten Administrator an und schickt ihm einen Link „Passwort setzen“ (mit --link-zeigen steht der Link
 * hier statt in einer Mail). Meldungen auf stderr, Rückgabewert 1 bei jedem Fehler.
 */
import { parseArgs } from "node:util";
import { ZodError } from "zod";
import { sql } from "./db/client";
import { richteEinPerBefehl } from "./services/ersteinrichtung";

const OPTION: Record<string, string> = { organisation: "--verein", name: "--name", email: "--email" };
const BEISPIEL = 'schaufuchs einrichten --verein "GZV Musterstadt" --name "Erika Muster" --email erika@example.org';
const datum = (d: Date) => new Intl.DateTimeFormat("de-DE", { dateStyle: "long", timeStyle: "short", timeZone: "Europe/Berlin" }).format(d);

function angaben() {
  let values;
  try {
    ({ values } = parseArgs({
      args: Bun.argv.slice(2),
      options: { verein: { type: "string" }, name: { type: "string" }, email: { type: "string" }, "link-zeigen": { type: "boolean" } },
      strict: true,
      allowPositionals: false,
    }));
  } catch (e) {
    const option = String((e as Error).message).match(/'(-[^']*)'/)?.[1];
    const grund =
      (e as { code?: string }).code === "ERR_PARSE_ARGS_UNEXPECTED_POSITIONAL"
        ? "Namen mit Leerzeichen bitte in Anführungszeichen setzen."
        : option
          ? `Unbekannte oder unvollständige Angabe: ${option}.`
          : "Angaben nicht lesbar.";
    throw new Error(`${grund} Aufruf: ${BEISPIEL} [--link-zeigen]`);
  }
  for (const [schluessel, option] of [["verein", "--verein"], ["name", "--name"], ["email", "--email"]] as const) {
    if (!values[schluessel]) throw new Error(`Bitte ${option} angeben. Aufruf: ${BEISPIEL} [--link-zeigen]`);
  }
  return { organisation: values.verein!, name: values.name!, email: values.email!, linkZeigen: !!values["link-zeigen"] };
}

let code = 0;
try {
  const a = angaben();
  const r = await richteEinPerBefehl(a);
  console.log(r.neu ? `Verein „${r.verein}“ mit dem Administrator ${r.email} angelegt.` : `Verein „${r.verein}“ ist schon angelegt – neuer Link für ${r.email}, der vorige gilt nicht mehr.`);
  if (!r.neu && (a.organisation.trim() !== r.verein || a.name.trim() !== r.name)) {
    console.log(`Vereinsname und Name („${r.name}“) bleiben, wie sie sind – ändern nach der Anmeldung unter „Verein und Datenschutz“ bzw. „Benutzer“.`);
  }
  if (r.link) {
    console.log(`Link „Passwort setzen“ – gilt einmal, bis ${datum(r.bis)} Uhr. Nur an ${r.email} weitergeben:`);
    console.log(r.link);
  } else if (r.mail?.gesendet) {
    console.log(`Link „Passwort setzen“ an ${r.email} geschickt – gilt einmal, bis ${datum(r.bis)} Uhr.`);
  } else {
    console.error(`Die Mail an ${r.email} ging nicht hinaus: ${r.mail?.fehler ?? "unbekannter Fehler"}`);
    console.error("SchauFUCHS versucht es weiter. Oder den Befehl mit --link-zeigen wiederholen – der neue Link ersetzt den alten.");
    code = 1;
  }
} catch (e) {
  const z = e instanceof ZodError ? e.issues[0] : undefined;
  console.error(z ? `${OPTION[String(z.path[0])] ?? ""}: ${z.message}` : e instanceof Error ? e.message : String(e));
  code = 1;
} finally {
  await sql.end();
}
process.exit(code);
