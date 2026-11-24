/**
 * Katalog-PDF, Tierteil: zwei oder drei Spalten bzw. Tabelle, Spartenköpfe mit Stich, Rassenköpfe mit Rassebild,
 * Preisrichter-, Klassen- und Tierzeilen; Teilschauen und Jugend nacheinander. Liefert das Register der Rassen.
 */
import { formatEuro, formatKatalognummer, gruppenAbteilung, istJugendBlock, JUGEND_KUERZEL, jugendKennzeichen, katalogGroessen, MELDEART_LABEL } from "@schau/domain";
import { oeffneBild } from "../services/rassebild";
import { ausstellerAnzeige, type Eintrag } from "../services/eintraege";
import { GRAU, HAARLINIE, MM, textUmbrochen, TINTE, zeilenUmbrechen } from "./basis";
import { FETT, KURSIV, NORMAL, ZIFFERN } from "./katalog-schrift";
import { stichFuer } from "./illustrationen";
import type { Seite, KatalogKontext } from "./katalog-kontext";
import { anzahlText } from "./katalog-hilfen";

/** Kurzform von „nicht veröffentlicht“, wenn die lange in der Spalte nicht Platz hat. */
const NICHT_VEROEFFENTLICHT_KURZ = "nicht veröff.";

// Bereiche mit Unternummer („24a“): Nachmeldungen sortieren hinter ihrer Hauptnummer ein.
type Nr = { katalogNr: number | null; suffix: string };
export const nrVergleich = (a: Nr, b: Nr) => a.katalogNr! - b.katalogNr! || a.suffix.localeCompare(b.suffix);
export const nrBereich = (von: Nr, bis: Nr) => (nrVergleich(von, bis) === 0 ? formatKatalognummer(von) : `${formatKatalognummer(von)}–${formatKatalognummer(bis)}`);

/** Tierteil: Sparten- und Rassenköpfe, Klassen, Tierzeilen; gibt das Register für das Rassenverzeichnis zurück. */
export function tierteilSetzen(K: KatalogKontext) {
  const { G, s, tierteilListe, bildDerRasse, geoeffnet, genutzteBilder, zu, richterName, mitErgebnis, gestaltung, a4, k, flaeche, farbe, aufFlaeche, akzent, lk, schlicht, doc, stich, seiten, L, B, unten, neueSeite, seitenNr, abschnitt, marke, aufLinie, kicker, versalHoehe, spitzePunkte, note } = K;
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
  const GT = katalogGroessen(kt);
  const GR = GT.liste; // Schriftgröße der Tierzeilen
  const ZEILE = (tabelle ? 13 : 10.4) * kt; // Tabelle: Luft für die Trennlinie unter jeder Zeile
  /** Luft über einem Rassenkopf bzw. einer neuen Klasse, wenn darüber Tierzeilen stehen (Gruppen sichtbar trennen). */
  const ABSTAND_RASSE = 9 * kt;
  const ABSTAND_KLASSE = 4 * kt;
  const spaltenKopf = () => {
    const c = col();
    const y = doc.y;
    const nx = spX() + c.nr + 2 * MM;
    /** Kopf einer Spalte; ist er gesperrt breiter als die Spalte (große Schrift), erst ohne Sperrung, dann kleiner. */
    const kopf = (text: string, x: number, width: number, align: "left" | "right" = "left") => {
      const platz = width - 1 * MM * kt; // Luft zum Kopf daneben („PREIS“ | „AUSSTELLER“)
      let gr = GT.fein;
      doc.font(FETT).fontSize(gr).fillColor(GRAU);
      const sperrung = doc.widthOfString(text, { characterSpacing: 0.6 * kt }) <= platz ? 0.6 * kt : 0;
      while (gr > 5 && doc.widthOfString(text, { characterSpacing: sperrung }) > platz) doc.fontSize((gr -= 0.25));
      doc.text(text, x, y, { lineBreak: false, characterSpacing: sperrung, width, align });
    };
    kopf("NR.", spX(), c.nr, "right");
    if (tabelle) {
      const t = tabX();
      kopf("KLASSE", t.klasse, c.klasse);
      kopf("FARBENSCHLAG", t.farbenschlag, c.farbenschlag);
      kopf("AUSSTELLER", t.aussteller, c.aussteller);
      kopf(mitErgebnis ? "NOTE" : "NOTIZ", t.note, c.note);
      if (mitErgebnis) kopf("PREIS", t.preis, c.preis);
      kopf("VKPR.", spX() + spB() - c.vk - 4 * MM, c.vk + 4 * MM, "right");
      doc.save().lineWidth(0.5).strokeColor(TINTE).moveTo(spX(), y + 8.5 * kt).lineTo(spX() + spB(), y + 8.5 * kt).stroke().restore();
      doc.y = y + 12 * kt;
      doc.fillColor(TINTE);
      return;
    }
    kopf(mitErgebnis ? "NOTE" : "NOTIZ", nx, c.note);
    if (mitErgebnis) kopf("PREIS", nx + c.note, c.preis);
    kopf("AUSSTELLER", nx + c.note + c.preis, c.aussteller);
    kopf("VKPR.", spX() + spB() - c.vk - 4 * MM, c.vk + 4 * MM, "right");
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
  /** „Rasse (Fortsetzung)“ – bricht bei langen Namen um wie alles im Katalog (Entscheidung 032). */
  const fortsetzung = (y: number, zeichnen = true) =>
    textUmbrochen(doc, `${laufendeRasse} (Fortsetzung)`, spX(), y, { breite: spB(), groesse: GT.liste, schrift: KURSIV, farbe, zeichnen });
  const raum = (hoehe: number, neueRasse = false): boolean => {
    if (doc.y + hoehe <= unten()) return false;
    const fortH = !neueRasse && laufendeRasse ? fortsetzung(0, false).hoehe + 11 * kt : 0;
    // Die nächste Spalte beginnt auf derselben Höhe: passt der Block auch dort nicht, gleich auf die nächste Seite
    // (sonst stünde z. B. ein Rassenkopf mit Bild allein unten in der rechten Spalte und die linke bliebe leer).
    if (spalte < SPALTEN - 1 && spaltenOben + 12 * kt + fortH + hoehe <= unten()) {
      tiefste = Math.max(tiefste, doc.y);
      spalte++;
      doc.y = spaltenOben;
      spaltenKopf();
    } else {
      tierSeite({ kopf: kopfJetzt });
    }
    zuletzt = "kopf";
    if (!neueRasse && laufendeRasse) {
      const yf = doc.y;
      const f = fortsetzung(yf);
      // In der Tabelle folgt gleich die Tierzeile (keine Klassenzeile dazwischen) – nur eine Zeile Abstand.
      doc.y = tabelle ? yf + 12 * kt + f.hoehe - f.zeilenhoehe : yf + f.hoehe + 11 * kt;
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
    const erwachsen = liste.filter((e) => !istJugendBlock(e, s));
    const jugend = liste.filter((e) => istJugendBlock(e, s));
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
        spartenKopf(sp, zusatz, kopfBasis, liste.filter((x) => abteilungVon(x) === sp), rasseBlock(e.rasse ?? e.einordnungRasse ?? e.freitext ?? "", e));
        sparte = sp;
        rasse = null;
      }
      const ra = e.rasse ?? e.einordnungRasse ?? e.freitext ?? "";
      if (ra !== rasse) {
        // Rassenkopf nur mit Preisrichter, Bild, Klasse und mindestens zwei Tieren darunter.
        raum(rasseBlock(ra, e), true);
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
        const richter = pr != null ? (richterName.get(pr) ?? "") : null;
        raum(10 * kt + (richter != null ? richterZeile(richter, false) : 0) + 16 * kt + klassenKopf(e, false) + zeilenHoehe(e));
        if (richter != null) richterZeile(richter);
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
        raum(ABSTAND_KLASSE + 12 * kt + klassenKopf(e, false) + zeilenHoehe(e));
        klassenKopf(e);
        klasse = kl;
      }
      // Nach einem Spalten- oder Seitenwechsel steht die Klasse noch einmal über den Tieren.
      if (raum(zeilenHoehe(e))) klassenKopf(e);
      tierZeile(e);
    }
  }

  /** Höhe, die ein Rassenkopf mindestens braucht: Überschrift, Preisrichter, Bild, Klasse und zwei Tiere (wie `e`). */
  function rasseBlock(ra: string, e: Eintrag) {
    const bm = bildMass(ra);
    return ABSTAND_RASSE + 17 * kt + rasseName(ra, 0, false).mehr + 10 * kt + 16 * kt + klassenKopf(e, false) + 2 * zeilenHoehe(e) + (bm ? bm.h + 6 * kt : 0);
  }

  function spartenKopf(sparte: string, zusatz: string, kopf: string, tiere: Eintrag[], ersterBlock: number) {
    const gruppe = tiere.some((t) => gruppenAbteilung(t.art, s.staemmeVorn) === sparte);
    // „Jugendabteilung“; eine Teilschau steht davor („Landesschau · Abteilung“), nicht angehängt („Landesschauabteilung“).
    const ohne = gruppe ? "Abteilung" : "Sparte";
    const art = !zusatz ? ohne : zusatz === "Jugend" || zusatz.endsWith(" · Jugend") ? `${zusatz}abteilung` : `${zusatz} · ${ohne}`;
    // Neue Sparte unter der vorigen, wenn noch knapp ein Drittel der Seite frei ist und Kopf samt erster Rasse
    // darunter passen – sonst neue Seite (keine Spartenüberschrift allein unten auf der Seite).
    const darunter = Math.max(tiefste, doc.y) + 12 * k;
    // Höhe des Spartenkopfs samt Spaltenkopf je Stil (gemessen; mit Rahmen steht das Bild über dem Namen).
    // Ein langer Name bricht um (nie „…“): jede weitere Zeile zählt mit.
    const fw0 = 15 * MM * k * 1.6;
    const nameB = gestaltung.stil === "rahmen" ? B() : gestaltung.stil === "modern" ? B() - fw0 - 4 * MM - 8 * MM * k : B() - fw0 - 6 * MM;
    doc.font(NORMAL).fontSize(G.h1);
    const nameMehr = Math.max(0, doc.heightOfString(sparte, { width: nameB, lineGap: -3 }) - doc.heightOfString("X", { width: nameB, lineGap: -3 }));
    // Die Versalzeile (Art, Teilschau) steht in derselben Breite wie der Name; bricht sie um, zählt jede weitere Zeile.
    const artMehr = versalHoehe(art, nameB) - G.klein * 1.35;
    const kopfHoehe = 15 * MM * k + (gestaltung.stil === "rahmen" ? 88 * k : gestaltung.stil === "modern" ? 40 * k : 34 * k) + nameMehr + artMehr;
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
    const bild = stich(stichFuer(sparte, gruppe));
    /** Stich der Sparte im Bildfeld fw × g (Stämme und Volieren: Hahn mit Henne). */
    const figur = (x: number, y: number, align: "center" | "right") => doc.image(bild, x, y, { fit: [fw, g], align, valign: "center" });
    const rassen = new Set(tiere.map((t) => t.rasse ?? t.einordnungRasse ?? t.freitext)).size;
    const nummern = [...tiere].sort(nrVergleich);
    const angabe = `${anzahlText(sparte, tiere.length)}  ·  ${rassen} ${rassen === 1 ? "Rasse" : "Rassen"}  ·  Nr. ${nrBereich(nummern[0]!, nummern.at(-1)!)}`;
    if (gestaltung.stil === "rahmen") {
      // Mittig: Bild, Art, Name der Sparte, Angaben, darunter eine doppelte Linie.
      figur(L() + (B() - fw) / 2, y0, "center");
      kicker(art, L(), y0 + g + 3 * k, B(), "center");
      doc.font(NORMAL).fontSize(G.h1).fillColor(TINTE).text(sparte, L(), doc.y, { width: B(), align: "center", lineGap: -3 });
      doc.font(NORMAL).fontSize(G.liste).fillColor(GRAU).text(angabe, L(), doc.y + 1, { width: B(), align: "center" });
      const y = doc.y + 5 * k;
      doc.save().rect(L(), y, B(), 1.4 * lk).fill(akzent).rect(L(), y + 3, B(), 0.45 * lk).fill(akzent).restore();
      doc.y = y + 12 * k;
    } else if (gestaltung.stil === "modern") {
      // Farbband mit Art und Name in Weiß, der Stich rechts neben dem Band; die Angaben darunter.
      const bandB = B() - fw - 4 * MM;
      // Das Band wächst mit dem Namen der Sparte, statt ihn zu kürzen.
      const innen = bandB - 8 * MM * k;
      const ueber = versalHoehe(art, innen) + G.klein * 0.15; // Versalzeile(n) über dem Namen
      const bandH = Math.max(g + 4 * k, 4 * k + ueber + doc.font(NORMAL).fontSize(G.h1).heightOfString(sparte, { width: innen, lineGap: -3 }) + 2 * k);
      doc.rect(L(), y0, bandB, bandH).fill(flaeche);
      figur(L() + B() - fw, y0 + 2 * k, "right");
      kicker(art, L() + 4 * MM * k, y0 + 4 * k, innen, "left", aufFlaeche);
      doc.font(NORMAL).fontSize(G.h1).fillColor(aufFlaeche).text(sparte, L() + 4 * MM * k, y0 + 4 * k + ueber, { width: innen, lineGap: -3 });
      doc.font(NORMAL).fontSize(G.liste).fillColor(GRAU).text(angabe, L(), y0 + bandH + 3 * k, { width: B() });
      doc.y += 8 * k;
    } else {
      // Klassisch: kleines Bild rechts, Titel links – die Schrift trägt die Seite, nicht das Bild.
      figur(L() + B() - fw, y0, "right");
      const tb = B() - fw - 6 * MM;
      kicker(art, L(), y0 + 1 * k, tb);
      doc.font(NORMAL).fontSize(G.h1).fillColor(TINTE).text(sparte, L(), doc.y, { width: tb, lineGap: -3 });
      doc.font(NORMAL).fontSize(G.liste).fillColor(GRAU).text(angabe, L(), doc.y + 1, { width: tb });
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

  /** Name der Rasse im Kopf: bis 8 pt verkleinert, dann umbrochen; `mehr` ist die Höhe über eine Zeile hinaus. */
  function rasseName(rasse: string, y: number, zeichnen = true) {
    const t = textUmbrochen(doc, rasse, spX() + 6, aufLinie(FETT, GT.h3, y + 14 * kt * 0.71), { breite: spB() - 10, groesse: GT.h3, min: 8, schrift: FETT, farbe: TINTE, zeichnen });
    return { ...t, mehr: t.hoehe - t.zeilenhoehe };
  }

  function rasseKopf(rasse: string) {
    doc.y += zuletzt === "tier" ? ABSTAND_RASSE : 2 * kt;
    const y = doc.y;
    const h = 14 * kt + rasseName(rasse, y, false).mehr;
    // Heller Balken mit Farbkante statt Vollfläche: ruhiger und im Schwarz-Weiß-Druck gut lesbar.
    if (!schlicht) doc.save().fillOpacity(0.12).rect(spX(), y, spB(), h).fill(flaeche).restore();
    doc.save().rect(spX(), y, 2.2 * lk, h).fill(akzent).restore();
    rasseName(rasse, y);
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

  /** Farbenschlag mit Zusatz (AOC, Neuzüchtung); bei freier Bezeichnung der freie Text. */
  function farbText(e: Eintrag) {
    const farbschlag = e.rasse ? (e.farbenschlag ?? "") : e.freitext;
    const zusatz = [e.istAoc ? "AOC" : "", e.istNeuzuechtung ? "Neuzüchtung" : ""].filter(Boolean).join(", ");
    return `${farbschlag || "–"}${zusatz ? ` (${zusatz})` : ""}`;
  }
  /** Zusatz „Stamm“/„Voliere“ vor der Klasse – in der eigenen Abteilung „Stämme“ überflüssig. */
  function artText(e: Eintrag) {
    return e.art !== "einzeltier" && !gruppenAbteilung(e.art, s.staemmeVorn) ? `${MELDEART_LABEL[e.art]} ` : "";
  }

  /**
   * Eine Zeile je Klasse wie in den Verbandskatalogen: „1,0 jung · blau mit Binden“. Ein langer Farbenschlag bricht um.
   * Gibt die Höhe über eine Zeile hinaus zurück; mit `zeichnen: false` nur gemessen.
   */
  function klassenKopf(e: Eintrag, zeichnen = true): number {
    // In der Tabelle stehen Klasse und Farbenschlag in jeder Zeile – zwischen den Klassen nur etwas Luft.
    if (tabelle) return 0;
    const prefix = `${artText(e)}${e.geschlecht} ${e.alter}`;
    const c = col();
    const pw = Math.max(c.nr + 2 * MM, doc.font(FETT).fontSize(GT.klein).widthOfString(prefix) + 2 * MM);
    const feld = (linie: number) =>
      textUmbrochen(doc, farbText(e), spX() + pw, aufLinie(KURSIV, GT.text, linie), { breite: spB() - pw, groesse: GT.text, min: 7.5, schrift: KURSIV, farbe: TINTE, zeichnen });
    if (!zeichnen) {
      const t = feld(0);
      return t.hoehe - t.zeilenhoehe;
    }
    if (zuletzt === "tier") doc.y += ABSTAND_KLASSE;
    zuletzt = "kopf";
    const linie = doc.y + 9 * kt; // gemeinsame Grundlinie von Klasse und Farbenschlag
    // Klasse unter der Nummernspalte, Farbenschlag auf Höhe der Bewertung – alles fluchtet.
    doc.fillColor(farbe).text(prefix, spX(), aufLinie(FETT, GT.klein, linie), { lineBreak: false });
    const t = feld(linie);
    doc.y = linie + 3.2 * kt + t.hoehe - t.zeilenhoehe;
    return t.hoehe - t.zeilenhoehe;
  }

  /** „Preisrichter: Name“ – bricht bei langen Namen um. Gibt die Höhe über eine Zeile hinaus zurück. */
  function richterZeile(name: string, zeichnen = true): number {
    const c = col();
    const y = doc.y - 1 * kt;
    const t = textUmbrochen(doc, `Preisrichter: ${name}`, spX() + c.nr + 2 * MM, y, { breite: spB() - c.nr - 2 * MM, groesse: GT.klein, schrift: KURSIV, farbe: GRAU, zeichnen });
    if (!zeichnen) return t.hoehe - t.zeilenhoehe;
    doc.y = y + t.hoehe + 8 * kt;
    zuletzt = "kopf";
    doc.fillColor(TINTE);
    return t.hoehe - t.zeilenhoehe;
  }

  /**
   * Aussteller in seinem Feld; steht die Jugend in der Rasse eingereiht, folgt dem Namen das Kürzel „Jgd.“ in derselben
   * Größe, auf derselben Grundlinie. Reicht der Platz nicht: erst die Schrift bis zur Mindestgröße, dann der Vorname als
   * Initiale („Schmidt, W.“), mit Kürzel dann dieses kleiner und zuletzt nur der Nachname. Passt auch das nicht, bricht
   * der ganze Name in der Mindestgröße um (das Kürzel hinter der letzten Zeile) – gekürzt wird nie (Entscheidung 032).
   * Gibt die Höhe über eine Zeile hinaus zurück; mit `zeichnen: false` nur gemessen.
   */
  function ausstellerFeld(e: Eintrag, x: number, y: number, breite: number, zeichnen = true): number {
    if (!(breite > 1)) return 0;
    const min = 6.8 * kt;
    const w = (t: string, schrift: string, g: number) => doc.font(schrift).fontSize(g).widthOfString(t);
    // Breite Schrift in schmaler Spalte (Atkinson, dreispaltig): „nicht veröff.“ statt umbrochen.
    const voll = ausstellerAnzeige(e);
    const anzeige = e.verdeckt && w(voll, NORMAL, min) > breite ? NICHT_VEROEFFENTLICHT_KURZ : voll;
    const jgd = jugendKennzeichen(e, s);
    const luft = 1 * MM;
    const kuerzel = (kg: number) => (jgd ? luft + w(JUGEND_KUERZEL, KURSIV, kg) : 0);
    const stufen = (von: number, bis: number) => [...Array.from({ length: Math.max(0, Math.ceil((von - bis) / 0.5)) }, (_, i) => von - i * 0.5), bis];
    const initiale = e.verdeckt || !e.vorname ? null : `${e.nachname}, ${e.vorname.charAt(0)}.`;
    const kMin = 5.5 * kt;
    const wahl = [
      ...stufen(GR, min).map((g) => ({ name: anzeige, g, kg: g })),
      ...(initiale ? stufen(GR, min).map((g) => ({ name: initiale, g, kg: g })) : []),
      ...(initiale && jgd ? stufen(min, kMin).map((kg) => ({ name: initiale, g: min, kg })) : []),
      ...(initiale && jgd ? stufen(min, kMin).map((kg) => ({ name: e.nachname, g: min, kg })) : []),
    ].find((v) => w(v.name, NORMAL, v.g) + kuerzel(v.kg) <= breite);
    // Eine Zeile – oder der ganze Name umbrochen in der Mindestgröße.
    const g = wahl?.g ?? min;
    const kg = wahl?.kg ?? min;
    doc.font(NORMAL).fontSize(g);
    const zeilen = wahl ? [wahl.name] : zeilenUmbrechen(doc, anzeige, breite);
    const lh = doc.currentLineHeight(true);
    const letzte = w(zeilen.at(-1)!, NORMAL, g);
    const kuerzelNeu = jgd && letzte + kuerzel(kg) > breite; // Kürzel in eigener Zeile
    const mehr = (zeilen.length - 1 + (kuerzelNeu ? 1 : 0)) * lh;
    if (!zeichnen) return mehr;
    doc.font(NORMAL).fontSize(g).fillColor(TINTE);
    zeilen.forEach((z, i) => doc.text(z, x, y + i * lh, { width: breite, lineBreak: false }));
    if (jgd) {
      const grundlinie = y + mehr - aufLinie(NORMAL, g, 0);
      doc.font(KURSIV).fontSize(kg).fillColor(GRAU).text(JUGEND_KUERZEL, kuerzelNeu ? x : x + letzte + luft, aufLinie(KURSIV, kg, grundlinie), { width: w(JUGEND_KUERZEL, KURSIV, kg) + 1, lineBreak: false });
    }
    doc.fillColor(TINTE);
    return mehr;
  }

  /** Preiskürzel der Tierzeile („E SE“), bei vielen Preisen umbrochen. */
  function preisFeld(e: Eintrag, x: number, y: number, breite: number, zeichnen = true) {
    const preise = e.preise.map((p) => p.kuerzel).join(" ");
    if (!preise) return 0;
    const t = textUmbrochen(doc, preise, x, y, { breite, groesse: GR, min: 6.5, schrift: FETT, farbe, zeichnen });
    return t.hoehe - t.zeilenhoehe;
  }

  /**
   * Höhe der Tierzeile: eine Zeile, mehr nur, wenn ein Feld umbricht (Aussteller, Preise; in der Tabelle auch Klasse
   * und Farbenschlag). Gemessen wie gesetzt, damit Spalten- und Seitenwechsel vorher feststehen.
   */
  function zeilenHoehe(e: Eintrag) {
    return ZEILE + (tabelle ? tabellenZeile(e, false) : listenZeile(e, false));
  }

  function tierZeile(e: Eintrag) {
    const y0 = doc.y;
    const mehr = tabelle ? tabellenZeile(e, true) : listenZeile(e, true);
    doc.fillColor(TINTE);
    doc.y = y0 + ZEILE + mehr;
    zuletzt = "tier";
    tiefste = Math.max(tiefste, doc.y);
  }

  /** Tierzeile in den Spalten: Nr. | Bewertung | Preis | Aussteller | Vkpr.; gibt die Höhe über eine Zeile hinaus zurück. */
  function listenZeile(e: Eintrag, zeichnen: boolean): number {
    const c = col();
    const y = doc.y;
    const x = spX();
    const nx = x + c.nr + 2 * MM;
    const mehr = Math.max(ausstellerFeld(e, nx + c.note + c.preis, y, c.aussteller - 1.5 * MM, false), mitErgebnis ? preisFeld(e, nx + c.note, y, c.preis - 1.5 * MM, false) : 0);
    if (!zeichnen) return mehr;
    doc.font(FETT).fontSize(GR).fillColor(TINTE).text(formatKatalognummer(e), x, y, { ...ZIFFERN, width: c.nr, align: "right", lineBreak: false });
    if (mitErgebnis) {
      // v und hv fett, damit Spitzentiere auch im Schwarz-Weiß-Druck auffallen.
      doc.font(e.punkte != null && e.punkte >= spitzePunkte ? FETT : NORMAL).fontSize(GR).fillColor(TINTE).text(note(e), nx, y, { width: c.note, lineBreak: false });
      preisFeld(e, nx + c.note, y, c.preis - 1.5 * MM);
    } else {
      // Vorkatalog: feine Schreiblinie für eigene Notizen statt „kt. E.“ in jeder Zeile.
      doc.save().lineWidth(0.3).strokeColor(HAARLINIE).dash(0.8, { space: 1.6 });
      doc.moveTo(nx, y + 8 * kt).lineTo(nx + c.note + c.preis - 2 * MM, y + 8 * kt).stroke();
      doc.undash().restore();
    }
    ausstellerFeld(e, nx + c.note + c.preis, y, c.aussteller - 1.5 * MM);
    verkaufspreis(e, x + spB() - c.vk, y, c.vk);
    return mehr;
  }

  /** Verkaufspreis rechts; nicht verkäuflich sind fehlende und gesperrte Tiere (Gesundheitsjournal) – kein Preis im Katalog. */
  function verkaufspreis(e: Eintrag, x: number, y: number, breite: number) {
    if (!e.verkaufspreisCent || e.status === "fehlt" || e.gesperrt) return;
    const verkauft = mitErgebnis && e.verkauftAn;
    const euro = e.verkaufspreisCent % 100 === 0 ? String(e.verkaufspreisCent / 100) : formatEuro(e.verkaufspreisCent).replace(/\s?€/, "");
    doc.font(verkauft ? KURSIV : NORMAL).fontSize(GR).fillColor(verkauft ? GRAU : TINTE).text(verkauft ? "verk." : euro, x, y, { width: breite, align: "right", lineBreak: false });
  }

  /** Eine Tabellenzeile: Nr. | Klasse | Farbenschlag | Aussteller | Bewertung | Preis | Vkpr. Lange Felder brechen um. */
  function tabellenZeile(e: Eintrag, zeichnen: boolean): number {
    const c = col();
    const t = tabX();
    const y0 = doc.y;
    const y = y0 + 1.6 * kt; // Text etwas unter der Oberkante, die Trennlinie liegt unter den Unterlängen
    const x = spX();
    // Gemeinsame Grundlinie: der kursive Farbenschlag (Titelschrift) steht auf derselben Linie wie die übrigen Spalten.
    const grund = y - aufLinie(NORMAL, GR, 0);
    const feld = (text: string, fx: number, fy: number, breite: number, schrift: string, f: string, z: boolean) => {
      const m = textUmbrochen(doc, text, fx, fy, { breite, groesse: GR, min: 6.5, schrift, farbe: f, zeichnen: z });
      return m.hoehe - m.zeilenhoehe;
    };
    const setze = (z: boolean) =>
      Math.max(
        feld(`${artText(e)}${e.geschlecht} ${e.alter}`, t.klasse, y, c.klasse - 1.5 * MM, FETT, farbe, z),
        feld(farbText(e), t.farbenschlag, aufLinie(KURSIV, GR, grund), c.farbenschlag, KURSIV, TINTE, z),
        ausstellerFeld(e, t.aussteller, y, c.aussteller - 1.5 * MM, z),
        mitErgebnis ? preisFeld(e, t.preis, y, c.preis - 1.5 * MM, z) : 0,
      );
    const mehr = setze(false);
    if (!zeichnen) return mehr;
    doc.font(FETT).fontSize(GR).fillColor(TINTE).text(formatKatalognummer(e), x, y, { ...ZIFFERN, width: c.nr, align: "right", lineBreak: false });
    setze(true);
    if (mitErgebnis) {
      doc.font(e.punkte != null && e.punkte >= spitzePunkte ? FETT : NORMAL).fontSize(GR).fillColor(TINTE).text(note(e), t.note, y, { width: c.note, lineBreak: false });
    } else {
      doc.save().lineWidth(0.3).strokeColor(HAARLINIE).dash(0.8, { space: 1.6 });
      doc.moveTo(t.note, y + 8 * kt).lineTo(t.note + c.note - 2 * MM, y + 8 * kt).stroke();
      doc.undash().restore();
    }
    verkaufspreis(e, x + spB() - c.vk, y, c.vk);
    // Feine Linie unter jeder Zeile, damit das Auge in der breiten Tabelle die Zeile hält.
    const unterkante = y0 + ZEILE + mehr - 0.4 * kt;
    doc.save().lineWidth(0.25).strokeColor(HAARLINIE).moveTo(x, unterkante).lineTo(x + spB(), unterkante).stroke().restore();
    return mehr;
  }

  return register;
}

export type Register = ReturnType<typeof tierteilSetzen>;
