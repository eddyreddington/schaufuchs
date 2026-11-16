import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { fehlerText } from "../lib";
import { trpc, type Ausgabe } from "../trpc";
import { Abschnitt, Dialog, Eingabe, FehlerAnzeige, Feld, Hinweis, Knopf, Laden, useFrage, useMeldung } from "../ui";

/* Einstellungen der Schau, Abschnitte am Ende: Schau absagen, Schau löschen, als Testschau kennzeichnen, Demodaten. */

type Schau = Ausgabe["schau"]["get"];

/**
 * Schau absagen (z. B. Ausstellungsverbot wegen Tierseuche): bis vor der Einlieferung. Alle Meldungen werden storniert,
 * die Aussteller benachrichtigt; die Erstattungen stehen danach in der Abrechnung.
 */
export function SchauAbsagen({ schau: s }: { schau: Schau }) {
  const utils = trpc.useUtils();
  const meldung = useMeldung();
  const { eingabe } = useFrage();
  const absagen = trpc.schau.absagen.useMutation({
    onSuccess: (r) => {
      utils.schau.invalidate();
      meldung(`Abgesagt: ${r.storniert} Meldung(en) storniert, ${r.benachrichtigt} Aussteller per E-Mail benachrichtigt. Die Erstattungen stehen unter „Abrechnung“.`);
    },
    onError: (e) => meldung(fehlerText(e), "fehler"),
  });
  return (
    <Abschnitt titel="Schau absagen">
      <Knopf
        variante="gefahr"
        laedt={absagen.isPending}
        onClick={async () => {
          const g = await eingabe({ titel: `„${s.name}“ absagen`, text: "Das lässt sich nicht rückgängig machen: Alle Meldungen werden storniert und die Aussteller benachrichtigt.", feld: "Grund (steht in der E-Mail an die Aussteller)", mindestens: 3, knopf: "Schau absagen", gefahr: true });
          if (g) absagen.mutate({ id: s.id, grund: g });
        }}
      >
        Schau absagen …
      </Knopf>
    </Abschnitt>
  );
}

/**
 * Leere Schau löschen (z. B. eine zum Ausprobieren angelegte): nur in der Vorbereitung und ohne Meldungen – der Server
 * prüft das. Zur Sicherheit den Namen eintippen und einen Grund angeben (steht im Protokoll des Vereins).
 */
export function SchauLoeschen({ schau: s }: { schau: Schau }) {
  const navigate = useNavigate();
  const utils = trpc.useUtils();
  const meldung = useMeldung();
  const { eingabe } = useFrage();
  const loeschen = trpc.schau.loeschen.useMutation({
    onSuccess: async () => {
      await utils.schau.liste.invalidate();
      meldung(`Die Schau „${s.name}“ ist gelöscht.`);
      navigate("/");
    },
    onError: (e) => meldung(fehlerText(e), "fehler"),
  });
  const starten = async () => {
    const was = s.test ? "mit allen Meldungen, Test-Ausstellern, Bewertungen, Kasse und Belegen" : "mit allen Einstellungen, Preisrichtern und Katalogseiten";
    const name = await eingabe({
      titel: "Schau löschen",
      text: `Die Schau „${s.name}“ ${was} endgültig löschen?`,
      feld: "Zur Bestätigung bitte den Namen der Schau eintippen",
      einzeilig: true,
      knopf: "Weiter",
      gefahr: true,
    });
    if (name == null) return;
    if (name.trim() !== s.name.trim()) return meldung("Der Name stimmt nicht – nichts gelöscht.", "fehler");
    const grund = await eingabe({ titel: "Schau löschen", feld: "Grund für das Löschen (steht im Protokoll des Vereins)", mindestens: 3, knopf: "Endgültig löschen", gefahr: true });
    if (grund == null) return;
    loeschen.mutate({ id: s.id, name, grund });
  };
  return (
    <Abschnitt titel="Schau löschen">
      <Knopf variante="gefahr" laedt={loeschen.isPending} onClick={starten}>
        Schau löschen …
      </Knopf>
    </Abschnitt>
  );
}

/**
 * Bestehende Schau als Testschau kennzeichnen (z. B. eine zum Üben angelegte mit Demo-Meldungen). Der Server lehnt ab,
 * wenn darin echte Aussteller gemeldet sind, und nennt sie.
 */
export function AlsTestschau({ schau: s }: { schau: Schau }) {
  const [offen, setOffen] = useState(false);
  return (
    <Abschnitt titel="Testschau">
      <Knopf variante="zweit" onClick={() => setOffen(true)}>
        Als Testschau kennzeichnen …
      </Knopf>
      <Dialog offen={offen} onSchliessen={() => setOffen(false)} titel="Als Testschau kennzeichnen">
        {offen && <TestschauDialog schau={s} fertig={() => setOffen(false)} />}
      </Dialog>
    </Abschnitt>
  );
}

/** Zeigt vorher, wer Test-Aussteller wird (oder wer als echter Aussteller das Kennzeichnen verhindert). */
function TestschauDialog({ schau: s, fertig }: { schau: Schau; fertig: () => void }) {
  const utils = trpc.useUtils();
  const meldung = useMeldung();
  const vorschau = trpc.schau.testschauVorschau.useQuery({ id: s.id }, { staleTime: 0 });
  const [name, setName] = useState("");
  const kennzeichnen = trpc.schau.alsTestschau.useMutation({
    onSuccess: async (r) => {
      await Promise.all([utils.schau.invalidate(), utils.verein.invalidate(), utils.meldung.invalidate()]);
      meldung(`„${s.name}“ ist jetzt eine Testschau${r.aussteller ? ` – ${r.aussteller} Aussteller gehören nur noch zu ihr` : ""}${r.kopien ? `, ${r.kopien} Test-Kopien angelegt` : ""}.`);
      fertig();
    },
  });
  if (vorschau.error) return <FehlerAnzeige fehler={vorschau.error} nochmal={() => vorschau.refetch()} />;
  if (!vorschau.data) return <Laden />;
  const { werden, kopien, hindernisse } = vorschau.data;
  if (hindernisse.length) {
    return (
      <div className="flex flex-col gap-3">
        <Hinweis ton="fehler">
          Die Schau hat schon {hindernisse.join(", ")}. Das sind echte Aufzeichnungen – eine Testschau ließe sich samt allem löschen. Deshalb lässt sie sich nicht als
          Testschau kennzeichnen.
        </Hinweis>
        <Knopf onClick={fertig}>Schließen</Knopf>
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
          <p>
            {werden.length === 1 ? "Dieser Aussteller wird Test-Aussteller und verschwindet" : `Diese ${werden.length} Aussteller werden Test-Aussteller und verschwinden`} aus „Aussteller“
            und aus echten Schauen. Bitte prüfen, dass keine echte Person dabei ist:
          </p>
          <ul className="max-h-48 list-disc overflow-y-auto rounded border border-linie py-2 pl-8">{werden.map((n, i) => <li key={i}>{n}</li>)}</ul>
        </>
      )}
      {kopien.length > 0 && (
        <>
          <p>
            {kopien.length === 1 ? "Dieser echte Aussteller bleibt" : `Diese ${kopien.length} echten Aussteller bleiben`}, wie {kopien.length === 1 ? "er ist" : "sie sind"}. Seine bzw. ihre
            Meldungen in dieser Schau gehen auf eine Test-Kopie über, die nur Name und Verein trägt:
          </p>
          <ul className="max-h-48 list-disc overflow-y-auto rounded border border-linie py-2 pl-8">{kopien.map((n, i) => <li key={i}>{n}</li>)}</ul>
        </>
      )}
      {!werden.length && !kopien.length && <p>Die Schau hat noch keine Meldungen.</p>}
      <p className="text-grau">Das lässt sich nicht rückgängig machen.</p>
      <Feld label="Zur Bestätigung den Namen der Schau eintippen" hinweis={`„${s.name}“`}>
        {(id) => <Eingabe id={id} value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />}
      </Feld>
      {kennzeichnen.error && <Hinweis ton="fehler">{fehlerText(kennzeichnen.error)}</Hinweis>}
      <Knopf type="submit" variante="gefahr" disabled={name.trim() !== s.name.trim()} laedt={kennzeichnen.isPending}>
        Endgültig als Testschau kennzeichnen
      </Knopf>
    </form>
  );
}

/** Testschau: Demodaten neu einspielen (alles Bisherige der Testschau wird ersetzt, Einstellungen bleiben). */
export function Demodaten({ schau: s }: { schau: Schau }) {
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
      meldung(`Demodaten neu eingespielt: ${r.ok ? `${r.meldungen} Meldungen, ${r.tiere} Tiere` : ""}, Phase „Einlieferung“.`);
      navigate(`/schau/${s.id}`);
    },
  });
  return (
    <Abschnitt titel="Demodaten">
      <Knopf variante="zweit" onClick={() => setOffen(true)}>
        Demodaten neu einspielen …
      </Knopf>
      <Dialog offen={offen} onSchliessen={() => !neu.isPending && setOffen(false)} titel="Demodaten neu einspielen">
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            neu.mutate({ id: s.id, name });
          }}
        >
          <p>Alles, was bisher in „{s.name}“ gemeldet, bewertet, verkauft oder abgerechnet wurde, wird gelöscht und durch frische Demodaten ersetzt.</p>
          <Feld label="Zur Bestätigung den Namen der Schau eintippen" hinweis={`„${s.name}“`}>
            {(id) => <Eingabe id={id} value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />}
          </Feld>
          {neu.error && <Hinweis ton="fehler">{fehlerText(neu.error)}</Hinweis>}
          <Knopf type="submit" variante="gefahr" disabled={name.trim() !== s.name.trim()} laedt={neu.isPending}>
            {neu.isPending ? "Demodaten werden eingespielt …" : "Demodaten neu einspielen"}
          </Knopf>
        </form>
      </Dialog>
    </Abschnitt>
  );
}
