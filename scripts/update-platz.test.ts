/**
 * Platz und Aufräumen bei Updates: scripts/docker-start.sh (Selbstbau) und `schaufuchs update` (fertige Programme),
 * dazu die Sperre in scripts/wiederherstellen.sh gegen ein Zurücknehmen auf dieselbe Version.
 * Ohne Aufräumen läuft die Platte mit jedem Update voll, und die Datenbank bleibt stehen. Docker und df werden durch
 * Skripte ersetzt, die jeden Aufruf mitschreiben – es wird nichts gebaut, gezogen oder gelöscht.
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const REPO = join(import.meta.dir, "..");
let ordner = "";

function ausfuehrbar(datei: string, inhalt: string) {
  writeFileSync(datei, inhalt);
  chmodSync(datei, 0o755);
}

/**
 * Stellvertreter für docker: schreibt mit und antwortet wie eine laufende Installation. Programmstand (Version und
 * Migrationen) aus version-bisher/-neu und migrationen-bisher/-neu (bisher gilt auch für vorher); scheitert-aufraeumen
 * lässt `builder prune` scheitern.
 */
function dockerAttrappe(zusatz = "") {
  ausfuehrbar(
    join(ordner, "bin", "docker"),
    `#!/bin/sh
echo "$*" >> "${ordner}/aufrufe"
case "$*" in
${zusatz}
  "info -f {{.DockerRootDir}}") echo "${ordner}" ;;
  "compose ps --status running --services") echo db ;;
  "image inspect -f {{.Id}} gefluegelschau-app:bisher") echo sha256:alt ;;
  "image inspect -f {{.Id}} gefluegelschau-app:latest") echo sha256:neu ;;
  *"--entrypoint cat gefluegelschau-app:bisher"* | *"--entrypoint cat gefluegelschau-app:vorher"*) echo "export const VERSION = \\"$(cat "${ordner}/version-bisher")\\";"; case "$*" in *_journal.json*) cat "${ordner}/migrationen-bisher" ;; esac ;;
  *"--entrypoint cat gefluegelschau-app:latest"*) echo "export const VERSION = \\"$(cat "${ordner}/version-neu")\\";"; case "$*" in *_journal.json*) cat "${ordner}/migrationen-neu" ;; esac ;;
  "builder prune -af") [ ! -f "${ordner}/scheitert-aufraeumen" ] || exit 1; touch "${ordner}/aufgeraeumt" ;;
esac
exit 0
`,
  );
}

/** Stellvertreter für df: frei-vorher bzw. (nach dem Aufräumen) frei-nachher in KB. */
function dfAttrappe() {
  ausfuehrbar(
    join(ordner, "bin", "df"),
    `#!/bin/sh
datei="${ordner}/frei-vorher"
[ ! -f "${ordner}/aufgeraeumt" ] || datei="${ordner}/frei-nachher"
echo "Filesystem 1024-blocks Used Available Capacity Mounted"
echo "/dev/vda1 41000000 1 $(cat "$datei") 1% /"
`,
  );
}

const GB = (n: number) => String(n * 1048576);

function aufrufe() {
  return existsSync(join(ordner, "aufrufe")) ? readFileSync(join(ordner, "aufrufe"), "utf8").trim().split("\n") : [];
}

beforeEach(() => {
  ordner = mkdtempSync(join(tmpdir(), "platz-"));
  mkdirSync(join(ordner, "bin"));
  mkdirSync(join(ordner, "scripts"));
  mkdirSync(join(ordner, "backups"));
  dockerAttrappe();
  dfAttrappe();
  writeFileSync(join(ordner, "frei-vorher"), GB(50));
  writeFileSync(join(ordner, "frei-nachher"), GB(50));
  writeFileSync(join(ordner, "version-bisher"), "1.11.0");
  writeFileSync(join(ordner, "version-neu"), "1.12.0");
  writeFileSync(join(ordner, "migrationen-bisher"), '{"entries":[66]}');
  writeFileSync(join(ordner, "migrationen-neu"), '{"entries":[66]}');
});

afterEach(() => rmSync(ordner, { recursive: true, force: true }));

describe("scripts/docker-start.sh", () => {
  beforeEach(() => {
    copyFileSync(join(REPO, "scripts", "docker-start.sh"), join(ordner, "scripts", "docker-start.sh"));
    writeFileSync(join(ordner, ".env"), "DATENSCHLUESSEL=probe\nBACKUP_EMPFAENGER=age1probe\n");
  });

  function start(env: Record<string, string> = {}) {
    const r = Bun.spawnSync(["sh", join(ordner, "scripts", "docker-start.sh")], {
      env: { ...process.env, PATH: `${join(ordner, "bin")}:${process.env.PATH}`, MIN_FREI_GB: "", ...env },
    });
    return { code: r.exitCode, aus: r.stdout.toString(), fehler: r.stderr.toString(), aufrufe: aufrufe() };
  }
  const ablauf = (a: string[]) => a.filter((x) => /^(builder|image prune|image rm|tag|compose (run|build|up))/.test(x));
  const AUFRAEUMEN = ["builder prune -af", "image prune -f --filter label=com.docker.compose.project=gefluegelschau"];
  const BAU = ["compose run --rm --no-deps backup einmal vor-update", "tag gefluegelschau-app:latest gefluegelschau-app:bisher", "compose build app backup"];

  test("genug Platz: sichern, bauen, starten, danach aufräumen; neue Version → bisheriges Programm wird vorher", () => {
    const r = start();
    expect(r.code).toBe(0);
    expect(ablauf(r.aufrufe)).toEqual([...BAU, "tag gefluegelschau-app:bisher gefluegelschau-app:vorher", "image rm gefluegelschau-app:bisher", "compose up -d", ...AUFRAEUMEN]);
    expect(r.aus).toContain("(1.11.0) aufgehoben als gefluegelschau-app:vorher");
  });

  test("derselbe Stand neu gebaut (andere ID, z. B. ohne Cache): vorher bleibt, wie es ist", () => {
    writeFileSync(join(ordner, "version-bisher"), "1.12.0");
    const r = start();
    expect(r.code).toBe(0);
    expect(r.aufrufe).not.toContain("tag gefluegelschau-app:bisher gefluegelschau-app:vorher");
  });

  test("gleiche Versionsnummer, aber neue Migration: bisheriges Programm wird vorher", () => {
    writeFileSync(join(ordner, "version-bisher"), "1.12.0");
    writeFileSync(join(ordner, "migrationen-neu"), '{"entries":[66,67]}');
    expect(start().aufrufe).toContain("tag gefluegelschau-app:bisher gefluegelschau-app:vorher");
  });

  test("Programmstand nicht lesbar (ältere Programme): wie bisher nach der ID", () => {
    writeFileSync(join(ordner, "version-bisher"), "1.12.0");
    dockerAttrappe('  *"--entrypoint cat gefluegelschau-app:"*) exit 1 ;;');
    expect(start().aufrufe).toContain("tag gefluegelschau-app:bisher gefluegelschau-app:vorher");
  });

  test("knapp: erst aufräumen; reicht es dann, geht das Update weiter", () => {
    writeFileSync(join(ordner, "frei-vorher"), GB(2));
    const r = start();
    expect(r.code).toBe(0);
    expect(r.aus).toContain("nur 2 GB frei");
    expect(ablauf(r.aufrufe).slice(0, 3)).toEqual([...AUFRAEUMEN, BAU[0]!]);
  });

  test("zu knapp auch nach dem Aufräumen: abbrechen, bevor gesichert oder gebaut wird", () => {
    writeFileSync(join(ordner, "frei-vorher"), GB(2));
    writeFileSync(join(ordner, "frei-nachher"), GB(3));
    const r = start();
    expect(r.code).toBe(1);
    expect(r.fehler).toContain("nur 3 GB frei, mindestens 5 GB nötig");
    expect(ablauf(r.aufrufe)).toEqual(AUFRAEUMEN);
  });

  test("MIN_FREI_GB aus der .env; ein ungültiger Wert bricht ab", () => {
    writeFileSync(join(ordner, ".env"), "DATENSCHLUESSEL=probe\nBACKUP_EMPFAENGER=age1probe\nMIN_FREI_GB=60\n");
    expect(start().fehler).toContain("mindestens 60 GB nötig");
    const ungueltig = start({ MIN_FREI_GB: "2.5" });
    expect(ungueltig.code).toBe(1);
    expect(ungueltig.fehler).toContain("ganze Zahl");
  });

  test("Aufräumen scheitert nach dem Start: nur eine Warnung, das Update gilt", () => {
    writeFileSync(join(ordner, "scheitert-aufraeumen"), "");
    const r = start();
    expect(r.code).toBe(0);
    expect(r.aufrufe).toContain("compose up -d");
    expect(r.fehler).toContain("Warnung: Aufräumen fehlgeschlagen");
  });
});

describe("schaufuchs update", () => {
  const BILD = "ghcr.io/beispiel/schaufuchs";

  beforeEach(() => {
    copyFileSync(join(REPO, "deploy", "schaufuchs"), join(ordner, "schaufuchs"));
    writeFileSync(join(ordner, ".env"), `SCHAUFUCHS_IMAGE=${BILD}\nSCHAUFUCHS_VERSION=1.12.0\nSCHAUFUCHS_VORHER=1.11.0\n`);
    // Vorhandene Programme: vier Versionen, je App und Sicherung, dazu ein fremdes.
    const liste = ["1.10.0", "1.11.0", "1.12.0", "1.13.0"].flatMap((v) => [`${BILD}:${v}`, `${BILD}-backup:${v}`]).concat(`${BILD}:<none>`, "postgres:16-alpine");
    dockerAttrappe(`  "images --format {{.Repository}}:{{.Tag}}") printf '%s\\n' ${liste.map((x) => `'${x}'`).join(" ")} ;;`);
  });

  function update() {
    const r = Bun.spawnSync(["sh", join(ordner, "schaufuchs"), "update", "1.13.0"], {
      env: { ...process.env, PATH: `${join(ordner, "bin")}:${process.env.PATH}`, SCHAUFUCHS_QUELLE: REPO },
    });
    return { code: r.exitCode, fehler: r.stderr.toString(), aufrufe: aufrufe() };
  }

  test("nach dem Update bleiben nur die neue und die vorige Version", () => {
    const r = update();
    expect(r.fehler).toBe("");
    expect(r.code).toBe(0);
    expect(r.aufrufe.filter((a) => a.startsWith("image rm")).sort()).toEqual([`image rm ${BILD}-backup:1.10.0`, `image rm ${BILD}-backup:1.11.0`, `image rm ${BILD}:1.10.0`, `image rm ${BILD}:1.11.0`]);
  });

  test("zu wenig Platz: erst ältere Versionen löschen, reicht es nicht, abbrechen, bevor gesichert oder gezogen wird", () => {
    writeFileSync(join(ordner, "frei-vorher"), GB(2));
    const r = update();
    expect(r.code).toBe(1);
    expect(r.fehler).toContain("Nur noch 2 GB frei");
    // Laufende 1.12.0 und vorige 1.11.0 bleiben.
    expect(r.aufrufe.filter((a) => a.startsWith("image rm")).sort()).toEqual([`image rm ${BILD}-backup:1.10.0`, `image rm ${BILD}-backup:1.13.0`, `image rm ${BILD}:1.10.0`, `image rm ${BILD}:1.13.0`]);
    expect(r.aufrufe.some((a) => /backup einmal|pull/.test(a))).toBe(false);
  });
});

describe("scripts/wiederherstellen.sh --vorherige-version", () => {
  beforeEach(() => {
    copyFileSync(join(REPO, "scripts", "wiederherstellen.sh"), join(ordner, "scripts", "wiederherstellen.sh"));
    writeFileSync(join(ordner, "backups", "probe.dump"), "");
  });
  // Ohne Antwort auf „Fortfahren?“ bricht das Skript danach ohnehin ab – hier zählt nur, ob es so weit kommt.
  const zuruecknehmen = () => {
    const r = Bun.spawnSync(["sh", join(ordner, "scripts", "wiederherstellen.sh"), "--vorherige-version", join(ordner, "backups", "probe.dump")], {
      env: { ...process.env, PATH: `${join(ordner, "bin")}:${process.env.PATH}` },
      stdin: "ignore",
    });
    return { fehler: r.stderr.toString(), aufrufe: aufrufe() };
  };

  test("vorher ist derselbe Programmstand wie das laufende Programm: abbrechen, bevor etwas angefasst wird", () => {
    writeFileSync(join(ordner, "version-bisher"), "1.12.0");
    const r = zuruecknehmen();
    expect(r.fehler).toContain("derselbe Programmstand (1.12.0)");
    expect(r.aufrufe.some((a) => a.startsWith("compose"))).toBe(false);
  });

  test("vorher hat eine andere Version oder andere Migrationen: es geht weiter", () => {
    expect(zuruecknehmen().aufrufe).toContain("compose up -d db");
    writeFileSync(join(ordner, "version-bisher"), "1.12.0");
    writeFileSync(join(ordner, "migrationen-neu"), '{"entries":[66,67]}');
    const r = zuruecknehmen();
    expect(r.fehler).not.toContain("derselbe Programmstand");
    expect(r.aufrufe.filter((a) => a === "compose up -d db")).toHaveLength(2);
  });
});
