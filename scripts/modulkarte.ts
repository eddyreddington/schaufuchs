/**
 * Erzeugt docs/modulkarte.md: Wegweiser durch den Code, damit niemand (Mensch oder Agent) suchen und lesen muss.
 * Liest die Quellen nur (TypeScript-Compiler-API aus dem vorhandenen Paket `typescript`), ändert nichts am Programm.
 *
 *   bun run modulkarte            schreibt docs/modulkarte.md
 *   bun run modulkarte --pruefen  wie oben, Fehlercode 1, wenn die Datei vorher veraltet war
 *
 * Die Ausgabe ist ohne Datum und sortiert – gleiche Quellen ergeben dieselbe Datei (Prüfung in der CI).
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, relative } from "node:path";
import ts from "typescript";

const WURZEL = join(import.meta.dir, "..");
const ZIEL = join(WURZEL, "docs/modulkarte.md");
/** Ab dieser Zeilenzahl ist eine Datei zu groß (Ziel unter 400, Grenze 600, siehe CLAUDE.md). */
export const GRENZE_ZEILEN = 600;

// ---------- Hilfen ----------

function lies(pfad: string) {
  const text = readFileSync(pfad, "utf8");
  const sf = ts.createSourceFile(pfad, text, ts.ScriptTarget.Latest, true, pfad.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  return { text, sf };
}

/** Zeilen wie `wc -l`. */
function zeilen(text: string) {
  let n = 0;
  for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) n++;
  return n;
}

const zahl = (n: number) => n.toLocaleString("de-DE");
const groesse = (n: number) => (n > GRENZE_ZEILEN ? `${zahl(n)} Z. ⚠` : `${zahl(n)} Z.`);

function dateien(ordner: string, filter: (name: string) => boolean): string[] {
  const voll = join(WURZEL, ordner);
  if (!existsSync(voll)) return [];
  const raus: string[] = [];
  for (const e of readdirSync(voll, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (e.isDirectory()) raus.push(...dateien(join(ordner, e.name), filter));
    else if (filter(e.name)) raus.push(join(ordner, e.name));
  }
  return raus;
}

const ABKUERZUNGEN = new Set(["z", "B", "d", "h", "u", "a", "ca", "bzw", "ggf", "inkl", "Nr", "usw", "vgl", "evtl", "max", "min", "S", "bspw", "o", "ä", "s", "Std", "Min", "Abs", "Art", "Ziff", "lit", "Kap", "bzgl", "zzgl", "ggü", "sog", "dt"]);

/** Erster Satz eines Kommentars, gekürzt – reicht als Wegweiser. */
function ersterSatz(roh: string): string {
  let t = roh.replace(/\s+/g, " ").trim();
  const tag = t.search(/(^|\s)@(param|returns?|example|see|deprecated|throws)\b/);
  if (tag >= 0) t = t.slice(0, tag).trim();
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (c !== "." && c !== "!" && c !== "?") continue;
    const danach = t[i + 1];
    if (danach !== undefined && danach !== " ") continue;
    if (c === ".") {
      const wort = t.slice(0, i).split(/[\s(„"]/).pop() ?? "";
      if (ABKUERZUNGEN.has(wort) || /^\d+$/.test(wort) || wort.length === 1) continue;
    }
    t = t.slice(0, i + 1);
    break;
  }
  return t.length > 150 ? `${t.slice(0, 147).trimEnd()} …` : t;
}

/** Kommentar direkt vor einem Knoten: der letzte Block (/** … *\/ oder zusammenhängende //-Zeilen). */
function kommentarVor(knoten: ts.Node, sf: ts.SourceFile, text: string): string {
  const bereiche = ts.getLeadingCommentRanges(text, knoten.getFullStart()) ?? [];
  if (!bereiche.length) return "";
  const letzter = bereiche[bereiche.length - 1]!;
  let block: ts.CommentRange[] = [letzter];
  if (letzter.kind === ts.SyntaxKind.SingleLineCommentTrivia) {
    block = [];
    for (let i = bereiche.length - 1; i >= 0; i--) {
      const b = bereiche[i]!;
      if (b.kind !== ts.SyntaxKind.SingleLineCommentTrivia) break;
      if (block.length && sf.getLineAndCharacterOfPosition(block[0]!.pos).line - sf.getLineAndCharacterOfPosition(b.pos).line > 1) break;
      block.unshift(b);
    }
  }
  return block.map((b) => reinigen(text.slice(b.pos, b.end))).join(" ");
}

function reinigen(kommentar: string): string {
  return kommentar
    .replace(/^\/\*\*?/, "")
    .replace(/\*\/$/, "")
    .split("\n")
    .map((z) => z.replace(/^\s*(\*|\/\/)\s?/, "").trim())
    .join(" ");
}

/** Beschreibung einer Datei: Kommentar am Anfang, wenn er nicht zur ersten Deklaration gehört. */
function dateiKommentar(sf: ts.SourceFile, text: string): string {
  const erste = sf.statements[0];
  if (!erste) return "";
  const bereiche = ts.getLeadingCommentRanges(text, erste.getFullStart()) ?? [];
  if (!bereiche.length) return "";
  const gehoertZurDatei = ts.isImportDeclaration(erste) || ts.isExportDeclaration(erste) || bereiche.length > 1;
  if (!gehoertZurDatei) return "";
  return ersterSatz(reinigen(text.slice(bereiche[0]!.pos, bereiche[0]!.end)));
}

const istExportiert = (n: ts.Node) => ts.canHaveModifiers(n) && !!ts.getModifiers(n)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);

interface Export {
  name: string;
  art: "funktion" | "konstante" | "typ" | "klasse";
  doku: string;
}

function exporte(sf: ts.SourceFile, text: string): Export[] {
  const raus: Export[] = [];
  for (const s of sf.statements) {
    if (!istExportiert(s)) continue;
    const doku = ersterSatz(kommentarVor(s, sf, text));
    if (ts.isFunctionDeclaration(s) && s.name) raus.push({ name: s.name.text, art: "funktion", doku });
    else if (ts.isClassDeclaration(s) && s.name) raus.push({ name: s.name.text, art: "klasse", doku });
    else if ((ts.isInterfaceDeclaration(s) || ts.isTypeAliasDeclaration(s) || ts.isEnumDeclaration(s)) && s.name) raus.push({ name: s.name.text, art: "typ", doku });
    else if (ts.isVariableStatement(s)) {
      for (const d of s.declarationList.declarations) {
        if (!ts.isIdentifier(d.name)) continue;
        const init = d.initializer;
        const fn = !!init && (ts.isArrowFunction(init) || ts.isFunctionExpression(init));
        raus.push({ name: d.name.text, art: fn ? "funktion" : "konstante", doku });
      }
    }
  }
  // Doppelte Namen (Überladungen) nur einmal.
  return raus.filter((e, i) => raus.findIndex((x) => x.name === e.name) === i);
}

function exportZeile(e: Export): string {
  const name = e.art === "funktion" ? `\`${e.name}()\`` : e.art === "typ" ? `\`${e.name}\` (Typ)` : e.art === "klasse" ? `\`${e.name}\` (Klasse)` : `\`${e.name}\``;
  return e.doku ? `- ${name} – ${e.doku}` : `- ${name}`;
}

// ---------- Domain ----------

function abschnittDomain(): string[] {
  const z: string[] = ["## Fachlogik `packages/domain/src`", "", "Reine Funktionen ohne Datenbank und Oberfläche. Server und Web importieren aus `@schau/domain` (`index.ts`).", ""];
  const alle = dateien("packages/domain/src", (n) => n.endsWith(".ts"));
  const tests = new Set(alle.filter((p) => p.endsWith(".test.ts")).map((p) => basename(p)));
  for (const pfad of alle.filter((p) => !p.endsWith(".test.ts"))) {
    const { text, sf } = lies(join(WURZEL, pfad));
    const name = basename(pfad);
    z.push(`### ${name} (${groesse(zeilen(text))})`);
    const beschr = dateiKommentar(sf, text);
    if (beschr) z.push(beschr);
    const test = name.replace(/\.ts$/, ".test.ts");
    if (tests.has(test)) z.push(`Tests: \`${test}\``);
    if (name === "index.ts") {
      z.push("Sammelt alle Exporte (`export * from …`).", "");
      continue;
    }
    const liste = exporte(sf, text);
    // Typen ohne Kommentar in einer Zeile – spart Platz, die Namen reichen zum Finden.
    const stumm = liste.filter((e) => e.art === "typ" && !e.doku).map((e) => `\`${e.name}\``);
    z.push("", ...liste.filter((e) => e.art !== "typ" || e.doku).map(exportZeile));
    if (stumm.length) z.push(`- Typen: ${stumm.join(", ")}`);
    z.push("");
  }
  const ohneQuelle = [...tests].filter((t) => !alle.includes(`packages/domain/src/${t.replace(/\.test\.ts$/, ".ts")}`)).sort();
  if (ohneQuelle.length) z.push(`Weitere Tests: ${ohneQuelle.map((t) => `\`${t}\``).join(", ")}`, "");
  return z;
}

// ---------- Router ----------

const ROLLEN: Record<string, string> = {
  publicProcedure: "öffentlich",
  benutzerProcedure: "angemeldet",
  adminProcedure: "admin",
  richterProcedure: "richter",
  oeffentlichSichtbarProcedure: "admin",
};

/** Wurzel einer Kette wie `adminProcedure.input(…).mutation(…)` und die Art (query/mutation). */
function prozedurArt(ausdruck: ts.Expression): { wurzel: string; art: string } | null {
  let art = "";
  let x: ts.Expression = ausdruck;
  while (true) {
    if (ts.isCallExpression(x)) {
      if (!art && ts.isPropertyAccessExpression(x.expression) && ["query", "mutation", "subscription"].includes(x.expression.name.text)) art = x.expression.name.text;
      x = x.expression;
    } else if (ts.isPropertyAccessExpression(x)) x = x.expression;
    else if (ts.isParenthesizedExpression(x) || ts.isAsExpression(x) || ts.isSatisfiesExpression(x)) x = x.expression;
    else break;
  }
  if (!ts.isIdentifier(x) || !art) return null;
  return { wurzel: x.text, art };
}

interface Prozedur {
  name: string;
  art: string;
  rolle: string;
  doku: string;
}

/** Objekte mit Prozeduren in einer Datei, nach Variablenname (z. B. `katalogRouter`, `anmeldung`). */
function prozedurObjekte(sf: ts.SourceFile, text: string) {
  // Örtliche Abkürzungen wie `const richterOderAdmin = benutzerProcedure.use(…)` auf ihre Wurzel zurückführen.
  const alias = new Map<string, string>();
  for (const s of sf.statements) {
    if (!ts.isVariableStatement(s)) continue;
    for (const d of s.declarationList.declarations) {
      if (!ts.isIdentifier(d.name) || !d.initializer) continue;
      let x: ts.Expression = d.initializer;
      while (ts.isCallExpression(x) || ts.isPropertyAccessExpression(x)) x = x.expression;
      if (ts.isIdentifier(x) && x.text.endsWith("Procedure")) alias.set(d.name.text, x.text);
    }
  }
  const rolle = (wurzel: string) => ROLLEN[alias.get(wurzel) ?? wurzel] ?? wurzel;

  const objekte = new Map<string, { prozeduren: Prozedur[]; spreads: string[] }>();
  for (const s of sf.statements) {
    if (!ts.isVariableStatement(s)) continue;
    for (const d of s.declarationList.declarations) {
      if (!ts.isIdentifier(d.name) || !d.initializer) continue;
      let obj: ts.Expression | undefined = d.initializer;
      if (ts.isCallExpression(obj) && ts.isIdentifier(obj.expression) && obj.expression.text === "router") obj = obj.arguments[0];
      if (!obj || !ts.isObjectLiteralExpression(obj)) continue;
      const prozeduren: Prozedur[] = [];
      const spreads: string[] = [];
      for (const p of obj.properties) {
        if (ts.isSpreadAssignment(p) && ts.isIdentifier(p.expression)) spreads.push(p.expression.text);
        if (!ts.isPropertyAssignment(p)) continue;
        const pa = prozedurArt(p.initializer);
        if (!pa) continue;
        const name = ts.isIdentifier(p.name) || ts.isStringLiteral(p.name) ? p.name.text : p.name.getText(sf);
        prozeduren.push({ name, art: pa.art, rolle: rolle(pa.wurzel), doku: ersterSatz(kommentarVor(p, sf, text)) });
      }
      if (prozeduren.length || spreads.length) objekte.set(d.name.text, { prozeduren, spreads });
    }
  }
  return objekte;
}

function abschnittRouter(): string[] {
  const z: string[] = [
    "## tRPC-Prozeduren `apps/server/src/routers`",
    "",
    "Aufruf im Web als `trpc.<bereich>.<prozedur>`. Rolle: öffentlich (ohne Anmeldung), angemeldet (jede Rolle), admin (Ausstellungsleitung, mit Zwei-Faktor), richter (Tablet). Feinere Rechte prüft die Prozedur selbst.",
    "",
  ];
  // Bereich je Router-Variable aus router.ts
  const { sf: wurzelSf } = lies(join(WURZEL, "apps/server/src/router.ts"));
  const bereich = new Map<string, string>();
  wurzelSf.forEachChild(function such(n) {
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === "router" && n.arguments[0] && ts.isObjectLiteralExpression(n.arguments[0])) {
      for (const p of n.arguments[0].properties) if (ts.isPropertyAssignment(p) && ts.isIdentifier(p.name) && ts.isIdentifier(p.initializer)) bereich.set(p.initializer.text, p.name.text);
    }
    n.forEachChild(such);
  });

  const pfade = dateien("apps/server/src/routers", (n) => n.endsWith(".ts") && !n.endsWith(".test.ts"));
  const jeDatei = pfade.map((pfad) => ({ pfad, ...lies(join(WURZEL, pfad)) })).map((d) => ({ ...d, objekte: prozedurObjekte(d.sf, d.text) }));
  // Teile, die per `...anmeldung` in einen Router gemischt werden, bekommen dessen Bereich.
  for (const d of jeDatei) for (const [name, o] of d.objekte) for (const s of o.spreads) if (bereich.has(name)) bereich.set(s, bereich.get(name)!);

  for (const d of jeDatei) {
    const rel = relative(join(WURZEL, "apps/server/src"), d.pfad.startsWith("/") ? d.pfad : join(WURZEL, d.pfad));
    const teile = [...d.objekte].filter(([, o]) => o.prozeduren.length);
    const bereiche = [...new Set(teile.map(([n]) => bereich.get(n) ?? "?"))];
    z.push(`### ${rel} (${groesse(zeilen(d.text))})${bereiche.length ? ` → ${bereiche.map((b) => `\`${b}\``).join(", ")}` : ""}`);
    const beschr = dateiKommentar(d.sf, d.text);
    if (beschr) z.push(beschr);
    z.push("");
    for (const [name, o] of teile) {
      const b = bereich.get(name) ?? "?";
      for (const p of o.prozeduren) z.push(`- \`${b}.${p.name}\` ${p.art} · ${p.rolle}${p.doku ? ` – ${p.doku}` : ""}`);
    }
    if (!teile.length) z.push([...d.objekte.values()].some((o) => o.spreads.length) ? "Setzt Teile zu einem Router zusammen." : "Keine Prozeduren (Hilfen für die Router).");
    z.push("");
  }
  return z;
}

// ---------- Seiten ----------

/** Route je Komponente aus apps/web/src/routes.tsx. */
function routen(): Map<string, string[]> {
  const { sf } = lies(join(WURZEL, "apps/web/src/routes.tsx"));
  const datei = new Map<string, string>(); // Komponente → Datei (ohne Endung)
  for (const s of sf.statements) {
    if (!ts.isImportDeclaration(s) || !ts.isStringLiteral(s.moduleSpecifier)) continue;
    const von = s.moduleSpecifier.text;
    const benannt = s.importClause?.namedBindings;
    if (von.startsWith("./seiten/") && benannt && ts.isNamedImports(benannt)) for (const e of benannt.elements) datei.set(e.name.text, basename(von));
  }
  const raus = new Map<string, string[]>();
  const verbinde = (a: string, b: string) => (b.startsWith("/") ? b : `${a.replace(/\/$/, "")}/${b}`);
  function lauf(liste: ts.ArrayLiteralExpression, oben: string) {
    for (const el of liste.elements) {
      if (!ts.isObjectLiteralExpression(el)) continue;
      let pfad = oben;
      let komponente = "";
      let kinder: ts.ArrayLiteralExpression | undefined;
      for (const p of el.properties) {
        if (!ts.isPropertyAssignment(p) || !ts.isIdentifier(p.name)) continue;
        if (p.name.text === "path" && ts.isStringLiteral(p.initializer)) pfad = verbinde(oben, p.initializer.text);
        if (p.name.text === "element") {
          const j = p.initializer;
          if (ts.isJsxSelfClosingElement(j)) komponente = j.tagName.getText(sf);
          else if (ts.isJsxElement(j)) komponente = j.openingElement.tagName.getText(sf);
        }
        if (p.name.text === "children" && ts.isArrayLiteralExpression(p.initializer)) kinder = p.initializer;
      }
      const d = datei.get(komponente);
      if (d && !pfad.endsWith("*")) raus.set(d, [...(raus.get(d) ?? []), pfad || "/"]);
      if (kinder) lauf(kinder, pfad);
    }
  }
  sf.forEachChild(function such(n) {
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === "createBrowserRouter" && n.arguments[0] && ts.isArrayLiteralExpression(n.arguments[0])) lauf(n.arguments[0], "");
    else n.forEachChild(such);
  });
  return raus;
}

/** Aufgerufene tRPC-Prozeduren: `trpc.a.b.useQuery(…)`, `utils.a.b.fetch(…)` usw. */
function aufrufe(text: string): string[] {
  const s = new Set<string>();
  for (const m of text.matchAll(/\btrpc\.(\w+)\.(\w+)\.(use\w+)\b/g)) s.add(`${m[1]}.${m[2]}`);
  for (const m of text.matchAll(/\b\w+\.(\w+)\.(\w+)\.(fetch|ensureData|prefetch)\(/g)) if (m[1] !== "trpc") s.add(`${m[1]}.${m[2]}`);
  return [...s].sort();
}

function abschnittSeiten(): string[] {
  const z: string[] = ["## Seiten `apps/web/src/seiten`", "", "Route aus `apps/web/src/routes.tsx`, dahinter die aufgerufenen Prozeduren.", ""];
  const r = routen();
  for (const pfad of dateien("apps/web/src/seiten", (n) => n.endsWith(".tsx") || n.endsWith(".ts"))) {
    const { text, sf } = lies(join(WURZEL, pfad));
    const name = basename(pfad);
    const route = r.get(name.replace(/\.tsx?$/, ""));
    z.push(`### ${name} (${groesse(zeilen(text))})${route ? ` – ${[...new Set(route)].map((x) => `\`${x}\``).join(", ")}` : ""}`);
    const beschr = dateiKommentar(sf, text);
    if (beschr) z.push(beschr);
    const a = aufrufe(text);
    if (a.length) z.push(`Prozeduren: ${a.join(", ")}`);
    z.push("");
  }
  return z;
}

// ---------- Weitere Dateien ----------

function abschnittWeitere(): string[] {
  const z: string[] = ["## Weitere Dateien", "", "Je Datei: Zeilen, Beschreibung, exportierte Namen.", ""];
  const gruppen: [string, string[]][] = [
    ["Server-Dienste mit Datenbank `apps/server/src/services`", dateien("apps/server/src/services", (n) => n.endsWith(".ts"))],
    ["PDFs `apps/server/src/pdf`", dateien("apps/server/src/pdf", (n) => n.endsWith(".ts"))],
    ["Datenbank `apps/server/src/db`", dateien("apps/server/src/db", (n) => n.endsWith(".ts"))],
    ["Server sonst `apps/server/src`", readdirSync(join(WURZEL, "apps/server/src")).filter((n) => n.endsWith(".ts") && !n.endsWith(".test.ts")).sort().map((n) => `apps/server/src/${n}`)],
    ["Web-Bausteine `apps/web/src`", [...dateien("apps/web/src/komponenten", (n) => /\.tsx?$/.test(n)), ...readdirSync(join(WURZEL, "apps/web/src")).filter((n) => /\.tsx?$/.test(n)).sort().map((n) => `apps/web/src/${n}`)]],
  ];
  for (const [titel, liste] of gruppen) {
    z.push(`### ${titel}`, "");
    for (const pfad of liste) {
      const { text, sf } = lies(join(WURZEL, pfad));
      const beschr = dateiKommentar(sf, text);
      const namen = exporte(sf, text).filter((e) => e.art !== "typ").map((e) => e.name);
      z.push(`- \`${basename(pfad)}\` (${groesse(zeilen(text))})${beschr ? ` – ${beschr}` : ""}${namen.length ? ` · ${namen.join(", ")}` : ""}`);
    }
    z.push("");
  }
  return z;
}

function abschnittTests(): string[] {
  const z: string[] = ["## Server-Tests `apps/server/src/tests`", "", "Laufen nacheinander gegen eine Datenbank (Einstieg `apps/server/src/ablauf.test.ts`); spätere Teile nutzen Daten der früheren.", ""];
  for (const pfad of dateien("apps/server/src/tests", (n) => n.endsWith(".ts"))) {
    const { text, sf } = lies(join(WURZEL, pfad));
    const beschr = dateiKommentar(sf, text) || ersterSatz(kommentarVor(sf.statements[0] ?? sf, sf, text));
    z.push(`- \`${basename(pfad)}\` (${zahl(zeilen(text))} Z.)${beschr ? ` – ${beschr}` : ""}`);
  }
  const weitere = readdirSync(join(WURZEL, "apps/server/src")).filter((n) => n.endsWith(".test.ts") && n !== "ablauf.test.ts").sort();
  if (weitere.length) z.push(`- Außerdem: ${weitere.map((n) => `\`${n}\``).join(", ")}`);
  z.push("");
  return z;
}

// ---------- Ausgabe ----------

export function erzeuge(): string {
  const teile = [
    "# Modulkarte",
    "",
    "Erzeugt mit `bun run modulkarte` aus `scripts/modulkarte.ts` – nicht von Hand ändern. Erst hier suchen, dann die genannte Datei öffnen.",
    `Überblick: \`docs/architektur.md\`, Moduldoku: \`docs/module/\`, Entscheidungen: \`docs/entscheidungen/\`. ⚠ = über ${GRENZE_ZEILEN} Zeilen.`,
    "",
    "Inhalt: [Fachlogik](#fachlogik-packagesdomainsrc) · [tRPC-Prozeduren](#trpc-prozeduren-appsserversrcrouters) · [Seiten](#seiten-appswebsrcseiten) · [Weitere Dateien](#weitere-dateien) · [Server-Tests](#server-tests-appsserversrctests)",
    "",
    ...abschnittDomain(),
    ...abschnittRouter(),
    ...abschnittSeiten(),
    ...abschnittWeitere(),
    ...abschnittTests(),
  ];
  return `${teile.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd()}\n`;
}

if (import.meta.main) {
  const neu = erzeuge();
  const alt = existsSync(ZIEL) ? readFileSync(ZIEL, "utf8") : "";
  if (neu !== alt) writeFileSync(ZIEL, neu);
  const kb = (Buffer.byteLength(neu) / 1024).toFixed(0);
  if (process.argv.includes("--pruefen") && neu !== alt) {
    console.error(`docs/modulkarte.md war veraltet und ist neu geschrieben (${kb} KB) – bitte mit committen.`);
    process.exit(1);
  }
  console.log(`docs/modulkarte.md ${neu === alt ? "aktuell" : "geschrieben"} (${zahl(zeilen(neu))} Zeilen, ${kb} KB).`);
}
