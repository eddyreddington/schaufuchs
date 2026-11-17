import type { OberflaecheTexte } from "..";

export const serverSchauDatei: OberflaecheTexte["serverSchau"]["datei"] = {
  nurJson: "Tylko zapytania JSON.",
  zuVieleAnfragen: "Za dużo zapytań. Prosimy chwilę poczekać.",
  angabenUngueltig: "Nieprawidłowe dane.",
  empfaengerFehlen: "Brak odbiorców.",
  schauFehlt: "Brak wystawy.",
  keineSepaDatei: "Brak otwartego pliku SEPA. Prosimy najpierw utworzyć go w rozliczeniu.",
  abrufeSpaeter: "Za dużo zapytań. Prosimy spróbować później.",
  katalogNichtVeroeffentlicht: "Katalog nie został jeszcze opublikowany.",
  katalogOnline: (monate: string) => `Katalog jest dostępny w internecie tylko przez ${monate} miesięcy po wystawie.`,
  katalogWirdErzeugt: "Katalog jest właśnie tworzony na nowo. Prosimy spróbować ponownie za chwilę.",
  bestaetigungFehlt: "Nie znaleziono potwierdzenia darowizny.",
  abrechnungFehlt: "Nie znaleziono rozliczenia.",
  quittungFehlt: "Nie znaleziono pokwitowania.",
  kaufbelegFehlt: "Nie znaleziono dowodu sprzedaży.",
  belegFehlt: "Nie znaleziono dowodu.",
};
