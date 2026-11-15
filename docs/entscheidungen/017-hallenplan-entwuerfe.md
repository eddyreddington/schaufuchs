# 017 Hallenplan-Entwürfe und Archiv

**Stand:** gilt (15.11.2026)

**Kontext:** Vor einer Schau entwirft die Ausstellungsleitung oft mehrere Hallenpläne (quer oder längs, mit oder ohne
Einzelreihen an den Wänden) und der Verein entscheidet sich für einen. Die übrigen sind für spätere Schauen nützlich,
etwa in derselben Halle mit anderer Tierzahl.

**Entscheidung:**
- Eigene Tabelle `hallenentwurf` je Verein: Name, die Halle (`Halle` wie in `schau.halle`), Schau der Entstehung,
  `archiviert`. Entwürfe einer Schau sind ihre Varianten; archivierte gehören dem Verein und lassen sich in jeder
  Schau laden.
- Speichern übernimmt die aktuelle Halle der Schau unverändert. Laden ersetzt sie über denselben Weg wie „Plan neu
  setzen“ (`planNeuSetzenIn`): Prüfungen, neu gerechneter Plan, fester Plan entfällt, Protokoll. Aus dem Archiv bzw.
  aus einer anderen Schau ohne die tierbezogenen Teile (`halleOhneFestenPlan`), wie bei der Übernahme in eine neue Schau.
- „Entscheiden“ lädt den gewählten Entwurf (oder behält den aktuellen Plan) und archiviert alle übrigen Entwürfe der
  Schau. Höchstens 30 Entwürfe je Schau; das Archiv ist nicht begrenzt.
- Wird eine Schau gelöscht, bleiben ihre archivierten Pläne (Schau-Bezug wird leer).

**Folgen:** Ein Entwurf speichert nur die Halle, nicht den festen Plan mit den Tieren – nach dem Laden rechnet die
Software den Plan neu. Laden und Entscheiden sind in der abgeschlossenen Schau gesperrt.
