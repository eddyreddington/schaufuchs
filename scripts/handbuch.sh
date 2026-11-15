#!/bin/sh
# Erzeugt aus den Handbüchern (docs/handbuch/*.md, Bilder in docs/handbuch/bilder/):
#   - druckfertige A4-PDFs nach docs/handbuch/pdf/
#   - die Hilfe in der Anwendung nach apps/web/public/hilfe/ (Bilder, PDF) und apps/web/public/hilfe-inhalt/ (HTML-Teil je
#     Handbuch – eigener Pfad, sonst ordnet der Service Worker /hilfe/helfer der Datei hilfe/helfer.html zu)
# Nach jeder Änderung an einem Handbuch ausführen und das Ergebnis mit einchecken.
# Benötigt pandoc und WeasyPrint (brew install pandoc weasyprint).
set -eu
cd "$(dirname "$0")/.."
QUELLE=docs/handbuch
APP=apps/web/public/hilfe
INHALT=apps/web/public/hilfe-inhalt
mkdir -p "$QUELLE/pdf" "$APP/bilder" "$INHALT"
rm -f "$APP"/*.html
# Bilder für die App: nur die aktuellen (verwaiste entfernen).
rm -f "$APP"/bilder/*.png "$APP"/bilder/*.jpg
for b in "$QUELLE"/bilder/*.png "$QUELLE"/bilder/*.jpg; do [ -f "$b" ] && cp "$b" "$APP/bilder/"; done
for md in "$QUELLE"/*.md; do
  name=$(basename "$md" .md)
  titel=$(head -n 1 "$md" | sed 's/^# //')
  # PDF: Gestaltung und Bilder eingebettet; die Kurzanleitung beginnt auf neuer Seite (Überschrift mit ID).
  (cd "$QUELLE" && pandoc "$name.md" --from markdown --to html5 --standalone --embed-resources \
    --metadata title="$titel" --metadata lang=de --css druck.css -V pagetitle="$titel" \
    --variable title= -o "pdf/$name.html" && weasyprint "pdf/$name.html" "pdf/$name.pdf" 2> /dev/null && rm -f "pdf/$name.html")
  cp "$QUELLE/pdf/$name.pdf" "$APP/$name.pdf"
  # App: nur der Inhalt (ohne Kopf), Bilder unter /hilfe/bilder/.
  # Spaltenbreiten (<colgroup> mit style=…) entfallen: die CSP der App erlaubt keine Inline-Styles.
  pandoc "$md" --from markdown --to html5 -o - | perl -0pe 's#<colgroup>.*?</colgroup>\n?##gs' | sed 's#src="bilder/#src="/hilfe/bilder/#g' > "$INHALT/$name.html"
  echo "$name: $(pdfinfo "$QUELLE/pdf/$name.pdf" 2> /dev/null | awk '/^Pages/{print $2}') Seiten"
done
