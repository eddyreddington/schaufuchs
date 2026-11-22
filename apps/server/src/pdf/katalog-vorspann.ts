/**
 * Katalog-PDF, Inhaltsteile vor dem Tierteil: Grußworte, Ausstellungsleitung und Termine, Preisrichter, Kennzahlen,
 * Preise und Stifter, Bestimmungen, freie Seiten, Legende und Ehrentafel.
 */
import { bindungText, formatEuro, formatKatalognummer, JUGEND_KUERZEL, jugendKennzeichen, oeffnungszeitenZeilen, SONDERNOTE_LABEL, STANDARD_NOTENSKALA } from "@schau/domain";
import { ausstellerAnzeige, type Eintrag } from "../services/eintraege";
import { datumDe, GRAU, HAARLINIE, MM, SANS, SANS_FETT, SANS_KURSIV, SERIF, SERIF_FETT, SERIF_KURSIV, TINTE } from "./basis";
import type { Beitrag, KatalogKontext } from "./katalog-kontext";

/** Alles vor dem Tierteil: Grußworte, Leitung und Termine, Preisrichter, Kennzahlen, Preise, Bestimmungen, freie Seiten, Legende. */
export function vorspann(K: KatalogKontext) {
  const { s, opts, beitraege, richter, einteilung, preisarten, stiftungen, spender, alle, eintraege, bildVon, zu, skala, mitErgebnis, gestaltung, k, flaeche, farbe, akzent, lk, schlicht, ohne, doc, L, B, unten, neueSeite, platz, abschnitt, marke, kicker, seitentitel, zwischentitel, absatz, angaben } = K;
  // ── Grußworte ──────────────────────────────────────────────────────────
  const grussworte = beitraege.filter((b) => b.art === "grusswort");
  for (const [i, g] of grussworte.entries()) {
    neueSeite();
    if (i === 0) {
      abschnitt("Grußworte");
      marke("grussworte");
    }
    grusswort(g);
  }

  function grusswort(g: Beitrag) {
    const foto = bildVon(g.bildId);
    const fotoB = 26 * MM * k;
    const fotoH = 33 * MM * k;
    const y0 = doc.y;
    let textX = L();
    if (foto) {
      try {
        doc.image(foto, L(), y0, { fit: [fotoB, fotoH] });
        textX = L() + fotoB + 5 * MM;
      } catch {
        textX = L();
      }
    }
    const ty = y0 + (foto && textX > L() ? 6 * k : 0);
    doc.save().rect(textX, ty, 10 * MM * k, 1.6 * lk).fill(akzent).restore();
    doc.font(SERIF).fontSize(19 * k).fillColor(TINTE).text(g.titel || "Grußwort", textX, ty + 5 * k, { width: L() + B() - textX, lineGap: -2 });
    if (g.unterzeile) doc.font(SANS_KURSIV).fontSize(8.5 * k).fillColor(GRAU).text(g.unterzeile, textX, doc.y + 2, { width: L() + B() - textX });
    doc.y = Math.max(doc.y + 12 * k, foto && textX > L() ? y0 + fotoH + 10 * k : 0);
    absatz(g.text);
    if (g.unterzeile) {
      platz(26 * k);
      doc.y += 6 * k;
      doc.font(SERIF_KURSIV).fontSize(10 * k).fillColor(TINTE).text(g.unterzeile, L() + B() * 0.35, doc.y, { width: B() * 0.65, align: "right" });
    }
  }

  // ── Organisation und Termine ───────────────────────────────────────────
  neueSeite();
  abschnitt("Ausstellungsleitung und Termine");
  marke("leitung");
  seitentitel("Ausstellungsleitung", s.veranstalter);
  const leitung = gestaltung.ausstellungsleitung
    .split("\n")
    .map((z) => z.trim())
    .filter(Boolean)
    .map((z): [string, string] => {
      const i = z.indexOf(":");
      return i > 0 ? [z.slice(0, i).trim(), z.slice(i + 1).trim()] : ["", z];
    });
  angaben([...(gestaltung.schirmherr ? [["Schirmherrschaft", gestaltung.schirmherr] as [string, string]] : []), ...leitung]);
  doc.y += 10 * k;
  zwischentitel("Termine und Hinweise");
  angaben([
    ["Ausstellungsort", s.ort],
    ["Einlieferung", s.einlieferung],
    ["Bewertung", s.bewertungAm ? `${datumDe(s.bewertungAm)} (für Besucher geschlossen)` : ""],
    ["Öffnungszeiten", oeffnungszeitenZeilen(s.oeffnungszeiten).join("\n")],
    ["Eintritt", gestaltung.eintritt],
    ["Ausgabe der Tiere", s.aussetzen],
    ["Reklamationen", s.reklamationsfrist ? `schriftlich bis ${datumDe(s.reklamationsfrist)}` : ""],
    ["Kontakt", s.kontaktEmail],
  ]);
  {
    // Kasten wie in den Verbandskatalogen: Haftung, Verkauf, Umgang mit den Tieren.
    const hinweise = [
      "Alle Angaben ohne Gewähr. Maßgeblich sind die Bewertungskarten und die Listen der Preisrichter.",
      `Tiere mit Verkaufspreis gibt es nur über die Verkaufsstelle${s.provisionBp ? ` (Provision ${(s.provisionBp / 100).toLocaleString("de-DE")} %)` : ""}. Verkaufte Tiere werden erst zum Ausgabetermin herausgegeben.`,
      "Die Tiere dürfen nur von Ordnern aus den Käfigen genommen werden. Bitte nicht füttern und nicht in die Käfige greifen.",
    ];
    const innen = 4 * MM * k;
    const textB = B() - 2 * innen - 8 * k;
    const groesse = 8.6 * k;
    const abstand = 3 * k;
    // Höhe genau so messen, wie gesetzt wird – sonst läuft der Text aus dem Kasten.
    doc.font(SANS).fontSize(groesse);
    const hoehen = hinweise.map((t) => doc.heightOfString(t, { width: textB, lineGap: 1.2 * k }));
    const kopfH = 7 * k * 1.35 + 4 * k;
    const h = innen + kopfH + hoehen.reduce((n, x) => n + x + abstand, 0) - abstand + innen;
    doc.y += 12 * k;
    platz(h);
    const y = doc.y;
    if (!schlicht) doc.save().fillOpacity(0.08).rect(L(), y, B(), h).fill(flaeche).restore();
    doc.save().rect(L(), y, 2.2 * lk, h).fill(akzent).restore();
    kicker("Zur besonderen Beachtung", L() + innen, y + innen, B() - 2 * innen);
    let ty = y + innen + kopfH;
    hinweise.forEach((t, i) => {
      doc.font(SANS_FETT).fontSize(groesse).fillColor(farbe).text("•", L() + innen, ty, { lineBreak: false });
      doc.font(SANS).fontSize(groesse).fillColor(TINTE).text(t, L() + innen + 8 * k, ty, { width: textB, lineGap: 1.2 * k });
      ty += hoehen[i]! + abstand;
    });
    doc.y = y + h + 14 * k;
  }
  // ── Preisrichter ───────────────────────────────────────────────────────
  if (richter.length && !ohne.has("preisrichter")) {
    neueSeite();
    abschnitt("Preisrichter");
    marke("preisrichter");
    seitentitel("Preisrichter", "mit den Katalognummern, die sie bewerten");
    for (const r of richter) {
      const bereiche = einteilung.filter((x) => x.preisrichterId === r.id);
      const rassen = [...new Set(eintraege.filter((e) => (e.bewertetVon ?? zu.get(e.id)) === r.id).map((e) => e.rasse ?? e.einordnungRasse ?? e.freitext))].filter(Boolean);
      const nummern = bereiche.map((x) => (x.vonNr === x.bisNr ? `${x.vonNr}` : `${x.vonNr}–${x.bisNr}`)).join(", ");
      // Links Name und Nummern, rechts die Rassen – wie eine Karteikarte je Preisrichter.
      const lb = B() * 0.36;
      doc.font(SANS).fontSize(8.4 * k);
      const rh = doc.heightOfString(rassen.join(", ") || " ", { width: B() - lb, lineGap: 1 * k });
      const h = Math.max(rh, 34 * k) + 12 * k;
      platz(h);
      const y = doc.y;
      doc.font(SERIF_FETT).fontSize(11.5 * k).fillColor(TINTE).text(r.name, L(), y, { width: lb - 8 });
      if (r.istObmann) kicker("Obmann", L(), doc.y + 1, lb - 8);
      if (nummern) doc.font(SANS_FETT).fontSize(8.6 * k).fillColor(farbe).text(`Nr. ${nummern}`, L(), doc.y + 1, { width: lb - 8 });
      // Anschrift nur im gedruckten Katalog – online keine Wohnanschrift ohne Einwilligung.
      // Anschrift nur mit Einverständnis des Preisrichters (Schalter an der Preisrichter-Seite).
      if (r.anschrift && r.anschriftImKatalog && !opts.online) doc.font(SANS).fontSize(7.8 * k).fillColor(GRAU).text(r.anschrift.replace(/\n/g, ", "), L(), doc.y + 1, { width: lb - 8 });
      const yLinks = doc.y;
      if (rassen.length) doc.font(SANS).fontSize(8.4 * k).fillColor(TINTE).text(rassen.join(", "), L() + lb, y + 2 * k, { width: B() - lb, lineGap: 1 * k });
      const yl = Math.max(yLinks, doc.y) + 6 * k;
      doc.save().lineWidth(0.3).strokeColor(HAARLINIE).moveTo(L(), yl).lineTo(L() + B(), yl).stroke().restore();
      doc.y = yl + 7 * k;
    }
  }

  const meldeZahl = new Set(eintraege.map((e) => e.ausstellerId)).size;
  // Kennzahlen als ruhiger Block: Tiere, Aussteller, Preisrichter.
  {
    const kz: [string, string][] = [
      [String(eintraege.length), "Tiere"],
      [String(meldeZahl), "Aussteller"],
      [String(richter.length), "Preisrichter"],
    ];
    doc.y += 16 * k;
    const hoehe = 26 * k + 12 * k;
    // Nur wenn sie noch auf die Seite passen – keine Seite nur für drei Zahlen.
    if (doc.y + hoehe <= unten()) {
      const y = doc.y;
      const b = B() / kz.length;
      kz.forEach(([zahl, text], i) => {
        if (i) doc.save().lineWidth(0.4).strokeColor(HAARLINIE).moveTo(L() + i * b, y + 4 * k).lineTo(L() + i * b, y + hoehe - 4 * k).stroke().restore();
        doc.font(SERIF).fontSize(24 * k).fillColor(farbe).text(zahl, L() + i * b, y, { width: b, align: "center", lineBreak: false });
        doc.font(SANS).fontSize(7.5 * k).fillColor(GRAU).text(text.toLocaleUpperCase("de"), L() + i * b, y + 28 * k, { width: b, align: "center", characterSpacing: 1 * k, lineBreak: false });
      });
      doc.y = y + hoehe;
    }
  }

  // ── Preise und Stifter ─────────────────────────────────────────────────
  if ((preisarten.length || stiftungen.length || spender.length) && !ohne.has("preise")) {
    neueSeite();
    abschnitt("Preise und Stifter");
    marke("preise");
    seitentitel("Preise", "Kürzel im Katalog und ihr Wert");
    angaben(
      preisarten.map((p): [string, string] => [
        `${p.kuerzel}  ${p.name}`,
        [p.betragCent ? formatEuro(p.betragCent) : p.sachpreis, p.mindestpunkte ? `ab ${p.mindestpunkte} Punkten` : "", bindungText(p), p.quelle === "stiftung" ? "gestiftet" : ""].filter(Boolean).join(" · ") || "–",
      ]),
      0.45,
    );
    if (stiftungen.length) {
      doc.y += 10 * k;
      zwischentitel("Wir danken den Stiftern");
      // Stifter mit Meldung nur, wenn diese Meldung bestätigt ist und der Name hier erscheinen darf (Meldebogen bzw.
      // Online-Einwilligung, nicht gesperrt); Stifter ohne Meldung im Internet nur mit Zustimmung.
      const sichtbar = (x: (typeof stiftungen)[number]) =>
        x.meldungId != null ? alle.some((e) => e.meldungId === x.meldungId && !e.verdeckt) : !opts.online || x.onlineNennen;
      const stifter = [...new Set(stiftungen.filter(sichtbar).map((x) => x.stifter.trim()).filter((x) => x && x !== "Gelöscht"))];
      doc.font(SERIF).fontSize(9.5 * k).fillColor(TINTE).text(stifter.join(" · "), L(), doc.y, { width: B(), align: "center", lineGap: 2 });
      // Mit Ergebnissen: welcher gestiftete Preis an welches Tier ging (Treuhand gegenüber dem Stifter).
      const vergaben = mitErgebnis
        ? stiftungen.filter(sichtbar).flatMap((st) => {
            const nr = alle.filter((e) => e.preise.some((p) => p.stiftungId === st.id)).map((e) => `${e.katalogNr}${e.suffix}`);
            const art = preisarten.find((p) => p.id === st.preisartId);
            return nr.length && st.stifter.trim() !== "Gelöscht" ? [[`${st.stifter.trim()}`, `${art?.kuerzel ?? "Preis"} an Nr. ${nr.join(", ")}`] as [string, string]] : [];
          })
        : [];
      if (vergaben.length) {
        doc.y += 8 * k;
        zwischentitel("Gestiftete Preise und ihre Gewinner");
        angaben(vergaben, 0.45);
      }
    }
    // Spender nur mit Einwilligung (Name, Betrag getrennt) – services/spenden.ts.
    if (spender.length) {
      doc.y += 10 * k;
      zwischentitel("Wir danken unseren Spendern");
      doc.font(SERIF).fontSize(9.5 * k).fillColor(TINTE).text(spender.join(" · "), L(), doc.y, { width: B(), align: "center", lineGap: 2 });
    }
  }

  // ── Bestimmungen ───────────────────────────────────────────────────────
  if (s.bestimmungen.trim() && !ohne.has("bestimmungen")) {
    neueSeite();
    abschnitt("Ausstellungsbestimmungen");
    marke("bestimmungen");
    seitentitel("Ausstellungsbestimmungen");
    absatz(s.bestimmungen, { groesse: 8.5 * k, schrift: SERIF });
  }

  // ── Freie Seiten (Hallenplan, Vereinsgeschichte …) ─────────────────────
  for (const b of beitraege.filter((x) => x.art === "seite")) {
    neueSeite();
    abschnitt(b.titel || "Seite");
    marke("seiten");
    seitentitel(b.titel || "", b.unterzeile || undefined);
    const foto = bildVon(b.bildId);
    if (foto) {
      const h = b.text.trim() ? (unten() - doc.y) * 0.6 : unten() - doc.y;
      try {
        doc.image(foto, L(), doc.y, { fit: [B(), h], align: "center" });
        doc.y += h + 6 * k;
      } catch {
        // Bild nicht lesbar – Text trotzdem setzen.
      }
    }
    if (b.text.trim()) absatz(b.text);
  }

  // ── Legende (direkt vor dem Tierteil, dort wird sie gebraucht) ─────────
  if (!ohne.has("legende")) {
  neueSeite();
  abschnitt("So lesen Sie den Katalog");
  marke("legende");
  seitentitel("So lesen Sie den Katalog");
  angaben([
    ["1,0 / 0,1", "ein männliches / ein weibliches Tier (Hahn, Erpel, Ganter, Täuber / Henne, Ente, Gans, Täubin)"],
    ["1,2 · 1,1 · 1,3", "Stamm oder Voliere: Zahl der männlichen, dann der weiblichen Tiere"],
    ["jung / alt", "Jungtier aus diesem Zuchtjahr / Alttier"],
    ["PR", "Preisrichter, der die folgenden Nummern bewertet"],
    ["AOC", "anerkannte Rasse in einem nicht anerkannten Farbenschlag"],
    ["Neuzüchtung", "Rasse oder Farbenschlag im Anerkennungsverfahren"],
    ["Vkpr.", "Verkaufspreis in Euro – Kauf nur über die Verkaufsstelle"],
    // Jugend in der Rasse eingereiht: das Kürzel hinter dem Aussteller (beim eigenen Block steht die Überschrift „Jugend“).
    ...(eintraege.some((e) => jugendKennzeichen(e, s)) ? [[JUGEND_KUERZEL, "Tier der Jugend, in der Rasse eingereiht"] as [string, string]] : []),
  ]);
  doc.y += 10 * k;
  zwischentitel("Bewertung");
  angaben([
    ...(skala ?? STANDARD_NOTENSKALA).map((n): [string, string] => [n.kuerzel, `${n.name} – ${n.punkte.join(", ")} Punkte`]),
    ...Object.values(SONDERNOTE_LABEL).map((n): [string, string] => [n.kuerzel, n.name]),
    ["fehlt", "Tier nicht eingeliefert"],
  ]);
  if (preisarten.length) {
    doc.y += 10 * k;
    zwischentitel("Preise");
    angaben(preisarten.map((p): [string, string] => [p.kuerzel, [p.name, p.betragCent ? formatEuro(p.betragCent) : p.sachpreis].filter(Boolean).join(" – ")]));
  }
  }
}

/** Ehrentafel mit den besten Tieren und den Preisträgern (nur mit Ergebnissen). */
export function ehrentafel(K: KatalogKontext) {
  const { preisarten, eintraege, mitErgebnis, k, farbe, ohne, doc, L, B, neueSeite, platz, abschnitt, marke, seitentitel, zwischentitel, spitzePunkte, note } = K;
  // ── Ehrentafel (nur mit Ergebnissen) ───────────────────────────────────
  if (mitErgebnis && !ohne.has("ehrentafel")) {
    const spitze = eintraege.filter((e) => e.punkte != null && e.punkte >= spitzePunkte).sort((a, b) => b.punkte! - a.punkte! || a.katalogNr! - b.katalogNr!);
    const mitPreis = eintraege.filter((e) => e.preise.length);
    if (spitze.length || mitPreis.length) {
      neueSeite({ kopf: "Ehrentafel" });
      abschnitt("Ehrentafel");
      marke("ehrentafel");
      seitentitel("Ehrentafel", "Wir gratulieren allen Preisträgern.");
      const liste = (titel: string, tiere: Eintrag[]) => {
        if (!tiere.length) return;
        doc.y += 4 * k;
        zwischentitel(titel);
        // Nr. | Tier (darf umbrechen) | Klasse | Note | Aussteller – feste Schrift, kein Schrumpfen.
        const nrB = 9 * MM * k;
        const klasseB = 13 * MM * k;
        const noteB = 11 * MM * k;
        const ausB = B() * 0.3;
        const tierB = B() - nrB - klasseB - noteB - ausB - 3 * MM;
        const gr = 8.4 * k;
        for (const e of tiere) {
          doc.font(SANS).fontSize(gr);
          const aus = ausstellerAnzeige(e, "vorname");
          const h = Math.max(doc.heightOfString(e.bezeichnung, { width: tierB }), doc.heightOfString(aus, { width: ausB }));
          platz(h + 3 * k);
          const y = doc.y;
          let x = L();
          doc.font(SANS_FETT).fontSize(gr).fillColor(TINTE).text(formatKatalognummer(e), x, y, { width: nrB - 2 * MM, align: "right", lineBreak: false });
          x += nrB;
          doc.font(SANS).fontSize(gr).fillColor(TINTE).text(e.bezeichnung, x, y, { width: tierB });
          x += tierB + 2 * MM;
          doc.fillColor(GRAU).text(`${e.geschlecht} ${e.alter}`, x, y, { width: klasseB, lineBreak: false });
          x += klasseB;
          doc.font(SANS_FETT).fillColor(farbe).text(note(e), x, y, { width: noteB, lineBreak: false });
          x += noteB + 1 * MM;
          doc.font(SANS).fillColor(TINTE).text(aus, x, y, { width: ausB });
          doc.y = y + h + 2.6 * k;
        }
        doc.y += 8 * k;
      };
      liste("Die besten Tiere der Schau", spitze);
      for (const p of preisarten) liste(`${p.name} (${p.kuerzel})`, mitPreis.filter((e) => e.preise.some((x) => x.preisartId === p.id)));
    }
  }
}
