# 020 Sprachen der Seiten für Aussteller

**Stand:** gilt (16.11.2026), erweitert durch [022](022-sprachen-der-oberflaeche.md): seit 022 ist auch die Oberfläche
des Vereins übersetzt; die Regeln hier für Aussteller-Seiten und Mails gelten weiter.

**Kontext:** Auf größeren und grenznahen Schauen melden Aussteller aus den Nachbarländern. Sie sollen online melden und
ihre Bestätigung lesen können. Die Oberfläche des Vereins (69 Seiten) bleibt deutsch – eine Übersetzung müsste bei jeder
Änderung mitgepflegt werden.

**Entscheidung:**
- Übersetzt werden nur die Seiten und Mails für Aussteller: Schauseite, Online-Meldung, Meine Meldung, Ergebnisse,
  Rahmen von Impressum und Datenschutz, Fehlerseite; Eingangsbestätigung, Absage, SEPA-Vorabankündigung.
- Sprachen: Deutsch, Deutsch (Schweiz), Englisch, Französisch, Niederländisch, Polnisch, Tschechisch. Schweiz = Deutsch
  mit „ss“ statt „ß“ (nur im festen Text); Französisch bekommt geschützte Leerzeichen vor „: ; ? !“ automatisch.
- Alle Texte in `packages/domain/src/sprachen/`; Deutsch ist die Grundlage, jede Übersetzung hat genau dieselben
  Schlüssel (Typprüfung) – ein neuer Text fehlt sonst beim Übersetzen auf. Keine neue Bibliothek.
- Sprache der Seite: `?sprache=` im Link → zuletzt gewählte → Browser → Deutsch. Gespeichert an der Meldung
  (`meldung.sprache`, Papiermeldung „de“); Mails gehen in der Sprache der Meldung.
- Bleiben, wie sie sind: Texte des Vereins (Bestimmungen, Erklärungen, Termine als Text, Absagegrund), Rassen und
  Farbenschläge (deutsches Verzeichnis), Bewertungstexte, Preise, Impressum und Datenschutzhinweise (rechtlich maßgeblich
  ist die deutsche Fassung; Hinweis in der Sprache der Seite), Drucke und PDF.

**Folgen:** Neue Texte auf Aussteller-Seiten kommen in alle Sprachen (die Typprüfung verlangt es). Die Übersetzungen
sind sorgfältig, aber nicht von Muttersprachlern geprüft – Verbesserungen bitte als Issue.

**Wo:** `packages/domain/src/sprachen/` (Texte, `texte()`, `passendeSprache()`, `euroIn()`, `datumIn()`, Test),
`apps/web/src/sprache.tsx` (Rahmen, Auswahl, Fehlertext), Seiten `oeffentlich.tsx`, `komponenten/aussteller.tsx`,
`komponenten/positionen.tsx`, `fehler.tsx`; Server `routers/oeffentlich.ts` (`sprache` an schau, melden,
onlineVeroeffentlichung), `routers/meldung.ts` (`eingangsText`, `meldungsLink`), Absage `routers/schau/phase.ts`,
Vorabankündigung `routers/lastschrift.ts`, Migration `0062_sprache`. Test: Domain `sprachen.test.ts`, Server `57-sprachen`.
