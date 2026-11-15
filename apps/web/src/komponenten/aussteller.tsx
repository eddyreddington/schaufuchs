import { kreisverbandZumVerein, ortZurPlz, type AdressVorschlaege } from "@schau/domain";
import { useId, useRef } from "react";
import { Eingabe, Feld } from "../ui";

export interface AusstellerDaten {
  vorname: string;
  nachname: string;
  strasse: string;
  plz: string;
  ort: string;
  telefon: string;
  email: string;
  verein: string;
  kreisverband: string;
  registriernummer: string;
  geburtsdatum: string | null;
  iban: string;
  kontoinhaber: string;
  /** Gekürzte hinterlegte IBAN, wenn der Benutzer die vollständige nicht sehen darf (Mitarbeiter). */
  ibanVerdeckt?: string;
}

export const leererAussteller = (): AusstellerDaten => ({
  vorname: "",
  nachname: "",
  strasse: "",
  plz: "",
  ort: "",
  telefon: "",
  email: "",
  verein: "",
  kreisverband: "",
  registriernummer: "",
  geburtsdatum: null,
  iban: "",
  kontoinhaber: "",
});

export function AusstellerFelder({
  a,
  setA,
  pflicht,
  vorschlaege,
}: {
  a: AusstellerDaten;
  setA: (a: AusstellerDaten) => void;
  pflicht?: boolean;
  /** Aus den eigenen Daten des Vereins (öffentlich nur Vereine und Kreisverbände). */
  vorschlaege?: Partial<AdressVorschlaege>;
}) {
  const listId = useId();
  const v = vorschlaege ?? {};
  const plz = a.plz.trim();
  const ortKey = a.ort.trim().toLocaleLowerCase("de");
  // Orte: zur eingegebenen PLZ zuerst passende; Straßen: im eingegebenen Ort bzw. der PLZ.
  const orte = [...new Set((v.orte ?? []).filter((o) => !plz || o.plz.startsWith(plz)).map((o) => o.ort))];
  const strassen = [
    ...new Set((v.strassen ?? []).filter((x) => (plz.length === 5 ? x.plz === plz : !ortKey || x.ort.toLocaleLowerCase("de") === ortKey)).map((x) => x.strasse)),
  ].slice(0, 200);
  const listen: Partial<Record<keyof AusstellerDaten, string[]>> = {
    ort: orte,
    strasse: strassen.map((x) => `${x} `),
    verein: (v.vereine ?? []).map((x) => x.verein),
    kreisverband: v.kreisverbaende ?? [],
  };
  /** Ort automatisch, sobald die PLZ vollständig ist und der Ort eindeutig bekannt und noch leer. */
  // Zuletzt automatisch eingetragene Werte: wird PLZ oder Verein korrigiert, darf der Vorschlag nachziehen – eigene
  // Eingaben bleiben unangetastet.
  const auto = useRef({ ort: "", kreisverband: "" });
  const aendern = (k: keyof AusstellerDaten, wert: string | null) => {
    const neu = { ...a, [k]: wert };
    if (k === "plz" && v.orte && (!a.ort.trim() || a.ort === auto.current.ort)) {
      neu.ort = ortZurPlz(wert ?? "", v.orte) ?? (a.ort === auto.current.ort ? "" : a.ort);
      auto.current.ort = neu.ort;
    }
    setA(neu);
  };
  /** Kreisverband erst beim Verlassen des Vereinsfelds – sonst träfe schon ein halb getippter Name („GZV Lich“ statt „GZV Lich-Nieder-Bessingen“). */
  const verlassen = (k: keyof AusstellerDaten) => {
    if (k === "verein" && v.vereine && (!a.kreisverband.trim() || a.kreisverband === auto.current.kreisverband)) {
      const kv = kreisverbandZumVerein(a.verein, v.vereine) ?? "";
      if (kv !== a.kreisverband) setA({ ...a, kreisverband: kv });
      auto.current.kreisverband = kv;
    }
  };
  const feld = (k: keyof AusstellerDaten, label: string, opts: { typ?: string; auto?: string; hinweis?: string; muss?: boolean; klasse?: string } = {}) => (
    <Feld label={`${label}${opts.muss ? " *" : ""}`} hinweis={opts.hinweis} className={opts.klasse}>
      {(id) => (
        <Eingabe
          id={id}
          type={opts.typ ?? "text"}
          autoComplete={listen[k]?.length ? "off" : opts.auto}
          list={listen[k]?.length ? `${listId}-${k}` : undefined}
          required={opts.muss}
          value={a[k] ?? ""}
          onChange={(e) => aendern(k, opts.typ === "date" && !e.target.value ? null : e.target.value)}
          onBlur={() => verlassen(k)}
        />
      )}
    </Feld>
  );
  return (
    // Spalten nach dem Platz im Formular (Container), nicht nach dem Bildschirm: daneben steht oft eine Seitenleiste.
    <div className="@container">
    <div className="grid gap-4 @md:grid-cols-2 @2xl:grid-cols-4">
      {feld("vorname", "Vorname", { auto: "given-name", muss: true })}
      {feld("nachname", "Nachname", { auto: "family-name", muss: true })}
      {feld("strasse", "Straße und Hausnummer", { auto: "street-address", klasse: "@md:col-span-2", muss: pflicht })}
      {feld("plz", "PLZ", { auto: "postal-code", muss: pflicht })}
      {feld("ort", "Ort", { auto: "address-level2", muss: pflicht })}
      {feld("telefon", "Telefon", { typ: "tel", auto: "tel" })}
      {feld("email", "E-Mail", { typ: "email", auto: "email", muss: pflicht })}
      {feld("verein", "Ortsverein", { muss: pflicht })}
      {feld("kreisverband", "Kreisverband")}
      {feld("registriernummer", "Registriernummer", { hinweis: "12 Ziffern, z. B. 276 06 535 012 0001", muss: pflicht, klasse: "@md:col-span-2" })}
      {feld("geburtsdatum", "Geburtsdatum (nur Jugend)", { typ: "date" })}
      {feld("iban", "IBAN für Preisgeld und Verkauf", {
        hinweis: a.ibanVerdeckt && !a.iban ? `Hinterlegt: ${a.ibanVerdeckt}, leer = unverändert` : "Freiwillig, sonst Barauszahlung",
        klasse: "@md:col-span-2",
        auto: "off",
      })}
      {feld("kontoinhaber", "Kontoinhaber, falls abweichend", { auto: "off" })}
      {Object.entries(listen).map(([k, werte]) =>
        werte.length ? (
          <datalist key={k} id={`${listId}-${k}`}>
            {werte.map((w) => (
              <option key={w} value={w} />
            ))}
          </datalist>
        ) : null,
      )}
    </div>
    </div>
  );
}
