/**
 * Katalog-PDF, Verzeichnisse: Rassenverzeichnis, Bildnachweis, Ausstellerverzeichnis und das am Ende nachgetragene
 * Inhaltsverzeichnis mit Impressum.
 */
import { formatKatalognummer } from "@schau/domain";
import { type Eintrag } from "../services/eintraege";
import { GRAU, HAARLINIE, MM, textUmbrochen, TINTE } from "./basis";
import { FETT, KURSIV, NORMAL } from "./katalog-schrift";
import type { KatalogKontext } from "./katalog-kontext";
import { anzahlText, bildnachweisTeile } from "./katalog-hilfen";
import { nrBereich, nrVergleich, type Register } from "./katalog-tierteil";

/** Rassenverzeichnis von A bis Z mit Nummernbereich und Seite. */
export function rassenverzeichnis(K: KatalogKontext, register: Register) {
  const { G, k, ohne, doc, L, B, neueSeite, platz, abschnitt, marke, seitentitel } = K;
  // ── Rassenverzeichnis ──────────────────────────────────────────────────
  if (register.size && !ohne.has("rassenverzeichnis")) {
    neueSeite({ kopf: "Rassenverzeichnis" });
    abschnitt("Rassenverzeichnis");
    marke("rassenverzeichnis");
    seitentitel("Rassenverzeichnis", "von A bis Z, mit Katalognummern und Seite");
    const zeilen = [...register.values()].sort((a, b) => a.rasse.localeCompare(b.rasse, "de") || nrVergleich(a.von, b.von));
    for (const r of zeilen) {
      const name = `${r.rasse}${r.zusatz ? ` (${r.zusatz})` : ""}`;
      // Lange Namen brechen in ihrer Spalte um (nie „…“, Entscheidung 032) – die Zeile wird höher.
      // Bei Stämmen und Volieren steht die Sparte des Tiers, die Abteilung steckt in „2 Stämme“.
      const felder = (y: number, zeichnen: boolean) => [
        textUmbrochen(doc, name, L(), y, { breite: B() * 0.48, groesse: G.liste, schrift: NORMAL, farbe: TINTE, zeichnen }),
        textUmbrochen(doc, `${r.sparte} · ${anzahlText(r.abteilung, r.anzahl)}`, L() + B() * 0.5, y + 0.8, { breite: B() * 0.25, groesse: G.klein, min: 6, schrift: NORMAL, farbe: GRAU, zeichnen }),
        textUmbrochen(doc, `Nr. ${nrBereich(r.von, r.bis)}`, L() + B() * 0.76, y, { breite: B() * 0.17, groesse: G.liste, schrift: NORMAL, farbe: TINTE, zeichnen }),
      ];
      const mehr = (f: ReturnType<typeof felder>) => Math.max(...f.map((t) => t.hoehe - t.zeilenhoehe));
      platz(11 * k + mehr(felder(0, false)));
      const y = doc.y;
      const f = felder(y, true);
      doc.font(FETT).fontSize(G.liste).fillColor(TINTE).text(String(r.seite), L(), y, { width: B(), align: "right", lineBreak: false });
      const w = doc.font(NORMAL).fontSize(G.liste).widthOfString(name);
      if (f[0]!.zeilen.length === 1 && w < B() * 0.48) {
        doc.save().lineWidth(0.4).strokeColor(HAARLINIE).dash(0.5, { space: 2.5 }).moveTo(L() + w + 3, y + 7.5 * k).lineTo(L() + B() * 0.5 - 3, y + 7.5 * k).stroke().undash().restore();
      }
      doc.y = y + 11 * k + mehr(f);
    }
  }
}

/** Bildnachweis: Vereinsbilder und genutzte Rassebilder mit Urheber und Lizenz. */
export function bildnachweisSeite(K: KatalogKontext, register: Register) {
  const { G, beitraege, bilder, bildDerRasse, genutzteBilder, k, ohne, doc, L, B, neueSeite, seitenNr, platz, abschnitt, marke } = K;
  // ── Bildnachweis (Urheber und Lizenz, wie § 13 UrhG und die freien Lizenzen es verlangen) ──
  // Bilder des Vereins (Titelbild, Logo, Fotos zu Grußworten und Seiten) mit Angaben; eigene Fotos ohne Angaben fehlen.
  const beitragZu = (id: number) => beitraege.find((x) => x.bildId === id && x.art !== "anzeige");
  const vereinsbilder = bilder
    .filter((b) => (b.urheber || b.lizenz || b.quelle) && (b.rolle !== "beitrag" || beitragZu(b.id)))
    .map((b) => ({ name: b.rolle === "titel" ? "Titelbild" : b.rolle === "logo" ? "Vereinslogo" : beitragZu(b.id)!.titel || "Foto", b }));
  const anzeigenMitBild = beitraege.some((x) => x.art === "anzeige" && x.bildId != null);
  if (genutzteBilder.size || vereinsbilder.length || anzeigenMitBild) {
    // Ohne Rassenverzeichnis eigene Seite – sonst stünde der Nachweis mitten in den Spalten des Tierteils.
    const eigeneSeite = ohne.has("rassenverzeichnis") || !register.size;
    if (eigeneSeite) neueSeite({ kopf: "Bildnachweis" });
    const seiteVorher = seitenNr();
    platz(40 * k);
    doc.y += 10 * k;
    abschnitt("Bildnachweis");
    marke("bildnachweis", !eigeneSeite && seitenNr() === seiteVorher);
    doc.font(FETT).fontSize(G.h3).fillColor(TINTE).text("Bildnachweis", L(), doc.y, { width: B() });
    doc.y += 5 * k;
    // Je Bild: Bezeichnung fett, dahinter Foto und Lizenz; darunter klein die Adressen von Quelle und Lizenz.
    const zeilen = [
      ...vereinsbilder.map((v) => ({ name: v.name, b: { urheber: v.b.urheber, lizenz: v.b.lizenz, lizenzUrl: "", quelle: v.b.quelle } })),
      ...[...genutzteBilder].sort((a, b) => a.localeCompare(b, "de")).map((name) => ({ name, b: bildDerRasse.get(name)! })),
    ];
    if (anzeigenMitBild) {
      doc.font(KURSIV).fontSize(G.klein).fillColor(GRAU).text("Für Bilder und Texte der Anzeigen sind die Inserenten verantwortlich.", L(), doc.y, { width: B() });
      doc.y += 3 * k;
    }
    for (const { name, b } of zeilen) {
      const { angaben, adressen } = bildnachweisTeile(b);
      doc.font(NORMAL).fontSize(G.klein);
      const h1 = doc.heightOfString(`${name}  ${angaben}`, { width: B() });
      doc.font(NORMAL).fontSize(G.fein);
      const h2 = adressen ? doc.heightOfString(adressen, { width: B() }) : 0;
      platz(h1 + h2 + 5 * k);
      doc.font(FETT).fontSize(G.klein).fillColor(TINTE).text(`${name}  `, L(), doc.y, { width: B(), continued: true });
      doc.font(NORMAL).fillColor(TINTE).text(angaben);
      if (adressen) doc.font(NORMAL).fontSize(G.fein).fillColor(GRAU).text(adressen, L(), doc.y + 0.5 * k, { width: B() });
      doc.y += 4 * k;
    }
    doc.fillColor(TINTE);
  }
}

/** Ausstellerverzeichnis, alphabetisch mit den Katalognummern. */
export function ausstellerverzeichnis(K: KatalogKontext) {
  const { G, tierteilListe, k, farbe, ohne, doc, L, B, neueSeite, platz, abschnitt, marke, seitentitel } = K;
  // ── Ausstellerverzeichnis ──────────────────────────────────────────────
  if (tierteilListe.some((e) => !e.verdeckt) && !ohne.has("ausstellerverzeichnis")) {
    neueSeite({ kopf: "Ausstellerverzeichnis" });
    abschnitt("Ausstellerverzeichnis");
    marke("ausstellerverzeichnis");
    seitentitel("Ausstellerverzeichnis", "alphabetisch, mit den Katalognummern ihrer Tiere");
    const jeAussteller = new Map<number, Eintrag[]>();
    // Ohne Zustimmung kein Eintrag im Verzeichnis – der Name stünde sonst doch im Katalog.
    for (const e of tierteilListe.filter((x) => !x.verdeckt)) jeAussteller.set(e.ausstellerId, [...(jeAussteller.get(e.ausstellerId) ?? []), e]);
    const liste = [...jeAussteller.values()].sort((a, b) => a[0]!.ausstellerName.localeCompare(b[0]!.ausstellerName, "de"));
    let buchstabe = "";
    for (const t of liste) {
      const a = t[0]!;
      const b0 = a.nachname.charAt(0).toLocaleUpperCase("de");
      const nummern = t.map((e) => formatKatalognummer(e)).join(", ");
      doc.font(NORMAL).fontSize(G.liste);
      const hNummern = doc.heightOfString(nummern, { width: B() * 0.5 });
      // Links Name und Ort/Verein (lange Doppelnamen brechen um), rechts die Nummern – die höhere Seite zählt.
      const hName = doc.font(FETT).fontSize(G.liste).heightOfString(`${a.nachname}, ${a.vorname}`, { width: B() * 0.5 - 4 });
      const hOrt = doc.font(NORMAL).fontSize(G.klein).heightOfString([a.ort, a.verein].filter(Boolean).join(" · ") || " ", { width: B() * 0.5 - 4 });
      const h = Math.max(11 * k + hNummern, hName + hOrt + 3 * k);
      if (b0 !== buchstabe) {
        platz(h + 18 * k);
        doc.moveDown(0.3);
        doc.font(FETT).fontSize(G.h2).fillColor(farbe).text(b0, L(), doc.y);
        buchstabe = b0;
      }
      platz(h);
      const y = doc.y;
      doc.font(FETT).fontSize(G.liste).fillColor(TINTE).text(`${a.nachname}, ${a.vorname}`, L(), y, { width: B() * 0.5 - 4 });
      doc.font(NORMAL).fontSize(G.klein).fillColor(GRAU).text([a.ort, a.verein].filter(Boolean).join(" · "), L(), doc.y, { width: B() * 0.5 - 4 });
      const yLinks = doc.y;
      doc.font(NORMAL).fontSize(G.liste).fillColor(TINTE).text(nummern, L() + B() * 0.5, y + 0.6 * k, { width: B() * 0.5 });
      doc.y = Math.max(yLinks, doc.y) + 3 * k;
    }
  }
}

/** Inhaltsverzeichnis auf der freigehaltenen zweiten Seite nachtragen, unten das Impressum. */
export function inhaltsverzeichnis(K: KatalogKontext, inhaltSeite: number) {
  const { G, s, opts, mitErgebnis, gestaltung, verein, k, doc, inhalt, L, B, unten, seitentitel } = K;
  // ── Inhaltsverzeichnis nachtragen, unten das Impressum ─────────────────
  doc.switchToPage(inhaltSeite);
  doc.x = L();
  doc.y = doc.page.margins.top;
  seitentitel("Inhalt");
  // Impressum (Pressegesetze der Länder: Name und Anschrift von Herausgeber bzw.
  // Verleger und Druckerei) – zuerst messen, damit ein langes Verzeichnis es nicht überdeckt.
  const stand = new Intl.DateTimeFormat("de-DE", { dateStyle: "long", timeZone: "Europe/Berlin" }).format(new Date());
  const herausgeber = [verein.name || s.veranstalter || s.name, verein.anschrift.replace(/\s*\n\s*/g, ", ")].filter(Boolean).join(", ");
  const impressum = [
    `Herausgeber: ${herausgeber}${verein.vertretung ? ` · vertreten durch ${verein.vertretung}` : ""}`,
    gestaltung.druck.trim() ? `Druck: ${gestaltung.druck.trim().replace(/\s*\n\s*/g, ", ")}` : "",
    gestaltung.ausstellungsleitung.split("\n").find((z) => /katalog/i.test(z))?.trim() ?? "",
    `Stand: ${stand}${mitErgebnis ? " · mit Ergebnissen" : ""}${!s.katalogGedruckt && !mitErgebnis ? " · vorläufig: Katalognummern noch nicht festgeschrieben, sie können sich noch ändern" : ""}`,
    opts.online
      ? "Angaben ohne Gewähr. Name, Wohnort und Verein stehen hier nur bei Ausstellern, die in die Veröffentlichung im Internet eingewilligt haben."
      : "Angaben ohne Gewähr. Name, Wohnort und Verein der Aussteller stehen nach den Ausstellungsbestimmungen im Katalog – ohne deren Anerkennung (Meldebogen oder Online-Meldung) oder bei Widerspruch nicht.",
  ].filter(Boolean);
  doc.font(NORMAL).fontSize(G.klein);
  const impressumH = impressum.reduce((n, t) => n + doc.heightOfString(t, { width: B() }) + 1.5, 0) + 8;
  // Lange Verzeichnisse (viele Sparten, Jugend) enger setzen: Zeilenabstand bis auf die Hälfte, Schrift bis auf 75 %.
  /** Titel einer Zeile: lange (Sparten, Teilschauen) brechen vor der Seitenzahl um. */
  const titelFeld = (z: (typeof inhalt)[number], x: number, y: number, groesse: number, zeichnen: boolean) => {
    const nw = doc.font(NORMAL).fontSize(groesse).widthOfString(String(z.seite));
    const einzug = z.ebene ? 8 * MM : 0;
    return textUmbrochen(doc, z.titel, x + einzug, y, { breite: B() - einzug - nw - 8, groesse, schrift: NORMAL, farbe: z.ebene ? GRAU : TINTE, zeichnen });
  };
  const mehrVon = (t: { hoehe: number; zeilenhoehe: number }) => t.hoehe - t.zeilenhoehe;
  const benoetigt = inhalt.reduce((n, z) => n + (z.ebene ? 14 : 17) * k + mehrVon(titelFeld(z, 0, 0, z.ebene ? G.liste : G.h3, false)), 0);
  const verfuegbar = unten() - impressumH - 6 - doc.y;
  const f = Math.max(0.5, Math.min(1, verfuegbar / Math.max(benoetigt, 1)));
  for (const z of inhalt) {
    const y = doc.y;
    const einzug = z.ebene ? 8 * MM : 0;
    const groesse = (z.ebene ? G.liste : G.h3) * Math.max(0.75, f);
    const t = titelFeld(z, L(), y, groesse, true);
    const zy = y + mehrVon(t); // letzte Zeile des Titels: dort Punktführung und Seitenzahl
    doc.font(NORMAL).fontSize(groesse).fillColor(z.ebene ? GRAU : TINTE);
    const w = doc.widthOfString(t.zeilen.at(-1) ?? "");
    const nr = String(z.seite);
    const nw = doc.widthOfString(nr);
    doc.text(nr, L() + B() - nw, zy, { lineBreak: false });
    // Punktführung zwischen Titel und Seitenzahl.
    doc.save().lineWidth(0.5).strokeColor(HAARLINIE).dash(0.5, { space: 2.5 });
    doc.moveTo(L() + einzug + w + 4, zy + 9 * k * f).lineTo(L() + B() - nw - 4, zy + 9 * k * f).stroke();
    doc.undash().restore();
    doc.y = zy + (z.ebene ? 14 : 17) * k * f;
  }
  {
    // Fest am unteren Rand: weiter unten löste pdfkit eine neue Seite aus und verschöbe alle Seitenzahlen.
    let y = unten() - impressumH;
    doc.save().lineWidth(0.4).strokeColor(HAARLINIE).moveTo(L(), y).lineTo(L() + B(), y).stroke().restore();
    y += 5;
    for (const t of impressum) {
      doc.font(NORMAL).fontSize(G.klein).fillColor(GRAU).text(t, L(), y, { width: B() });
      y = doc.y + 1.5;
    }
  }
}
