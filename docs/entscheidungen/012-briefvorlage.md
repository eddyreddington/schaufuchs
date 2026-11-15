# 012 Briefvorlage: eine je Verein, Texte mit Platzhaltern

**Stand:** gilt (15.11.2026)

**Kontext:** Meldebestätigung (B-Bogen), Abrechnung mit Quittung, Kassenbelege und Rundschreiben an Mitglieder oder
Aussteller sollen den Briefbogen des Vereins tragen: eigener Briefkopf, Fußzeile mit Anschrift und Bankverbindung,
DIN 5008 für Fensterumschläge. Die Texte (Einleitung, Hinweise zur Einlieferung, Gruß) soll der Verein selbst
schreiben können, ohne dass jede Schau neu eingerichtet werden muss.

**Entscheidung:**
- Eine Briefvorlage je Verein: Zeile in `druckvorlage` mit Art „brief“ und ohne `schauId`. Sie gilt für alle Schauen;
  anders als bei Bewertungskarten (011) gibt es keine Fassung je Schau – Briefbogen und Texte ändern sich von Schau
  zu Schau nicht, der Schauname kommt über Platzhalter hinein.
- Form, Maße (Anschriftfeld, Falzmarken), Platzhalter und das Begrenzen gespeicherter Werte stehen rein in
  `packages/domain/src/briefvorlage.ts` und sind getestet; gezeichnet wird in `apps/server/src/pdf/brief.ts`.
- Platzhalter in geschweiften Klammern (`{Anrede}`, `{Schau}` …). Unbekannte bleiben stehen und werden in der
  Oberfläche gemeldet, statt still zu verschwinden – ein Tippfehler fällt so im Probebrief auf.
- Fehlt die Vorlage oder ein Wert, gilt die Vorgabe: Briefe sehen dann aus wie vor 1.2.1.
- Serienbriefe gehen an Vereinsmitglieder, alle Aussteller oder die Aussteller mit bestätigter Meldung einer Schau
  (`apps/server/src/services/serienbrief.ts`) – nie an gesperrte, gelöschte oder Test-Aussteller. Sie nutzen immer
  die gespeicherte Vorlage; nur Betreff, Text und Gruß kommen aus der Anfrage.
- Mehrere Briefe in einem PDF (Serienbrief, Ausstellerunterlagen) zählen ihre Seiten je Brief („Seite 1 von 2“), nicht
  über den ganzen Stapel – jede Seite geht an einen anderen Empfänger.
- Kaufbeleg und Ausgabeschein (Verkauf) bleiben ein eigenes Format ohne Briefbogen: Sie werden am Verkaufstisch
  gedruckt und müssen auf einen Blick lesbar sein.

**Folgen:** Spendenquittung und Zuwendungsbestätigung (1.2.1) nutzen Briefkopf und Fußzeile dieser Vorlage.
