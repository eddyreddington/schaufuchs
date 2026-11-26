# 034 Anmeldung gehärtet: Gerätekennzeichen, Langzeitgrenze für Codes, Notfallcodes mit Schlüssel, SMTP nur mit TLS

**Stand:** gilt (26.11.2026)

**Kontext:** Eine Prüfung der Anmeldung fand fünf Schwächen. Wer das Passwort kennt, konnte den 6-stelligen Code über
Wochen weiter durchprobieren, denn das Fenster von 15 Minuten lief immer wieder ab. Notfallcodes lagen als SHA-256 ohne
Schlüssel in der Datenbank, das TOTP-Geheimnis dagegen verschlüsselt. Ein Fremder hinter derselben Adresse (Hallen-WLAN,
NAT) sperrte mit wenigen Fehlversuchen das Gerät der AL bzw. das Tablet eines Preisrichters aus. Die Bremsen-Zähler
wuchsen ohne Grenze. `smtp://` nutzte STARTTLS nur, wenn der Mailserver es anbot.

**Entscheidung:**

1. **Zweiter Faktor:** `codeBremse` ist eine `Stufenbremse` (`services/bremse.ts`). Je Konto gelten 10 Fehlversuche in
   15 Minuten und bei der Anmeldung zusätzlich 30 Codes aus der App in 24 Stunden. Danach ist die Anmeldung mit Code
   gesperrt, bis die AL „Sperre aufheben“ oder „Neues Passwort setzen“ wählt. Ein Notfallcode zählt im langen Fenster
   nicht und kommt auch während der Sperre hinein. Beim 5. Fehlversuch und bei der Sperre bekommt der Inhaber eine
   Hinweismail.
2. **Notfallcodes:** gespeichert als `h1:` + HMAC-SHA-256 mit einem aus `DATENSCHLUESSEL` abgeleiteten Schlüssel.
   Einträge ohne Kennung (SHA-256 aus Versionen bis 1.21) gelten weiter, bis sie verbraucht oder beim nächsten Einrichten
   ersetzt sind (`findeNotfallcode`). Keine Migration. `DATENSCHLUESSEL` darf sich also auch wegen der Notfallcodes nicht
   ändern.
3. **Gerätekennzeichen:** Das Cookie `schau_geraet` ist zufällig und HttpOnly. Es wird bei der ersten erfolgreichen
   Anmeldung gesetzt, beim zweiten Faktor erst nach dem Code. Kennt `Wartezeit` das Paar aus Konto bzw. Preisrichter und
   Kennzeichen, gilt die Bremse je Gerät für das Kennzeichen statt für die Adresse. Die Grenze je Adresse und die
   Wartezeit gelten dann nicht. Ein unbekanntes oder erfundenes Kennzeichen zählt wie keines. Das Paar steht nur im
   Arbeitsspeicher, höchstens 30 Tage. Nach einem Neustart gilt bis zur nächsten Anmeldung wieder die Adresse.
4. **Speicher:** Jede Bremse und jede Wartezeit hält höchstens 50.000 Einträge. Ist das erreicht, wird zuerst Abgelaufenes
   verworfen, dann das Älteste, was nicht sperrt. Ein auf null zurückgegebener Versuch löscht seinen Eintrag. Ist die
   Schlange der Passwortprüfungen voll, weist `pruefeAuslastung()` die Anfrage ab, bevor gezählt oder gelesen wird.
5. **SMTP:** `smtp://` verlangt STARTTLS (`requireTLS`). `requireTLS`, `ignoreTLS`, `secure` und `opportunisticTLS` in
   `SMTP_URL` werden übergangen. Abschalten geht nur ausdrücklich mit `SMTP_OHNE_TLS=1`, dann mit Warnung im Server-Log.

**Folgen:** Ein Mailserver ohne STARTTLS stellt nach dem Update nicht mehr zu. Die Mails bleiben dann mit Fehler im
Postausgang, bis `smtps://…:465` oder `SMTP_OHNE_TLS=1` eingetragen ist. Wer die Code-Sperre auslöst, kennt das
Passwort. Der Inhaber sollte es ändern, darauf weist die Hinweismail hin.

**Wo:** `services/bremse.ts`, `services/zweifaktor.ts`, `services/post.ts`, `auth.ts` (`COOKIE_GERAET`,
`pruefeAuslastung`), `routers/auth/anmeldung.ts`, `routers/auth/gemeinsam.ts`, `routers/bewertung.ts` (PIN).
