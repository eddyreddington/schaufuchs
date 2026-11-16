/** Seite eines Benutzers (für Administratoren): Angaben, Zugang, Passwort neu setzen, Zwei-Faktor zurücksetzen. */
import { useRef, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { datum, datumZeit, fehlerText } from "../lib";
import { useOberflaeche } from "../sprache";
import { trpc } from "../trpc";
import { Abschnitt, Auswahl, Eingabe, Feld, Haken, Hinweis, Knopf, Marke, Speicherleiste, useFrage, useMeldung } from "../ui";
import { einladungAbgelaufen, useNeuLaden, type Einzel } from "./benutzer-teile";

export function Angaben({ b, selbst }: { b: Einzel; selbst: boolean }) {
  const o = useOberflaeche();
  const b0 = o.verein.benutzer;
  const t = b0.angaben;
  const [name, setName] = useState(b.name);
  const [email, setEmail] = useState(b.email);
  const [rolle, setRolle] = useState(b.rolle);
  // null = noch nicht angefasst: bei geänderter Adresse vorbelegt, sonst aus.
  const [mailWahl, setMailWahl] = useState<boolean | null>(null);
  const neu = useNeuLaden();
  const meldung = useMeldung();
  const speichern = trpc.auth.benutzerSpeichern.useMutation();
  const rolleSetzen = trpc.auth.benutzerRolle.useMutation();
  const geaendert = name !== b.name || email !== b.email || rolle !== b.rolle;
  const angabenGeaendert = name.trim() !== b.name || email.trim().toLowerCase() !== b.email;
  const mitMail = b.aktiv && angabenGeaendert && (mailWahl ?? email.trim().toLowerCase() !== b.email);
  const senden = async (e: FormEvent) => {
    e.preventDefault();
    try {
      let gesendet = false;
      if (name !== b.name || email !== b.email) gesendet = (await speichern.mutateAsync({ id: b.id, name, email, willkommensmail: mitMail })).willkommensmail;
      if (rolle !== b.rolle) await rolleSetzen.mutateAsync({ id: b.id, rolle });
      await neu();
      setMailWahl(null);
      const an = email.trim().toLowerCase();
      meldung(gesendet ? (b.einladungOffen ? t.gespeichertEinladung(an) : t.gespeichertWillkommen(an)) : o.allgemein.gespeichert);
    } catch {
      /* Fehler steht im Formular */
    }
  };
  const fehler = speichern.error ?? rolleSetzen.error;
  const formular = useRef<HTMLFormElement>(null);
  return (
    <Abschnitt titel={t.titel}>
      <form ref={formular} onSubmit={senden} className="flex flex-col gap-4">
        <Feld label={o.allgemein.name}>{(id) => <Eingabe id={id} value={name} onChange={(e) => setName(e.target.value)} required minLength={2} />}</Feld>
        <Feld label={b0.email} hinweis={t.emailHinweis}>
          {(id) => <Eingabe id={id} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />}
        </Feld>
        <Feld label={b0.rolleSpalte} hinweis={selbst ? t.eigeneRolle : undefined}>
          {(id) => (
            <Auswahl id={id} value={rolle} disabled={selbst} onChange={(e) => setRolle(e.target.value as typeof rolle)}>
              <option value="mitarbeiter">{b0.rolle.mitarbeiter}</option>
              <option value="admin">{b0.rolle.admin}</option>
            </Auswahl>
          )}
        </Feld>
        {b.aktiv && angabenGeaendert && (
          <Haken
            label={b.einladungOffen ? t.neueEinladung : t.willkommenNeu}
            checked={mitMail}
            onChange={setMailWahl}
            hinweis={b.einladungOffen ? t.alterLinkUngueltig : t.ohnePasswort}
          />
        )}
        {fehler && <Hinweis ton="fehler">{fehlerText(fehler)}</Hinweis>}
        <Speicherleiste
          sichtbar={geaendert}
          onVerwerfen={() => {
            setName(b.name);
            setEmail(b.email);
            setRolle(b.rolle);
          }}
          onSpeichern={() => formular.current?.requestSubmit()}
          laedt={speichern.isPending || rolleSetzen.isPending}
        />
      </form>
    </Abschnitt>
  );
}

export function Zugang({ b, selbst }: { b: Einzel; selbst: boolean }) {
  const o = useOberflaeche();
  const b0 = o.verein.benutzer;
  const t = b0.zugangSeite;
  const { bestaetige } = useFrage();
  const neu = useNeuLaden();
  const meldung = useMeldung();
  const fertig = (text: string) => ({ onSuccess: async () => { await neu(); meldung(text); }, onError: (e: { message: string }) => meldung(fehlerText(e), "fehler") });
  const aktiv = trpc.auth.benutzerAktiv.useMutation(fertig(b.aktiv ? t.gesperrt : t.entsperrt));
  const entsperren = trpc.auth.sperreAufheben.useMutation(fertig(t.sperreAufgehoben));
  const navigate = useNavigate();
  const loeschen = trpc.auth.benutzerLoeschen.useMutation({
    onSuccess: async (r) => {
      await neu();
      meldung(r.ganz ? t.geloescht(b.name) : t.entfernt(b.name));
      navigate("/benutzer");
    },
    onError: (e) => meldung(fehlerText(e), "fehler"),
  });
  const willkommen = trpc.auth.benutzerWillkommen.useMutation({
    onSuccess: async (r) => {
      await neu();
      meldung(r.einladung ? t.neueEinladungUnterwegs(r.an) : t.willkommenUnterwegs(r.an));
    },
    onError: (e) => meldung(fehlerText(e), "fehler"),
  });
  const abmelden = trpc.auth.benutzerAbmelden.useMutation({
    onSuccess: async (r) => { await neu(); meldung(t.abgemeldet(r.abgemeldet)); },
    onError: (e) => meldung(fehlerText(e), "fehler"),
  });
  return (
    <Abschnitt titel={b0.zugang}>
      <dl className="mb-5 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2">
        <dt className="text-grau">{o.allgemein.status}</dt>
        <dd>
          {!b.aktiv
            ? t.statusGesperrt
            : b.einladungOffen
              ? einladungAbgelaufen(b)
                ? t.einladungAbgelaufen
                : t.eingeladenBis(datumZeit(b.einladungBis))
              : b0.aktiv}
        </dd>
        <dt className="text-grau">{b0.zuletzt}</dt>
        <dd>{b.zuletzt ? datumZeit(b.zuletzt) : b0.nochNie}</dd>
        <dt className="text-grau">{t.geraete}</dt>
        <dd>{b.geraete}</dd>
        {b.wartet && (
          <>
            <dt className="text-grau">{t.fehlversuche}</dt>
            <dd className="text-kamm">{t.wartezeitLaeuft}</dd>
          </>
        )}
      </dl>
      <div className="flex flex-wrap gap-2">
        {b.geraete > (selbst ? 1 : 0) && (
          <Knopf onClick={async () => (await bestaetige({ titel: selbst ? t.andereAbmeldenFrage : t.alleAbmeldenFrage(b.name), knopf: t.abmelden })) && abmelden.mutate({ id: b.id })} laedt={abmelden.isPending}>
            {selbst ? t.andereAbmelden : t.alleAbmelden}
          </Knopf>
        )}
        {!selbst && (
          <>
            {b.aktiv && (
              <Knopf
                variante={b.einladungOffen ? "primaer" : undefined}
                onClick={() => willkommen.mutate({ id: b.id })}
                laedt={willkommen.isPending}
              >
                {b.einladungOffen ? t.einladungSenden : t.willkommenErneut}
              </Knopf>
            )}
            <Knopf onClick={() => entsperren.mutate({ id: b.id })} laedt={entsperren.isPending}>
              {t.sperreAufheben}
            </Knopf>
            <Knopf
              variante={b.aktiv ? "leise" : "primaer"}
              onClick={async () =>
                (!b.aktiv || (await bestaetige({ titel: t.sperrenFrage(b.name), text: t.sperrenText, knopf: t.sperren, gefahr: true }))) &&
                aktiv.mutate({ id: b.id, aktiv: !b.aktiv })
              }
              laedt={aktiv.isPending}
            >
              {b.aktiv ? t.benutzerSperren : t.benutzerEntsperren}
            </Knopf>
            <Knopf
              variante="gefahr"
              onClick={async () =>
                (await bestaetige({
                  titel: t.loeschenFrage(b.name),
                  text: t.loeschenText,
                  knopf: o.allgemein.loeschen,
                  gefahr: true,
                })) && loeschen.mutate({ id: b.id })
              }
              laedt={loeschen.isPending}
            >
              {t.benutzerLoeschen}
            </Knopf>
          </>
        )}
      </div>
    </Abschnitt>
  );
}

export function PasswortNeu({ b }: { b: Einzel }) {
  const b0 = useOberflaeche().verein.benutzer;
  const t = b0.passwortNeu;
  const [passwort, setPasswort] = useState("");
  const neu = useNeuLaden();
  const meldung = useMeldung();
  const setzen = trpc.auth.benutzerPasswortSetzen.useMutation({
    onSuccess: async () => {
      setPasswort("");
      await neu();
      meldung(t.gesetzt(b.name));
    },
  });
  return (
    <Abschnitt titel={b0.passwort}>
      <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); setzen.mutate({ id: b.id, passwort }); }}>
        <Feld label={b0.neuesPasswort} hinweis={b0.mindestens10}>
          {(id) => <Eingabe id={id} type="text" value={passwort} onChange={(e) => setPasswort(e.target.value)} required minLength={10} autoComplete="off" />}
        </Feld>
        {setzen.error && <Hinweis ton="fehler">{fehlerText(setzen.error)}</Hinweis>}
        <div><Knopf type="submit" laedt={setzen.isPending}>{t.setzen}</Knopf></div>
      </form>
    </Abschnitt>
  );
}

export function ZweiFaktorFremd({ b }: { b: Einzel }) {
  const b0 = useOberflaeche().verein.benutzer;
  const t = b0.zweiFaktorFremd;
  const { bestaetige } = useFrage();
  const neu = useNeuLaden();
  const meldung = useMeldung();
  const zurueck = trpc.auth.zweiFaktorZuruecksetzen.useMutation({ onSuccess: async () => { await neu(); meldung(t.zurueckgesetzt); }, onError: (e) => meldung(fehlerText(e), "fehler") });
  return (
    <Abschnitt titel={b0.zweiFaktor}>
      {b.zweiFaktor ? (
        <div className="flex flex-col gap-4">
          <p>
            <Marke ton="ok">{t.eingerichtet}</Marke>
            <span className="ml-2 text-grau">{t.seit(b.zweiFaktorSeit ? datum(b.zweiFaktorSeit) : "–", b.notfallUebrig)}</span>
          </p>
          <div>
            <Knopf onClick={async () => (await bestaetige({ titel: t.zuruecksetzenFrage(b.name), knopf: t.zuruecksetzen, gefahr: true })) && zurueck.mutate({ id: b.id })} laedt={zurueck.isPending}>
              {t.zuruecksetzenKnopf}
            </Knopf>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <p><Marke ton="neutral">{b0.nichtEingerichtet}</Marke></p>
          <p className="text-sm text-grau">{t.nurSelbst}</p>
        </div>
      )}
    </Abschnitt>
  );
}
