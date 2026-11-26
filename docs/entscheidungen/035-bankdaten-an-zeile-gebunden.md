# 035 Bankdaten an ihre Zeile gebunden, Einladungslinks verschlüsselt im Postausgang

**Stand:** gilt (26.11.2026)

**Kontext:** Seit 1.3 verschlüsselt die Anwendung IBAN, Kontoinhaber, SEPA-Dateien und Zwei-Faktor-Geheimnisse mit
`DATENSCHLUESSEL` (AES-256-GCM, `db/geheim.ts`). In den Zusatzdaten (AAD) stand nur das Feld („aussteller.iban“). Ein
Geheimtext passte damit in jede Zeile derselben Spalte: Wer in die Datenbank schreiben kann, aber den Schlüssel nicht
hat, meldet sich mit der eigenen IBAN an und kopiert deren Geheimtext in die Zeile eines anderen Ausstellers. Preisgeld
und Verkaufserlös gingen dann an ihn, ohne Auffälligkeit und ohne Protokolleintrag.

Daneben lagen zwei Personendaten offener als gedacht: Der Einladungslink (Entscheidung 026) stand im Klartext im
Postausgang, solange die Mail nicht versendet war (ohne Mailserver, bei Störungen) – und damit in jeder Sicherung. Und
eine Stammdatenänderung über die Meldung schrieb Kontoinhaber, Telefon und E-Mail im Klartext ins Protokoll, das sich
wegen der Hash-Kette nicht nachträglich ändern lässt.

**Entscheidung:**

1. **Bankdaten von Ausstellern und Mandaten sind an ihre Zeile gebunden.** Neue Form `enc2:<Zeile>:<Base64>`, die
   Zusatzdaten sind „aussteller.iban#42“. Die Zeilennummer steht lesbar vor dem Geheimtext, ist aber mit verschlüsselt:
   Wer sie umschreibt, macht den Wert unlesbar. Ob sie zur Zeile passt, prüfen Abrechnung (`abrechnungListe`, damit
   auch SEPA-Überweisung und Auszahlung) und Lastschrift (`posten`) mit `inEigenerZeile`; passt sie nicht, bricht der
   Vorgang ab („Interner Fehler“, Meldung im Server-Log).
2. **Geschrieben wird nur über `bankdatenFuer()`.** Die Spalten sind mit `geheimText(…, { zeile: true })` angelegt; ein
   gewöhnlicher Text außer "" wird abgelehnt, damit kein Schreibweg die Bindung vergisst. Neue Aussteller bekommen ihre
   Nummer vorab (`nextval`), wie schon die Mandate.
3. **Altbestand bleibt lesbar.** `enc1:`-Werte (nur Feld) und Klartext liest die Umstellung beim Start
   (`verschluesseleBestand`) und bindet sie an ihre Zeile – nur die noch ungebundenen Spalten einer Zeile, damit ein
   kopierter `enc2:`-Wert daneben nicht mit gebunden wird. Danach lehnt die laufende Anwendung in Produktion Bankdaten
   ohne Zeile ab wie bisher Klartext. Die Schlüsselprüfung beim Start liest beide Formen. Getestet mit Geheimtexten, die
   der Programmstand vor dieser Entscheidung erzeugt hat.
4. **Nicht gebunden** bleiben Zwei-Faktor-Geheimnis und die Inhalte von SEPA- und Lastschriftdateien: Wer in die
   Datenbank schreiben kann, setzt ohnehin Passwort-Hash oder Rolle; die Dateien entstehen aus den geprüften Bankdaten.
   Unverschlüsselt bleibt auch das Vereinskonto der Schau (`schau.verein_iban`) – die Bindung ist eine Lage der
   Tiefenverteidigung, kein Schutz gegen jeden Schreibzugriff.
5. **Einladungslinks im Postausgang:** Der Teil hinter `/einladung#` wird beim Ablegen verschlüsselt (Feld
   „postausgang.einladung“) und erst beim Versand eingesetzt. Danach, beim Annehmen der Einladung und bei einem neueren
   Link wird er unkenntlich gemacht („(nach dem Versand entfernt)“, „(Einladung angenommen)“, „(durch einen neueren Link
   ersetzt)“); liegengebliebene Mails gehen dann nicht mehr hinaus.
6. **Protokoll der Stammdaten** einheitlich über `stammdatumImProtokoll` (`@schau/domain`): IBAN gekürzt, Kontoinhaber,
   Telefon, E-Mail und Geburtsdatum nur „(angegeben)“ – über die Meldung wie in der Aussteller-Verwaltung.

**Folgen:**

- Keine Migration des Schemas. Beim ersten Start nach dem Update schreibt die Umstellung alle Bankdaten einmal neu
  (eine Transaktion, im Log „Verschlüsselt: … Aussteller, … SEPA-Mandate“).
- Ein älterer Programmstand liest `enc2:` nicht. Zurücknehmen daher nur mit der Sicherung von vor dem Update
  (`wiederherstellen.sh --vorherige-version`, wie bei jeder Migration).
- Bestehende Protokolleinträge mit Kontoinhaber, Telefon oder E-Mail im Klartext bleiben (Hash-Kette); sie verschwinden
  mit der regulären Bereinigung bzw. Anonymisierung.
- Eine Einladungsmail aus der Zeit davor (Klartext-Link) wird weiter versendet und ebenso unkenntlich gemacht.
