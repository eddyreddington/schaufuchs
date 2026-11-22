/** Dialog „Preisrichter hinzufügen“ bzw. „Preisrichter bearbeiten“: Angaben, Sparten, BDRG-Gruppen, Obmann und Zusage. */
import { useState, type FormEvent } from "react";
import { bdrgGruppe, ZUSAGEN, type Zusage } from "@schau/domain";
import { fehlerText } from "../lib";
import { useOberflaeche } from "../sprache";
import { trpc, type Ausgabe } from "../trpc";
import { Auswahl, Eingabe, Feld, Haken, HilfeLink, Hinweis, Knopf } from "../ui";

export type Richter = Ausgabe["preisrichter"]["liste"]["richter"][number];

/** Gruppen aus dem Eingabefeld: getrennt durch Komma, Semikolon oder Leerzeichen, einheitlich geschrieben, ohne Doppelte. */
const gruppenAus = (text: string) => [...new Set(text.split(/[,;\s]+/).map(bdrgGruppe).filter(Boolean))];

export function RichterForm({ schauId, versionId, start, richter, fertig }: { schauId: number; versionId: number | null; start: Partial<Richter>; richter: Richter[]; fertig: () => void }) {
  const t = useOberflaeche();
  const tx = t.preisrichter.form;
  const [r, setR] = useState({
    name: start.name ?? "",
    anschrift: start.anschrift ?? "",
    email: start.email ?? "",
    telefon: start.telefon ?? "",
    istObmann: start.istObmann ?? false,
    sparten: start.sparten ?? [],
    anschriftImKatalog: start.anschriftImKatalog ?? false,
    obmannId: start.obmannId ?? null,
    zusage: (start.zusage ?? "offen") as Zusage,
    zugesagtFuer: start.zugesagtFuer ?? "",
    vorbehalt: start.vorbehalt ?? "",
  });
  const [gruppen, setGruppen] = useState((start.gruppen ?? []).join(", "));
  // Sparten aus dem Verzeichnis der Schau; dazu gespeicherte, die es dort nicht (mehr) gibt, damit sie nicht still verschwinden.
  const gliederung = trpc.stammdaten.gliederung.useQuery({ versionId: versionId ?? 0 }, { enabled: versionId != null });
  const sparten = [...new Set([...(gliederung.data?.sparten.map((x) => x.name) ?? []), ...r.sparten])];
  const imVerzeichnis = [...new Set((gliederung.data?.rassen ?? []).map((x) => x.gruppe).filter(Boolean))].sort((a, b) => a.localeCompare(b, "de", { numeric: true }));
  // Obmann: nur Obmänner derselben Schau, nicht er selbst (eine gespeicherte Wahl bleibt sichtbar).
  const obmaenner = richter.filter((x) => x.id !== start.id && (x.istObmann || x.id === r.obmannId));
  const utils = trpc.useUtils();
  const speichern = trpc.preisrichter.speichern.useMutation({ onSuccess: () => { utils.preisrichter.liste.invalidate(); fertig(); } });
  const senden = (e: FormEvent) => {
    e.preventDefault();
    speichern.mutate({ schauId, id: start.id, ...r, gruppen: gruppenAus(gruppen) });
  };
  return (
    <form onSubmit={senden} className="flex flex-col gap-4">
      <Feld label={t.allgemein.name}>{(id) => <Eingabe id={id} value={r.name} onChange={(e) => setR({ ...r, name: e.target.value })} required autoFocus />}</Feld>
      <Feld label={tx.anschrift}>{(id) => <Eingabe id={id} value={r.anschrift} onChange={(e) => setR({ ...r, anschrift: e.target.value })} />}</Feld>
      <Haken
        label={tx.anschriftImKatalog}
        hinweis={tx.anschriftHinweis}
        checked={r.anschriftImKatalog}
        onChange={(v) => setR({ ...r, anschriftImKatalog: v })}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <Feld label={tx.telefon}>{(id) => <Eingabe id={id} value={r.telefon} onChange={(e) => setR({ ...r, telefon: e.target.value })} />}</Feld>
        <Feld label={tx.email}>{(id) => <Eingabe id={id} type="email" value={r.email} onChange={(e) => setR({ ...r, email: e.target.value })} />}</Feld>
      </div>
      <Haken label={t.preisrichter.seite.obmann} hinweis={tx.obmannHinweis} checked={r.istObmann} onChange={(v) => setR({ ...r, istObmann: v })} />
      {(obmaenner.length > 0 || r.obmannId != null) && (
        <Feld label={tx.obmannFuer}>
          {(id) => (
            <Auswahl id={id} value={r.obmannId ?? ""} onChange={(e) => setR({ ...r, obmannId: e.target.value === "" ? null : Number(e.target.value) })}>
              <option value="">{tx.keinObmann}</option>
              {obmaenner.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </Auswahl>
          )}
        </Feld>
      )}
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-semibold">
          {tx.sparten} <span className="font-normal text-grau">{tx.spartenLeer}</span>
        </legend>
        <div className="grid gap-1 sm:grid-cols-2">
          {sparten.map((sp) => (
            <Haken key={sp} label={sp} checked={r.sparten.includes(sp)} onChange={(v) => setR({ ...r, sparten: v ? [...r.sparten, sp] : r.sparten.filter((x) => x !== sp) })} />
          ))}
        </div>
      </fieldset>
      <Feld label={`${tx.gruppen} ${tx.gruppenLeer}`} hinweis={imVerzeichnis.length ? tx.gruppenImVerzeichnis(imVerzeichnis.join(", ")) : undefined}>
        {(id) => <Eingabe id={id} value={gruppen} onChange={(e) => setGruppen(e.target.value)} placeholder={tx.gruppenPlatzhalter} autoComplete="off" />}
      </Feld>
      <div className="grid gap-4 sm:grid-cols-[minmax(0,10rem)_1fr]">
        <Feld label={tx.zusage}>
          {(id) => (
            <Auswahl id={id} value={r.zusage} onChange={(e) => setR({ ...r, zusage: e.target.value as Zusage })}>
              {ZUSAGEN.map((z) => (
                <option key={z} value={z}>
                  {tx.zusagen[z]}
                </option>
              ))}
            </Auswahl>
          )}
        </Feld>
        <Feld label={tx.zugesagtFuer}>{(id) => <Eingabe id={id} value={r.zugesagtFuer} onChange={(e) => setR({ ...r, zugesagtFuer: e.target.value })} placeholder={tx.zugesagtFuerPlatzhalter} maxLength={200} />}</Feld>
      </div>
      <Feld label={tx.vorbehalt}>{(id) => <Eingabe id={id} value={r.vorbehalt} onChange={(e) => setR({ ...r, vorbehalt: e.target.value })} maxLength={1000} />}</Feld>
      {speichern.error && <Hinweis ton="fehler">{fehlerText(speichern.error)}</Hinweis>}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* bleibt deutsch: Abschnitt im Handbuch */}
        <HilfeLink abschnitt="preisrichter-gruppen-zusage">{tx.hilfeZusage}</HilfeLink>
        <Knopf type="submit" variante="primaer" laedt={speichern.isPending}>{t.allgemein.speichern}</Knopf>
      </div>
    </form>
  );
}
