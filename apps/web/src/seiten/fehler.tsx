import { isRouteErrorResponse, Link, useParams, useRouteError } from "react-router-dom";
import { useOberflaeche, useTexte } from "../sprache";
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
  // Auf den Seiten für Aussteller in deren Sprache, sonst deutsch (Entscheidung 020).
  const t = useTexte().fehler;
  const zurSchau = useOberflaeche().rahmen.fehler.zurSchau;
  const titel = nichtGefunden ? t.seiteFehlt : t.aufgetreten;
  useSeitentitel(titel);
  return (
    <div className={`${SEITE} ${SCHMAL} ${imRahmen ? "" : SEITENRAND}`}>
      <div className="flex flex-col gap-2 pt-6">
        <p className="text-sm font-semibold tabular-nums text-grau">{nichtGefunden ? t.fehler404 : t.fehler}</p>
        <h1 className="text-[1.7rem] font-bold leading-tight">{titel}</h1>
        <p role={nichtGefunden ? undefined : "alert"} className="text-grau">
          {nichtGefunden ? t.adressePruefen : t.neuLaden}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {!nichtGefunden && (
          <Knopf variante="primaer" onClick={() => window.location.reload()}>
            {t.seiteNeuLaden}
          </Knopf>
        )}
        <Link to="/" className={knopfKlasse(nichtGefunden ? "primaer" : "zweit")}>
          {t.startseite}
        </Link>
        {Number(schauId) > 0 && (
          <Link to={`/schau/${schauId}`} className={knopfKlasse()}>
            {zurSchau}
          </Link>
        )}
      </div>
    </div>
  );
}
