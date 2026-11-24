# 033 Gleichzeitiges Arbeiten: Sperren und Stand-Prüfung

**Stand:** gilt (24.11.2026; Sperrreihenfolge für alle Bereiche vereinheitlicht)

**Kontext:** Eine Gesamt-Gegenprüfung auf gleichzeitiges Arbeiten (mehrere Kassen, Helfer und Ausstellungsleitung
zugleich, erneuter Klick nach verlorener Antwort, ein alter Browser-Tab) fand im Bereich Geld und Meldung wiederkehrende
Muster: Prüfungen am Stand vor der Transaktion (Phase aus `ladeSchau`, Status aus `ladeMeldung`), die nach dem Warten
auf eine Sperre nicht wiederholt wurden; zwei Wege, die dieselbe Zeile in verschiedener Reihenfolge sperren
(Verklemmung, 40P01); ein alter Wert fürs Protokoll, ungesperrt gelesen; Formulare, die ihren ganzen Stand zurückschreiben
und so fremde Änderungen still überschreiben. PostgreSQL läuft mit READ COMMITTED: jede Anweisung sieht, was bis zu ihrem
Beginn committet ist – eine Sperre schützt nur, was nach ihr gelesen wird.

**Entscheidung:**

1. **Erst sperren, dann prüfen.** Die Prüfung vor der Transaktion bleibt als schnelle Antwort. Maßgeblich ist dieselbe
   Prüfung unter der Sperre am frisch gelesenen Stand. Für Geld: `sperreKasseMitPhase(tx, schauId)`
   (`services/kasse.ts`) nimmt die Kassensperre und liest die Phase neu – wer gewartet hat, sieht einen inzwischen
   gebuchten Abschluss. Zeilen, deren Zustand die Prüfung trägt (Meldungsstatus, Verfall, Lastschriftlauf), werden mit
   `FOR UPDATE` gelesen und daran geprüft. Jeder Phasenwechsel (`phaseSetzen`) nimmt die Online-Melde-Sperre und die
   Kasse, wartet also auf laufende Online-Meldungen, Verkäufe, Zahlungen und Auszahlungen, die die alte Phase gelesen
   haben; der Abschluss wiederholt darunter seine Hindernisse.
2. **Feste Sperrreihenfolge** (verbindlich für alle Schreibwege; wer eine Stufe nicht braucht, lässt sie aus, nimmt aber
   nie eine frühere nach einer späteren):
   1. Online-Melde-Sperre (`sperreOnlineMeldung`)
   2. Testschau-Sperre (`sperreTestschauGeteilt`/`Exklusiv`)
   3. Kasse (`sperreKasse`, `sperreKasseMitPhase`)
   4. Bestätigungen (`sperreBestaetigungen`), danach Sperren je Anfrage, E-Mail, Name oder Import (Advisory; erster
      Schlüssel immer eine feste Kennung, nie die Vereinsnummer – sonst überschnitten sich die Schlüsselräume)
   5. Vereinszeile (`organisation`, `FOR NO KEY UPDATE`), dann Aussteller → Meldung (mehrere nach ID,
      `FOR NO KEY UPDATE`; `FOR UPDATE` nur, wo Meldungen gelöscht oder umgehängt werden)
   6. Einteilung (`sperreEinteilung` exklusiv, `sperreEinteilungGeteilt` für Noten und Preise, Advisory 2026111201;
      `sperreEinteilungFuerMeldung` nach der Meldungszeile)
   7. Schau-Zeile: `FOR SHARE` (Note, Preis, Impfnachweis) oder `FOR NO KEY UPDATE` (Phase, Absage, Freigabe, Nummern,
      Einstellungen, Halle, Käfige, Entwürfe)
   8. Tiere (`katalogeintrag`, nach ID `FOR UPDATE`), danach übrige Zeilen der Schau (Preisrichter nach ID, Gesundheit,
      Bild, Hallenentwurf)
   9. Benutzer → Sitzung
   10. `protokolliere()` **zuletzt**: der Trigger `aenderung_kette` sperrt eine für die ganze Installation geltende
       Zeile bis zum Commit, danach nimmt das Einfügen `FOR KEY SHARE` auf Schau, Benutzer und Preisrichter
       (Fremdschlüssel). Nach dem ersten Protokolleintrag wartet die Transaktion auf keine Sperre mehr. Wege, die in einer
       Schleife protokollieren und weiter schreiben, laufen in `protokollZuletzt(tx, …)` (`services/protokoll.ts`): die
       Einträge werden gesammelt und am Ende in derselben Reihenfolge geschrieben, nur in einer Transaktion (Meldung speichern, Import, Lastschrift
       buchen, Löschwunsch, Einteilung, Preisrichter, Benutzerverwaltung, Hallenentwurf entscheiden).

   **Zeilen, auf die Protokoll oder Einfügungen verweisen** (Schau, Benutzer, Preisrichter, Verein, Meldung): nur
   `FOR SHARE` oder `FOR NO KEY UPDATE`, nie `FOR UPDATE`, wenn danach protokolliert wird – `FOR UPDATE` wartet auf
   jedes `FOR KEY SHARE`, und wer es hält, hält womöglich schon die Kette. Ausnahmen, bewusst: Löschen der Schau
   (nur in der Vorbereitung bzw. Testschau), Löschen eines Preisrichters (sperrt erst „no key update“, löscht, protokolliert
   danach), Bild hochladen (ohne Protokoll). Nicht lösbar, nur selten: Ein UPDATE einer Spalte mit eindeutigem Index
   sperrt wie `FOR UPDATE` – E-Mail eines Benutzers ändern und eine neue Kurzadresse der Schau (nur in der Vorbereitung).
   Dort kommt das Protokoll zuletzt; trifft es doch einen gleichzeitigen Eintrag desselben Benutzers, meldet der Server
   „Bitte noch einmal“.

   **Bekannte Ausnahmen** (enden mit 40P01 oder 55P03, also „Bitte noch einmal versuchen“, nie mit einem Hänger):
   Benutzer ändern mit neuer E-Mail-Adresse und Benutzer entfernen, Schau löschen, neue Kurzadresse der Schau,
   Preisrichter löschen – jeweils, wenn gleichzeitig ein Protokolleintrag oder eine Einfügung auf dieselbe Zeile verweist.
   **Großer Import:** Er sperrt Verein (Import-Sperre), Aussteller und Meldungen bis zum Ende und schreibt sein
   Protokoll gesammelt am Schluss (in Blöcken zu 500 Zeilen je INSERT). Solange er läuft, warten Anlegen eines Ausstellers
   mit gleichem Namen, Bearbeiten der betroffenen Aussteller und Meldungen, Vereinsangaben (bei gelernten
   Rassen-Zuordnungen) und ein zweiter Import desselben Vereins; dauert das länger als die Grenze (10 s), melden sie
   „Bitte noch einmal“. Während der Import seine Einträge schreibt, warten alle Protokollschreiber der Installation kurz.

   **Kein `db` in einer Transaktion, die Sperren hält:** Hilfen bekommen die Transaktion (`ex`/`tx`), etwa
   `ladeEintraege(…, { ex: tx })`, `planTiere(s, undefined, tx)`, `abrechnungListe(id, tx)`. Eine zweite Verbindung aus
   dem Pool wartete womöglich auf die eigenen Sperren, und bei vollem Pool (10) hängen alle.

   **Grenze für das Warten:** Jede `db.transaction` setzt `lock_timeout` (`db/client.ts`, 10 s, `DB_LOCK_TIMEOUT`).
   Wer länger auf eine Sperre wartet, bricht ab (55P03) und bekommt wie bei einer Verklemmung „Bitte noch einmal
   versuchen“ (SERVICE_UNAVAILABLE). Migrationen, Startskript und Sicherung laufen nicht darüber.

   Nie eine Zeile sperren und danach auf die Kasse warten. Meldung vor Einteilung, weil erst die gesperrte Meldung zeigt,
   ob die Einteilung gebraucht wird (Statuswechsel, automatische Bestätigung nach Zahlung); kein Weg sperrt unter der
   Einteilung eine Meldung. Meldungen vor der Schau-Zeile: Absage, Teilschauen, Testschau-Kennzeichen und Zurücksetzen der
   Testdaten sperren die betroffenen Meldungen nach ID, bevor sie die Schau sperren (wie der Impfnachweis). Online-Meldung:
   Online-Melde-Sperre, Testschau (geteilt), dann die Sperre je Adresse. Eine Verklemmung (40P01, „Bitte noch einmal
   versuchen“) ist ein Fehler im Code, keine Behebung.
3. **Wer eine Menge prüft, die andere gleichzeitig erweitern, braucht eine gemeinsame Sperre** – eine Zeilensperre
   genügt nicht, weil neue Zeilen sie nicht berühren. Absage und Entfernen einer Teilschau nehmen die Testschau-Sperre
   exklusiv (jede Meldung hält sie geteilt), Online-Meldungen derselben Schau prüfen Halle und Meldephase nacheinander
   (`sperreOnlineMeldung` je Schau; die Meldephase prüft nur dieser öffentliche Weg – die Ausstellungsleitung erfasst
   auch später Meldungen mit Eingang „online“), Rücklastschrift und Zuwendungsbestätigung teilen `sperreBestaetigungen`.
4. **Alter Wert fürs Protokoll** wird in derselben Transaktion mit `FOR UPDATE` gelesen (ADR 003): sonst steht bei zwei
   gleichzeitigen Änderungen zweimal derselbe alte Wert im Protokoll.
5. **Stand-Prüfung für Formulare, die zurückschreiben:** Das Formular bekommt beim Laden einen Stand und sendet ihn
   mit; weicht er unter der Sperre ab, lehnt der Server mit CONFLICT „Inzwischen geändert – bitte neu laden“ ab, statt zu
   überschreiben. Meldung: `meldungStand()` (`services/meldung-stand.ts`) über Aussteller, Meldungsfelder und Tiere,
   verglichen erst, wenn Aussteller, Meldung und Tiere gesperrt sind. Der Stand ist ein HMAC mit einem aus dem
   Datenschlüssel abgeleiteten Schlüssel, weil er Felder enthält, die nicht jede Rolle sieht. Die Oberfläche bietet
   nach CONFLICT „Neu laden“ an; die Eingaben bleiben bis dahin sichtbar.
   Geld: der angezeigte Betrag (`erwartetOffenCent`, `erwartetCent`) – jede Oberfläche, die kassiert, sendet ihn.
6. **Dieselbe Anfrage zweimal** legt nichts doppelt an: eine neue Meldung trägt die Kennung ihres Formulars
   (`meldung.anfrage_id`, eindeutig je Schau, Migration 0072); kommt sie wieder, liefert der Server die schon angelegte.
   Die Kennung entsteht über `crypto.getRandomValues` (`neueAnfrageId`), also auch beim Betrieb über http://.

**Folgen:** Neue Schreibwege nehmen die Sperren in dieser Reihenfolge und prüfen darunter. Servertests stellen das
Rennen fest nach: eine zweite Verbindung hält die Sperre bzw. eine Transaktion bleibt offen, bis der andere Aufruf
wartet (`tests/84`–`87-gleichzeitig-*.ts`, Muster auch in `30-einteilung-gegenpruefung.ts`);
`tests/88-gleichzeitig-gesamt.ts` lässt viele Schreibwege zugleich laufen (Mischbetrieb) und erwartet weder Verklemmung
noch Hänger; `tests/89-verklemmungen.ts` spielt einen Protokolleintrag nach (Kette, dann Fremdschlüssel) und prüft die
Grenze für das Warten. Andere Bereiche verweisen auf diese Entscheidung.

**Offen:** Das allgemeine Formularmodell (letzter Schreiber gewinnt) gilt weiter für Einstellungen ohne Stand
(Vereinsangaben, Spender, Gebühren). Wege in `routers/meldung.ts`, die Meldegeld negativ buchen (Erstattung, Storno),
prüfen gültige Zuwendungsbestätigungen nicht – eigenes Ticket. `statusSetzen` nimmt bei jedem Wechsel die Kasse
(auch „offen → bestätigt“ durch Helfer) und hält sie bis zur Einteilung; an Einlieferungstagen beobachten – braucht die
Einteilung bei großen Schauen merklich Zeit, sie in einen eigenen kurzen Schritt nach dem Statuswechsel legen.
