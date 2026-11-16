/**
 * Übersetzung der Oberfläche (Entscheidung 022): kein deutscher Rest im Quelltext von apps/web, kein deutscher Text
 * verloren oder verändert, jede Meldung des Servers übersetzbar. Vollständigkeit der Sprachen prüft
 * packages/domain/src/sprachen/oberflaeche.test.ts.
 */
import { describe, expect, test } from "bun:test";
import { reste, serverOhneUebersetzung, verloren } from "./sprachen-scan";

const zeile = (s: { datei: string; zeile?: number; text: string }) => `${s.datei}${s.zeile ? `:${s.zeile}` : ""}  ${s.text}`;

describe("Sprachen der Oberfläche (Entscheidung 022)", () => {
  test("kein deutscher Text mehr im Quelltext der Oberfläche (sonst „// bleibt deutsch“)", () => {
    expect(reste().map(zeile)).toEqual([]);
  });

  test("Deutsch unverändert: jeder Text von vorher steht wortgleich im Quelltext oder in den deutschen Texten", async () => {
    expect((await verloren()).map(zeile)).toEqual([]);
  });

  test("jede Meldung des Servers hat eine Übersetzung", async () => {
    expect((await serverOhneUebersetzung()).map(zeile)).toEqual([]);
  });
});
