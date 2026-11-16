import { serverText } from "@schau/domain";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { fehlerText } from "../lib";
import { useOberflaeche, useSprache } from "../sprache";
import { trpc, type Ausgabe } from "../trpc";
import { Abschnitt, Dialog, Eingabe, FehlerAnzeige, Feld, Hinweis, Knopf, Laden, useFrage, useMeldung } from "../ui";

/* Einstellungen der Schau, Abschnitte am Ende: Schau absagen, Schau löschen, als Testschau kennzeichnen, Demodaten. */

type Schau = Ausgabe["schau"]["get"];

/**
 * Schau absagen (z. B. Ausstellungsverbot wegen Tierseuche): bis vor der Einlieferung. Alle Meldungen werden storniert,
 * die Aussteller benachrichtigt; die Erstattungen stehen danach in der Abrechnung.
 */
export function SchauAbsagen({ schau: s }: { schau: Schau }) {
  const tv = useOberflaeche().schau.einstellungen.verwalten;
  const utils = trpc.useUtils();
  const meldung = useMeldung();
  const { eingabe } = useFrage();
  const absagen = trpc.schau.absagen.useMutation({
    onSuccess: (r) => {
      utils.schau.invalidate();
      meldung(tv.abgesagt(r.storniert, r.benachrichtigt));
    },
    onError: (e) => meldung(fehlerText(e), "fehler"),
  });
  return (
    <Abschnitt titel={tv.absagen}>
      <Knopf
        variante="gefahr"
        laedt={absagen.isPending}
        onClick={async () => {
          const g = await eingabe({ titel: tv.absagenTitel(s.name), text: tv.absagenText, feld: tv.absagenGrund, mindestens: 3, knopf: tv.absagen, gefahr: true });
          if (g) absagen.mutate({ id: s.id, grund: g });
        }}
      >
        {tv.absagenPunkte}
      </Knopf>
    </Abschnitt>
  );
}

/**
 * Leere Schau löschen (z. B. eine zum Ausprobieren angelegte): nur in der Vorbereitung und ohne Meldungen – der Server
 * prüft das. Zur Sicherheit den Namen eintippen und einen Grund angeben (steht im Protokoll des Vereins).
 */
export function SchauLoeschen({ schau: s }: { schau: Schau }) {
  const t = useOberflaeche();
  const tv = t.schau.einstellungen.verwalten;
  const navigate = useNavigate();
  const utils = trpc.useUtils();
  const meldung = useMeldung();
  const { eingabe } = useFrage();
  const loeschen = trpc.schau.loeschen.useMutation({
    onSuccess: async () => {
      await utils.schau.liste.invalidate();
      meldung(tv.geloescht(s.name));
      navigate("/");
    },
    onError: (e) => meldung(fehlerText(e), "fehler"),
  });
  const starten = async () => {
    const was = s.test ? tv.loeschenWasTest : tv.loeschenWas;
    const name = await eingabe({
      titel: tv.loeschen,
      text: tv.loeschenFrage(s.name, was),
      feld: tv.bitteNamenEintippen,
      einzeilig: true,
      knopf: t.allgemein.weiter,
      gefahr: true,
    });
    if (name == null) return;
    if (name.trim() !== s.name.trim()) return meldung(tv.nameFalsch, "fehler");
    const grund = await eingabe({ titel: tv.loeschen, feld: tv.loeschenGrund, mindestens: 3, knopf: tv.endgueltigLoeschen, gefahr: true });
    if (grund == null) return;
    loeschen.mutate({ id: s.id, name, grund });
  };
  return (
    <Abschnitt titel={tv.loeschen}>
      <Knopf variante="gefahr" laedt={loeschen.isPending} onClick={starten}>
        {tv.loeschenPunkte}
      </Knopf>
    </Abschnitt>
  );
}

/**
 * Bestehende Schau als Testschau kennzeichnen (z. B. eine zum Üben angelegte mit Demo-Meldungen). Der Server lehnt ab,
 * wenn darin echte Aussteller gemeldet sind, und nennt sie.
 */
export function AlsTestschau({ schau: s }: { schau: Schau }) {
  const tv = useOberflaeche().schau.einstellungen.verwalten;
  const [offen, setOffen] = useState(false);
  return (
    <Abschnitt titel={tv.testschau}>
      <Knopf variante="zweit" onClick={() => setOffen(true)}>
        {tv.alsTestschauPunkte}
      </Knopf>
      <Dialog offen={offen} onSchliessen={() => setOffen(false)} titel={tv.alsTestschau}>
        {offen && <TestschauDialog schau={s} fertig={() => setOffen(false)} />}
      </Dialog>
    </Abschnitt>
  );
}

/** Zeigt vorher, wer Test-Aussteller wird (oder wer als echter Aussteller das Kennzeichnen verhindert). */
function TestschauDialog({ schau: s, fertig }: { schau: Schau; fertig: () => void }) {
  const t = useOberflaeche();
  const tv = t.schau.einstellungen.verwalten;
  const sprache = useSprache();
  const utils = trpc.useUtils();
  const meldung = useMeldung();
  const vorschau = trpc.schau.testschauVorschau.useQuery({ id: s.id }, { staleTime: 0 });
  const [name, setName] = useState("");
  const kennzeichnen = trpc.schau.alsTestschau.useMutation({
    onSuccess: async (r) => {
      await Promise.all([utils.schau.invalidate(), utils.verein.invalidate(), utils.meldung.invalidate()]);
      meldung(tv.istTestschau(s.name, r.aussteller, r.kopien));
      fertig();
    },
  });
  if (vorschau.error) return <FehlerAnzeige fehler={vorschau.error} nochmal={() => vorschau.refetch()} />;
  if (!vorschau.data) return <Laden />;
  const { werden, kopien, hindernisse } = vorschau.data;
  if (hindernisse.length) {
    return (
      <div className="flex flex-col gap-3">
        <Hinweis ton="fehler">{tv.hindernisse(hindernisse.map((h) => serverText(h, sprache)).join(", "))}</Hinweis>
        <Knopf onClick={fertig}>{t.allgemein.schliessen}</Knopf>
      </div>
    );
  }
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        kennzeichnen.mutate({ id: s.id, name, anzahl: werden.length + kopien.length, kopien: kopien.length > 0 });
      }}
    >
      {werden.length > 0 && (
        <>
          <p>{werden.length === 1 ? tv.werdenEiner : tv.werdenMehrere(werden.length)}</p>
          <ul className="max-h-48 list-disc overflow-y-auto rounded border border-linie py-2 pl-8">{werden.map((n, i) => <li key={i}>{n}</li>)}</ul>
        </>
      )}
      {kopien.length > 0 && (
        <>
          <p>{kopien.length === 1 ? tv.kopienEiner : tv.kopienMehrere(kopien.length)}</p>
          <ul className="max-h-48 list-disc overflow-y-auto rounded border border-linie py-2 pl-8">{kopien.map((n, i) => <li key={i}>{n}</li>)}</ul>
        </>
      )}
      {!werden.length && !kopien.length && <p>{tv.keineMeldungen}</p>}
      <p className="text-grau">{tv.nichtRueckgaengig}</p>
      <Feld label={tv.namenEintippen} hinweis={tv.inAnfuehrung(s.name)}>
        {(id) => <Eingabe id={id} value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />}
      </Feld>
      {kennzeichnen.error && <Hinweis ton="fehler">{fehlerText(kennzeichnen.error)}</Hinweis>}
      <Knopf type="submit" variante="gefahr" disabled={name.trim() !== s.name.trim()} laedt={kennzeichnen.isPending}>
        {tv.endgueltigTestschau}
      </Knopf>
    </form>
  );
}

/** Testschau: Demodaten neu einspielen (alles Bisherige der Testschau wird ersetzt, Einstellungen bleiben). */
export function Demodaten({ schau: s }: { schau: Schau }) {
  const tv = useOberflaeche().schau.einstellungen.verwalten;
  const utils = trpc.useUtils();
  const meldung = useMeldung();
  const navigate = useNavigate();
  const [offen, setOffen] = useState(false);
  const [name, setName] = useState("");
  const neu = trpc.schau.demodatenNeu.useMutation({
    // Auch bei einem Fehler: Das Zurücksetzen kann schon gelöscht haben.
    onError: () => utils.invalidate(),
    onSuccess: async (r) => {
      await utils.invalidate();
      setOffen(false);
      setName("");
      meldung(tv.demoNeuGemeldet(r.ok ? tv.demoZahlen(r.meldungen, r.tiere) : ""));
      navigate(`/schau/${s.id}`);
    },
  });
  return (
    <Abschnitt titel={tv.demodaten}>
      <Knopf variante="zweit" onClick={() => setOffen(true)}>
        {tv.demoNeuPunkte}
      </Knopf>
      <Dialog offen={offen} onSchliessen={() => !neu.isPending && setOffen(false)} titel={tv.demoNeu}>
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            neu.mutate({ id: s.id, name });
          }}
        >
          <p>{tv.demoText(s.name)}</p>
          <Feld label={tv.namenEintippen} hinweis={tv.inAnfuehrung(s.name)}>
            {(id) => <Eingabe id={id} value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />}
          </Feld>
          {neu.error && <Hinweis ton="fehler">{fehlerText(neu.error)}</Hinweis>}
          <Knopf type="submit" variante="gefahr" disabled={name.trim() !== s.name.trim()} laedt={neu.isPending}>
            {neu.isPending ? tv.demoLaeuft : tv.demoNeu}
          </Knopf>
        </form>
      </Dialog>
    </Abschnitt>
  );
}
