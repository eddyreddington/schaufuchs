import type { OberflaecheTexte } from "..";
import { liczba } from "./kasse-abrechnung";

const platnosci = (n: number) => liczba(n, "płatność", "płatności", "płatności");

export const kontoauszug: OberflaecheTexte["kasse"]["kontoauszug"] = {
  titel: "Wyciąg bankowy",
  unter: "Przypisz i zaksięguj przelewy opłaty zgłoszeniowej",
  nichtGelesen: "Nie udało się odczytać pliku.",
  zuGross: "Plik jest za duży (najwyżej 4 MB).",
  zahlungenGebucht: (n: number) => `${platnosci(n)} ${n === 1 ? "zaksięgowana" : "zaksięgowano"}`,
  meldungenBestaetigt: (n: number) => `${liczba(n, "zgłoszenie", "zgłoszenia", "zgłoszeń")} ${n === 1 ? "potwierdzone" : "potwierdzono"}`,
  nichtBestaetigt: (n: number) => `Niepotwierdzone opłacone zgłoszenia: ${n} – potwierdź ręcznie`,
  uebersprungen: (n: number, gruende: string) => `${n} ${n === 1 ? "pominięta" : "pominięto"} (${gruende})`,
  andereDatei: "Wybierz inny plik",
  dateiWaehlen: "Wybierz wyciąg bankowy (CSV lub camt.053)",
  wirdGelesen: "trwa odczyt …",
  keineGutschriften: "Brak uznań w euro w tym pliku",
  gutschriften: (n: number, gebucht: number) => `${liczba(n, "uznanie", "uznania", "uznań")} · ${gebucht} już zaksięgowano`,
  zahlungenBuchen: (n: number, summe: string) => `Zaksięguj ${platnosci(n)} (${summe})`,
  keineAuswahl: "Zaksięguj płatności",
  datum: "Data",
  betrag: "Kwota",
  vonZweck: "Od / tytuł przelewu",
  meldung: "Zgłoszenie",
  stand: "Stan",
  hakenLabel: (datum: string, betrag: string) => `Zaksięguj uznanie z ${datum} na ${betrag}`,
  meldungLabel: (datum: string, betrag: string) => `Zgłoszenie dla uznania z ${datum} na ${betrag}`,
  nichtZuordnen: "– nie przypisuj –",
  offen: (name: string, betrag: string) => `${name} · do zapłaty ${betrag}`,
  gebucht: "zaksięgowano",
  teilzahlung: "Wpłata częściowa",
  zuViel: "za dużo",
  referenz: "Referencja",
  vorschlag: "Propozycja",
  vorschlagHinweis: "„Propozycja”: bez referencji, tylko według nazwiska i kwoty – proszę sprawdzić, a potem zaznaczyć.",
};
