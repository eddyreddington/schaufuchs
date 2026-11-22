# 002 Möbel sind keine Sperrfläche

**Stand:** gilt (14.11.2026)

**Kontext:** Tische, Bänke, Garnituren und Pokaltische werden im Hallenplan eingesetzt. Zählten sie wie Flächen, schoben sie Reihen und
Käfige weg, sobald man sie verschiebt.

**Entscheidung:** Möbel stehen frei und verschieben nie Käfige – weder im losen noch im festen Plan. Erlaubt auch vor Käfigen,
in Gängen und Hauptgängen; nicht auf Käfigen, Platten, Blöcken, Volieren, anderen Möbeln, in einer Türöffnung oder außerhalb
der Halle. Im Gang vor einem Ein- oder Ausgang nur ein Hinweis (Fluchtweg). Beim Neu-Setzen bleiben Möbel stehen.

**Folgen:** Wer eine Regel „Möbel als Hindernis“ einbaut, dreht diese Entscheidung um – Test „Möbel ohne Einfluss“ (Zufallshallen) schlägt an.

**Wo:** `hallenplan-moebel.ts` (`istMoebel`, `moebelStuecke`), `hallenplan-gruppe.ts` (`pruefeLage`), `hallenplan-neu.ts`, Server-Tests `42-hallenplan-moebel-etagen` und `67-pokaltisch`.

**Nachtrag (22.11.2026):** Der Pokaltisch (Tisch für die Ehrenpreise, `pokaltisch`) ist ein Möbelstück wie der Tisch und fällt
unter dieselbe Regel; die Zufallshallen im Test „Möbel ohne Einfluss“ setzen ihn mit ein.
