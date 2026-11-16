import { Link } from "react-router-dom";
import { datumZeit } from "../lib";
import { useSchauId } from "../rahmen";
import { trpc } from "../trpc";
import { Abschnitt, FehlerAnzeige, Hinweis, knopfKlasse, Laden, Seitenkopf } from "../ui";
import { DruckAbschnitt } from "./einstellungen-druck";
import { MeisterschaftenAbschnitt } from "./einstellungen-meisterschaften";
import { Notenskala } from "./einstellungen-notenskala";
import { Gebuehren, Preisarten } from "./einstellungen-preise";
import { Stammangaben } from "./einstellungen-stammangaben";
import { TeilschauenAbschnitt } from "./einstellungen-teilschauen";
import { AlsTestschau, Demodaten, SchauAbsagen, SchauLoeschen } from "./einstellungen-verwalten";

/*
 * Seite „Einstellungen“ der Schau: Abschnittsliste links, Abschnitte rechts. Die großen Abschnitte stehen in
 * einstellungen-stammangaben, -preise, -notenskala, -teilschauen, -meisterschaften, -druck, -verwalten.
 */

/** Sprungziele der Abschnittsliste links (ids der Abschnitte). */
const ABSCHNITTE: [string, string][] = [
  ["schau", "Schau"],
  ["termine", "Termine"],
  ["zahlung", "Meldegeld und Konto"],
  ["katalog", "Katalog und Preise"],
  ["teilschauen", "Teilschauen"],
  ["bestimmungen", "Bestimmungen"],
  ["veterinaeramt", "Veterinäramt"],
  ["gebuehren", "Standgeld und Gebühren"],
  ["preise", "Preise"],
  ["notenskala", "Notenskala"],
  ["meisterschaften", "Meisterschaften"],
  ["kaefige", "Käfige und Halle"],
  ["druck", "Druck"],
  ["protokoll", "Protokoll"],
];

export function Einstellungen() {
  const id = useSchauId();
  const schau = trpc.schau.get.useQuery({ id });
  const status = trpc.auth.status.useQuery();
  if (schau.error) return <FehlerAnzeige fehler={schau.error} nochmal={() => schau.refetch()} />;
  if (schau.isLoading || !schau.data) return <Laden />;
  const istAdmin = status.data?.benutzer?.rolle === "admin";
  return (
    <div className="flex flex-col gap-6">
      <Seitenkopf titel="Einstellungen" hilfe="einstellungen" />
      {!istAdmin && <Hinweis>Nur Administratoren können die Einstellungen ändern.</Hinweis>}
      <div className="grid items-start gap-6 xl:grid-cols-[11rem_minmax(0,1fr)]">
        <nav aria-label="Abschnitte" className="sticky top-16 hidden flex-col gap-0.5 text-sm xl:flex">
          {ABSCHNITTE.map(([anker, label]) => (
            <a key={anker} href={`#${anker}`} className="rounded-md px-2.5 py-1.5 text-grau no-underline hover:bg-papier hover:text-tinte">
              {label}
            </a>
          ))}
        </nav>
        <div className="flex min-w-0 flex-col gap-6">
          {/* Für Helfer nur zum Lesen: alle Felder und Knöpfe gesperrt. */}
          <fieldset disabled={!istAdmin} className="flex min-w-0 flex-col gap-6">
            <Stammangaben schau={schau.data} />
            <Gebuehren schau={schau.data} />
            <Preisarten schau={schau.data} />
            <Notenskala schau={schau.data} />
          </fieldset>
          <TeilschauenAbschnitt schauId={schau.data.id} start={schau.data.teilschauen} darfAendern={istAdmin} />
          <MeisterschaftenAbschnitt schauId={schau.data.id} darfAendern={istAdmin} />
          <KaefigeUndHalle schauId={schau.data.id} />
          <DruckAbschnitt schauId={schau.data.id} darfAendern={istAdmin} />
          <ProtokollAbschnitt schauId={schau.data.id} />
          {istAdmin && !schau.data.test && <AlsTestschau schau={schau.data} />}
          {istAdmin && schau.data.test && <Demodaten schau={schau.data} />}
          {istAdmin && !schau.data.abgesagtAm && ["vorbereitung", "meldung", "katalog"].includes(schau.data.phase) && <SchauAbsagen schau={schau.data} />}
          {istAdmin && (schau.data.phase === "vorbereitung" || schau.data.test) && <SchauLoeschen schau={schau.data} />}
        </div>
      </div>
    </div>
  );
}

/** Protokoll der Schau: die letzten Einträge, das ganze Protokoll auf eigener Seite (Suche, Export, Prüfung). */
function ProtokollAbschnitt({ schauId }: { schauId: number }) {
  const letzte = trpc.schau.protokoll.useQuery({ schauId, limit: 3 });
  return (
    <Abschnitt
      id="protokoll"
      titel="Protokoll"
      aktionen={
        <Link to={`/schau/${schauId}/protokoll`} className={knopfKlasse()}>
          Protokoll öffnen
        </Link>
      }
    >
      {letzte.isLoading ? (
        <Laden />
      ) : !letzte.data?.length ? (
        <p className="text-sm text-grau">Noch keine Einträge.</p>
      ) : (
        <ul className="flex flex-col gap-1 text-sm">
          {letzte.data.map((z) => (
            <li key={z.id} className="flex flex-wrap gap-x-2">
              <span className="tabular-nums text-grau">{datumZeit(z.zeitpunkt)}</span>
              <span>{z.aktion}</span>
              <span className="text-grau">{z.wer}</span>
            </li>
          ))}
        </ul>
      )}
    </Abschnitt>
  );
}

/** Wegweiser: Käfigmaße, Käfig je Rasse und Halle stehen auf eigenen Seiten. */
function KaefigeUndHalle({ schauId }: { schauId: number }) {
  return (
    <Abschnitt id="kaefige" titel="Käfige und Halle">
      <div className="flex flex-wrap gap-2">
        <Link to={`/schau/${schauId}/kaefige`} className={knopfKlasse("zweit")}>
          Käfige
        </Link>
        <Link to={`/schau/${schauId}/hallenplan`} className={knopfKlasse("zweit")}>
          Hallenplan
        </Link>
      </div>
    </Abschnitt>
  );
}
