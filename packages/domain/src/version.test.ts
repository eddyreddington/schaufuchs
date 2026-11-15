import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { VERSION } from "./version";

const WURZEL = join(import.meta.dir, "../../..");
const lies = (pfad: string) => readFileSync(join(WURZEL, pfad), "utf8");

// Eine Version steht an mehreren Stellen; vergisst man eine, meldet /api/gesund oder der Installer eine andere als das Release.
describe("Versionsnummer überall gleich", () => {
  test.each(["package.json", "packages/domain/package.json", "apps/server/package.json", "apps/web/package.json"])("%s", (pfad) => {
    expect(JSON.parse(lies(pfad)).version).toBe(VERSION);
  });

  test("Installer lädt dieselbe Version", () => {
    expect(lies("deploy/install.sh")).toContain(`VERSION="\${SCHAUFUCHS_VERSION:-${VERSION}}"`);
  });

  test("Handbücher nennen dieselbe Version", () => {
    for (const h of ["ausstellungsleitung", "helfer", "preisrichter"]) expect(lies(`docs/handbuch/${h}.md`).split("\n")[2]).toStartWith(`SchauFUCHS ${VERSION} ·`);
  });

  test("Versionshinweise enthalten die Version", () => {
    const [haupt, neben] = VERSION.split(".");
    expect(lies(`docs/versionshinweise-${haupt}.${neben}.md`)).toContain(`## ${VERSION} (`);
  });
});
