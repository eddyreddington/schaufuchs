/** Seite eines Benutzers (für Administratoren): Angaben, Zugang, Passwort neu setzen, Zwei-Faktor zurücksetzen. */
import { useRef, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { datum, datumZeit, fehlerText } from "../lib";
import { trpc } from "../trpc";
import { Abschnitt, Auswahl, Eingabe, Feld, Haken, Hinweis, Knopf, Marke, Speicherleiste, useFrage, useMeldung } from "../ui";
import { einladungAbgelaufen, ROLLE, useNeuLaden, type Einzel } from "./benutzer-teile";

export function Angaben({ b, selbst }: { b: Einzel; selbst: boolean }) {
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
      meldung(gesendet ? `Gespeichert. ${b.einladungOffen ? "Die neue Einladung" : "Die Willkommensmail"} ist an ${email.trim().toLowerCase()} unterwegs.` : "Gespeichert.");
    } catch {
      /* Fehler steht im Formular */
    }
  };
  const fehler = speichern.error ?? rolleSetzen.error;
  const formular = useRef<HTMLFormElement>(null);
  return (
    <Abschnitt titel="Angaben">
      <form ref={formular} onSubmit={senden} className="flex flex-col gap-4">
        <Feld label="Name">{(id) => <Eingabe id={id} value={name} onChange={(e) => setName(e.target.value)} required minLength={2} />}</Feld>
        <Feld label="E-Mail-Adresse" hinweis="Zum Anmelden, gilt sofort">
          {(id) => <Eingabe id={id} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />}
        </Feld>
        <Feld label="Rolle" hinweis={selbst ? "Die eigene Rolle ändert ein anderer Administrator." : undefined}>
          {(id) => (
            <Auswahl id={id} value={rolle} disabled={selbst} onChange={(e) => setRolle(e.target.value as typeof rolle)}>
              <option value="mitarbeiter">{ROLLE.mitarbeiter}</option>
              <option value="admin">{ROLLE.admin}</option>
            </Auswahl>
          )}
        </Feld>
        {b.aktiv && angabenGeaendert && (
          <Haken
            label={b.einladungOffen ? "Neue Einladung schicken" : "Willkommensmail neu schicken"}
            checked={mitMail}
            onChange={setMailWahl}
            hinweis={b.einladungOffen ? "Der alte Link wird ungültig" : "Ohne Passwort"}
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
  const { bestaetige } = useFrage();
  const neu = useNeuLaden();
  const meldung = useMeldung();
  const fertig = (text: string) => ({ onSuccess: async () => { await neu(); meldung(text); }, onError: (e: { message: string }) => meldung(fehlerText(e), "fehler") });
  const aktiv = trpc.auth.benutzerAktiv.useMutation(fertig(b.aktiv ? "Gesperrt und auf allen Geräten abgemeldet." : "Entsperrt."));
  const entsperren = trpc.auth.sperreAufheben.useMutation(fertig("Wartezeit und Sperre nach Fehlversuchen aufgehoben."));
  const navigate = useNavigate();
  const loeschen = trpc.auth.benutzerLoeschen.useMutation({
    onSuccess: async (r) => {
      await neu();
      meldung(r.ganz ? `${b.name} gelöscht.` : `${b.name} entfernt. Anmeldung, E-Mail, Passwort und 2FA sind gelöscht; der Name bleibt in Protokoll und Kasse sichtbar.`);
      navigate("/benutzer");
    },
    onError: (e) => meldung(fehlerText(e), "fehler"),
  });
  const willkommen = trpc.auth.benutzerWillkommen.useMutation({
    onSuccess: async (r) => {
      await neu();
      meldung(r.einladung ? `Neue Einladung an ${r.an} ist unterwegs. Der alte Link gilt nicht mehr.` : `Willkommensmail an ${r.an} ist unterwegs.`);
    },
    onError: (e) => meldung(fehlerText(e), "fehler"),
  });
  const abmelden = trpc.auth.benutzerAbmelden.useMutation({
    onSuccess: async (r) => { await neu(); meldung(`${r.abgemeldet} Gerät${r.abgemeldet === 1 ? "" : "e"} abgemeldet.`); },
    onError: (e) => meldung(fehlerText(e), "fehler"),
  });
  return (
    <Abschnitt titel="Zugang">
      <dl className="mb-5 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2">
        <dt className="text-grau">Status</dt>
        <dd>
          {!b.aktiv
            ? "gesperrt – Anmeldung nicht möglich"
            : b.einladungOffen
              ? einladungAbgelaufen(b)
                ? "Einladung abgelaufen – bitte neu senden"
                : `eingeladen, Link gilt bis ${datumZeit(b.einladungBis)}`
              : "aktiv"}
        </dd>
        <dt className="text-grau">Zuletzt angemeldet</dt>
        <dd>{b.zuletzt ? datumZeit(b.zuletzt) : "noch nie"}</dd>
        <dt className="text-grau">Angemeldete Geräte</dt>
        <dd>{b.geraete}</dd>
        {b.wartet && (
          <>
            <dt className="text-grau">Fehlversuche</dt>
            <dd className="text-kamm">Wartezeit läuft</dd>
          </>
        )}
      </dl>
      <div className="flex flex-wrap gap-2">
        {b.geraete > (selbst ? 1 : 0) && (
          <Knopf onClick={async () => (await bestaetige({ titel: selbst ? "Alle anderen Geräte abmelden?" : `${b.name} auf allen Geräten abmelden?`, knopf: "Abmelden" })) && abmelden.mutate({ id: b.id })} laedt={abmelden.isPending}>
            {selbst ? "Andere Geräte abmelden" : "Auf allen Geräten abmelden"}
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
                {b.einladungOffen ? "Neue Einladung senden" : "Willkommensmail erneut senden"}
              </Knopf>
            )}
            <Knopf onClick={() => entsperren.mutate({ id: b.id })} laedt={entsperren.isPending}>
              Sperre nach Fehlversuchen aufheben
            </Knopf>
            <Knopf
              variante={b.aktiv ? "leise" : "primaer"}
              onClick={async () =>
                (!b.aktiv || (await bestaetige({ titel: `${b.name} sperren?`, text: "Alle Geräte werden abgemeldet, eine Anmeldung ist bis zum Entsperren nicht möglich.", knopf: "Sperren", gefahr: true }))) &&
                aktiv.mutate({ id: b.id, aktiv: !b.aktiv })
              }
              laedt={aktiv.isPending}
            >
              {b.aktiv ? "Benutzer sperren" : "Benutzer entsperren"}
            </Knopf>
            <Knopf
              variante="gefahr"
              onClick={async () =>
                (await bestaetige({
                  titel: `${b.name} löschen?`,
                  text: "Der Zugang wird endgültig gelöscht, ein schon erfasster Name bleibt in Protokoll und Kasse.",
                  knopf: "Löschen",
                  gefahr: true,
                })) && loeschen.mutate({ id: b.id })
              }
              laedt={loeschen.isPending}
            >
              Benutzer löschen
            </Knopf>
          </>
        )}
      </div>
    </Abschnitt>
  );
}

export function PasswortNeu({ b }: { b: Einzel }) {
  const [passwort, setPasswort] = useState("");
  const neu = useNeuLaden();
  const meldung = useMeldung();
  const setzen = trpc.auth.benutzerPasswortSetzen.useMutation({
    onSuccess: async () => {
      setPasswort("");
      await neu();
      meldung(`Neues Passwort gesetzt. ${b.name} ist auf allen Geräten abgemeldet und bekommt eine Hinweismail ohne Passwort.`);
    },
  });
  return (
    <Abschnitt titel="Passwort">
      <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); setzen.mutate({ id: b.id, passwort }); }}>
        <Feld label="Neues Passwort" hinweis="Mindestens 10 Zeichen">
          {(id) => <Eingabe id={id} type="text" value={passwort} onChange={(e) => setPasswort(e.target.value)} required minLength={10} autoComplete="off" />}
        </Feld>
        {setzen.error && <Hinweis ton="fehler">{fehlerText(setzen.error)}</Hinweis>}
        <div><Knopf type="submit" laedt={setzen.isPending}>Neues Passwort setzen</Knopf></div>
      </form>
    </Abschnitt>
  );
}

export function ZweiFaktorFremd({ b }: { b: Einzel }) {
  const { bestaetige } = useFrage();
  const neu = useNeuLaden();
  const meldung = useMeldung();
  const zurueck = trpc.auth.zweiFaktorZuruecksetzen.useMutation({ onSuccess: async () => { await neu(); meldung("Zwei-Faktor-Anmeldung zurückgesetzt."); }, onError: (e) => meldung(fehlerText(e), "fehler") });
  return (
    <Abschnitt titel="Zwei-Faktor-Anmeldung">
      {b.zweiFaktor ? (
        <div className="flex flex-col gap-4">
          <p>
            <Marke ton="ok">eingerichtet</Marke>
            <span className="ml-2 text-grau">seit {b.zweiFaktorSeit ? datum(b.zweiFaktorSeit) : "–"}, noch {b.notfallUebrig} Notfallcode{b.notfallUebrig === 1 ? "" : "s"}</span>
          </p>
          <div>
            <Knopf onClick={async () => (await bestaetige({ titel: `Zwei-Faktor-Anmeldung für ${b.name} zurücksetzen?`, knopf: "Zurücksetzen", gefahr: true })) && zurueck.mutate({ id: b.id })} laedt={zurueck.isPending}>
              Zwei-Faktor-Anmeldung zurücksetzen
            </Knopf>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <p><Marke ton="neutral">nicht eingerichtet</Marke></p>
          <p className="text-sm text-grau">Einrichten kann nur die Person selbst.</p>
        </div>
      )}
    </Abschnitt>
  );
}
