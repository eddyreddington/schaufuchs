import { createBrowserRouter, Outlet } from "react-router-dom";
import { Anmelden, AppRahmen, SchauRahmen } from "./rahmen";
import { Abrechnung } from "./seiten/abrechnung";
import { Benutzer, BenutzerNeu, BenutzerSeite } from "./seiten/benutzer";
import { Bewertung } from "./seiten/bewertung";
import { Einladung } from "./seiten/einladung";
import { Hilfe } from "./seiten/hilfe";
import { Einlieferung } from "./seiten/einlieferung";
import { Einstellungen } from "./seiten/einstellungen";
import { FehlerSeite } from "./seiten/fehler";
import { Hallenplan } from "./seiten/hallenplan";
import { Hallenplan3DSeite } from "./seiten/hallenplan-3d-seite";
import { Kaefige } from "./seiten/kaefige";
import { Katalog } from "./seiten/katalog";
import { Kassenbuch } from "./seiten/kassenbuch";
import { Spenden } from "./seiten/spenden";
import { Meisterschaften } from "./seiten/meisterschaften";
import { SpenderSeite } from "./seiten/spender";
import { ImportSeite } from "./seiten/import";
import { KatalogGestalten } from "./seiten/katalog-gestalten";
import { MeldungBearbeiten } from "./seiten/meldung-bearbeiten";
import { Meldungen } from "./seiten/meldungen";
import { Ergebnisse, MeineMeldung, OeffentlicheSchau, Rechtstext } from "./seiten/oeffentlich";
import { Preise } from "./seiten/preise";
import { Preisrichter } from "./seiten/preisrichter";
import { Protokoll } from "./seiten/protokoll";
import { RichterApp } from "./seiten/richter";
import { SchauListe } from "./seiten/schau-liste";
import { Stammdaten } from "./seiten/stammdaten";
import { Uebersicht } from "./seiten/uebersicht";
import { Verein } from "./seiten/verein";
import { BriefvorlageSeite } from "./seiten/briefvorlage";
import { DruckvorlageSeite } from "./seiten/druckvorlage";
import { AusstellerSeite } from "./seiten/aussteller";
import { Verkauf } from "./seiten/verkauf";
import { UngespeichertWaechter } from "./ui";

/** Wurzel aller Seiten: ein Wächter für ungespeicherte Eingaben (React Router erlaubt nur eine Navigationssperre). */
function Wurzel() {
  return (
    <>
      <UngespeichertWaechter />
      <Outlet />
    </>
  );
}

export const router = createBrowserRouter([
  {
    element: <Wurzel />,
    errorElement: <FehlerSeite />,
    children: [
      { path: "/anmelden", element: <Anmelden /> },
      { path: "/einladung", element: <Einladung /> },
      { path: "/hilfe", element: <Hilfe /> },
      { path: "/hilfe/:teil", element: <Hilfe /> },
      { path: "/s/:slug", element: <OeffentlicheSchau />, errorElement: <FehlerSeite /> },
      { path: "/s/:slug/meldung/:token", element: <MeineMeldung />, errorElement: <FehlerSeite /> },
      { path: "/s/:slug/ergebnisse", element: <Ergebnisse />, errorElement: <FehlerSeite /> },
      { path: "/s/:slug/impressum", element: <Rechtstext art="impressum" />, errorElement: <FehlerSeite /> },
      { path: "/s/:slug/datenschutz", element: <Rechtstext art="datenschutz" />, errorElement: <FehlerSeite /> },
      { path: "/richter/:slug", element: <RichterApp />, errorElement: <FehlerSeite /> },
      // Hallenplan in 3D: eigener Tab, ganze Seite ohne Seitenleiste.
      { path: "/schau/:schauId/hallenplan/3d", element: <Hallenplan3DSeite />, errorElement: <FehlerSeite /> },
      {
        path: "/",
        element: <AppRahmen />,
        errorElement: <FehlerSeite />,
        children: [
          { index: true, element: <SchauListe /> },
          { path: "stammdaten", element: <Stammdaten /> },
          { path: "benutzer", element: <Benutzer /> },
          { path: "benutzer/neu", element: <BenutzerNeu /> },
          { path: "benutzer/:benutzerId", element: <BenutzerSeite /> },
          { path: "verein", element: <Verein /> },
          { path: "verein/druckvorlagen/:vorlageId", element: <DruckvorlageSeite /> },
          { path: "verein/briefvorlage", element: <BriefvorlageSeite /> },
          { path: "aussteller", element: <AusstellerSeite /> },
          { path: "spender", element: <SpenderSeite /> },
          { path: "import", element: <ImportSeite /> },
          {
            path: "schau/:schauId",
            element: <SchauRahmen />,
            // Fehler in einer Seite: Die Kopfzeile mit Navigation bleibt stehen.
            errorElement: <FehlerSeite imRahmen />,
            children: [
              { index: true, element: <Uebersicht /> },
              { path: "einstellungen", element: <Einstellungen /> },
              { path: "meldungen", element: <Meldungen /> },
              { path: "meldungen/neu", element: <MeldungBearbeiten /> },
              { path: "meldungen/:meldungId", element: <MeldungBearbeiten /> },
              { path: "katalog", element: <Katalog /> },
              { path: "kaefige", element: <Kaefige /> },
              { path: "hallenplan", element: <Hallenplan /> },
              { path: "katalog/gestalten", element: <KatalogGestalten /> },
              { path: "preisrichter", element: <Preisrichter /> },
              { path: "einlieferung", element: <Einlieferung /> },
              { path: "bewertung", element: <Bewertung /> },
              { path: "preise", element: <Preise /> },
              { path: "verkauf", element: <Verkauf /> },
              { path: "abrechnung", element: <Abrechnung /> },
              { path: "kassenbuch", element: <Kassenbuch /> },
              { path: "spenden", element: <Spenden /> },
              { path: "meisterschaften", element: <Meisterschaften /> },
              { path: "protokoll", element: <Protokoll /> },
              { path: "*", element: <FehlerSeite imRahmen /> },
            ],
          },
        ],
      },
      { path: "*", element: <FehlerSeite /> },
    ],
  },
]);
