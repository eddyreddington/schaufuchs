# 003 Protokoll mit Hash-Kette, `protokolliere()`

**Stand:** gilt

**Kontext:** Reklamationen nach der Schau und die GoBD verlangen nachvollziehbare, unveränderbare Aufzeichnungen über Bewertung,
Preise, Verkauf und Geld.

**Entscheidung:** Jede Änderung an Bewertung, Preisen, Verkauf und Geld schreibt `protokolliere()` (`apps/server/src/services/protokoll.ts`)
in derselben Transaktion: Tabelle, Datensatz, Aktion, alt/neu, Grund, wer. Die Datenbank verkettet die Einträge per Hash
(`aenderung_kette`) und verbietet Ändern und Löschen per Trigger (`apps/server/src/db/schutz.sql`). Zahlungen, Verkäufe und
Auszahlungen werden storniert, nie geändert. Ausnahmen (Anonymisieren nach Fristen, Löschen ganzer Demo-Vereine mit
`schau.loeschen`) werden selbst vermerkt.

**Folgen:** Neue Schreibwege in diesen Bereichen brauchen `protokolliere()`; `pruefeProtokoll()` (`services/protokoll-suche.ts`) prüft die Kette.
`schutz.sql` läuft nach jeder Migration und in den Tests.
Den alten Wert eines Eintrags liest der Schreibweg in derselben Transaktion gesperrt (`FOR UPDATE`), sonst stünde bei
zwei gleichzeitigen Änderungen zweimal derselbe alte Wert im Protokoll ([033](033-gleichzeitiges-arbeiten.md)).
