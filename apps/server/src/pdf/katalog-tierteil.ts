/**
 * Katalog-PDF, Tierteil: zwei oder drei Spalten bzw. Tabelle, Spartenköpfe mit Stich, Rassenköpfe mit Rassebild,
 * Preisrichter-, Klassen- und Tierzeilen; Teilschauen und Jugend nacheinander. Liefert das Register der Rassen.
 */
import { formatEuro, formatKatalognummer, gruppenAbteilung, MELDEART_LABEL } from "@schau/domain";
import { oeffneBild } from "../services/rassebild";
import { ausstellerAnzeige, type Eintrag } from "../services/eintraege";
import { GRAU, HAARLINIE, MM, SANS, SANS_FETT, SANS_KURSIV, SERIF, SERIF_FETT, SERIF_KURSIV, textImFeld, TINTE } from "./basis";
import { stichFuer } from "./illustrationen";
import type { Seite, KatalogKontext } from "./katalog-kontext";
import { anzahlText } from "./katalog-hilfen";

// Bereiche mit Unternummer („24a“): Nachmeldungen sortieren hinter ihrer Hauptnummer ein.
type Nr = { katalogNr: number | null; suffix: string };
export const nrVergleich = (a: Nr, b: Nr) => a.katalogNr! - b.katalogNr! || a.suffix.localeCompare(b.suffix);
export const nrBereich = (von: Nr, bis: Nr) => (nrVergleich(von, bis) === 0 ? formatKatalognummer(von) : `${formatKatalognummer(von)}–${formatKatalognummer(bis)}`);

/** Tierteil: Sparten- und Rassenköpfe, Klassen, Tierzeilen; gibt das Register für das Rassenverzeichnis zurück. */
export function tierteilSetzen(K: KatalogKontext) {
  const { s, tierteilListe, bildDerRasse, geoeffnet, genutzteBilder, zu, richterName, mitErgebnis, gestaltung, a4, k, flaeche, farbe, aufFlaeche, akzent, lk, schlicht, doc, stich, seiten, L, B, unten, neueSeite, seitenNr, abschnitt, marke, aufLinie, kicker, spitzePunkte, note } = K;
  // ── Tierteil: zwei Spalten wie in den Verbandskatalogen, oder Tabelle über die ganze Breite, oder drei Spalten ──
  // Drei Spalten nur auf A4 (auf A5 wären sie zu schmal) – dort mit der Schriftgröße des A5-Hefts.
  const aufteilung = gestaltung.aufteilung === "dreispaltig" && !a4 ? "zweispaltig" : (gestaltung.aufteilung ?? "zweispaltig");
  const tabelle = aufteilung === "tabelle";
  const SPALTEN = tabelle ? 1 : aufteilung === "dreispaltig" ? 3 : 2;
  const kt = aufteilung === "dreispaltig" ? 1 : k;
  const LUECKE = (SPALTEN === 3 ? 4 : 5) * MM * kt;
  const spB = () => (B() - (SPALTEN - 1) * LUECKE) / SPALTEN;
  let spalte = 0;
  let spaltenOben = 0;
  const spX = () => L() + spalte * (spB() + LUECKE);
  // Spalten der Tierzeile: Nr. | Bewertung | Preis | Aussteller | Vkpr. – in der Tabelle
  // Nr. | Klasse | Farbenschlag | Aussteller | Bewertung | Preis | Vkpr.
  const col = () => {
    const nr = 7.5 * MM * kt; // Nummer rechtsbündig, danach 2 mm Luft
    if (tabelle) {
      // Auf A5 enger, damit der Farbenschlag genug Platz behält.
      const note = (mitErgebnis ? (a4 ? 13 : 11) : a4 ? 24 : 18) * MM * kt;
      const preis = mitErgebnis ? (a4 ? 14 : 10) * MM * kt : 0;
      const vk = (a4 ? 11 : 9) * MM * kt;
      const klasse = (a4 ? 24 : 18) * MM * kt;
      const aussteller = spB() * (a4 ? 0.27 : 0.25);
      const farbenschlag = Math.max(10 * MM, spB() - nr - 2 * MM - klasse - aussteller - note - preis - vk - 3 * MM);
      return { nr, note, preis, vk, aussteller, klasse, farbenschlag };
    }
    const note = mitErgebnis ? 9.5 * MM * kt : 14 * MM * kt;
    const preis = mitErgebnis ? 7.5 * MM * kt : 0;
    const vk = 6.5 * MM * kt;
    return { nr, note, preis, vk, aussteller: spB() - nr - 2 * MM - note - preis - vk, klasse: 0, farbenschlag: 0 };
  };
  /** x-Positionen der Tabellenspalten (nur Aufteilung „Tabelle“). */
  const tabX = () => {
    const c = col();
    const klasse = spX() + c.nr + 2 * MM;
    const farbenschlag = klasse + c.klasse;
    const aussteller = farbenschlag + c.farbenschlag + 1.5 * MM;
    const note = aussteller + c.aussteller + 1.5 * MM;
    const preis = note + c.note;
    return { klasse, farbenschlag, aussteller, note, preis };
  };
  const GR = 8.2 * kt; // Schriftgröße der Tierzeilen
  const ZEILE = (tabelle ? 13 : 10.4) * kt; // Tabelle: Luft für die Trennlinie unter jeder Zeile
  /** Luft über einem Rassenkopf bzw. einer neuen Klasse, wenn darüber Tierzeilen stehen (Gruppen sichtbar trennen). */
  const ABSTAND_RASSE = 9 * kt;
  const ABSTAND_KLASSE = 4 * kt;
  const spaltenKopf = () => {
    const c = col();
    const y = doc.y;
    const nx = spX() + c.nr + 2 * MM;
    doc.font(SANS_FETT).fontSize(6 * kt).fillColor(GRAU);
    const opt = { lineBreak: false, characterSpacing: 0.6 * kt } as const;
    doc.text("NR.", spX(), y, { ...opt, width: c.nr, align: "right" });
    if (tabelle) {
      const t = tabX();
      doc.text("KLASSE", t.klasse, y, { ...opt, width: c.klasse });
      doc.text("FARBENSCHLAG", t.farbenschlag, y, { ...opt, width: c.farbenschlag });
      doc.text("AUSSTELLER", t.aussteller, y, { ...opt, width: c.aussteller });
      doc.text(mitErgebnis ? "NOTE" : "NOTIZ", t.note, y, { ...opt, width: c.note });
      if (mitErgebnis) doc.text("PREIS", t.preis, y, { ...opt, width: c.preis });
      doc.text("VKPR.", spX() + spB() - c.vk - 4 * MM, y, { ...opt, width: c.vk + 4 * MM, align: "right" });
      doc.save().lineWidth(0.5).strokeColor(TINTE).moveTo(spX(), y + 8.5 * kt).lineTo(spX() + spB(), y + 8.5 * kt).stroke().restore();
      doc.y = y + 12 * kt;
      doc.fillColor(TINTE);
      return;
    }
    doc.text(mitErgebnis ? "NOTE" : "NOTIZ", nx, y, { ...opt, width: c.note });
    if (mitErgebnis) doc.text("PREIS", nx + c.note, y, { ...opt, width: c.preis });
    doc.text("AUSSTELLER", nx + c.note + c.preis, y, { ...opt, width: c.aussteller });
    doc.text("VKPR.", spX() + spB() - c.vk - 4 * MM, y, { ...opt, width: c.vk + 4 * MM, align: "right" });
    doc.save().lineWidth(0.5).strokeColor(TINTE).moveTo(spX(), y + 8.5 * kt).lineTo(spX() + spB(), y + 8.5 * kt).stroke().restore();
    doc.y = y + 12 * kt;
    doc.fillColor(TINTE);
  };
  let tiefste = 0; // unterstes y beider Spalten der aktuellen Seite
  let imTierteil = false;
  let kopfJetzt = ""; // Kolumnentitel der laufenden Rasse für Folgeseiten
  let laufendeRasse = ""; // für „Fortsetzung“ oben in der neuen Spalte
  /** Was zuletzt in der Spalte steht: nach Tierzeilen bekommen Klassen- und Rassenkopf Luft, oben in der Spalte nicht. */
  let zuletzt: "kopf" | "tier" = "kopf";
  /** Rasse, deren Bild noch unter Überschrift und Preisrichter folgt. */
  let bildFolgt: string | null = null;
  const tierSeite = (info: Seite) => {
    neueSeite(info);
    spalte = 0;
    spaltenOben = doc.y;
    tiefste = 0;
    spaltenKopf();
    zuletzt = "kopf";
  };
  /**
   * Platz in der Spalte, sonst nächste Spalte bzw. Seite – Überschriften wandern mit.
   * Läuft eine Rasse weiter, steht oben in der neuen Spalte „Rasse (Fortsetzung)“.
   */
  const raum = (hoehe: number, neueRasse = false): boolean => {
    if (doc.y + hoehe <= unten()) return false;
    // Die nächste Spalte beginnt auf derselben Höhe: passt der Block auch dort nicht, gleich auf die nächste Seite
    // (sonst stünde z. B. ein Rassenkopf mit Bild allein unten in der rechten Spalte und die linke bliebe leer).
    if (spalte < SPALTEN - 1 && spaltenOben + 12 * kt + hoehe <= unten()) {
      tiefste = Math.max(tiefste, doc.y);
      spalte++;
      doc.y = spaltenOben;
      spaltenKopf();
    } else {
      tierSeite({ kopf: kopfJetzt });
    }
    zuletzt = "kopf";
    if (!neueRasse && laufendeRasse) {
      doc.font(SERIF_KURSIV).fontSize(8.5 * kt).fillColor(farbe);
      const yf = doc.y;
      doc.text(`${laufendeRasse} (Fortsetzung)`, spX(), yf, { width: spB(), lineBreak: false, ellipsis: true });
      // In der Tabelle folgt gleich die Tierzeile (keine Klassenzeile dazwischen) – nur eine Zeile Abstand.
      doc.y = tabelle ? yf + 12 * kt : doc.y + 11 * kt;
      doc.fillColor(TINTE);
    }
    return true;
  };

  /** Register für das Rassenverzeichnis: erste Seite, Nummernbereich, Anzahl. */
  const register = new Map<string, { rasse: string; sparte: string; abteilung: string; seite: number; von: Nr; bis: Nr; anzahl: number; zusatz: string }>();

  /** Abteilung im Tierteil: „Volieren“ und „Stämme“ vorn, wenn eingestellt – sonst die Sparte. */
  const abteilungVon = (e: Eintrag) => gruppenAbteilung(e.art, s.staemmeVorn) ?? e.sparte ?? "Sonstige";

  // Teilschauen (Entscheidung 016) nacheinander, jede auf neuer Seite und mit ihrem Namen vor der Sparte; darin wie
  // ohne Teilschauen erst die Senioren, dann die Jugend. Ohne Teilschauen ist es eine einzige Gruppe ohne Namen.
  const teilschauGruppen = [...new Map(tierteilListe.map((e) => [e.teilschauFolge, e.teilschauName ?? ""] as const)).entries()].sort((a, b) => a[0] - b[0]);
  for (const [folge, name] of teilschauGruppen) {
    const liste = tierteilListe.filter((e) => e.teilschauFolge === folge);
    const erwachsen = liste.filter((e) => !(s.jugendSeparat && e.istJugend));
    const jugend = s.jugendSeparat ? liste.filter((e) => e.istJugend) : [];
    if (erwachsen.length) {
      imTierteil = false; // jede Teilschau beginnt auf neuer Seite
      tierteil(erwachsen, name);
    }
    if (jugend.length) {
      imTierteil = false; // Jugendabteilung beginnt auf neuer Seite
      tierteil(jugend, [name, "Jugend"].filter(Boolean).join(" · "));
    }
  }

  function tierteil(liste: Eintrag[], zusatz: string) {
    let sparte: string | null = null;
    let rasse: string | null = null;
    let klasse: string | null = null;
    let richterId: number | null | undefined;
    let kopfBasis = "";
    for (const e of liste) {
      const sp = abteilungVon(e);
      if (sp !== sparte) {
        kopfBasis = `${zusatz ? `${zusatz} · ` : ""}${sp}`;
        spartenKopf(sp, zusatz, kopfBasis, liste.filter((x) => abteilungVon(x) === sp), rasseBlock(e.rasse ?? e.einordnungRasse ?? e.freitext ?? ""));
        sparte = sp;
        rasse = null;
      }
      const ra = e.rasse ?? e.einordnungRasse ?? e.freitext ?? "";
      if (ra !== rasse) {
        // Rassenkopf nur mit Preisrichter, Bild, Klasse und mindestens zwei Tieren darunter.
        raum(rasseBlock(ra), true);
        rasseKopf(ra);
        bildFolgt = ra;
        laufendeRasse = ra;
        kopfJetzt = `${kopfBasis} · ${ra}`;
        // Der Kolumnentitel nennt die erste Rasse der Seite.
        const sNow = seiten[seiten.length - 1]!;
        if (!sNow.kopf || sNow.kopf === kopfBasis) seiten[seiten.length - 1] = { ...sNow, kopf: kopfJetzt };
        const key = `${zusatz}|${sp}|${ra}`;
        const r = register.get(key);
        if (r) {
          if (nrVergleich(e, r.bis) > 0) r.bis = { katalogNr: e.katalogNr, suffix: e.suffix };
          if (nrVergleich(e, r.von) < 0) r.von = { katalogNr: e.katalogNr, suffix: e.suffix };
          r.anzahl++;
        } else register.set(key, { rasse: ra, sparte: e.sparte ?? "Sonstige", abteilung: sp, seite: seitenNr(), von: { katalogNr: e.katalogNr, suffix: e.suffix }, bis: { katalogNr: e.katalogNr, suffix: e.suffix }, anzahl: 1, zusatz });
        rasse = ra;
        klasse = null;
        richterId = undefined;
      } else {
        const r = register.get(`${zusatz}|${sp}|${ra}`)!;
        if (nrVergleich(e, r.bis) > 0) r.bis = { katalogNr: e.katalogNr, suffix: e.suffix };
        if (nrVergleich(e, r.von) < 0) r.von = { katalogNr: e.katalogNr, suffix: e.suffix };
        r.anzahl++;
      }
      // Bewertete Tiere: wer tatsächlich bewertet hat (auch nach einer Umverteilung), sonst die Einteilung.
      const pr = e.bewertetVon ?? zu.get(e.id) ?? null;
      if (pr !== richterId) {
        raum(10 * kt + 16 * kt + ZEILE);
        if (pr != null) richterZeile(richterName.get(pr) ?? "");
        richterId = pr;
        klasse = null;
      }
      // Das Rassebild steht unter Überschrift und Preisrichter (Platz ist beim Rassenkopf schon reserviert).
      if (bildFolgt) {
        rassebildZeichnen(bildFolgt);
        bildFolgt = null;
      }
      const kl = `${e.bezeichnung}|${e.art}|${e.geschlecht}|${e.alter}`;
      if (kl !== klasse) {
        raum(ABSTAND_KLASSE + 12 * kt + ZEILE);
        klassenKopf(e);
        klasse = kl;
      }
      // Nach einem Spalten- oder Seitenwechsel steht die Klasse noch einmal über den Tieren.
      if (raum(ZEILE)) klassenKopf(e);
      tierZeile(e);
    }
  }

  /** Höhe, die ein Rassenkopf mindestens braucht: Überschrift, Preisrichter, Bild, Klasse und zwei Tiere. */
  function rasseBlock(ra: string) {
    const bm = bildMass(ra);
    return ABSTAND_RASSE + 17 * kt + 10 * kt + 16 * kt + 2 * ZEILE + (bm ? bm.h + 6 * kt : 0);
  }

  function spartenKopf(sparte: string, zusatz: string, kopf: string, tiere: Eintrag[], ersterBlock: number) {
    // Neue Sparte unter der vorigen, wenn noch knapp ein Drittel der Seite frei ist und Kopf samt erster Rasse
    // darunter passen – sonst neue Seite (keine Spartenüberschrift allein unten auf der Seite).
    const darunter = Math.max(tiefste, doc.y) + 12 * k;
    // Höhe des Spartenkopfs samt Spaltenkopf je Stil (gemessen; mit Rahmen steht das Bild über dem Namen).
    const kopfHoehe = 15 * MM * k + (gestaltung.stil === "rahmen" ? 88 * k : gestaltung.stil === "modern" ? 40 * k : 34 * k);
    if (imTierteil && !gestaltung.sparteNeueSeite && unten() - darunter > Math.max((unten() - doc.page.margins.top) * 0.3, kopfHoehe + ersterBlock)) {
      doc.y = darunter; // Kolumnentitel bleibt bei der ersten Rasse der Seite
    } else neueSeite({ kopf });
    imTierteil = true;
    tiefste = 0;
    laufendeRasse = "";
    abschnitt(`${zusatz ? `${zusatz}: ` : ""}${sparte}`, zusatz ? 1 : 0);
    marke("tierteil");
    const y0 = doc.y;
    const g = 15 * MM * k; // Höhe des Bildfelds
    const fw = g * 1.6; // Breite des Bildfelds (Stiche sind meist breiter als hoch)
    const gruppe = tiere.some((t) => gruppenAbteilung(t.art, s.staemmeVorn) === sparte);
    const bild = stich(stichFuer(sparte, gruppe));
    /** Stich der Sparte im Bildfeld fw × g (Stämme und Volieren: Hahn mit Henne). */
    const figur = (x: number, y: number, align: "center" | "right") => doc.image(bild, x, y, { fit: [fw, g], align, valign: "center" });
    const art = zusatz ? `${zusatz}abteilung` : gruppe ? "Abteilung" : "Sparte";
    const rassen = new Set(tiere.map((t) => t.rasse ?? t.einordnungRasse ?? t.freitext)).size;
    const nummern = [...tiere].sort(nrVergleich);
    const angabe = `${anzahlText(sparte, tiere.length)}  ·  ${rassen} ${rassen === 1 ? "Rasse" : "Rassen"}  ·  Nr. ${nrBereich(nummern[0]!, nummern.at(-1)!)}`;
    if (gestaltung.stil === "rahmen") {
      // Mittig: Bild, Art, Name der Sparte, Angaben, darunter eine doppelte Linie.
      figur(L() + (B() - fw) / 2, y0, "center");
      kicker(art, L(), y0 + g + 3 * k, B(), "center");
      doc.font(SERIF).fontSize(23 * k).fillColor(TINTE).text(sparte, L(), doc.y, { width: B(), align: "center", lineGap: -3 });
      doc.font(SANS).fontSize(8.4 * k).fillColor(GRAU).text(angabe, L(), doc.y + 1, { width: B(), align: "center" });
      const y = doc.y + 5 * k;
      doc.save().rect(L(), y, B(), 1.4 * lk).fill(akzent).rect(L(), y + 3, B(), 0.45 * lk).fill(akzent).restore();
      doc.y = y + 12 * k;
    } else if (gestaltung.stil === "modern") {
      // Farbband mit Art und Name in Weiß, der Stich rechts neben dem Band; die Angaben darunter.
      const bandH = g + 4 * k;
      const bandB = B() - fw - 4 * MM;
      doc.rect(L(), y0, bandB, bandH).fill(flaeche);
      figur(L() + B() - fw, y0 + 2 * k, "right");
      doc.font(SANS_FETT).fontSize(7 * k).fillColor(aufFlaeche).text(art.toLocaleUpperCase("de"), L() + 4 * MM * k, y0 + 4 * k, { width: bandB - 8 * MM * k, characterSpacing: 1.4 * k, lineBreak: false });
      doc.font(SERIF).fontSize(21 * k).fillColor(aufFlaeche).text(sparte, L() + 4 * MM * k, y0 + 4 * k + 7 * k * 1.5, { width: bandB - 8 * MM * k, lineGap: -3, height: bandH, ellipsis: true });
      doc.font(SANS).fontSize(8.4 * k).fillColor(GRAU).text(angabe, L(), y0 + bandH + 3 * k, { width: B() });
      doc.y += 8 * k;
    } else {
      // Klassisch: kleines Bild rechts, Titel links – die Schrift trägt die Seite, nicht das Bild.
      figur(L() + B() - fw, y0, "right");
      const tb = B() - fw - 6 * MM;
      kicker(art, L(), y0 + 1 * k, tb);
      doc.font(SERIF).fontSize(23 * k).fillColor(TINTE).text(sparte, L(), doc.y, { width: tb, lineGap: -3 });
      doc.font(SANS).fontSize(8.4 * k).fillColor(GRAU).text(angabe, L(), doc.y + 1, { width: tb });
      const y = Math.max(doc.y, y0 + g) + 5 * k;
      doc.save().rect(L(), y, B(), 1.4 * lk).fill(akzent).restore();
      doc.y = y + 9 * k;
    }
    spalte = 0;
    spaltenOben = doc.y;
    spaltenKopf();
  }

  /**
   * Jedes Rassebild wird einmal geöffnet und eingebettet (kommt die Rasse mehrfach vor, z. B. in der Jugend, nutzt der
   * Katalog es wieder). Was pdfkit nicht lesen kann, fehlt im Katalog, statt ihn zu verhindern.
   */
  function rassebildOeffnen(rasse: string) {
    const b = bildDerRasse.get(rasse);
    if (!b) return null;
    if (!geoeffnet.has(rasse)) {
      try {
        geoeffnet.set(rasse, oeffneBild(doc, b.daten)); // pdfkit dreht nach der EXIF-Angabe
      } catch {
        geoeffnet.set(rasse, { bild: null, breite: 0, hoehe: 0 });
      }
    }
    const g = geoeffnet.get(rasse)!;
    return g.bild && g.breite && g.hoehe ? g : null;
  }

  /** Größe des Rassebilds in der Spalte (höchstens 20 mm hoch, Seitenverhältnis bleibt); null ohne Bild. */
  function bildMass(rasse: string) {
    if (gestaltung.rassebilder === false) return null;
    const g = rassebildOeffnen(rasse);
    if (!g) return null;
    const hoeheMax = (tabelle ? 50 : 62) * kt;
    const w = Math.min(spB(), (hoeheMax * g.breite) / g.hoehe);
    return { bild: g.bild!, w, h: (w * g.hoehe) / g.breite };
  }

  function rasseKopf(rasse: string) {
    doc.y += zuletzt === "tier" ? ABSTAND_RASSE : 2 * kt;
    const y = doc.y;
    const h = 14 * kt;
    // Heller Balken mit Farbkante statt Vollfläche: ruhiger und im Schwarz-Weiß-Druck gut lesbar.
    if (!schlicht) doc.save().fillOpacity(0.12).rect(spX(), y, spB(), h).fill(flaeche).restore();
    doc.save().rect(spX(), y, 2.2 * lk, h).fill(akzent).restore();
    textImFeld(doc, rasse, spX() + 6, aufLinie(SERIF_FETT, 10.5 * kt, y + h * 0.71), { breite: spB() - 10, groesse: 10.5 * kt, min: 8, schrift: SERIF_FETT, farbe: TINTE });
    doc.y = y + h + 3.5 * kt;
    zuletzt = "kopf";
    doc.fillColor(TINTE);
  }

  /** Rassebild mittig in der Spalte, unter Überschrift und Preisrichter (Urheber und Lizenz im Bildnachweis am Ende). */
  function rassebildZeichnen(rasse: string) {
    const bm = bildMass(rasse);
    if (!bm) return;
    doc.y += 1.5 * kt;
    // In der Tabelle an der Kante der Klassenspalte (wie Preisrichter und Zeilen), sonst mittig in der Spalte.
    const x = tabelle ? tabX().klasse : spX() + (spB() - bm.w) / 2;
    doc.image(bm.bild as unknown as Buffer, x, doc.y, { width: bm.w, height: bm.h });
    doc.save().lineWidth(0.4).strokeColor(HAARLINIE).rect(x, doc.y, bm.w, bm.h).stroke().restore();
    doc.y += bm.h + 4.5 * kt;
    genutzteBilder.add(rasse);
    zuletzt = "kopf";
  }

  /** Eine Zeile je Klasse wie in den Verbandskatalogen: „1,0 jung · blau mit Binden“. */
  function klassenKopf(e: Eintrag) {
    // In der Tabelle stehen Klasse und Farbenschlag in jeder Zeile – zwischen den Klassen nur etwas Luft.
    if (tabelle) return; // gleichmäßige Zeilen ohne Zwischenräume – die Klasse steht in jeder Zeile
    const farbschlag = e.rasse ? (e.farbenschlag ?? "") : e.freitext;
    const zusatz = [e.istAoc ? "AOC" : "", e.istNeuzuechtung ? "Neuzüchtung" : ""].filter(Boolean).join(", ");
    // In der eigenen Abteilung „Stämme“ ist der Zusatz „Stamm“ überflüssig.
    const art = e.art !== "einzeltier" && !gruppenAbteilung(e.art, s.staemmeVorn) ? `${MELDEART_LABEL[e.art]} ` : "";
    if (zuletzt === "tier") doc.y += ABSTAND_KLASSE;
    zuletzt = "kopf";
    const linie = doc.y + 9 * kt; // gemeinsame Grundlinie von Klasse und Farbenschlag
    const prefix = `${art}${e.geschlecht} ${e.alter}`;
    const c = col();
    // Klasse unter der Nummernspalte, Farbenschlag auf Höhe der Bewertung – alles fluchtet.
    doc.fillColor(farbe).text(prefix, spX(), aufLinie(SANS_FETT, 7 * kt, linie), { lineBreak: false });
    const pw = Math.max(c.nr + 2 * MM, doc.widthOfString(prefix) + 2 * MM);
    textImFeld(doc, `${farbschlag || "–"}${zusatz ? ` (${zusatz})` : ""}`, spX() + pw, aufLinie(SERIF_KURSIV, 9.6 * kt, linie), { breite: spB() - pw, groesse: 9.6 * kt, min: 7.5, schrift: SERIF_KURSIV, farbe: TINTE });
    doc.y = linie + 3.2 * kt;
  }

  function richterZeile(name: string) {
    const c = col();
    doc.font(SANS_KURSIV).fontSize(7.2 * kt).fillColor(GRAU).text(`Preisrichter: ${name}`, spX() + c.nr + 2 * MM, doc.y - 1 * kt, { width: spB() - c.nr - 2 * MM, lineBreak: false, ellipsis: true });
    doc.y += 8 * kt;
    zuletzt = "kopf";
    doc.fillColor(TINTE);
  }

  function tierZeile(e: Eintrag) {
    if (tabelle) return tabellenZeile(e);
    const c = col();
    const y = doc.y;
    const x = spX();
    doc.font(SANS_FETT).fontSize(GR).fillColor(TINTE).text(formatKatalognummer(e), x, y, { width: c.nr, align: "right", lineBreak: false });
    const nx = x + c.nr + 2 * MM;
    if (mitErgebnis) {
      const n = note(e);
      // v und hv fett, damit Spitzentiere auch im Schwarz-Weiß-Druck auffallen.
      doc.font(e.punkte != null && e.punkte >= spitzePunkte ? SANS_FETT : SANS).fontSize(GR).fillColor(TINTE).text(n, nx, y, { width: c.note, lineBreak: false });
      const preise = e.preise.map((p) => p.kuerzel).join(" ");
      if (preise) textImFeld(doc, preise, nx + c.note, y, { breite: c.preis - 1.5 * MM, groesse: GR, min: 6.5, schrift: SANS_FETT, farbe });
    } else {
      // Vorkatalog: feine Schreiblinie für eigene Notizen statt „kt. E.“ in jeder Zeile.
      doc.save().lineWidth(0.3).strokeColor(HAARLINIE).dash(0.8, { space: 1.6 });
      doc.moveTo(nx, y + 8 * kt).lineTo(nx + c.note + c.preis - 2 * MM, y + 8 * kt).stroke();
      doc.undash().restore();
    }
    textImFeld(doc, ausstellerAnzeige(e), nx + c.note + c.preis, y, { breite: c.aussteller - 1.5 * MM, groesse: GR, min: 6.8 * kt, schrift: SANS, farbe: TINTE });
    // Nicht verkäuflich: fehlende Tiere und gesperrte (Gesundheitsjournal) – kein Preis im Katalog.
    if (e.verkaufspreisCent && e.status !== "fehlt" && !e.gesperrt) {
      const verkauft = mitErgebnis && e.verkauftAn;
      const euro = e.verkaufspreisCent % 100 === 0 ? String(e.verkaufspreisCent / 100) : formatEuro(e.verkaufspreisCent).replace(/\s?€/, "");
      doc.font(verkauft ? SANS_KURSIV : SANS).fontSize(GR).fillColor(verkauft ? GRAU : TINTE).text(verkauft ? "verk." : euro, x + spB() - c.vk, y, { width: c.vk, align: "right", lineBreak: false });
    }
    doc.fillColor(TINTE);
    doc.y = y + ZEILE;
    zuletzt = "tier";
    tiefste = Math.max(tiefste, doc.y);
  }

  /** Eine Tabellenzeile: Nr. | Klasse | Farbenschlag | Aussteller | Bewertung | Preis | Vkpr. */
  function tabellenZeile(e: Eintrag) {
    const c = col();
    const t = tabX();
    const y0 = doc.y;
    const y = y0 + 1.6 * kt; // Text etwas unter der Oberkante, die Trennlinie liegt unter den Unterlängen
    const x = spX();
    // Gemeinsame Grundlinie: der kursive Farbenschlag (Titelschrift) steht auf derselben Linie wie die übrigen Spalten.
    const grund = y - aufLinie(SANS, GR, 0);
    const farbschlag = e.rasse ? (e.farbenschlag ?? "") : e.freitext;
    const zusatz = [e.istAoc ? "AOC" : "", e.istNeuzuechtung ? "Neuzüchtung" : ""].filter(Boolean).join(", ");
    const art = e.art !== "einzeltier" && !gruppenAbteilung(e.art, s.staemmeVorn) ? `${MELDEART_LABEL[e.art]} ` : "";
    doc.font(SANS_FETT).fontSize(GR).fillColor(TINTE).text(formatKatalognummer(e), x, y, { width: c.nr, align: "right", lineBreak: false });
    textImFeld(doc, `${art}${e.geschlecht} ${e.alter}`, t.klasse, y, { breite: c.klasse - 1.5 * MM, groesse: GR, min: 6.5, schrift: SANS_FETT, farbe });
    textImFeld(doc, `${farbschlag || "–"}${zusatz ? ` (${zusatz})` : ""}`, t.farbenschlag, aufLinie(SERIF_KURSIV, GR * 1.08, grund), { breite: c.farbenschlag, groesse: GR * 1.08, min: 6.5, schrift: SERIF_KURSIV, farbe: TINTE });
    textImFeld(doc, ausstellerAnzeige(e), t.aussteller, y, { breite: c.aussteller - 1.5 * MM, groesse: GR, min: 6.8 * kt, schrift: SANS, farbe: TINTE });
    if (mitErgebnis) {
      doc.font(e.punkte != null && e.punkte >= spitzePunkte ? SANS_FETT : SANS).fontSize(GR).fillColor(TINTE).text(note(e), t.note, y, { width: c.note, lineBreak: false });
      const preise = e.preise.map((p) => p.kuerzel).join(" ");
      if (preise) textImFeld(doc, preise, t.preis, y, { breite: c.preis - 1.5 * MM, groesse: GR, min: 6.5, schrift: SANS_FETT, farbe });
    } else {
      doc.save().lineWidth(0.3).strokeColor(HAARLINIE).dash(0.8, { space: 1.6 });
      doc.moveTo(t.note, y + 8 * kt).lineTo(t.note + c.note - 2 * MM, y + 8 * kt).stroke();
      doc.undash().restore();
    }
    // Nicht verkäuflich: fehlende Tiere und gesperrte (Gesundheitsjournal) – kein Preis im Katalog.
    if (e.verkaufspreisCent && e.status !== "fehlt" && !e.gesperrt) {
      const verkauft = mitErgebnis && e.verkauftAn;
      const euro = e.verkaufspreisCent % 100 === 0 ? String(e.verkaufspreisCent / 100) : formatEuro(e.verkaufspreisCent).replace(/\s?€/, "");
      doc.font(verkauft ? SANS_KURSIV : SANS).fontSize(GR).fillColor(verkauft ? GRAU : TINTE).text(verkauft ? "verk." : euro, x + spB() - c.vk, y, { width: c.vk, align: "right", lineBreak: false });
    }
    // Feine Linie unter jeder Zeile, damit das Auge in der breiten Tabelle die Zeile hält.
    doc.save().lineWidth(0.25).strokeColor(HAARLINIE).moveTo(x, y0 + ZEILE - 0.4 * kt).lineTo(x + spB(), y0 + ZEILE - 0.4 * kt).stroke().restore();
    doc.fillColor(TINTE);
    doc.y = y0 + ZEILE;
    zuletzt = "tier";
    tiefste = Math.max(tiefste, doc.y);
  }

  return register;
}

export type Register = ReturnType<typeof tierteilSetzen>;
