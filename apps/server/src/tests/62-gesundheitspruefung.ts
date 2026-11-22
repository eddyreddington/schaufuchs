/**
 * Gesundheitsprüfung `/api/gesund` (Entscheidung 024): neben `ok` und `version` die letzte Sicherung, offene
 * Migrationen und laufende Schautage.
 */
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { migrationsverzeichnisFehler } from "@schau/domain";
import { gesundAngaben } from "../services/gesundheitspruefung";
import { adminKontext, m } from "./kontext";

describe("Gesundheitsprüfung", () => {
  test("bisherige Antwort bleibt, die neuen Angaben kommen dazu", async () => {
    const server = (await import("../index")).default;
    const r = await server.fetch(new Request("http://test/api/gesund"));
    expect(r.status).toBe(200);
    const j = (await r.json()) as Record<string, unknown>;
    expect(j.ok).toBe(true);
    expect(typeof j.version).toBe("string");
    expect(typeof j.schautage).toBe("boolean");
    expect(Object.keys(j)).toEqual(expect.arrayContaining(["letzteSicherung", "sicherungAlterStunden", "migrationenOffen"]));
  });

  test("fehlen die Zusatzangaben, bleibt die Prüfung bestanden – gleiche Form, alles unbekannt", async () => {
    const server = (await import("../index")).default;
    await m.sql.unsafe("alter table sicherung rename to sicherung_beiseite");
    try {
      const r = await server.fetch(new Request("http://test/api/gesund"));
      expect(r.status).toBe(200);
      const j = (await r.json()) as Record<string, unknown>;
      expect(j).toMatchObject({ ok: true, letzteSicherung: null, sicherungAlterStunden: null, migrationenOffen: null, schautage: null });
    } finally {
      await m.sql.unsafe("alter table sicherung_beiseite rename to sicherung");
    }
  });

  test("Alter der letzten Sicherung aus der Meldung des Sicherungsdienstes", async () => {
    const [vorher] = await m.db.select().from(m.schema.sicherung);
    try {
      await m.db.delete(m.schema.sicherung);
      expect((await gesundAngaben()).sicherungAlterStunden).toBeNull();
      // So meldet scripts/backup.sh – zweimal, die Tabelle hat nur eine Zeile.
      const melden = "insert into sicherung (id, am) values (1, now()) on conflict (id) do update set am = excluded.am";
      await m.sql.unsafe(melden);
      await m.sql.unsafe(melden);
      const zeilen = await m.db.select().from(m.schema.sicherung);
      expect(zeilen).toHaveLength(1);
      const am = zeilen[0]!.am;
      const spaeter = new Date(am.getTime() + 5.5 * 3_600_000);
      const a = await gesundAngaben(spaeter);
      expect(a.sicherungAlterStunden).toBe(5);
      expect(a.letzteSicherung).toBe(am.toISOString());
      // Promise.resolve: eine Abfrage von postgres.js ist kein Promise, `rejects` bliebe daran hängen.
      await expect(Promise.resolve(m.sql.unsafe("insert into sicherung (id, am) values (2, now())"))).rejects.toThrow("sicherung_eine_zeile");
    } finally {
      await m.db.delete(m.schema.sicherung);
      if (vorher) await m.db.insert(m.schema.sicherung).values(vorher);
    }
  });

  test("Migrationsverzeichnis: Nummern, Zeitstempel und Schnappschüsse passen (nach jedem Merge)", () => {
    const ordner = join(import.meta.dir, "../../drizzle");
    const lies = (datei: string) => JSON.parse(readFileSync(join(ordner, datei), "utf8"));
    const schnappschuesse = readdirSync(join(ordner, "meta"))
      .filter((d) => d.endsWith("_snapshot.json"))
      .map((datei) => ({ datei, id: lies(`meta/${datei}`).id as string, prevId: lies(`meta/${datei}`).prevId as string }));
    const dateien = readdirSync(ordner).filter((d) => d.endsWith(".sql"));
    expect(migrationsverzeichnisFehler({ journal: lies("meta/_journal.json").entries, dateien, schnappschuesse })).toEqual([]);
  });

  test("offene Migrationen gegen das Verzeichnis der eingespielten", async () => {
    const journal = JSON.parse(readFileSync(join(import.meta.dir, "../../drizzle/meta/_journal.json"), "utf8")) as { entries: { when: number }[] };
    const whens = journal.entries.map((e) => e.when);
    const [{ da }] = (await m.sql`select to_regclass('drizzle.__drizzle_migrations') is not null as da`) as unknown as [{ da: boolean }];
    if (da) {
      // Datenbank mit echtem Verzeichnis (nicht über db:push angelegt): nur die Form prüfen, nichts anfassen.
      expect(typeof (await gesundAngaben()).migrationenOffen).toBe("number");
      return;
    }
    // db:push führt kein Verzeichnis: nicht feststellbar.
    expect((await gesundAngaben()).migrationenOffen).toBeNull();
    const [{ schemaDa }] = (await m.sql`select exists (select 1 from pg_namespace where nspname = 'drizzle') as "schemaDa"`) as unknown as [{ schemaDa: boolean }];
    try {
      await m.sql.unsafe("create schema if not exists drizzle");
      await m.sql.unsafe("create table drizzle.__drizzle_migrations (id serial primary key, hash text not null, created_at bigint)");
      expect((await gesundAngaben()).migrationenOffen).toBe(whens.length);
      await m.sql`insert into drizzle.__drizzle_migrations (hash, created_at) values ('a', ${whens.at(-2)!})`;
      expect((await gesundAngaben()).migrationenOffen).toBe(1);
      await m.sql`insert into drizzle.__drizzle_migrations (hash, created_at) values ('b', ${whens.at(-1)!})`;
      expect((await gesundAngaben()).migrationenOffen).toBe(0);
    } finally {
      await m.sql.unsafe("drop table if exists drizzle.__drizzle_migrations");
      if (!schemaDa) await m.sql.unsafe("drop schema if exists drizzle");
    }
  });

  test("Schautage: vom Tag vor der Bewertung bis zum letzten Öffnungstag, Testschauen und abgeschlossene nie", async () => {
    const al = m.appRouter.createCaller(adminKontext);
    const daten = { bewertungAm: "2031-03-07", oeffnungszeiten: "Sa 8.3. 9–17 Uhr\nSo 9.3. 9–15 Uhr" };
    const setze = (id: number, werte: Partial<typeof m.schema.schau.$inferInsert>) => m.db.update(m.schema.schau).set(werte).where(m.eq(m.schema.schau.id, id));
    const am = (tag: string) => gesundAngaben(new Date(`${tag}T10:00:00Z`)).then((a) => a.schautage);
    const ids: number[] = [];
    const neu = async (name: string) => {
      const { id } = await al.schau.anlegen({ name, ort: "Halle" });
      ids.push(id);
      return id;
    };
    try {
      // Ohne diese Schauen: so, wie die übrigen Schauen der Testdatenbank es ergeben.
      const ohne = await am("2031-03-08");
      const laufend = await neu("Gesund Schautage");
      await setze(laufend, daten);
      expect(await am("2031-03-05")).toBe(await am("2031-02-01"));
      expect(await am("2031-03-06")).toBe(true);
      expect(await am("2031-03-09")).toBe(true);
      // Eine Testschau wird nie wieder echt (Schutz in der Datenbank) – darum für „abgeschlossen“ eine zweite Schau.
      await setze(laufend, { test: true });
      expect(await am("2031-03-08")).toBe(ohne);
      const fertig = await neu("Gesund abgeschlossen");
      await setze(fertig, { ...daten, phase: "abgeschlossen" });
      expect(await am("2031-03-08")).toBe(ohne);
    } finally {
      // Löschen geht nicht (das Protokoll der Schau ist geschützt) – als Testschauen zählen sie nirgends mehr mit.
      for (const id of ids) await setze(id, { test: true });
    }
  });
});
