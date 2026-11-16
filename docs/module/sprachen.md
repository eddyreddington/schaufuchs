# Modul Sprachen (Oberfläche, Aussteller-Seiten, Servermeldungen)

**Zweck:** Oberfläche und Aussteller-Seiten in Deutsch, Deutsch (Schweiz), Englisch, Französisch, Niederländisch, Polnisch
und Tschechisch. Entscheidungen: [020](../entscheidungen/020-sprachen-fuer-aussteller.md) (Aussteller),
[022](../entscheidungen/022-sprachen-der-oberflaeche.md) (ganze Oberfläche). Begriffe: [Glossar](../sprachen-glossar.md).
Vollständige Liste der Funktionen: [Modulkarte](../modulkarte.md).

## Einstiegspunkte

| Wo | Datei | Wichtig |
|---|---|---|
| Sprachen, Aussteller-Texte | `packages/domain/src/sprachen/index.ts`, `de.ts`, `en.ts` … | `SPRACHEN`, `SPRACHNAME`, `texte()`, `passendeSprache()`, `euroIn()`, `datumIn()`, `LOCALE` |
| Texte der Oberfläche | `packages/domain/src/sprachen/oberflaeche/<sprache>/<gruppe>.ts`, `oberflaeche/index.ts` | `oberflaeche(sprache)`, Typ `OberflaecheTexte`; Gruppen je Bereich, `allgemein`, `fach` |
| Servermeldungen | `oberflaeche/server.ts`, Gruppen `serverSchau`, `serverKatalog`, `serverKasse` | `serverText(text, sprache)` |
| Umschreibung | `sprachen/umschreiben.ts` | `umschreiben()`, `ohneEszett()`, `franzoesischeZeichen()` |
| Web | `apps/web/src/sprache.tsx`, `sprache-jetzt.ts`, `lib.ts` | `SpracheRahmen`, `useOberflaeche()`, `useTexte()`, `useSprache()`, `SprachWahl`; `ot()`, `aktuelleSprache()`; `fehlerText()` |
| Server | `routers/auth/anmeldung.ts` | `auth.spracheSetzen`, `auth.status` (`benutzer.sprache`) |
| Prüfung | `packages/domain/src/sprachen/oberflaeche.test.ts`, `scripts/sprachen-scan.ts` mit Test | Vollständigkeit, Deutsch unverändert (`sprachen-vorher.json`), keine Reste, Servermeldungen |

## So kommt ein neuer Text dazu

1. Deutsch in `oberflaeche/de/<gruppe>.ts` (bei der Seite, zu der er gehört), mit Werten als Funktion `(n: number) => …`.
2. Dieselben Schlüssel in `en`, `fr`, `nl`, `pl`, `cs` – die Typprüfung meldet jede fehlende Stelle.
3. In der Komponente `const t = useOberflaeche();` → `t.<gruppe>.<seite>.<text>`; außerhalb von Komponenten `ot()`.
4. Neue Meldung des Servers (`fehler("…", "…")`): wortgleich in eine Gruppe `server*` und übersetzen; mit Werten als
   Funktion nur mit Text-Parametern ohne Bedingung (Mehrzahl als eigener Eintrag).
5. Bewusst deutscher Text im Quelltext: Kommentar `// bleibt deutsch`.
6. `bun scripts/sprachen-scan.ts rest` (Reste), `server` (Meldungen), `verloren` (Deutsch unverändert) – oder `bun run pruefen`.

## Regeln und Invarianten

- Deutsch ist die Grundlage und bleibt wortgleich; Schweiz („ss“) und französische Leerzeichen entstehen automatisch.
- Der Server schreibt deutsch; übersetzt wird erst in der Oberfläche. Protokoll, Drucke, PDFs, Mails an Benutzer bleiben deutsch.
- Sprache der Verwaltung: Konto → im Browser gewählt → Deutsch (nie allein nach Browsersprache). Aussteller-Seiten: Link → Wahl → Browser → Deutsch.
- Rassen, Farbenschläge, Bewertungstexte und alles, was der Verein selbst schreibt, werden nicht übersetzt.
