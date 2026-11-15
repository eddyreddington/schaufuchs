import { describe, expect, test } from "bun:test";
import { lizenzUrlVon, pruefeLizenz } from "./lizenz";

describe("Bildlizenzen", () => {
  test("Link zur Lizenz aus dem Namen", () => {
    expect(lizenzUrlVon("CC BY-SA 4.0")).toBe("https://creativecommons.org/licenses/by-sa/4.0/");
    expect(lizenzUrlVon("cc by 2.0")).toBe("https://creativecommons.org/licenses/by/2.0/");
    expect(lizenzUrlVon("CC BY 3.0 DE")).toBe("https://creativecommons.org/licenses/by/3.0/de/");
    expect(lizenzUrlVon("CC0")).toBe("https://creativecommons.org/publicdomain/zero/1.0/");
    expect(lizenzUrlVon("eigenes Bild")).toBe("");
  });
  test("Freigabe: Pflichtangaben, NC und ND gesperrt, CC BY mit Urheber", () => {
    expect(pruefeLizenz({ urheber: "", lizenz: "", lizenzUrl: "" }, true).ok).toBe(false);
    expect(pruefeLizenz({ urheber: "", lizenz: "", lizenzUrl: "" }, false).ok).toBe(true);
    expect(pruefeLizenz({ urheber: "X", lizenz: "CC BY-NC-SA 4.0", lizenzUrl: "" }, true)).toMatchObject({ ok: false });
    expect(pruefeLizenz({ urheber: "X", lizenz: "CC BY-ND 4.0", lizenzUrl: "" }, true)).toMatchObject({ ok: false });
    expect(pruefeLizenz({ urheber: "", lizenz: "CC BY-SA 4.0", lizenzUrl: "" }, true)).toMatchObject({ ok: false });
    expect(pruefeLizenz({ urheber: "Foto Muster", lizenz: "CC BY-SA 4.0", lizenzUrl: "" }, true)).toEqual({ ok: true, lizenzUrl: "https://creativecommons.org/licenses/by-sa/4.0/" });
    expect(pruefeLizenz({ urheber: "", lizenz: "gemeinfrei", lizenzUrl: "" }, true)).toEqual({ ok: true, lizenzUrl: "" });
    expect(pruefeLizenz({ urheber: "", lizenz: "eigenes Bild", lizenzUrl: "" }, true).ok).toBe(true);
    expect(pruefeLizenz({ urheber: "A", lizenz: "CC BY 1.5 XY seltsam", lizenzUrl: "" }, true).ok).toBe(true);
  });
});
