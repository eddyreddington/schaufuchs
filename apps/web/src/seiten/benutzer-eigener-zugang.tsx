/** Eigener Zugang: Passwort ändern und Zwei-Faktor-Anmeldung einrichten oder abschalten. */
import QRCode from "qrcode";
import { useState } from "react";
import { fehlerText } from "../lib";
import { trpc } from "../trpc";
import { Abschnitt, Eingabe, Feld, Hinweis, Knopf, Marke, useMeldung } from "../ui";

export function PasswortAendern() {
  const [alt, setAlt] = useState("");
  const [neu, setNeu] = useState("");
  const meldung = useMeldung();
  const aendern = trpc.auth.passwortAendern.useMutation({
    onSuccess: () => {
      meldung("Passwort geändert.");
      setAlt("");
      setNeu("");
    },
  });
  return (
    <Abschnitt titel="Eigenes Passwort ändern">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          aendern.mutate({ alt, neu });
        }}
        className="flex flex-col gap-3"
      >
        <Feld label="Bisheriges Passwort">{(id) => <Eingabe id={id} type="password" value={alt} onChange={(e) => setAlt(e.target.value)} required autoComplete="current-password" />}</Feld>
        <Feld label="Neues Passwort" hinweis="Mindestens 10 Zeichen">{(id) => <Eingabe id={id} type="password" value={neu} onChange={(e) => setNeu(e.target.value)} required minLength={10} autoComplete="new-password" />}</Feld>
        {aendern.error && <Hinweis ton="fehler">{fehlerText(aendern.error)}</Hinweis>}
        <div>
          <Knopf type="submit" laedt={aendern.isPending}>Passwort ändern</Knopf>
        </div>
      </form>
    </Abschnitt>
  );
}

/** Zwei-Faktor-Anmeldung einrichten (QR-Code für die Authenticator-App), Notfallcodes anzeigen, abschalten. */
export function ZweiFaktor() {
  const status = trpc.auth.zweiFaktorStatus.useQuery();
  const utils = trpc.useUtils();
  const meldung = useMeldung();
  const [passwort, setPasswort] = useState("");
  const [code, setCode] = useState("");
  const [einrichtung, setEinrichtung] = useState<{ geheim: string; adresse: string; qr: string } | null>(null);
  const [notfall, setNotfall] = useState<string[] | null>(null);
  const [abschalten, setAbschalten] = useState(false);
  const starten = trpc.auth.zweiFaktorEinrichten.useMutation({
    onSuccess: async (r) => {
      const qr = await QRCode.toDataURL(r.adresse, { margin: 1, width: 220 });
      setEinrichtung({ ...r, qr });
      setPasswort("");
    },
  });
  const bestaetigen = trpc.auth.zweiFaktorBestaetigen.useMutation({
    onSuccess: async (r) => {
      setNotfall(r.notfallcodes);
      setEinrichtung(null);
      setCode("");
      await utils.auth.zweiFaktorStatus.invalidate();
    },
  });
  const aus = trpc.auth.zweiFaktorAbschalten.useMutation({
    onSuccess: async () => {
      setAbschalten(false);
      setPasswort("");
      setCode("");
      await Promise.all([utils.auth.zweiFaktorStatus.invalidate(), utils.auth.status.invalidate()]);
      meldung("Zwei-Faktor-Anmeldung abgeschaltet.");
    },
  });
  const fehlerAnzeige = starten.error ?? bestaetigen.error ?? aus.error;
  return (
    <Abschnitt titel="Zwei-Faktor-Anmeldung">
      {notfall ? (
        <div className="flex flex-col gap-3">
          <Hinweis ton="ok">Eingerichtet.</Hinweis>
          <p>
            <span className="font-semibold">Notfallcodes</span> – jetzt sichern, sie werden nicht noch einmal angezeigt:
          </p>
          <ul className="nummer grid grid-cols-2 gap-1 rounded-md bg-papier p-3 text-lg">
            {notfall.map((c) => <li key={c}>{c}</li>)}
          </ul>
          <Knopf
            className="self-start"
            onClick={async () => {
              setNotfall(null);
              // Erst jetzt: bei der 2FA-Pflicht wechselt die Seite danach zur Verwaltung.
              await utils.auth.status.invalidate();
            }}
          >
            Habe ich gesichert
          </Knopf>
        </div>
      ) : status.data?.aktiv ? (
        <div className="flex flex-col gap-3">
          <p>
            <Marke ton="ok">aktiv</Marke> <span className="ml-1 text-grau">Noch {status.data.notfallUebrig} Notfallcode{status.data.notfallUebrig === 1 ? "" : "s"} übrig.</span>
          </p>
          {!abschalten ? (
            <Knopf variante="leise" className="self-start" onClick={() => setAbschalten(true)}>Abschalten …</Knopf>
          ) : (
            <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); aus.mutate({ passwort, code }); }}>
              <Feld label="Passwort">{(id) => <Eingabe id={id} type="password" value={passwort} onChange={(e) => setPasswort(e.target.value)} required autoComplete="current-password" />}</Feld>
              <Feld label="Code aus der App oder Notfallcode">{(id) => <Eingabe id={id} value={code} onChange={(e) => setCode(e.target.value)} required autoComplete="one-time-code" />}</Feld>
              <Knopf type="submit" variante="gefahr" className="self-start" laedt={aus.isPending}>Zwei-Faktor-Anmeldung abschalten</Knopf>
            </form>
          )}
        </div>
      ) : einrichtung ? (
        <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); bestaetigen.mutate({ code }); }}>
          <p>1. QR-Code mit der Authenticator-App scannen</p>
          <img src={einrichtung.qr} alt="QR-Code für die Authenticator-App" className="size-52 self-start rounded-md border border-linie bg-weiss p-1" />
          <p className="text-sm text-grau">
            Schlüssel zum Abtippen:
            <span className="nummer mt-1 block select-all text-base text-tinte">{einrichtung.geheim}</span>
          </p>
          <Feld label="2. Den angezeigten 6-stelligen Code eingeben">
            {(id) => <Eingabe id={id} value={code} onChange={(e) => setCode(e.target.value)} required autoComplete="one-time-code" inputMode="numeric" maxLength={7} className="nummer max-w-40 text-xl tracking-widest" />}
          </Feld>
          <div className="flex gap-2">
            <Knopf type="submit" variante="primaer" laedt={bestaetigen.isPending}>Bestätigen</Knopf>
            <Knopf variante="leise" onClick={() => { setEinrichtung(null); setCode(""); }}>Abbrechen</Knopf>
          </div>
        </form>
      ) : (
        <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); starten.mutate({ passwort }); }}>
          <p>
            <Marke>nicht eingerichtet</Marke>
          </p>
          <Feld label="Passwort zur Bestätigung">{(id) => <Eingabe id={id} type="password" value={passwort} onChange={(e) => setPasswort(e.target.value)} required autoComplete="current-password" />}</Feld>
          <Knopf type="submit" className="self-start" laedt={starten.isPending}>Einrichten</Knopf>
        </form>
      )}
      {fehlerAnzeige && <Hinweis ton="fehler" className="mt-3">{fehlerText(fehlerAnzeige)}</Hinweis>}
    </Abschnitt>
  );
}
