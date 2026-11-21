# 017 Hallenplan-Entwürfe und Archiv

**Stand:** gilt (15.11.2026, Laden in derselben Schau geändert am 22.11.2026)

**Kontext:** Vor einer Schau entwirft die Ausstellungsleitung oft mehrere Hallenpläne (quer oder längs, mit oder ohne
Einzelreihen an den Wänden) und der Verein entscheidet sich für einen. Die übrigen sind für spätere Schauen nützlich,
etwa in derselben Halle mit anderer Tierzahl.

**Entscheidung:**
- Eigene Tabelle `hallenentwurf` je Verein: Name, die Halle (`Halle` wie in `schau.halle`), Schau der Entstehung,
  `archiviert`. Entwürfe einer Schau sind ihre Varianten; archivierte gehören dem Verein und lassen sich in jeder
  Schau laden.
- Speichern übernimmt die aktuelle Halle der Schau unverändert und den festen Plan (`hallenentwurf.fest`, seit
  22.11.2026; ältere Entwürfe haben keinen).
- Laden eines Entwurfs **derselben Schau mit festem Plan** (auch archiviert) stellt ihn genau her: Halle samt Versatz und
  fester Plan (`entwurfEinsetzen`, Protokoll „Hallenplan aus Entwurf geladen“ mit dem überschriebenen festen Plan
  vollständig). Ohne festen Plan (automatisch geplant oder älterer Entwurf) wie bisher neu setzen – Versatz und
  entfernte Plätze eines älteren Entwurfs passten sonst nicht mehr zu den Tieren. „Entscheiden“ lädt und archiviert mit
  festem Plan in einer Transaktion. Auch „Plan neu setzen“ protokolliert den bisherigen festen Plan vollständig. Bis 21.11.2026 wurde auch hier neu gesetzt – dabei
  gingen festgeschriebene Aufstellung und Verschobenes verloren (Rückmeldung 21.11.2026, Plan wiederhergestellt).
- Laden aus einer **anderen Schau** (Archiv früherer Schauen) über „Plan neu setzen“ (`planNeuSetzenIn`) ohne die
  tierbezogenen Teile (`halleOhneFestenPlan`), wie bei der Übernahme in eine neue Schau – die festen Plätze gehörten zu
  anderen Tieren.
- „Entscheiden“ lädt den gewählten Entwurf (oder behält den aktuellen Plan) und archiviert alle übrigen Entwürfe der
  Schau. Höchstens 30 Entwürfe je Schau; das Archiv ist nicht begrenzt.
- Wird eine Schau gelöscht, bleiben ihre archivierten Pläne (Schau-Bezug wird leer).

**Folgen:** In derselben Schau ist ein Entwurf eine Sicherung des Plans; Tiere, die nach dem Speichern dazukamen,
bekommen beim Laden freie Plätze (wie im festen Plan üblich). Ein Entwurf aus einer anderen Schau wird neu gerechnet.
Laden und Entscheiden sind in der abgeschlossenen Schau gesperrt.
