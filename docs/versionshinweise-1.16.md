# SchauFUCHS 1.16 – Versionshinweise

## 1.16.0 (22.11.2026)

Gegenüber 1.15.1 ist neu:

### Hallenplan: „Nach Plan nummerieren“ nummeriert nur noch

- „Katalognummern nach Hallenplan vergeben“ (bzw. „Käfigplätze nach Plan“) vergibt nur noch Nummern in der Folge des
  Plans. Kein Tier wechselt dabei den Käfig, freie Plätze bleiben frei, wo sie sind. Bisher rückten Tiere vorher in frei
  gewordene Plätze auf.
- Nachmeldungen, die noch nicht im festgeschriebenen Plan stehen, behalten beim Nummerieren ihren Käfig (ihre Lage wird
  dabei mit festgeschrieben).
- Der Hinweis „freie Plätze zwischen belegten Käfigen“ bleibt stehen; einen freien Platz füllt bei Bedarf „Tier
  versetzen“. Der Knopf „Jetzt nach Plan nummerieren“ erscheint nur noch, wenn die Nummern nicht der Folge des Plans
  folgen.

Handbuch: „Nach dem Umstellen neu nummerieren“ im Abschnitt Hallenplan.

### Update

`sudo schaufuchs update` sichert vorher und holt 1.16.0. An der Datenbank ändert sich nichts.
