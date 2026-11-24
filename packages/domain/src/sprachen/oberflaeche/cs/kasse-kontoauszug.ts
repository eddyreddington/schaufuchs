import type { OberflaecheTexte } from "..";
import { pocet } from "./kasse-abrechnung";

const platby = (n: number) => pocet(n, "platba", "platby", "plateb");

export const kontoauszug: OberflaecheTexte["kasse"]["kontoauszug"] = {
  titel: "Výpis z účtu",
  unter: "Přiřadit a zaúčtovat převody přihlašovacích poplatků",
  nichtGelesen: "Soubor se nepodařilo načíst.",
  zuGross: "Soubor je příliš velký (nejvýše 4 MB).",
  zahlungenGebucht: (n: number) => `${n === 1 ? "Zaúčtována" : n >= 2 && n <= 4 ? "Zaúčtovány" : "Zaúčtováno"} ${platby(n)}`,
  meldungenBestaetigt: (n: number) => `${n === 1 ? "Potvrzena" : n >= 2 && n <= 4 ? "Potvrzeny" : "Potvrzeno"} ${pocet(n, "přihláška", "přihlášky", "přihlášek")}`,
  nichtBestaetigt: (n: number) => `Nepotvrzené zaplacené přihlášky: ${n} – potvrďte ručně`,
  uebersprungen: (n: number, gruende: string) => `${n === 1 ? "Přeskočena" : n >= 2 && n <= 4 ? "Přeskočeny" : "Přeskočeno"} ${n} (${gruende})`,
  andereDatei: "Vybrat jiný soubor",
  dateiWaehlen: "Vybrat výpis z účtu (CSV nebo camt.053)",
  wirdGelesen: "načítá se …",
  keineGutschriften: "V tomto souboru nejsou žádné připsané platby v eurech",
  gutschriften: (n: number, gebucht: number) => `${pocet(n, "připsaná platba", "připsané platby", "připsaných plateb")} · ${gebucht} již zaúčtováno`,
  zahlungenBuchen: (n: number, summe: string) => `Zaúčtovat ${platby(n)} (${summe})`,
  keineAuswahl: "Zaúčtovat platby",
  datum: "Datum",
  betrag: "Částka",
  vonZweck: "Od / účel platby",
  meldung: "Přihláška",
  stand: "Stav",
  hakenLabel: (datum: string, betrag: string) => `Zaúčtovat připsanou platbu z ${datum} na ${betrag}`,
  meldungLabel: (datum: string, betrag: string) => `Přihláška pro připsanou platbu z ${datum} na ${betrag}`,
  nichtZuordnen: "– nepřiřazovat –",
  offen: (name: string, betrag: string) => `${name} · nezaplaceno ${betrag}`,
  gebucht: "zaúčtováno",
  teilzahlung: "Částečná platba",
  zuViel: "příliš mnoho",
  referenz: "Reference",
  vorschlag: "Návrh",
  vorschlagHinweis: "„Návrh“: bez reference, jen podle jména a částky – zkontrolujte a pak zaškrtněte.",
};
