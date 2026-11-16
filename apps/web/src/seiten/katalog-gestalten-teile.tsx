import { useRef, useState, type FormEvent } from "react";
import { KATALOG_GLIEDERUNG, type KatalogGliederungsTeil, type KatalogSeitenbereich, type KatalogTeil } from "@schau/domain";
import { fehlerText } from "../lib";
import { trpc } from "../trpc";
import { Auswahl, Dialog, Eingabe, Feld, Haken, Hinweis, Knopf, Marke, Textfeld, useAenderungenWarnen, useFrage, useMeldung } from "../ui";
import { Schalter } from "./katalog-gestalten-bausteine";
import { BildHochladen, BildNachweis, Vorschau } from "./katalog-gestalten-bilder";
import type { Art, Beitrag, Form } from "./katalog-gestalten-form";

/* Katalog gestalten, Reiter „Teile und Reihenfolge“: Gliederung mit Seitenzahlen, Beiträge (Grußworte, Seiten, Anzeigen). */

const ARTEN: Record<Art, { titel: string; neu: string }> = {
  grusswort: { titel: "Grußworte", neu: "Grußwort hinzufügen" },
  seite: { titel: "Freie Seiten", neu: "Seite hinzufügen" },
  anzeige: { titel: "Anzeigen und Förderer", neu: "Anzeige hinzufügen" },
};

/** Warum ein Teil im Katalog fehlt, obwohl er nicht abgewählt ist. */
const ENTFAELLT: Partial<Record<KatalogGliederungsTeil, string>> = {
  grussworte: "noch keine",
  seiten: "noch keine",
  anzeigen: "noch keine",
  preisrichter: "noch keine Preisrichter",
  preise: "noch keine Preise",
  bestimmungen: "kein Text unter „Einstellungen“",
  ehrentafel: "erst mit Ergebnissen",
  tierteil: "noch keine Katalognummern",
  rassenverzeichnis: "noch keine Katalognummern",
  ausstellerverzeichnis: "noch keine Aussteller mit Namen",
  bildnachweis: "keine Bilder mit Nachweis",
  kommendeSchauen: "keine Termine nach dieser Schau",
  notizen: "Seitenzahl geht schon auf",
};
const seitenText = (b: KatalogSeitenbereich) => (b.von === b.bis ? `S. ${b.von}` : `S. ${b.von}–${b.bis}`);

export function Gliederung({
  schauId,
  d,
  set,
  teilAn,
  beitraege,
  bereiche,
  mitErgebnis,
  markiert,
  waehle,
  zeigeTeil,
}: {
  schauId: number;
  d: Form;
  set: <K extends keyof Form>(k: K, v: Form[K]) => void;
  teilAn: (t: KatalogTeil, an: boolean) => void;
  beitraege: Beitrag[];
  bereiche: KatalogSeitenbereich[];
  mitErgebnis: boolean;
  markiert: KatalogGliederungsTeil | null;
  waehle: (s: KatalogGliederungsTeil, von: number | null) => void;
  zeigeTeil: (s: KatalogGliederungsTeil) => void;
}) {
  const [bearbeiten, setBearbeiten] = useState<Partial<Beitrag> | null>(null);
  const art = bearbeiten?.art ?? "grusswort";
  return (
    <div className="p-2 sm:p-3">
      <ol className="flex flex-col divide-y divide-linie">
        {KATALOG_GLIEDERUNG.map((g) => {
          const bereich = bereiche.find((b) => b.schluessel === g.schluessel);
          const abgewaehlt = "teil" in g && d.ausgeblendet.includes(g.teil);
          const fehlt = !bereich && !abgewaehlt && bereiche.length > 0;
          const liste = "beitraege" in g ? beitraege.filter((b) => b.art === g.beitraege) : [];
          const mitUnterzeile = g.schluessel === "tierteil" || ("beitraege" in g && liste.length > 0);
          return (
            <li key={g.schluessel} id={`teil-${g.schluessel}`} className={`scroll-mt-4 py-0.5 ${mitUnterzeile ? "pb-2" : ""}`}>
              <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md px-2 py-1.5 transition-colors ${markiert === g.schluessel ? "bg-band-hell" : "hover:bg-papier"}`}>
                <span className="w-16 shrink-0 text-right text-sm text-grau tabular-nums">{bereich ? seitenText(bereich) : "–"}</span>
                <button type="button" className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1 py-1 text-left" onClick={() => waehle(g.schluessel, bereich?.von ?? null)}>
                  <span className={abgewaehlt ? "text-grau line-through" : "font-semibold text-tinte"}>{g.name}</span>
                  {fehlt && ENTFAELLT[g.schluessel] && <span className="text-sm text-grau">entfällt: {g.schluessel === "ehrentafel" && mitErgebnis ? "keine Preisträger" : ENTFAELLT[g.schluessel]}</span>}
                  {(g.schluessel === "preisrichter" || g.schluessel === "bestimmungen") && abgewaehlt && <Marke ton="warnung">gehört in den Katalog</Marke>}
                  {g.schluessel === "notizen" && abgewaehlt && <span className="text-sm text-grau">Füllseiten bleiben leer</span>}
                </button>
                {"teil" in g ? (
                  <Schalter label={`${g.name} im Katalog`} an={!abgewaehlt} onChange={(v) => teilAn(g.teil, v)} />
                ) : "beitraege" in g ? (
                  <Knopf variante="leise" onClick={() => setBearbeiten({ art: g.beitraege })}>+ {ARTEN[g.beitraege].neu.replace(" hinzufügen", "")}</Knopf>
                ) : g.schluessel === "titel" || g.schluessel === "leitung" ? (
                  <Knopf variante="leise" onClick={() => zeigeTeil(g.schluessel)}>Bearbeiten</Knopf>
                ) : (
                  <span className="text-sm text-grau">immer</span>
                )}
              </div>
              {g.schluessel === "tierteil" && (
                <div className="flex flex-wrap gap-x-6 gap-y-2 px-2 pt-1 sm:pl-[5.25rem]">
                  <Haken label="Rassebilder drucken" checked={d.rassebilder} onChange={(v) => set("rassebilder", v)} />
                  <Haken label="Jede Sparte auf neuer Seite" checked={d.sparteNeueSeite} onChange={(v) => set("sparteNeueSeite", v)} />
                </div>
              )}
              {"beitraege" in g && liste.length > 0 && <BeitragListe schauId={schauId} art={g.beitraege} beitraege={liste} bearbeiten={setBearbeiten} />}
            </li>
          );
        })}
      </ol>
      <Dialog offen={bearbeiten != null} onSchliessen={() => setBearbeiten(null)} titel={bearbeiten?.id ? `${ARTEN[art].titel}: bearbeiten` : ARTEN[art].neu} breit>
        {bearbeiten && <BeitragForm schauId={schauId} art={art} start={bearbeiten} fertig={() => setBearbeiten(null)} />}
      </Dialog>
    </div>
  );
}

/** Beiträge einer Art: Reihenfolge per Ziehen (Griff) oder ↑ ↓, speichert sofort. */
function BeitragListe({ schauId, art, beitraege, bearbeiten }: { schauId: number; art: Art; beitraege: Beitrag[]; bearbeiten: (b: Beitrag) => void }) {
  const utils = trpc.useUtils();
  const meldung = useMeldung();
  const { bestaetige } = useFrage();
  const [reihe, setReihe] = useState<number[] | null>(null);
  const [gezogen, setGezogen] = useState<number | null>(null);
  const fertig = () => utils.katalogGestaltung.laden.invalidate();
  const ordnen = trpc.katalogGestaltung.beitraegeOrdnen.useMutation({
    onSettled: () => fertig().then(() => setReihe(null)),
    onError: (e) => meldung(fehlerText(e), "fehler"),
  });
  const loeschen = trpc.katalogGestaltung.beitragLoeschen.useMutation({ onSuccess: fertig, onError: (e) => meldung(fehlerText(e), "fehler") });
  const ids = reihe ?? beitraege.map((b) => b.id);
  const liste = ids.map((id) => beitraege.find((b) => b.id === id)).filter((b): b is Beitrag => !!b);
  const speichere = (neu: number[]) => {
    setReihe(neu);
    ordnen.mutate({ schauId, ids: neu });
  };
  const schiebe = (i: number, um: number) => {
    const neu = [...ids];
    [neu[i], neu[i + um]] = [neu[i + um]!, neu[i]!];
    speichere(neu);
  };
  // Ziehen am Griff (Maus, Finger, Stift): Platz nach der Mitte der übrigen Zeilen, gespeichert beim Loslassen.
  const zeilen = useRef(new Map<number, HTMLLIElement>());
  const ziehe = (id: number, y: number) => {
    const andere = ids.filter((x) => x !== id);
    const stelle = andere.findIndex((x) => {
      const r = zeilen.current.get(x)?.getBoundingClientRect();
      return r ? y < r.top + r.height / 2 : false;
    });
    const neu = [...andere];
    neu.splice(stelle < 0 ? neu.length : stelle, 0, id);
    if (neu.join() !== ids.join()) setReihe(neu);
  };
  const loslassen = (behalten: boolean) => {
    if (gezogen == null) return;
    setGezogen(null);
    if (behalten && reihe && reihe.join() !== beitraege.map((x) => x.id).join()) speichere(reihe);
    else if (!ordnen.isPending) setReihe(null);
  };
  return (
    <ul className="flex flex-col gap-1 px-2 pt-1 sm:pl-[5.25rem]">
      {liste.map((b, i) => (
        <li
          key={b.id}
          ref={(el) => {
            if (el) zeilen.current.set(b.id, el);
            else zeilen.current.delete(b.id);
          }}
          className={`flex flex-wrap items-center gap-2 rounded-lg border bg-weiss px-2 py-1 ${gezogen === b.id ? "border-band shadow-md" : "border-linie"}`}
        >
          <span
            className="cursor-grab touch-none select-none px-1 text-lg text-grau active:cursor-grabbing"
            aria-hidden
            title="Zum Verschieben ziehen"
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              setGezogen(b.id);
            }}
            onPointerMove={(e) => gezogen === b.id && ziehe(b.id, e.clientY)}
            onPointerUp={() => loslassen(true)}
            onPointerCancel={() => loslassen(false)}
          >
            ⠿
          </span>
          {b.bildId ? <Vorschau schauId={schauId} bildId={b.bildId} alt="" klein /> : null}
          <span className="min-w-[10rem] flex-1">
            <span className="font-semibold text-tinte">{b.titel || "(ohne Titel)"}</span>
            {art === "anzeige" && <span className="text-sm text-grau"> · {GROESSE[b.groesse]}</span>}
          </span>
          <span className="flex flex-wrap gap-0.5">
            <Knopf variante="leise" aria-label={`${b.titel || "Beitrag"} nach oben`} disabled={i === 0 || ordnen.isPending} onClick={() => schiebe(i, -1)}>↑</Knopf>
            <Knopf variante="leise" aria-label={`${b.titel || "Beitrag"} nach unten`} disabled={i === liste.length - 1 || ordnen.isPending} onClick={() => schiebe(i, 1)}>↓</Knopf>
            <Knopf variante="leise" onClick={() => bearbeiten(b)}>Bearbeiten</Knopf>
            <Knopf variante="leise" onClick={async () => (await bestaetige({ titel: `„${b.titel || "Beitrag"}“ löschen?`, knopf: "Löschen", gefahr: true })) && loeschen.mutate({ schauId, id: b.id })}>Löschen</Knopf>
          </span>
        </li>
      ))}
    </ul>
  );
}

const GROESSE: Record<Beitrag["groesse"], string> = { ganz: "ganze Seite", halb: "halbe Seite", viertel: "Viertelseite" };

const FELDER: Record<Art, { titel: string; titelHinweis: string; unterzeile: string; unterHinweis: string; text: string; bild: string }> = {
  grusswort: {
    titel: "Überschrift",
    titelHinweis: "z. B. „Grußwort des Bürgermeisters“",
    unterzeile: "Name und Funktion (Unterschrift)",
    unterHinweis: "z. B. „Hans Beispiel, Bürgermeister der Stadt Musterstadt“",
    text: "Text",
    bild: "Porträtfoto",
  },
  seite: { titel: "Überschrift", titelHinweis: "z. B. „Hallenplan“", unterzeile: "Unterzeile", unterHinweis: "optional", text: "Text", bild: "Bild (z. B. Hallenplan)" },
  anzeige: { titel: "Firma / Förderer", titelHinweis: "z. B. „Futtermittel Müller GmbH“", unterzeile: "Ort / Kontakt", unterHinweis: "optional, bei Anzeigen ohne Bild", text: "Anzeigentext", bild: "Fertige Anzeige als Bild" },
};

function BeitragForm({ schauId, art, start, fertig }: { schauId: number; art: Art; start: Partial<Beitrag>; fertig: () => void }) {
  const [b, setB] = useState({ titel: start.titel ?? "", unterzeile: start.unterzeile ?? "", text: start.text ?? "", bildId: start.bildId ?? null, groesse: start.groesse ?? ("ganz" as const) });
  const gespeichert = useAenderungenWarnen(b);
  const f = FELDER[art];
  const utils = trpc.useUtils();
  const speichern = trpc.katalogGestaltung.beitragSpeichern.useMutation({
    onSuccess: () => {
      gespeichert();
      utils.katalogGestaltung.laden.invalidate();
      fertig();
    },
  });
  const set = <K extends keyof typeof b>(k: K, v: (typeof b)[K]) => setB((x) => ({ ...x, [k]: v }));
  const senden = (e: FormEvent) => {
    e.preventDefault();
    speichern.mutate({ schauId, beitrag: { id: start.id, art, ...b } });
  };
  return (
    <form onSubmit={senden} className="grid gap-4">
      <Feld label={f.titel} hinweis={f.titelHinweis}>
        {(fid) => <Eingabe id={fid} value={b.titel} onChange={(e) => set("titel", e.target.value)} />}
      </Feld>
      <Feld label={f.unterzeile} hinweis={f.unterHinweis}>
        {(fid) => <Eingabe id={fid} value={b.unterzeile} onChange={(e) => set("unterzeile", e.target.value)} />}
      </Feld>
      {art === "anzeige" && (
        <Feld label="Größe">
          {(fid) => (
            <Auswahl id={fid} value={b.groesse} onChange={(e) => set("groesse", e.target.value as typeof b.groesse)}>
              {Object.entries(GROESSE).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </Auswahl>
          )}
        </Feld>
      )}
      <Feld label={f.text} hinweis="Leerzeile = neuer Absatz.">
        {(fid) => <Textfeld id={fid} rows={art === "grusswort" ? 12 : 6} value={b.text} onChange={(e) => set("text", e.target.value)} />}
      </Feld>
      <div className="flex flex-col gap-2">
        <span className="text-sm font-semibold">{f.bild}</span>
        <div className="flex flex-wrap items-center gap-3">
          {b.bildId && <Vorschau schauId={schauId} bildId={b.bildId} alt={f.bild} klein />}
          <BildHochladen schauId={schauId} rolle="beitrag" beschriftung={b.bildId ? "Anderes Bild" : "Bild wählen"} fertig={(id) => set("bildId", id)} />
          {b.bildId && <Knopf type="button" variante="leise" onClick={() => set("bildId", null)}>Ohne Bild</Knopf>}
        </div>
        {b.bildId && art !== "anzeige" && <BildNachweis schauId={schauId} bildId={b.bildId} />}
      </div>
      {speichern.error && <Hinweis ton="fehler">{fehlerText(speichern.error)}</Hinweis>}
      <div className="flex flex-wrap justify-end gap-2">
        <Knopf type="button" onClick={fertig}>Abbrechen</Knopf>
        <Knopf type="submit" variante="primaer" laedt={speichern.isPending}>Speichern</Knopf>
      </div>
    </form>
  );
}
