# 034 Online-Meldung an einen vorhandenen Stammsatz: erst nach Bestätigung

**Stand:** gilt (26.11.2026)

**Kontext:** Die Online-Meldung hängt sich an den vorhandenen Aussteller, wenn E-Mail, Registriernummer, Vor- und
Nachname übereinstimmen – sonst entstünde in jeder Schau ein neuer Stammsatz, und ein Mandat (Entscheidung 018) griffe
nie. Das Formular ist aber anonym: Wer diese vier Angaben eines anderen kennt, meldete in dessen Namen, bekam den
Zugangslink in der Antwort und belastete dessen Mandat mit Meldegeld, Stiftung und Spende. Die Antwort verriet zudem
über die Überweisungsdaten, ob ein Mandat besteht.

**Entscheidung:**
- Der Stammsatz wird weiter verwendet und nicht überschrieben (Dubletten zusammenzuführen gibt es nicht).
- Die Meldung gilt erst, wenn der Inhaber sie bestätigt: Bis dahin bleibt „Meldebogen unterschrieben“ (`zustimmungAm`)
  leer. Bestätigen kann er mit dem Knopf „Meldung bestätigen“ auf „Meine Meldung“ (`oeffentlich.meldungBestaetigen`);
  den Link dorthin bekommt nur die hinterlegte Adresse per Mail. Ein Knopf, kein Bestätigen beim Öffnen: Virenscanner
  öffnen Links in Mails von selbst. Die Ausstellungsleitung bestätigt stattdessen mit dem Haken „Meldebogen ist
  unterschrieben“ (Anruf, Papier). Protokolliert als „vom Aussteller bestätigt“.
- Die Antwort von `melden` hat dann kein `token` (leer) und keine Überweisungsdaten; die Dankseite verweist auf die Mail.
  Neue Aussteller bekommen ihren Link wie bisher sofort.
- Lastschrift: Online-Meldungen ohne `zustimmungAm` zieht kein Mandat ein (Vorschau: „Online-Meldung noch nicht vom
  Aussteller bestätigt.“). Von Online-Meldungen nur das Meldegeld – online zugesagte Stiftung und Spende nie per Mandat.
- Prüfliste: „… Online-Meldungen nicht vom Aussteller bestätigt“ statt „ohne unterschriebenen Meldebogen“.

**Folgen:** Ohne Bestätigung steht der Name nicht im Katalog (wie ohne Meldebogen). Ein echter Aussteller klickt einmal
mehr. Wer schon gemeldet hat, bekommt weiter „schon gemeldet“ – so erfährt, wer die vier Angaben kennt, dass gemeldet
wurde. Keine Datenbankänderung.

**Wo:** `apps/server/src/routers/oeffentlich.ts` (`meldeOnline`, `meldungBestaetigen`), `routers/lastschrift.ts`
(`posten`), `services/pruefung.ts`, `apps/web/src/seiten/oeffentlich-bestaetigen.tsx`.
