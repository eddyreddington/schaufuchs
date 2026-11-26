/**
 * Betrieb der fertigen Installation (Entscheidung 037): Prüfsummen und Image-Digests bei Installation, Update und
 * Rücknahme, Rechte der .env, Notfallblatt nicht beim Benutzer der Sicherungen, Hinweise in scripts/docker-start.sh.
 * Docker und die Systembefehle werden durch Skripte ersetzt, die jeden Aufruf mitschreiben – es wird nichts gezogen,
 * gestartet oder verlinkt.
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const REPO = join(import.meta.dir, "..");
const BILD = "ghcr.io/beispiel/schaufuchs";
const DIGEST_APP = `sha256:${"a".repeat(64)}`;
const DIGEST_BACKUP = `sha256:${"b".repeat(64)}`;
const DATEIEN = ["deploy/docker-compose.yml", "deploy/Caddyfile", "deploy/schaufuchs", "scripts/wiederherstellen.sh"];
let ordner = "";
let quelle = "";

function ausfuehrbar(datei: string, inhalt: string) {
  writeFileSync(datei, inhalt);
  chmodSync(datei, 0o755);
}
const aufrufe = () => (existsSync(join(ordner, "aufrufe")) ? readFileSync(join(ordner, "aufrufe"), "utf8").trim().split("\n") : []);
const sha256 = (datei: string) => new Bun.CryptoHasher("sha256").update(readFileSync(datei)).digest("hex");

/** Prüfsummen der Release-Dateien und Digests der Programme, wie der Workflow „Veröffentlichen“ sie anhängt. */
function pruefsummen(aendern: Record<string, string> = {}, release?: string) {
  const zeilen = DATEIEN.map((d) => `${aendern[d] ?? sha256(join(quelle, d))}  ${d}`);
  zeilen.push(`${aendern["image/schaufuchs"] ?? DIGEST_APP}  image/schaufuchs`, `${aendern["image/schaufuchs-backup"] ?? DIGEST_BACKUP}  image/schaufuchs-backup`);
  // Ab 1.22.1 nennt die signierte Datei die Version (sonst ließe sie sich unter eine andere Version kopieren).
  if (release) zeilen.push(`${release}  release`);
  writeFileSync(join(quelle, "SHA256SUMS"), zeilen.join("\n") + "\n");
}

beforeEach(() => {
  ordner = mkdtempSync(join(tmpdir(), "betrieb-"));
  quelle = join(ordner, "quelle");
  for (const d of ["bin", "scripts", "backups", "quelle/deploy", "quelle/scripts", "home"]) mkdirSync(join(ordner, d), { recursive: true });
  for (const d of DATEIEN) copyFileSync(join(REPO, d), join(quelle, d));
  // Programme in der Registry: welcher Digest beim Ziehen ankommt (digest-app, digest-backup).
  writeFileSync(join(ordner, "digest-app"), DIGEST_APP);
  writeFileSync(join(ordner, "digest-backup"), DIGEST_BACKUP);
  ausfuehrbar(
    join(ordner, "bin", "docker"),
    `#!/bin/sh
echo "$*" >> "${ordner}/aufrufe"
case "$*" in
  "info -f {{.DockerRootDir}}") echo "${ordner}" ;;
  "image inspect -f "*" ${BILD}-backup:"*) echo "${BILD}-backup@$(cat "${ordner}/digest-backup")" ;;
  "image inspect -f "*" ${BILD}:"*) echo "${BILD}@$(cat "${ordner}/digest-app")" ;;
  "run --rm --entrypoint age-keygen "*) printf '# created: heute\\n# public key: age1probe\\nAGE-SECRET-KEY-1PROBE\\n' ;;
esac
exit 0
`,
  );
  ausfuehrbar(join(ordner, "bin", "df"), `#!/bin/sh\necho "Filesystem 1024-blocks Used Available Capacity Mounted"\necho "/dev/vda1 41000000 1 ${50 * 1048576} 1% /"\n`);
});

afterEach(() => rmSync(ordner, { recursive: true, force: true }));

describe("schaufuchs update und zuruecknehmen: Prüfsummen und Digests", () => {
  beforeEach(() => {
    copyFileSync(join(REPO, "deploy", "schaufuchs"), join(ordner, "schaufuchs"));
    writeFileSync(join(ordner, ".env"), `SCHAUFUCHS_IMAGE=${BILD}\nSCHAUFUCHS_VERSION=1.12.0\nSCHAUFUCHS_VORHER=1.11.0\n`, { mode: 0o600 });
  });

  function lauf(args: string[], env: Record<string, string> = {}) {
    // umask wie unter sudo (022): neue Dateien wären sonst für alle lesbar.
    const r = Bun.spawnSync(["sh", "-c", 'umask 022; exec sh "$0" "$@"', join(ordner, "schaufuchs"), ...args], {
      env: { ...process.env, PATH: `${join(ordner, "bin")}:${process.env.PATH}`, SCHAUFUCHS_QUELLE: quelle, ...env },
    });
    return { code: r.exitCode, aus: r.stdout.toString(), fehler: r.stderr.toString(), aufrufe: aufrufe(), env: readFileSync(join(ordner, ".env"), "utf8") };
  }
  const update = () => lauf(["update", "1.13.0"]);
  const unveraendert = (r: ReturnType<typeof lauf>) => {
    expect(r.code).toBe(1);
    expect(r.env).toContain("SCHAUFUCHS_VERSION=1.12.0");
    expect(readFileSync(join(ordner, "schaufuchs"), "utf8")).toBe(readFileSync(join(REPO, "deploy", "schaufuchs"), "utf8"));
    expect(r.aufrufe).not.toContain("compose up -d");
    for (const d of ["docker-compose.yml.neu", "Caddyfile.neu", "schaufuchs.neu", "scripts/wiederherstellen.sh.neu", ".env.neu"]) expect(existsSync(join(ordner, d))).toBe(false);
  };

  test("Prüfsummen und Digests stimmen: Update, Digests stehen in der .env", () => {
    pruefsummen();
    const r = update();
    expect(r.fehler).toBe("");
    expect(r.code).toBe(0);
    expect(r.env).toContain("SCHAUFUCHS_VERSION=1.13.0");
    expect(r.env).toContain(`SCHAUFUCHS_DIGEST_APP=${DIGEST_APP}`);
    expect(r.env).toContain(`SCHAUFUCHS_DIGEST_BACKUP=${DIGEST_BACKUP}`);
  });

  test("eine geladene Datei weicht ab: nichts verändert", () => {
    pruefsummen({ "deploy/schaufuchs": "0".repeat(64) });
    const r = update();
    unveraendert(r);
    expect(r.fehler).toContain("Prüfsumme");
  });

  test("ein Programm in der Registry wurde ersetzt (anderer Digest unter demselben Tag): nichts verändert", () => {
    pruefsummen();
    writeFileSync(join(ordner, "digest-app"), `sha256:${"c".repeat(64)}`);
    const r = update();
    unveraendert(r);
    expect(r.fehler).toContain("Programm");
  });

  test("update auf eine ältere Version: abgelehnt mit Hinweis auf zuruecknehmen, nichts verändert", () => {
    for (const aelter of ["1.11.0", "1.9.9", "0.20.0"]) {
      const r = lauf(["update", aelter]);
      unveraendert(r);
      expect(r.fehler + r.aus).toContain("zuruecknehmen");
      expect(r.aufrufe.join("\n")).not.toContain("vor-update");
    }
    // Höhere Versionen (auch zweistellige Teile) gehen weiter.
    expect(lauf(["update", "1.12.10"]).env).toContain("SCHAUFUCHS_VERSION=1.12.10");
  });

  // Ab 1.22.1 signiert der Maintainer SHA256SUMS außerhalb von GitHub (Entscheidung 037, Nachtrag): ohne gültige
  // Signatur kein Update – auch nicht, wenn jemand Release und Prüfsummen auf GitHub austauscht.
  function schluessel(name: string) {
    const k = join(ordner, name);
    Bun.spawnSync(["ssh-keygen", "-q", "-t", "ed25519", "-N", "", "-C", "schaufuchs-release", "-f", k], { stdin: "ignore" });
    return { privat: k, oeffentlich: readFileSync(`${k}.pub`, "utf8").trim().split(" ").slice(0, 2).join(" ") };
  }
  // ssh-keygen fragt vor dem Überschreiben einer vorhandenen Signatur nach – daher vorher löschen, ohne Eingabe.
  const signieren = (privat: string) => {
    rmSync(join(quelle, "SHA256SUMS.sig"), { force: true });
    // Ohne SSH-Agent: ein Agent (z. B. aus dem Passwortmanager) würde auf eine Bestätigung warten.
    const { SSH_AUTH_SOCK: _, ...ohneAgent } = process.env;
    Bun.spawnSync(["ssh-keygen", "-Y", "sign", "-f", privat, "-n", "schaufuchs-release", join(quelle, "SHA256SUMS")], { stdin: "ignore", env: ohneAgent });
  };
  const signiert = (env: Record<string, string>, version = "1.23.0") => lauf(["update", version], env);

  test("signiertes Release ab 1.22.1: mit gültiger Signatur Update, ohne oder mit fremder Signatur nichts verändert", () => {
    const echt = schluessel("echt");
    const fremd = schluessel("fremd");
    const env = { SCHAUFUCHS_RELEASE_SCHLUESSEL: echt.oeffentlich };
    pruefsummen({}, "v1.23.0");
    // Ohne Signatur: abgelehnt.
    let r = signiert(env);
    unveraendert(r);
    expect(r.fehler + r.aus).toContain("Signatur");
    // Signatur mit einem anderen Schlüssel: abgelehnt.
    signieren(fremd.privat);
    r = signiert(env);
    unveraendert(r);
    expect(r.fehler + r.aus).toContain("Signatur");
    // Gültig: Update.
    signieren(echt.privat);
    r = signiert(env);
    expect(r.code).toBe(0);
    expect(r.env).toContain("SCHAUFUCHS_VERSION=1.23.0");
  });

  test("gültig signierte Prüfsummen einer anderen Version (kopiert): nichts verändert", () => {
    const echt = schluessel("echt");
    pruefsummen({}, "v1.23.0");
    signieren(echt.privat);
    const r = signiert({ SCHAUFUCHS_RELEASE_SCHLUESSEL: echt.oeffentlich }, "9.0.0");
    unveraendert(r);
    expect(r.fehler + r.aus).toContain("9.0.0");
  });

  test("Versionen außerhalb des Schemas (rc, zweistellig, mit v): Signatur trotzdem Pflicht", () => {
    for (const v of ["1.23.0-rc1", "2.0", "2.0.0a", "v1.23.0"]) {
      pruefsummen();
      const r = signiert({ SCHAUFUCHS_RELEASE_SCHLUESSEL: schluessel(`k${v}`).oeffentlich }, v);
      unveraendert(r);
    }
  });

  test("öffentlicher Release-Schlüssel in schaufuchs und install.sh gleich", () => {
    const k = (d: string) => /^RELEASE_SCHLUESSEL="(ssh-ed25519 [A-Za-z0-9+/=]+)"$/m.exec(readFileSync(join(REPO, "deploy", d), "utf8"))?.[1];
    expect(k("schaufuchs")).toBeTruthy();
    expect(k("schaufuchs")).toBe(k("install.sh"));
  });

  test("Release ab 1.22.1 ganz ohne Prüfsummen: nichts verändert (kein Rückfall auf ungeprüft)", () => {
    const r = signiert({ SCHAUFUCHS_RELEASE_SCHLUESSEL: schluessel("echt").oeffentlich });
    unveraendert(r);
    expect(r.fehler + r.aus).toContain("Prüfsummen");
  });

  test("Release ohne Prüfsummen (vor der Umstellung): Update wie bisher, mit Hinweis", () => {
    const r = update();
    expect(r.code).toBe(0);
    expect(r.aus).toContain("ohne Prüfsummen");
    expect(r.env).toContain("SCHAUFUCHS_VERSION=1.13.0");
  });

  test("zuruecknehmen: weicht das vorige Programm vom gemerkten Digest ab, wird nichts zurückgespielt", () => {
    writeFileSync(join(ordner, ".env"), `SCHAUFUCHS_IMAGE=${BILD}\nSCHAUFUCHS_VERSION=1.13.0\nSCHAUFUCHS_VORHER=1.12.0\nSCHAUFUCHS_VORHER_DIGEST_APP=sha256:${"d".repeat(64)}\nSCHAUFUCHS_VORHER_DIGEST_BACKUP=${DIGEST_BACKUP}\n`, { mode: 0o600 });
    writeFileSync(join(ordner, "backups", "schau-2026-11-20-1200-vor-update.dump.age"), "");
    ausfuehrbar(join(ordner, "scripts", "wiederherstellen.sh"), `#!/bin/sh\ntouch "${ordner}/zurueckgespielt"\n`);
    writeFileSync(join(ordner, "schluessel.txt"), "AGE-SECRET-KEY-1PROBE\n");
    const r = lauf(["zuruecknehmen"], { SCHAUFUCHS_SCHLUESSEL: join(ordner, "schluessel.txt"), SCHAUFUCHS_TMP: ordner });
    expect(r.code).toBe(1);
    expect(r.fehler).toContain("Programm");
    expect(existsSync(join(ordner, "zurueckgespielt"))).toBe(false);
    expect(r.env).toContain("SCHAUFUCHS_VERSION=1.13.0");
  });

  test("die Zwischendatei der .env ist nur für den Besitzer lesbar", () => {
    // Stellvertreter für rm: schreibt die Rechte der Zwischendatei mit, bevor sie gelöscht wird.
    ausfuehrbar(join(ordner, "bin", "rm"), `#!/bin/sh\nfor a; do case "$a" in *.env.neu) [ ! -f "$a" ] || ls -l "$a" | cut -c1-10 >> "${ordner}/rechte" ;; esac; done\nexec /bin/rm "$@"\n`);
    pruefsummen();
    expect(update().code).toBe(0);
    const rechte = readFileSync(join(ordner, "rechte"), "utf8").trim().split("\n");
    expect(rechte.length).toBeGreaterThan(0);
    for (const x of rechte) expect(x).toBe("-rw-------");
  });
});

describe("install.sh (Linux, aufgerufen mit sudo)", () => {
  const ziel = () => join(ordner, "opt");
  beforeEach(() => {
    const bin = join(ordner, "bin");
    ausfuehrbar(join(bin, "uname"), `#!/bin/sh\necho Linux\n`);
    ausfuehrbar(join(bin, "id"), `#!/bin/sh\ncase "$*" in "-u") echo 0 ;; *) echo 1000 ;; esac\n`);
    ausfuehrbar(join(bin, "getent"), `#!/bin/sh\ncase "$1" in passwd) echo "benutzer:x:1000:1000::${join(ordner, "home")}:/bin/sh" ;; esac\n`);
    ausfuehrbar(join(bin, "chown"), `#!/bin/sh\necho "chown $*" >> "${ordner}/aufrufe"\n`);
    ausfuehrbar(join(bin, "ln"), `#!/bin/sh\necho "ln $*" >> "${ordner}/aufrufe"\n`);
  });

  function installieren(extra: Record<string, string> = {}) {
    const r = Bun.spawnSync(["sh", join(REPO, "deploy", "install.sh")], {
      env: {
        ...process.env,
        PATH: `${join(ordner, "bin")}:${process.env.PATH}`,
        SUDO_USER: "benutzer",
        SCHAUFUCHS_ZIEL: ziel(),
        SCHAUFUCHS_QUELLE: quelle,
        SCHAUFUCHS_IMAGE: BILD,
        SCHAUFUCHS_VERSION: "1.13.0",
        SCHAUFUCHS_ADRESSE: "localhost",
        SCHAUFUCHS_EMAIL: "probe@example.org",
        SCHAUFUCHS_JA: "1",
        ...extra,
      },
      stdin: "ignore",
    });
    return { code: r.exitCode, aus: r.stdout.toString(), fehler: r.stderr.toString(), aufrufe: aufrufe() };
  }

  test("Notfallblatt nicht im Ordner des Benutzers, dem die Sicherungen gehören, sondern nur für root", () => {
    pruefsummen();
    const r = installieren();
    expect(r.fehler).toBe("");
    expect(r.code).toBe(0);
    expect(existsSync(join(ordner, "home", "schaufuchs-notfallblatt.txt"))).toBe(false);
    const blatt = join(ziel(), "notfallblatt.txt");
    expect(readFileSync(blatt, "utf8")).toContain("AGE-SECRET-KEY-1PROBE");
    expect(statSync(blatt).mode & 0o777).toBe(0o600);
    expect(r.aufrufe.filter((a) => a.startsWith("chown") && a.includes("notfallblatt"))).toEqual([]);
    // Die Sicherungen gehören weiter dem Benutzer.
    expect(r.aufrufe).toContain(`chown 1000:1000 ${join(ziel(), "backups")}`);
    expect(r.aus).toContain(`sudo cat ${blatt}`);
  });

  test("Prüfsumme oder Digest stimmt nicht: Abbruch, bevor Schlüssel angelegt werden", () => {
    pruefsummen({ "deploy/docker-compose.yml": "0".repeat(64) });
    let r = installieren();
    expect(r.code).toBe(1);
    expect(r.fehler).toContain("Prüfsumme");
    expect(existsSync(join(ziel(), ".env"))).toBe(false);
    // Geprüft wird vor dem Ablegen: keine (womöglich veränderte) Datei bleibt liegen, auch keine Zwischendatei.
    for (const d of ["docker-compose.yml", "Caddyfile", "schaufuchs", "scripts/wiederherstellen.sh"]) {
      expect(existsSync(join(ziel(), d))).toBe(false);
      expect(existsSync(join(ziel(), `${d}.neu`))).toBe(false);
    }
    rmSync(ziel(), { recursive: true, force: true });
    pruefsummen();
    writeFileSync(join(ordner, "digest-backup"), `sha256:${"c".repeat(64)}`);
    r = installieren();
    expect(r.code).toBe(1);
    expect(r.fehler).toContain("Programm");
    expect(existsSync(join(ziel(), ".env"))).toBe(false);
  });

  test("Installation ab 1.22.1: nur mit gültiger Signatur der Prüfsummen, sonst Abbruch vor dem Ablegen", () => {
    const k = join(ordner, "sig-schluessel");
    Bun.spawnSync(["ssh-keygen", "-q", "-t", "ed25519", "-N", "", "-C", "schaufuchs-release", "-f", k], { stdin: "ignore" });
    const env = { SCHAUFUCHS_VERSION: "1.23.0", SCHAUFUCHS_RELEASE_SCHLUESSEL: readFileSync(`${k}.pub`, "utf8").trim().split(" ").slice(0, 2).join(" ") };
    pruefsummen({}, "v1.23.0");
    let r = installieren(env);
    expect(r.code).toBe(1);
    expect(r.fehler).toContain("Signatur");
    expect(existsSync(join(ziel(), ".env"))).toBe(false);
    expect(existsSync(join(ziel(), "schaufuchs"))).toBe(false);
    rmSync(ziel(), { recursive: true, force: true });
    const { SSH_AUTH_SOCK: _, ...ohneAgent } = process.env;
    Bun.spawnSync(["ssh-keygen", "-Y", "sign", "-f", k, "-n", "schaufuchs-release", join(quelle, "SHA256SUMS")], { stdin: "ignore", env: ohneAgent });
    r = installieren(env);
    expect(r.fehler).toBe("");
    expect(r.code).toBe(0);
  });

  test("Digests landen in der .env (für die Rücknahme)", () => {
    pruefsummen();
    expect(installieren().code).toBe(0);
    const env = readFileSync(join(ziel(), ".env"), "utf8");
    expect(env).toContain(`SCHAUFUCHS_DIGEST_APP=${DIGEST_APP}`);
    expect(env).toContain(`SCHAUFUCHS_DIGEST_BACKUP=${DIGEST_BACKUP}`);
  });
});

describe("scripts/docker-start.sh (Selbstbau)", () => {
  beforeEach(() => copyFileSync(join(REPO, "scripts", "docker-start.sh"), join(ordner, "scripts", "docker-start.sh")));
  const start = () => {
    const r = Bun.spawnSync(["sh", join(ordner, "scripts", "docker-start.sh")], { env: { ...process.env, PATH: `${join(ordner, "bin")}:${process.env.PATH}`, MIN_FREI_GB: "" } });
    return { code: r.exitCode, aus: r.stdout.toString(), fehler: r.stderr.toString() };
  };

  test("ohne EINRICHTUNG_CODE: Hinweis, wo der Code für die Einrichtung im Browser steht", () => {
    writeFileSync(join(ordner, ".env"), "DATENSCHLUESSEL=probe\nBACKUP_EMPFAENGER=age1probe\nEINRICHTUNG_CODE=\n", { mode: 0o600 });
    const r = start();
    expect(r.code).toBe(0);
    expect(r.fehler).toContain("EINRICHTUNG_CODE");
    writeFileSync(join(ordner, ".env"), "DATENSCHLUESSEL=probe\nBACKUP_EMPFAENGER=age1probe\nEINRICHTUNG_CODE=lang-und-zufaellig\n", { mode: 0o600 });
    expect(start().fehler).not.toContain("EINRICHTUNG_CODE");
  });

  test(".env für alle lesbar: Hinweis mit chmod 600", () => {
    writeFileSync(join(ordner, ".env"), "DATENSCHLUESSEL=probe\nBACKUP_EMPFAENGER=age1probe\nEINRICHTUNG_CODE=x\n");
    chmodSync(join(ordner, ".env"), 0o644);
    expect(start().fehler).toContain("chmod 600 .env");
    chmodSync(join(ordner, ".env"), 0o600);
    expect(start().fehler).not.toContain("chmod 600");
  });
});
