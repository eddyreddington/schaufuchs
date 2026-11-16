/**
 * Meldungen des Servers zu Bildern, Katalog-Gestaltung, Stammdaten, Rassebildern und Druckvorlagen (Entscheidung 022):
 * routers/katalog-gestaltung.ts, katalog/kaefige.ts, stammdaten.ts, rassebild.ts, druckvorlage.ts, services/rassebild.ts.
 */
export const stamm = {
  bild: {
    groesser2: "Das Bild ist größer als 2 MB. Bitte verkleinern (z. B. 2000 Pixel breit).",
    groesser2Kurz: "Das Bild ist größer als 2 MB. Bitte verkleinern.",
    groesser5: "Das Bild ist größer als 5 MB.",
    logo: "Das Logo ist größer als 600 KB. Bitte verkleinern (z. B. 600 Pixel breit) – es steht auf jedem Beleg.",
    format: "Nur Bilder im Format JPEG oder PNG.",
    nurJpeg: "Nur Bilder im Format JPEG. Bitte das Foto als JPEG speichern.",
    lesen: "Das Bild lässt sich nicht lesen. Bitte als JPEG oder PNG neu speichern.",
    lesenJpeg: "Das Bild lässt sich nicht lesen. Bitte als JPEG neu speichern.",
    beschaedigt: "Das Bild lässt sich nicht lesen (beschädigt oder unvollständig). Bitte neu speichern.",
    unvollstaendig: "Das Bild ist unvollständig. Bitte neu speichern oder herunterladen.",
    pixel: (breite: string, hoehe: string) => `Das Bild ist mit ${breite} × ${hoehe} Pixeln zu groß. Bitte verkleinern.`,
    pixel1200: (breite: string, hoehe: string) => `Das Bild ist mit ${breite} × ${hoehe} Pixeln zu groß. Bitte verkleinern (z. B. 1200 Pixel breit).`,
    png: (breite: string, hoehe: string) => `Das PNG-Bild mit durchsichtigem Hintergrund ist mit ${breite} × ${hoehe} Pixeln zu groß für den Katalogdruck. Bitte als JPEG speichern oder auf höchstens 1,5 Millionen Pixel verkleinern (z. B. 1500 × 1000).`,
    fremd: "Dieses Bild gehört nicht zur Schau.",
    fehlt: "Bild nicht gefunden.",
    beitragFehlt: "Beitrag nicht gefunden.",
    beitragUnbekannt: "Unbekannter Beitrag.",
  },
  /** Lizenz eines Bilds im Katalog (pruefeLizenz in der Domain). */
  lizenz: {
    fehlt: "Lizenz fehlt – z. B. „eigenes Bild“, „gemeinfrei“, „CC0“ oder „CC BY-SA 4.0“.",
    nc: "Lizenz „nicht kommerziell“ (NC): Der Katalog wird verkauft – dieses Bild darf nicht hinein.",
    nd: "Lizenz „keine Bearbeitung“ (ND): Im Katalog wird das Bild zugeschnitten und verkleinert – dieses Bild darf nicht hinein.",
    urheber: "Urheber fehlt – die CC-BY-Lizenz verlangt die Namensnennung.",
    link: "Link zur Lizenz fehlt – bitte die Adresse der Lizenz angeben (z. B. https://creativecommons.org/licenses/by-sa/4.0/).",
  },
  stammdaten: {
    versionUnbekannt: "Diese Stammdaten-Version gibt es nicht.",
    keineZeilen: "Die Datei enthält keine gültigen Zeilen.",
    versionFehlt: "Version nicht gefunden.",
    nichtErgaenzen: "Diese Version ist für alle Vereine bereitgestellt und lässt sich nicht ergänzen. Bitte ein eigenes Verzeichnis einspielen.",
    nichtLoeschen: "Diese Version ist für alle Vereine bereitgestellt und kann nicht gelöscht werden.",
    schonDa: (rasse: string) => `Alle angegebenen Farbenschläge gibt es bei „${rasse}“ schon.`,
    verwendet: "Diese Version wird von einer Schau verwendet.",
    verweisen: "Gemeldete Tiere verweisen auf diese Version – sie lässt sich nicht löschen.",
    // Hinweise beim Einspielen einer CSV (parseStammdatenCsv in der Domain)
    anfuehrung: (zeile: string) => `Zeile ${zeile}: Anführungszeichen nicht geschlossen.`,
    dreiSpalten: (zeile: string) => `Zeile ${zeile}: drei Spalten erwartet (Sparte;Rasse;Farbenschlag).`,
    mehrSpalten: (zeile: string) => `Zeile ${zeile}: mehr als drei Spalten – Trennzeichen im Feld? Feld in Anführungszeichen setzen.`,
    doppelt: (zeile: string, rasse: string, farbenschlag: string) => `Zeile ${zeile}: doppelt (${rasse}, ${farbenschlag}).`,
  },
  druckvorlage: {
    fehlt: "Vorlage nicht gefunden.",
    andereSchau: "Diese Vorlage gehört zu einer anderen Schau.",
  },
};
