/**
 * Lizenzangaben von Bildern im Katalog (Rassebilder, Fotos des Vereins). Der Katalog wird verkauft und Bilder werden
 * zugeschnitten – „nicht kommerziell“ (NC) und „keine Bearbeitung“ (ND) passen deshalb nicht. CC-BY-Lizenzen verlangen
 * Urheber, Lizenzname und einen Link zur Lizenz (CC 4.0 Abschnitt 3(a)); der Link lässt sich aus dem Namen ableiten.
 */

/** Link zur Lizenz aus einer üblichen Angabe wie „CC BY-SA 4.0“ oder „CC BY 3.0 DE“; leer, wenn nicht ableitbar. */
export function lizenzUrlVon(lizenz: string): string {
  const t = lizenz.trim().replace(/\s+/g, " ");
  if (/^cc ?0\b|^cc zero|public domain dedication/i.test(t)) return "https://creativecommons.org/publicdomain/zero/1.0/";
  const m = t.match(/^cc[ -]?(by(?:-sa|-nd|-nc|-nc-sa|-nc-nd)?)\s+(\d\.\d)(?:\s+([a-z]{2}))?\b/i);
  if (!m) return "";
  const art = m[1]!.toLowerCase();
  const version = m[2]!;
  const land = m[3]?.toLowerCase();
  return `https://creativecommons.org/licenses/${art}/${version}/${land && version !== "4.0" ? `${land}/` : ""}`;
}

export interface LizenzAngaben {
  urheber: string;
  lizenz: string;
  lizenzUrl: string;
}

/**
 * Prüft, ob ein Bild mit diesen Angaben in den Katalog darf. Gibt den (ggf. ergänzten) Lizenz-Link zurück oder den
 * Grund, warum nicht. `pflicht`: ohne Lizenzangabe nicht freigeben (Rassebilder); sonst darf sie fehlen (eigenes Foto).
 */
export function pruefeLizenz(a: LizenzAngaben, pflicht: boolean): { ok: true; lizenzUrl: string } | { ok: false; fehler: string } {
  const lizenz = a.lizenz.trim();
  if (!lizenz) {
    return pflicht ? { ok: false, fehler: "Lizenz fehlt – z. B. „eigenes Bild“, „gemeinfrei“, „CC0“ oder „CC BY-SA 4.0“." } : { ok: true, lizenzUrl: a.lizenzUrl.trim() };
  }
  if (/\bnc\b|nicht[ -]?kommerziell|non[ -]?commercial/i.test(lizenz)) {
    return { ok: false, fehler: "Lizenz „nicht kommerziell“ (NC): Der Katalog wird verkauft – dieses Bild darf nicht hinein." };
  }
  if (/\bnd\b|keine bearbeitung|no[ -]?deriv/i.test(lizenz)) {
    return { ok: false, fehler: "Lizenz „keine Bearbeitung“ (ND): Im Katalog wird das Bild zugeschnitten und verkleinert – dieses Bild darf nicht hinein." };
  }
  if (/^cc[ -]?by/i.test(lizenz)) {
    if (!a.urheber.trim()) return { ok: false, fehler: "Urheber fehlt – die CC-BY-Lizenz verlangt die Namensnennung." };
    const url = a.lizenzUrl.trim() || lizenzUrlVon(lizenz);
    if (!url) return { ok: false, fehler: "Link zur Lizenz fehlt – bitte die Adresse der Lizenz angeben (z. B. https://creativecommons.org/licenses/by-sa/4.0/)." };
    return { ok: true, lizenzUrl: url };
  }
  return { ok: true, lizenzUrl: a.lizenzUrl.trim() || lizenzUrlVon(lizenz) };
}
