import { isRouteErrorResponse, Link, useParams, useRouteError } from "react-router-dom";
import { Knopf, knopfKlasse, SCHMAL, SEITE, SEITENRAND, useSeitentitel } from "../ui";

/**
 * Unbekannte Adresse oder Fehler beim Anzeigen einer Seite – statt der englischen Standardseite von React Router.
 * imRahmen: steht im Inhaltsbereich des App-Rahmens, der den Rand schon setzt.
 */
export function FehlerSeite({ imRahmen }: { imRahmen?: boolean }) {
  const fehler = useRouteError();
  const { schauId } = useParams();
  // Ohne Fehler wird die Seite als Auffangroute („*“) angezeigt: Die Adresse gibt es nicht.
  const nichtGefunden = !fehler || (isRouteErrorResponse(fehler) && fehler.status === 404);
  if (fehler) console.error(fehler);
  const titel = nichtGefunden ? "Diese Seite gibt es nicht" : "Es ist ein Fehler aufgetreten";
  useSeitentitel(titel);
  return (
    <div className={`${SEITE} ${SCHMAL} ${imRahmen ? "" : SEITENRAND}`}>
      <div className="flex flex-col gap-2 pt-6">
        <p className="text-sm font-semibold tabular-nums text-grau">{nichtGefunden ? "Fehler 404" : "Fehler"}</p>
        <h1 className="text-[1.7rem] font-bold leading-tight">{titel}</h1>
        <p role={nichtGefunden ? undefined : "alert"} className="text-grau">
          {nichtGefunden ? "Bitte die Adresse prüfen." : "Die Seite konnte nicht angezeigt werden – bitte neu laden."}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {!nichtGefunden && (
          <Knopf variante="primaer" onClick={() => window.location.reload()}>
            Seite neu laden
          </Knopf>
        )}
        <Link to="/" className={knopfKlasse(nichtGefunden ? "primaer" : "zweit")}>
          Zur Startseite
        </Link>
        {Number(schauId) > 0 && (
          <Link to={`/schau/${schauId}`} className={knopfKlasse()}>
            Zur Übersicht der Schau
          </Link>
        )}
      </div>
    </div>
  );
}
