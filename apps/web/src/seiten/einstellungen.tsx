import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { datumZeit } from "../lib";
import { useSchauId } from "../rahmen";
import { useOberflaeche } from "../sprache";
import { trpc } from "../trpc";
import { Abschnitt, FehlerAnzeige, Hinweis, knopfKlasse, Laden, ReiterLeiste, ReiterTafel, reiterTafel, Seitenkopf, useReiter } from "../ui";
import { DruckAbschnitt } from "./einstellungen-druck";
import { MeisterschaftenAbschnitt } from "./einstellungen-meisterschaften";
import { Notenskala } from "./einstellungen-notenskala";
import { Gebuehren, Preisarten } from "./einstellungen-preise";
import { STAMM_ABSCHNITTE, Stammangaben, type StammAbschnitt } from "./einstellungen-stammangaben";
import { TeilschauenAbschnitt } from "./einstellungen-teilschauen";
import { AlsTestschau, Demodaten, SchauAbsagen, SchauLoeschen } from "./einstellungen-verwalten";

/*
 * Seite „Einstellungen“ der Schau: je Punkt ein Reiter statt einer langen Seite. Der Reiter steht im Anker der Adresse
 * (…/einstellungen#druck). Die großen Teile stehen in einstellungen-stammangaben, -preise, -notenskala, -teilschauen,
 * -meisterschaften, -druck, -verwalten.
 */

/** Reiter in dieser Reihenfolge (Beschriftung: t.schau.einstellungen.seite.abschnitte). */
const REITER = ["schau", "termine", "zahlung", "katalog", "teilschauen", "bestimmungen", "veterinaeramt", "gebuehren", "preise", "notenskala", "meisterschaften", "kaefige", "druck", "protokoll", "verwalten"] as const;
type Reiter = (typeof REITER)[number];
const STAMM_TAFEL = "tafel-stammangaben";

export function Einstellungen() {
  const id = useSchauId();
  const te = useOberflaeche().schau.einstellungen.seite;
  const schau = trpc.schau.get.useQuery({ id });
  const status = trpc.auth.status.useQuery();
  const istAdmin = status.data?.benutzer?.rolle === "admin";
  const s = schau.data;
  // „Verwalten“ (Testschau oder Demodaten, Absagen, Löschen) nur für Administratoren – für sie steht dort immer etwas.
  const verwalten = !!s && istAdmin;
  const reiter = REITER.filter((r) => r !== "verwalten" || verwalten);
  const [aktiv, waehlen] = useReiter(reiter);
  if (schau.error) return <FehlerAnzeige fehler={schau.error} nochmal={() => schau.refetch()} />;
  if (schau.isLoading || !s) return <Laden />;
  const stamm = (STAMM_ABSCHNITTE as readonly string[]).includes(aktiv) ? (aktiv as StammAbschnitt) : null;
  /** Tafel eines Reiters: alle bleiben geladen (Ungespeichertes geht beim Wechsel nicht verloren), nur einer ist sichtbar. */
  const tafel = (r: Reiter, inhalt: ReactNode) => (
    <ReiterTafel key={r} id={r} aktiv={aktiv === r} waehlen={waehlen}>
      {inhalt}
    </ReiterTafel>
  );
  /** Die sechs Reiter der Stammangaben teilen sich eine Tafel (ein Formular). */
  const tafelFuer = (r: Reiter) => ((STAMM_ABSCHNITTE as readonly string[]).includes(r) ? STAMM_TAFEL : reiterTafel(r));
  return (
    <div className="flex flex-col gap-6">
      <Seitenkopf titel={te.titel} hilfe="einstellungen" />
      {!istAdmin && <Hinweis>{te.nurAdmin}</Hinweis>}
      <ReiterLeiste reiter={reiter.map((r) => ({ id: r, label: te.abschnitte[r] }))} aktiv={aktiv} waehlen={waehlen} label={te.abschnitteLabel} tafelFuer={tafelFuer} />
      {/* Für Helfer nur zum Lesen: alle Felder und Knöpfe gesperrt. */}
      {/* contents: Das fieldset ist kein eigener Kasten – die Tafeln darin stehen im selben Abstand wie die übrigen. */}
      <fieldset disabled={!istAdmin} className="contents">
        {/* Ein Formular für sechs Reiter: immer geladen, damit der Stand beim Wechsel bleibt (die Speicherleiste steht in
            der Kopfleiste und bleibt so auch auf anderen Reitern sichtbar). */}
        <ReiterTafel id={stamm ?? "schau"} aktiv={!!stamm} waehlen={waehlen} tafelId={STAMM_TAFEL}>
          <Stammangaben schau={s} abschnitt={stamm} />
        </ReiterTafel>
        {tafel("gebuehren", <Gebuehren schau={s} />)}
        {tafel("preise", <Preisarten schau={s} />)}
        {tafel("notenskala", <Notenskala schau={s} />)}
      </fieldset>
      {tafel("teilschauen", <TeilschauenAbschnitt schauId={s.id} start={s.teilschauen} darfAendern={istAdmin} />)}
      {tafel("meisterschaften", <MeisterschaftenAbschnitt schauId={s.id} darfAendern={istAdmin} />)}
      {tafel("kaefige", <KaefigeUndHalle schauId={s.id} />)}
      {tafel("druck", <DruckAbschnitt schauId={s.id} darfAendern={istAdmin} />)}
      {tafel("protokoll", <ProtokollAbschnitt schauId={s.id} />)}
      {verwalten &&
        tafel(
          "verwalten",
          <>
            {!s.test && <AlsTestschau schau={s} />}
            {s.test && <Demodaten schau={s} />}
            {!s.abgesagtAm && ["vorbereitung", "meldung", "katalog"].includes(s.phase) && <SchauAbsagen schau={s} />}
            {(s.phase === "vorbereitung" || s.test) && <SchauLoeschen schau={s} />}
          </>,
        )}
    </div>
  );
}

/** Protokoll der Schau: die letzten Einträge, das ganze Protokoll auf eigener Seite (Suche, Export, Prüfung). */
function ProtokollAbschnitt({ schauId }: { schauId: number }) {
  const te = useOberflaeche().schau.einstellungen.seite;
  const letzte = trpc.schau.protokoll.useQuery({ schauId, limit: 3 });
  return (
    <Abschnitt
      id="protokoll"
      titel={te.abschnitte.protokoll}
      aktionen={
        <Link to={`/schau/${schauId}/protokoll`} className={knopfKlasse()}>
          {te.protokollOeffnen}
        </Link>
      }
    >
      {letzte.isLoading ? (
        <Laden />
      ) : !letzte.data?.length ? (
        <p className="text-sm text-grau">{te.keineEintraege}</p>
      ) : (
        <ul className="flex flex-col gap-1 text-sm">
          {letzte.data.map((z) => (
            <li key={z.id} className="flex flex-wrap gap-x-2">
              <span className="tabular-nums text-grau">{datumZeit(z.zeitpunkt)}</span>
              <span>{z.aktion /* bleibt deutsch: Protokolleintrag */}</span>
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
  const te = useOberflaeche().schau.einstellungen.seite;
  return (
    <Abschnitt id="kaefige" titel={te.abschnitte.kaefige}>
      <div className="flex flex-wrap gap-2">
        <Link to={`/schau/${schauId}/kaefige`} className={knopfKlasse("zweit")}>
          {te.kaefige}
        </Link>
        <Link to={`/schau/${schauId}/hallenplan`} className={knopfKlasse("zweit")}>
          {te.hallenplan}
        </Link>
      </div>
    </Abschnitt>
  );
}
