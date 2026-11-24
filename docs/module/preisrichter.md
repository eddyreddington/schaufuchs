# Modul Preisrichter (Zulassung, Obmann, Zusage, Einteilung, Drucke)

**Zweck:** Preisrichter einer Schau mit Sparten und BDRG-Gruppen, für die sie zugelassen sind, Zuordnung zu einem Obmann
und Stand der Zusage, Preisrichterverpflichtung und Bewertungsliste als PDF; Einteilung nach Rassen (vor den Katalognummern) und nach Nummern, mit Vorschlag. Grundlage für
Tablet, Bewertung und Preise. Vollständige Liste der Funktionen: [Modulkarte](../modulkarte.md).

## Einstiegspunkte

| Wo | Datei | Wichtig |
|---|---|---|
| Zulassung, Obmann, Zusage | `packages/domain/src/preisrichter-zulassung.ts` | `darfBewerten()` (Sparte und Gruppe), `bewertetSparte()`, `bewertetGruppe()`, `bdrgGruppe()` / `bdrgGruppeGueltig()`, `pruefeObmann()`, `ZUSAGEN` |
| Einteilung nach Rassen | `packages/domain/src/einteilung.ts` | `richterNachRasse()` (Jugendregel vor Farbenschlag vor Rasse), `richterImPlan()` (Hallenplan: ohne Nummer nach Rasse, mit Nummer nach Bereich, [ADR 031](../entscheidungen/031-hallenplan-vor-katalognummern.md)), `bereicheAusRassen()`, `regelnAusZuteilung()`, `vergleicheEinteilFolge()` |
| Gruppe im Verzeichnis | `packages/domain/src/stammdaten.ts` | `parseStammdatenCsv()`: freiwillige vierte Spalte „Gruppe“ |
| Server, Preisrichter | `apps/server/src/routers/preisrichter.ts` | `preisrichter.liste`, `.speichern` und `.loeschen` (→ `services/preisrichter-speichern.ts`), `.einteilungSetzen`, `.zuteilungSetzen`, `.einteilungJugendSetzen`, Vorschläge; `services/einteilung.ts` (`einteilTier()`, `bereicheDerSchau()`) |
| Server, Vorschlag | `apps/server/src/services/einteilung-vorschlag.ts` | `schlageEinteilungVor()`: nur an Preisrichter, die Sparte und Gruppe bewerten |
| Server, Gruppen pflegen | `apps/server/src/routers/stammdaten.ts` | `stammdaten.gruppenSetzen` (nur eigene Version, Protokoll), `gliederung` und `baum` mit `gruppe` |
| Server, Einträge | `apps/server/src/services/eintraege.ts` | `gruppe` je Eintrag (Rasse bzw. bei freier Bezeichnung die gewählte Rasse) |
| Vorlage | `apps/server/src/routers/schau/anlegen.ts` | Preisrichter mit Sparten und Gruppen übernommen (Zusage wieder offen, „zugesagt für“ und Vorbehalt leer), Obmann-Zuordnung auf die neue Schau umgesetzt |
| Drucke | `apps/server/src/pdf/verpflichtung.ts`, `pdf/bewertungsliste.ts`, Fachregeln `packages/domain/src/preisrichter-druck.ts` | `preisrichterVerpflichtungPdf()` (`/datei/:schauId/preisrichter-verpflichtung.pdf`, `?preisrichter=`), `preisrichterListePdf()` (`/datei/:schauId/preisrichter/:prId/liste.pdf`); `verpflichtungBrief()`, `VERPFLICHTUNG_MUSTER`, `rueckmeldungFehler()`, `verpflichtungGruppen()`, `bewertungslisteZeilen()`, `bewertungslisteSpalten()` |
| Web | `apps/web/src/seiten/preisrichter.tsx` (Liste, Einteilung nach Nummern), `preisrichter-rassen.tsx` (Einteilung nach Rassen), `preisrichter-form.tsx` (Dialog), `stammdaten-gruppen.tsx` | Route `/schau/:schauId/preisrichter`, `/stammdaten` → „Gruppen“ |

## Regeln und Invarianten

- Sparten leer = alle Sparten; Gruppen leer = keine Einschränkung über Gruppen. Eine Rasse ohne Gruppe wird nicht über
  Gruppen geprüft. Ein Farbenschlag zählt mit der Gruppe seiner Rasse.
- Fremde Sparte oder fremde Gruppe: Einteilung nach Rassen und nach Nummern lehnen ab und nennen Preisrichter, Sparte bzw.
  Gruppe und Rasse bzw. Nummern; die Vorschläge teilen solche Tiere nicht zu („Kein Preisrichter für: Gruppe …“).
- Jugend in der Einteilung (`schau.einteilung_jugend_separat`, Vorgabe „mit der Rasse“): Bei „separat“ ist die Jugend je
  Rasse eine eigene Einheit (Zeile „Jugend: Rasse“, Regel mit `jugend: true`, auch je Farbenschlag), im Vorschlag eigene
  Einheit, in der Folge wie im Katalog (Jugendblock am Ende oder hinter ihrer Rasse). Regeln ohne Merkmal gelten für
  Senioren und Jugend; ein Jugendtier geht erst nach den Jugendregeln, dann wie die Senioren. Bei „mit der Rasse“ gelten
  Jugendregeln nicht und bleiben gespeichert: `zuteilungSetzen` ersetzt dann nur die Regeln ohne Merkmal (Jugendregeln
  in der Eingabe zählen nicht, die Einstellung gilt unter der Sperre). Umschalten mit Protokoll (Tabelle `schau`), unter
  der Einteilungssperre, mit Neuberechnung der Bereiche (`ohne`, `abweichend` wie beim Speichern) und Rückfrage bei
  bewerteten Tieren; aus der Vorlage übernommen.
- Gruppen werden einheitlich gespeichert (ohne Leerzeichen, groß, höchstens 10 Zeichen aus Buchstaben und Ziffern).
- Obmann-Zuordnung: nur ein Obmann derselben Schau, nicht er selbst. Verliert ein Obmann den Haken, werden die ihm
  zugeordneten Preisrichter gelöst, ebenso beim Löschen (je mit Protokoll; `loeschePreisrichter()`). Die Prüfung liest die
  Preisrichter der Schau gesperrt (`for update`), damit eine gleichzeitige Änderung des Hakens nicht übersehen wird. Die Bestätigung der Noten
  (`bewertung.obmannBestaetigen`) ist davon unabhängig.
- Zusage `offen` | `zugesagt` | `abgesagt` (Vorgabe offen), dazu „zugesagt für“ und Vorbehalt als freier Text. Aus der
  Vorlage: Zusage wieder `offen`, „zugesagt für“ und Vorbehalt leer; Sparten, Gruppen und Obmann bleiben.
- Jede Änderung am Preisrichter mit `protokolliere()` (Tabelle `preisrichter`, alter und neuer Wert; Anlegen, Ändern,
  Löschen); Kontaktdaten und Vorbehalt nur als „geändert“ vermerkt (`geaendertOhneWert`), ohne Werte (das Protokoll lässt
  sich nicht löschen). Gruppen im Verzeichnis: Tabelle `stammdaten_version`.
- Datenschutz: Auskunft (`ladeAuskunftPerson`) mit Sparten, Gruppen, Obmann, Zusage, Zeitraum und Vorbehalt; die Bereinigung
  leert Kontakt, PIN, „zugesagt für“ und Vorbehalt 30 Tage nach dem Abschluss, die Anschrift nach 3 Jahren.
- Preisrichterverpflichtung: Brief nach der Briefvorlage des Vereins ([ADR 012](../entscheidungen/012-briefvorlage.md)),
  alle Preisrichter (nach Namen, je Brief ab neuer Seite) oder einer; Abschnitt zum Abtrennen mit Name, Zusage/Absage,
  Gruppen zum Ankreuzen (die im Verzeichnis der Schau vorkommenden, sonst A–M, Z1–Z3), Vorbehalt, Datum, Unterschrift.
  Betreff und Text aus der Briefvorlage (Teil `verpflichtung`, Platzhalter wie in den anderen Texten, dazu
  `{Bewertungstag}` und `{Rückmeldung}`); je Feld leer der feste Betreff bzw. Text (`verpflichtungBrief()`), der Ort, Bewertungstag und
  „Rückmeldung bis“ nur nennt, wenn sie feststehen. „Rückmeldung der Preisrichter bis“ (`schau.preisrichterRueckmeldungBis`,
  Reiter „Termine“, nicht nach dem Bewertungstag, kommt nicht aus der Vorlage) steht im Brief, im Informationsblock und
  im Abschnitt. Wer die Rückmeldung bekommt, trägt Zusage, Gruppen und Vorbehalt von Hand beim Preisrichter ein.
- Bewertungsliste: zwei Listen nebeneinander je A4-Seite, laufend; Zwischenkopf je Rasse und Farbenschlag (läuft eine
  Rasse in die nächste Spalte, dort als „(Forts.)“), kein Kopf allein am Spaltenende; Spalten Nr., Klasse, Note, Pkt.,
  Preis; Obmann im Kopf (der zugeordnete, sonst leer); Seitenzählung; keine Ausstellernamen ([ADR 005](../entscheidungen/005-anonyme-bewertung.md)).
- Gleichzeitiges Arbeiten bei Bewertung und Preisen ([ADR 033](../entscheidungen/033-gleichzeitiges-arbeiten.md)), Sperrfolge
  Kasse → Einteilung → Schau → Tier: Eine Note (`ladeZumAendern`) liest die Schau `for share`, das Tablet hält dazu die
  Einteilungssperre geteilt (`sperreEinteilungGeteilt`) und prüft die Zuteilung unter ihr neu („Tier ist Ihnen nicht
  zugeteilt.“). `preise.freigeben` läuft ganz in einer Transaktion unter Kassensperre und Schau `for no key update`; eine
  Rücknahme ohne Freigabe schreibt nichts. `vergebePreis` sperrt nach Kasse und Schau die Tierzeile, die Note gilt so bis
  zum Eintragen des Preises. `schau.notenskalaSetzen` prüft die Freigabe an der gesperrten Schau. `katalog.nummernNachPlan`
  nimmt die Einteilungssperre vor der Schau.
- Keine erfundene Zuordnung Rasse → Gruppe im Repo; Tests nutzen erkennbar erfundene Gruppen (X1, X2); erlaubt ist nur die Liste der Bezeichnungen A–M, Z1–Z3 als Vorgabe zum Ankreuzen – [ADR 027](../entscheidungen/027-bdrg-daten-nutzung.md).

## Tests

- Domain: `preisrichter-zulassung.test.ts`, `preisrichter-druck.test.ts`, `stammdaten-gruppe.test.ts`, `einteilung.test.ts`, `einteilung-jugend.test.ts`.
- Server (`apps/server/src/tests`): `03-tablet-halle-drucke` (Bewertungsliste nur eigene Schau), `29-einteilung-rassen`,
  `30-einteilung-gegenpruefung`, `69-preisrichter-gruppen`, `70-preisrichter-drucke` (Verpflichtung, Bewertungsliste),
  `71-preisrichter-gegenpruefung` (Auskunft, Bereinigung, Vorlage, Löschen, Sperre), `72-jugend-einteilung` (Jugend separat
  oder eingereiht, Katalog und Einteilung), `73-jugend-gegenpruefung` (Umschalten meldet Tiere ohne Preisrichter,
  Jugendregeln überstehen Speichern bei „mit der Rasse“), `76-verpflichtung-zusage` (Rückmeldetermin, eigener Brieftext,
  Zusage aus der Vorlage), `84-gleichzeitig-bewertung` (Freigabe, Preisvergabe, Einteilung und Notenskala gegen
  gleichzeitige Noten; die zweite Verbindung hält die Sperre); `src/einteilung.test.ts` (Vorschlag).

## Datenbank

`rasse.gruppe` (Text, leer = nicht gepflegt). `preisrichter`: `sparten`, `gruppen` (jsonb), `obmann_id` (→ `preisrichter`,
beim Löschen leer), `zusage` (Aufzählung `pr_zusage`), `zugesagt_fuer`, `vorbehalt` – Migration 0068. `pr_zuteilung.jugend` (eindeutig je Schau, Sparte, Rasse, Farbenschlag,
Jugend) und `schau.einteilung_jugend_separat` – Migration 0069.
`schau.preisrichter_rueckmeldung_bis` (Datum, leer = nicht genannt) – Migration 0070.
