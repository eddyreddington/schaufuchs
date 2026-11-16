# 008 Keine Erklärtexte in der Oberfläche, Handbuch-Links

**Stand:** gilt (13.11.2026)

**Kontext:** Lange Erklärungen auf den Seiten machten sie unübersichtlich und veralteten neben dem Handbuch.

**Entscheidung:** In der Oberfläche nur kurze Status- und Fehlermeldungen, in Rückfragen ein Satz zur Folge. Bedienung und
Hintergründe stehen im Handbuch (`docs/handbuch/`, in der App unter `/hilfe`); die Seite verlinkt mit „Hilfe zu …“ auf den
Abschnitt (`/hilfe/ausstellungsleitung#abschnitt`, `hilfe` am `Seitenkopf` bzw. `HilfeLink` in `apps/web/src/ui-seite.tsx`, über `ui.tsx` importierbar).

**Folgen:** Jede neue Funktion: Handbuchabschnitt mitschreiben, Anker verlinken. Neue Erklärsätze auf einer Seite sind ein Rückschritt.
