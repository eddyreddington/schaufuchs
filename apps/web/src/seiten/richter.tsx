/**
 * Bewertung am Tablet für Preisrichter.
 * Arbeitet ohne Netz weiter: Tiere und Bewertungen liegen im Gerät (IndexedDB),
 * neue Bewertungen warten im Ausgang und werden übertragen, sobald wieder Verbindung besteht.
 */
import { get } from "idb-keyval";
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { trpc } from "../trpc";
import { Laden } from "../ui";
import { RichterAnmeldung } from "./richter-anmeldung";
import { datenSchluessel, leseZuletzt, merkeZuletzt, type Richter } from "./richter-geraet";
import { Tablet } from "./richter-tablet";

export function RichterApp() {
  const { slug = "" } = useParams();
  const status = trpc.auth.status.useQuery(undefined, { retry: false });
  const [angemeldet, setAngemeldet] = useState(false);
  const [zuletzt] = useState(() => leseZuletzt(slug));
  const [offlineDaten, setOfflineDaten] = useState<boolean | null>(null);
  const richter = status.data?.richter;
  // Tablet: größere Grundschrift (Ziele mindestens 44 px), nur solange diese Seite offen ist.
  useEffect(() => {
    document.documentElement.classList.add("tablet");
    return () => document.documentElement.classList.remove("tablet");
  }, []);

  // Ohne Netz: wenn Daten des zuletzt angemeldeten Preisrichters im Gerät liegen, direkt mit ihnen arbeiten.
  useEffect(() => {
    if (!zuletzt) return setOfflineDaten(false);
    get(datenSchluessel(slug, zuletzt.id)).then(
      (d) => setOfflineDaten(!!d),
      () => setOfflineDaten(false),
    );
  }, [slug, zuletzt]);

  // Die Sitzung gilt nur für ihre Schau: ein Link zu einer anderen Schau zeigt die Anmeldung.
  const passend = richter && richter.slug === slug ? richter : null;
  // Endet die Sitzung während der Arbeit (z. B. neue PIN), bleibt das Tablet stehen: es zeigt „Anmeldung abgelaufen“,
  // statt die Karte mit ungespeicherten Eingaben ohne Rückfrage zu verlassen.
  const [aktiv, setAktiv] = useState<Richter | null>(null);
  useEffect(() => {
    if (passend) {
      merkeZuletzt(slug, passend);
      setAktiv({ id: passend.id, name: passend.name });
    }
  }, [slug, passend?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (status.isLoading || offlineDaten === null) return <Laden />;
  if (passend) return <Tablet key={passend.id} slug={slug} richter={{ id: passend.id, name: passend.name }} abmeldung={status.data?.abmeldung.richter ?? null} />;
  if (aktiv && !richter) return <Tablet key={aktiv.id} slug={slug} richter={aktiv} abmeldung={null} />;
  if (status.isError && offlineDaten && zuletzt) return <Tablet key={zuletzt.id} slug={slug} richter={zuletzt} abmeldung={null} />;
  if (angemeldet && status.isFetching) return <Laden />;
  return <RichterAnmeldung slug={slug} andereSchau={!!richter && !passend} fertig={() => { setAngemeldet(true); status.refetch(); }} />;
}
