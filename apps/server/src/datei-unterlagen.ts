/**
 * Datei-Adressen der Unterlagen als PDF (angemeldete Benutzer der eigenen Schau): Bewertungskarten und -listen, Preisverteilung,
 * Preisrichterverpflichtung,
 * B-Bogen und A-Bogen (auch für die Vereinsmitglieder), Abrechnung und Quittungen, Kaufbelege, Kassenbericht und archivierte Belege.
 */
import { and, eq } from "drizzle-orm";
import type { Hono } from "hono";
import { db } from "./db/client";
import { auszahlung, katalogeintrag, meldung, verkauf } from "./db/schema";
import { abrechnungPdf, ausstellerUnterlagenPdf, bewertungskartenPdf, kassenberichtPdf, kaufbelegPdf } from "./pdf/dokumente";
import { preisrichterListePdf } from "./pdf/bewertungsliste";
import { aBogenFuerAusstellerPdf, aBogenPdf } from "./pdf/a-bogen";
import { preisverteilungPdf } from "./pdf/preisverteilung";
import { preisrichterVerpflichtungPdf } from "./pdf/verpflichtung";
import { serienbriefEmpfaenger } from "./services/serienbrief";
import { archiviereKassenbeleg, archiviereKaufbeleg, archiviereQuittung, archiviereSpendenquittung, ladeBeleg, type Belegart } from "./services/kassenbuch";
import { archivPdf, datumAus, pdf, schauFuer, zahlAus } from "./datei-hilfen";

export function unterlagenDateien(app: Hono<any>) {
  app.get("/datei/:schauId/bewertungskarten.pdf", async (c) => {
    const s = await schauFuer(c);
    if (!s) return c.text("Nicht angemeldet oder keine Berechtigung.", 403);
    const pr = c.req.query("preisrichter");
    if (pr && zahlAus(pr) == null) return c.text("Preisrichter nicht gefunden.", 404);
    return pdf(c, await bewertungskartenPdf(s, pr ? zahlAus(pr)! : undefined), `bewertungskarten-${s.slug}.pdf`);
  });

  app.get("/datei/:schauId/preisrichter/:prId/liste.pdf", async (c) => {
    const s = await schauFuer(c);
    if (!s) return c.text("Nicht angemeldet oder keine Berechtigung.", 403);
    const pr = zahlAus(c.req.param("prId"));
    if (pr == null) return c.text("Preisrichter nicht gefunden.", 404);
    return pdf(c, await preisrichterListePdf(s, pr), `bewertungsliste.pdf`);
  });

  // Preisverteilung: alle Preisrichter (je einer ab neuer Seite) oder mit ?preisrichter= nur einer. Ohne Ausstellernamen.
  app.get("/datei/:schauId/preisverteilung.pdf", async (c) => {
    const s = await schauFuer(c);
    if (!s) return c.text("Nicht angemeldet oder keine Berechtigung.", 403);
    const pr = c.req.query("preisrichter");
    if (pr && zahlAus(pr) == null) return c.text("Preisrichter nicht gefunden.", 404);
    const datei = await preisverteilungPdf(s, pr ? zahlAus(pr)! : undefined);
    if (!datei) return c.text("Preisrichter nicht gefunden.", 404);
    return pdf(c, datei, `preisverteilung-${s.slug}.pdf`);
  });

  // Preisrichterverpflichtung (Brief mit Abschnitt zum Abtrennen): alle Preisrichter (je Brief ab neuer Seite) oder ?preisrichter=.
  app.get("/datei/:schauId/preisrichter-verpflichtung.pdf", async (c) => {
    const s = await schauFuer(c);
    if (!s) return c.text("Nicht angemeldet oder keine Berechtigung.", 403);
    const pr = c.req.query("preisrichter");
    if (pr && zahlAus(pr) == null) return c.text("Preisrichter nicht gefunden.", 404);
    const datei = await preisrichterVerpflichtungPdf(s, pr ? zahlAus(pr)! : undefined);
    if (!datei) return c.text("Preisrichter nicht gefunden.", 404);
    return pdf(c, datei, `preisrichter-verpflichtung-${s.slug}.pdf`);
  });

  app.get("/datei/:schauId/aussteller.pdf", async (c) => {
    const s = await schauFuer(c);
    if (!s) return c.text("Nicht angemeldet oder keine Berechtigung.", 403);
    const einzel = c.req.query("meldung");
    if (einzel && zahlAus(einzel) == null) return c.text("Meldung nicht gefunden.", 404);
    const ids = einzel
      ? [zahlAus(einzel)!]
      : (await db.select({ id: meldung.id }).from(meldung).where(eq(meldung.schauId, s.id))).map((m) => m.id);
    return pdf(c, await ausstellerUnterlagenPdf(s, ids), `b-bogen-${s.slug}.pdf`);
  });

  // A-Bogen (Meldebogen zum Ausfüllen und Unterschreiben): leer, oder mit ?meldung= vorausgefüllt aus einer Meldung.
  app.get("/datei/:schauId/a-bogen.pdf", async (c) => {
    const s = await schauFuer(c);
    if (!s) return c.text("Nicht angemeldet oder keine Berechtigung.", 403);
    const einzel = c.req.query("meldung");
    const id = einzel ? zahlAus(einzel) : undefined;
    if (einzel && id == null) return c.text("Meldung nicht gefunden.", 404);
    const datei = await aBogenPdf(s, id ?? undefined);
    if (!datei) return c.text("Meldung nicht gefunden.", 404);
    return pdf(c, datei, id ? `a-bogen-${s.slug}-${id}.pdf` : `a-bogen-${s.slug}.pdf`);
  });

  // A-Bögen für die Vereinsmitglieder (Vereinsverwaltung): je Mitglied einer, vorausgefüllt (siehe
  // aBogenFuerAusstellerPdf); mit ?aussteller= nur für diesen. Nur Ausstellungsleitung – es sind Anschriften aller
  // Mitglieder. Nicht zu Testschauen: deren Bögen gehen nicht an echte Mitglieder.
  app.get("/datei/:schauId/a-bogen-mitglieder.pdf", async (c) => {
    const s = await schauFuer(c, { nurAdmin: true });
    if (!s) return c.text("Nicht angemeldet oder keine Berechtigung.", 403);
    if (s.test) return c.text("Schau nicht gefunden.", 404);
    const einzel = c.req.query("aussteller");
    const id = einzel ? zahlAus(einzel) : undefined;
    if (einzel && id == null) return c.text("Aussteller nicht gefunden.", 404);
    const ids = id != null ? [id] : (await serienbriefEmpfaenger(s.organisationId, "mitglieder")).map((a) => a.id);
    const datei = await aBogenFuerAusstellerPdf(s, ids);
    if (!datei) return c.text("Aussteller nicht gefunden.", 404);
    return pdf(c, datei, id != null ? `a-bogen-${s.slug}-aussteller-${id}.pdf` : `a-bogen-${s.slug}-mitglieder.pdf`);
  });

  app.get("/datei/:schauId/abrechnung.pdf", async (c) => {
    const s = await schauFuer(c);
    if (!s) return c.text("Nicht angemeldet oder keine Berechtigung.", 403);
    const aRoh = c.req.query("aussteller");
    const qRoh = c.req.query("quittung");
    const a = zahlAus(aRoh);
    const q = zahlAus(qRoh);
    if ((aRoh && a == null) || (qRoh && q == null)) return c.text("Abrechnung nicht gefunden.", 404);
    // Quittungen kommen aus dem Belegarchiv (so wie beim Buchen erzeugt); die Abrechnung ohne Quittung ist eine Vorschau.
    if (a != null && q != null) {
      const [b] = await db
        .select({ storniert: auszahlung.storniertAm })
        .from(auszahlung)
        .where(and(eq(auszahlung.schauId, s.id), eq(auszahlung.ausstellerId, a), eq(auszahlung.quittungNr, q)));
      if (!b) return c.text("Quittung nicht gefunden.", 404);
      const archiv = (b.storniert && (await archiviereQuittung(s, a, q, true))) || (await archiviereQuittung(s, a, q));
      if (archiv) return archivPdf(c, archiv, `quittung-${q}.pdf`);
    }
    return pdf(c, await abrechnungPdf(s, a ?? undefined, q ?? undefined), `abrechnung-${s.slug}.pdf`);
  });

  // Hono nähme bei ":id.pdf" den Namen "id.pdf" – daher Muster mit Endung.
  app.get("/datei/:schauId/kaufbeleg/:datei{[0-9]+\\.pdf}", async (c) => {
    const s = await schauFuer(c);
    if (!s) return c.text("Nicht angemeldet oder keine Berechtigung.", 403);
    const id = Number.parseInt(c.req.param("datei"), 10);
    // Aus dem Belegarchiv: der Beleg von damals, nach Storno der Stornobeleg.
    // Nur Verkäufe dieser Schau – sonst ließe sich über eine fremde ID ein falscher Beleg ins Archiv legen.
    const [v] =
      id <= 2_147_483_647
        ? await db
            .select({ storniert: verkauf.storniertAm })
            .from(verkauf)
            .innerJoin(katalogeintrag, eq(katalogeintrag.id, verkauf.katalogeintragId))
            .where(and(eq(verkauf.id, id), eq(katalogeintrag.schauId, s.id)))
        : [];
    if (!v) return c.text("Kaufbeleg nicht gefunden.", 404);
    const archiv = (v.storniert && (await archiviereKaufbeleg(s, id, true))) || (await archiviereKaufbeleg(s, id));
    if (archiv) return archivPdf(c, archiv, `kaufbeleg-${archiv.nummer}.pdf`);
    return pdf(c, await kaufbelegPdf(s, id), `kaufbeleg.pdf`);
  });

  app.get("/datei/:schauId/kassenbericht.pdf", async (c) => {
    const s = await schauFuer(c);
    if (!s) return c.text("Nicht angemeldet oder keine Berechtigung.", 403);
    const roh = c.req.query("datum");
    const datum = datumAus(roh);
    if (roh && !datum) return c.text("Datum ungültig.", 400);
    return pdf(c, await kassenberichtPdf(s, datum ?? undefined), `kassenbericht-${s.slug}${datum ? `-${datum}` : ""}.pdf`);
  });

  /** Ein archivierter Beleg (Original, Storno, Einzahlung, Eigenbeleg) – genau wie beim Buchen abgelegt. */
  app.get("/datei/:schauId/beleg/:art{[a-z-]+}/:datei{[0-9]+\\.pdf}", async (c) => {
    const s = await schauFuer(c);
    if (!s) return c.text("Nicht angemeldet oder keine Berechtigung.", 403);
    const nummer = zahlAus(c.req.param("datei").replace(".pdf", ""));
    // Die Art genau prüfen: ein Muster mit Alternativen nahm „kaufbeleg-storno“ als „kaufbeleg“ und lieferte das Original.
    if (!["kaufbeleg", "kaufbeleg-storno", "quittung", "quittung-storno", "einzahlung", "eigenbeleg", "spende", "spende-storno"].includes(c.req.param("art"))) return c.text("Beleg nicht gefunden.", 404);
    const art = c.req.param("art") as Belegart;
    let b = nummer == null ? null : await ladeBeleg(s.id, art, nummer);
    // Kassenbelege, deren Ablage beim Buchen scheiterte, entstehen beim ersten Abruf (wie Quittungen und Kaufbelege).
    if (!b && nummer != null && (art === "einzahlung" || art === "eigenbeleg")) b = await archiviereKassenbeleg(s, art, nummer);
    if (!b && nummer != null && (art === "spende" || art === "spende-storno")) b = await archiviereSpendenquittung(s, nummer, art === "spende-storno");
    if (!b) return c.text("Beleg nicht gefunden.", 404);
    return archivPdf(c, b, `${b.art}-${b.nummer}.pdf`);
  });
}
