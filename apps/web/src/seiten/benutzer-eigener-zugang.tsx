/** Eigener Zugang: Passwort ändern und Zwei-Faktor-Anmeldung einrichten oder abschalten. */
import QRCode from "qrcode";
import { useState } from "react";
import { fehlerText } from "../lib";
import { useOberflaeche } from "../sprache";
import { trpc } from "../trpc";
import { Abschnitt, Eingabe, Feld, Hinweis, Knopf, Marke, useMeldung } from "../ui";

export function PasswortAendern() {
  const b0 = useOberflaeche().verein.benutzer;
  const t = b0.eigenesPasswort;
  const [alt, setAlt] = useState("");
  const [neu, setNeu] = useState("");
  const meldung = useMeldung();
  const aendern = trpc.auth.passwortAendern.useMutation({
    onSuccess: () => {
      meldung(t.geaendert);
      setAlt("");
      setNeu("");
    },
  });
  return (
    <Abschnitt titel={t.titel}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          aendern.mutate({ alt, neu });
        }}
        className="flex flex-col gap-3"
      >
        <Feld label={t.bisherig}>{(id) => <Eingabe id={id} type="password" value={alt} onChange={(e) => setAlt(e.target.value)} required autoComplete="current-password" />}</Feld>
        <Feld label={b0.neuesPasswort} hinweis={b0.mindestens10}>{(id) => <Eingabe id={id} type="password" value={neu} onChange={(e) => setNeu(e.target.value)} required minLength={10} autoComplete="new-password" />}</Feld>
        {aendern.error && <Hinweis ton="fehler">{fehlerText(aendern.error)}</Hinweis>}
        <div>
          <Knopf type="submit" laedt={aendern.isPending}>{t.aendern}</Knopf>
        </div>
      </form>
    </Abschnitt>
  );
}

/** Zwei-Faktor-Anmeldung einrichten (QR-Code für die Authenticator-App), Notfallcodes anzeigen, abschalten. */
export function ZweiFaktor() {
  const o = useOberflaeche();
  const b0 = o.verein.benutzer;
  const t = b0.eigeneZweiFaktor;
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
      meldung(t.abgeschaltet);
    },
  });
  const fehlerAnzeige = starten.error ?? bestaetigen.error ?? aus.error;
  return (
    <Abschnitt titel={b0.zweiFaktor}>
      {notfall ? (
        <div className="flex flex-col gap-3">
          <Hinweis ton="ok">{t.eingerichtet}</Hinweis>
          <p>
            <span className="font-semibold">{t.notfallcodes}</span>{t.sichern}
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
            {t.gesichert}
          </Knopf>
        </div>
      ) : status.data?.aktiv ? (
        <div className="flex flex-col gap-3">
          <p>
            <Marke ton="ok">{b0.aktiv}</Marke> <span className="ml-1 text-grau">{t.uebrig(status.data.notfallUebrig)}</span>
          </p>
          {!abschalten ? (
            <Knopf variante="leise" className="self-start" onClick={() => setAbschalten(true)}>{t.abschalten}</Knopf>
          ) : (
            <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); aus.mutate({ passwort, code }); }}>
              <Feld label={b0.passwort}>{(id) => <Eingabe id={id} type="password" value={passwort} onChange={(e) => setPasswort(e.target.value)} required autoComplete="current-password" />}</Feld>
              <Feld label={t.code}>{(id) => <Eingabe id={id} value={code} onChange={(e) => setCode(e.target.value)} required autoComplete="one-time-code" />}</Feld>
              <Knopf type="submit" variante="gefahr" className="self-start" laedt={aus.isPending}>{t.abschaltenKnopf}</Knopf>
            </form>
          )}
        </div>
      ) : einrichtung ? (
        <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); bestaetigen.mutate({ code }); }}>
          <p>{t.schritt1}</p>
          <img src={einrichtung.qr} alt={t.qrAlt} className="size-52 self-start rounded-md border border-linie bg-weiss p-1" />
          <p className="text-sm text-grau">
            {t.schluessel}
            <span className="nummer mt-1 block select-all text-base text-tinte">{einrichtung.geheim}</span>
          </p>
          <Feld label={t.schritt2}>
            {(id) => <Eingabe id={id} value={code} onChange={(e) => setCode(e.target.value)} required autoComplete="one-time-code" inputMode="numeric" maxLength={7} className="nummer max-w-40 text-xl tracking-widest" />}
          </Feld>
          <div className="flex gap-2">
            <Knopf type="submit" variante="primaer" laedt={bestaetigen.isPending}>{t.bestaetigen}</Knopf>
            <Knopf variante="leise" onClick={() => { setEinrichtung(null); setCode(""); }}>{o.allgemein.abbrechen}</Knopf>
          </div>
        </form>
      ) : (
        <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); starten.mutate({ passwort }); }}>
          <p>
            <Marke>{b0.nichtEingerichtet}</Marke>
          </p>
          <Feld label={t.passwortBestaetigung}>{(id) => <Eingabe id={id} type="password" value={passwort} onChange={(e) => setPasswort(e.target.value)} required autoComplete="current-password" />}</Feld>
          <Knopf type="submit" className="self-start" laedt={starten.isPending}>{t.einrichten}</Knopf>
        </form>
      )}
      {fehlerAnzeige && <Hinweis ton="fehler" className="mt-3">{fehlerText(fehlerAnzeige)}</Hinweis>}
    </Abschnitt>
  );
}
