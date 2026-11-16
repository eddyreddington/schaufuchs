/**
 * Prüfungen der Übersetzung der Oberfläche (Entscheidung 022), auch als Befehl:
 *   bun scripts/sprachen-scan.ts rest [Datei …]   deutsche Texte, die noch im Quelltext von apps/web stehen
 *   bun scripts/sprachen-scan.ts vorher STAND    alle Textstücke von apps/web im Git-Stand STAND nach scripts/sprachen-vorher.json
 *   bun scripts/sprachen-scan.ts verloren        alte Textstücke, die weder im Quelltext noch in den deutschen Texten stehen
 *   bun scripts/sprachen-scan.ts server [Datei …] Meldungen des Servers ohne Übersetzung
 * Bewusst deutscher Text im Quelltext: Kommentar `// bleibt deutsch` in derselben oder der Zeile davor.
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";

const WURZEL = join(import.meta.dir, "..");
const WEB = join(WURZEL, "apps/web/src");
const SERVER = join(WURZEL, "apps/server/src");
export const VORHER_DATEI = join(import.meta.dir, "sprachen-vorher.json");

export type Stueck = { datei: string; zeile: number; text: string; art: "jsx" | "attribut" | "text" };

function dateien(ordner: string, nurTs = false): string[] {
  return readdirSync(ordner, { recursive: true, encoding: "utf8" })
    .filter((f) => (nurTs ? /\.ts$/ : /\.tsx?$/).test(f) && !/\.test\.ts$|\/tests\//.test(f) && !f.startsWith("tests/"))
    .map((f) => join(ordner, f))
    .sort();
}

const ENTITAETEN: Record<string, string> = { nbsp: " ", shy: "", amp: "&", quot: '"', apos: "'", lt: "<", gt: ">", ndash: "–", mdash: "—", hellip: "…" };
/** Für Vergleiche: Entitäten auflösen, weiche Trennung weg, Leerraum zusammenfassen. */
export const normal = (s: string) =>
  s
    .replace(/&(\w+);/g, (m, n: string) => ENTITAETEN[n] ?? m)
    .replace(/­/g, "")
    .replace(/[\s  ]+/g, " ")
    .trim();

const BUCHSTABEN = /[A-Za-zÄÖÜäöüß]{2}/;
/** Attribute ohne sichtbaren Text. */
const TECHNISCH = new Set(["className", "to", "href", "type", "key", "id", "name", "role", "variante", "ton", "symbol", "htmlFor", "autoComplete", "inputMode", "target", "rel", "lang", "src", "method", "form", "pattern", "accept", "download", "dir", "groesse", "breite", "art", "wert", "value", "data-testid", "enterKeyHint", "spellCheck", "capture", "loading", "decoding"]);
const SICHTBAR = new Set(["title", "placeholder", "aria-label", "alt", "label", "titel", "hinweis", "beschriftung", "text", "unterzeile", "leer", "frage", "bestaetigen", "aria-description", "tooltip"]);

/** Sieht ein Text wie Oberfläche aus (nicht wie Klasse, Schlüssel, Pfad)? */
export function wieText(s: string): boolean {
  const t = normal(s);
  if (!BUCHSTABEN.test(t)) return false;
  if (/^[a-z0-9_\-:./[\]#%()&>=!,+*'@~?$ ]*$/.test(t) && !/ [a-zäöü]{3,} [a-zäöü]{3,}/.test(t)) return false; // klein, technisch
  if (/^[A-Za-z0-9_.-]+$/.test(t) && !/^[A-ZÄÖÜ][a-zäöüß]+$/.test(t)) return false; // Bezeichner wie fooBar, ABC_1
  if (/^(image|application|text)\/|^https?:|^\/|^#|^\.|^data:|^[\w-]+\.(pdf|csv|xlsx|png|svg|json|js)$/.test(t)) return false;
  return true;
}

function bleibtDeutsch(quelle: ts.SourceFile, knoten: ts.Node): boolean {
  const zeile = quelle.getLineAndCharacterOfPosition(knoten.getStart(quelle)).line;
  const zeilen = quelle.text.split("\n");
  return [zeilen[zeile], zeilen[zeile - 1]].some((z) => z?.includes("bleibt deutsch"));
}

/** Alle Textstücke einer Datei: JSX-Text, Zeichenketten und feste Teile von Vorlagen (ohne Importe und Klassen). */
export function stuecke(datei: string, inhalt = readFileSync(datei, "utf8"), alle = true): Stueck[] {
  const quelle = ts.createSourceFile(datei, inhalt, ts.ScriptTarget.Latest, true, datei.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const aus: Stueck[] = [];
  const rel = relative(WURZEL, datei);
  const neu = (k: ts.Node, text: string, art: Stueck["art"]) => {
    if (!alle && bleibtDeutsch(quelle, k)) return;
    aus.push({ datei: rel, zeile: quelle.getLineAndCharacterOfPosition(k.getStart(quelle)).line + 1, text: normal(text), art });
  };
  const besuche = (k: ts.Node): void => {
    if (ts.isImportDeclaration(k) || ts.isExportDeclaration(k) || ts.isLiteralTypeNode(k)) return;
    if (ts.isCallExpression(k) && /^(console\.|cn$|clsx$|import$|require$)/.test(k.expression.getText(quelle))) return;
    if (ts.isJsxAttribute(k)) {
      const name = k.name.getText(quelle);
      if (TECHNISCH.has(name) || name.startsWith("on") && !SICHTBAR.has(name)) return;
      if (k.initializer && ts.isStringLiteral(k.initializer)) {
        if (alle ? BUCHSTABEN.test(k.initializer.text) : SICHTBAR.has(name) ? BUCHSTABEN.test(k.initializer.text) : wieText(k.initializer.text)) neu(k, k.initializer.text, "attribut");
        return;
      }
    }
    if (ts.isPropertyAssignment(k) && /^(className|klasse|klassen)$/.test(k.name.getText(quelle))) return;
    if (ts.isJsxText(k)) {
      if (BUCHSTABEN.test(k.text)) neu(k, k.text, "jsx");
    } else if (ts.isStringLiteral(k) || ts.isNoSubstitutionTemplateLiteral(k)) {
      // Schlüssel in Objekten und Vergleichswerte sind keine Oberfläche.
      const p = k.parent;
      const schluessel = (ts.isPropertyAssignment(p) && p.name === k) || ts.isElementAccessExpression(p) || (ts.isBinaryExpression(p) && /^[!=]==?$/.test(p.operatorToken.getText(quelle))) || ts.isCaseClause(p);
      if (!schluessel && (alle ? BUCHSTABEN.test(k.text) : wieText(k.text))) neu(k, k.text, "text");
    } else if (ts.isTemplateExpression(k)) {
      for (const teil of [k.head, ...k.templateSpans.map((s) => s.literal)]) if (alle ? BUCHSTABEN.test(teil.text) : wieText(teil.text)) neu(k, teil.text, "text");
    }
    ts.forEachChild(k, besuche);
  };
  besuche(quelle);
  return aus.filter((s) => s.text);
}

/** Deutsche Reste der Oberfläche im Quelltext (ohne die Aussteller-Seite, deren Texte seit 020 übersetzt sind). */
export function reste(nur?: string[]): Stueck[] {
  const liste = nur?.length ? nur.map((f) => join(WURZEL, f)) : dateien(WEB);
  return liste.flatMap((d) => stuecke(d, undefined, false));
}

/** Alle Textstücke von apps/web/src, heute oder in einem Git-Stand (für die Liste „vorher“). */
export function alleStuecke(stand?: string): Stueck[] {
  if (!stand) return dateien(WEB).flatMap((d) => stuecke(d));
  const git = (...a: string[]) => Bun.spawnSync(["git", ...a], { cwd: WURZEL }).stdout.toString();
  return git("ls-tree", "-r", "--name-only", stand, "apps/web/src")
    .split("\n")
    .filter((f) => /\.tsx?$/.test(f))
    .flatMap((f) => stuecke(join(WURZEL, f), git("show", `${stand}:${f}`)));
}

/** Alte Textstücke, die weder im heutigen Quelltext noch in einem deutschen Text der Oberfläche stehen. */
export async function verloren(): Promise<{ datei: string; text: string }[]> {
  const { oberflaeche, texte } = await import("../packages/domain/src");
  const beispiel = ["‹a›", "‹b›", "‹c›", "‹d›", "‹e›", "‹f›"];
  const deutsch: string[] = [];
  const lauf = (w: unknown) => {
    if (typeof w === "string") deutsch.push(normal(w));
    else if (typeof w === "function") {
      const r = (w as (...a: string[]) => unknown)(...beispiel);
      for (const x of Array.isArray(r) ? r : [r]) deutsch.push(normal(String(x)));
    } else if (w && typeof w === "object") Object.values(w).forEach(lauf);
  };
  lauf(oberflaeche("de"));
  lauf(texte("de"));
  const imQuelltext = new Set(alleStuecke().map((s) => s.text));
  const vorher = JSON.parse(readFileSync(VORHER_DATEI, "utf8")) as Record<string, string[]>;
  const fehlt: { datei: string; text: string }[] = [];
  for (const [datei, liste] of Object.entries(vorher))
    for (const text of liste) if (!imQuelltext.has(text) && !deutsch.some((d) => d.includes(text))) fehlt.push({ datei, text });
  return fehlt;
}

/** Meldungen des Servers (`fehler("CODE", "…")`), die `serverText()` nicht übersetzt. */
export async function serverOhneUebersetzung(nur?: string[]): Promise<Stueck[]> {
  const { serverText } = await import("../packages/domain/src");
  const liste = nur?.length ? nur.map((f) => join(WURZEL, f)) : dateien(SERVER, true);
  const aus: Stueck[] = [];
  for (const datei of liste) {
    const inhalt = readFileSync(datei, "utf8");
    const quelle = ts.createSourceFile(datei, inhalt, ts.ScriptTarget.Latest, true);
    const besuche = (k: ts.Node): void => {
      if (ts.isCallExpression(k) && k.expression.getText(quelle) === "fehler" && k.arguments.length >= 2) {
        const a = k.arguments[1]!;
        let beispiel: string | null = null;
        if (ts.isStringLiteral(a) || ts.isNoSubstitutionTemplateLiteral(a)) beispiel = a.text;
        else if (ts.isTemplateExpression(a)) beispiel = a.head.text + a.templateSpans.map((s) => `X${s.literal.text}`).join("");
        if (beispiel !== null && serverText(beispiel, "en") === beispiel && /[a-zäöü]/.test(beispiel))
          aus.push({ datei: relative(WURZEL, datei), zeile: quelle.getLineAndCharacterOfPosition(k.getStart(quelle)).line + 1, text: beispiel, art: "text" });
      }
      ts.forEachChild(k, besuche);
    };
    besuche(quelle);
  }
  return aus;
}

if (import.meta.main) {
  const [befehl, ...rest] = process.argv.slice(2);
  const zeige = (l: { datei: string; zeile?: number; text: string }[]) => {
    for (const s of l) console.log(`${s.datei}${s.zeile ? `:${s.zeile}` : ""}  ${s.text}`);
    console.log(`${l.length} Stellen`);
  };
  if (befehl === "rest") zeige(reste(rest));
  else if (befehl === "server") zeige(await serverOhneUebersetzung(rest));
  else if (befehl === "verloren") zeige(await verloren());
  else if (befehl === "vorher") {
    const nachDatei: Record<string, string[]> = {};
    if (!rest[0]) throw new Error("Git-Stand angeben, z. B. main");
    for (const s of alleStuecke(rest[0])) (nachDatei[s.datei] ??= []).includes(s.text) || nachDatei[s.datei]!.push(s.text);
    writeFileSync(VORHER_DATEI, `${JSON.stringify(nachDatei, null, 1)}\n`);
    console.log(`${Object.values(nachDatei).flat().length} Textstücke aus ${Object.keys(nachDatei).length} Dateien`);
  } else console.log("bun scripts/sprachen-scan.ts rest|vorher|verloren|server [Datei …]");
}
