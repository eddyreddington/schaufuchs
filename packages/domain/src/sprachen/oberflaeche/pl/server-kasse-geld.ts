import type { OberflaecheTexte } from "..";

type T = OberflaecheTexte["serverKasse"];

export const kasse: T["kasse"] = {
  abgeschlossenKorrektur: "Wystawa jest zamknięta – aby wprowadzić korekty, najpierw wrócić z podaniem powodu do rozliczenia.",
  abgerechnetReklamation: (nr: string) =>
    `Wystawca jest już rozliczony (pokwitowanie ${nr}). Jako reklamacja tylko przez kierownictwo wystawy z podaniem powodu – różnica pojawi się wtedy jako dopłata lub zwrot.`,
  abgerechnetGesperrt: (nr: string) => `Wystawca jest już rozliczony (pokwitowanie ${nr}). Sprzedaż, storno i nagrody są potem zablokowane.`,
  inSepaDatei: "Wystawca jest w otwartym pliku SEPA. Najpierw zaksięgować lub odrzucić plik.",
  lastschriftOffen: "Opłata zgłoszeniowa jest w otwartym pliku polecenia zapłaty – najpierw zaksięgować lub odrzucić.",
  kassenbestand: (soll: string, danach: string) => `Według księgi kasowej w kasie jest tylko ${soll} € – potem byłoby ${danach} €.`,
  kassenbestandHolen: (text: string) => `${text} Prosimy sprawdzić kwotę lub wezwać kierownictwo wystawy.`,
  kassenbestandTrotzdem: (text: string) => `${text} Zaksięgować mimo to?`,
};

export const auszahlung: T["auszahlung"] = {
  abPhaseSchau: "Wypłaty od etapu „Wystawa”. Zwroty opłaty zgłoszeniowej wcześniej księgować przy zgłoszeniu.",
  ueberweisungNurAL: "Przelewy księguje kierownictwo wystawy (administratorzy).",
  bereitsAbgerechnet: (nr: string) => `Już rozliczono (pokwitowanie ${nr}).`,
  ibanFehlt: "Do przelewu brakuje IBAN wystawcy – prosimy wpisać go przy zgłoszeniu lub wypłacić gotówką.",
  betragGeaendert: (jetzt: string, vorher: string) => `Kwota się zmieniła: teraz ${jetzt} zamiast ${vorher}. Prosimy odświeżyć stronę i sprawdzić.`,
  nachzahlungNurAL: "Dopłaty i zwroty należności księguje kierownictwo wystawy (administratorzy).",
  rueckforderungEingang: "Zwrot należności przelewem księgować dopiero, gdy pieniądze wpłyną na konto klubu.",
  auszahlungFehlt: "Nie znaleziono wypłaty.",
  quittungStorniert: (nr: string) => `Pokwitowanie ${nr} jest już anulowane.`,
  spaetereQuittung: (nr: string) => `Najpierw anulować późniejsze pokwitowanie ${nr}.`,
};

export const kassenbuch: T["kassenbuch"] = {
  abgeschlossen: "Wystawa jest zamknięta – nie ma już księgowań kasowych.",
  zweck: "Przy wypłacie z kasy prosimy podać cel (np. „Wpłata do banku”).",
  entnahmeNurAL: "Wypłaty z kasy księguje kierownictwo wystawy (administratorzy).",
  kuenftig: "Zamknięcie dnia dla przyszłego dnia nie jest możliwe.",
  schonAbgeschlossen: (datum: string) => `Dzień kasowy ${datum} jest już zamknięty (od tego czasu bez księgowania gotówkowego).`,
  spaeterAbgeschlossen: "Późniejszy dzień kasowy jest już zamknięty.",
  erstAbschliessen: (datum: string) => `Najpierw zamknąć dzień kasowy ${datum}.`,
  keineBewegung: "Tego dnia nie było ruchu gotówki.",
  differenz: (ist: string, soll: string) => `Policzono ${ist} €, powinno być ${soll} € – prosimy wyjaśnić różnicę.`,
};

export const sepa: T["sepa"] = {
  ausfuehrungVergangen: "Data wykonania leży w przeszłości.",
  phaseAbrechnung: "Plik SEPA należy do etapu „Rozliczenie” (po wystawie).",
  vereinskonto: "Prosimy najpierw wpisać konto klubu w ustawieniach.",
  schonOffen: "Istnieje już otwarty plik SEPA. Najpierw zaksięgować lub odrzucić.",
  lastschriftOffen: "Istnieje otwarty plik polecenia zapłaty. Najpierw zaksięgować lub odrzucić, potem przelewy.",
  keineOffenen: "Brak oczekujących przelewów.",
  nichtMehrOffen: "Ten plik SEPA nie jest już otwarty.",
  keineOffenenErstellen: "Brak oczekujących przelewów. Prosimy najpierw utworzyć plik SEPA.",
  auswahlWeicht: "Wybór różni się od pliku SEPA.",
  keineUeberweisungen: "Brak przelewów.",
  betragPositiv: (name: string) => `Kwota dla ${name} musi być dodatnia.`,
  ausserhalbEwr: (name: string) => `${name}: konto poza EOG – prosimy wypłacić gotówką lub zrobić osobny przelew.`,
  ibanZeichen: (name: string) => `${name}: IBAN jest niekompletny lub zawiera nieprawidłowe znaki.`,
  ibanLaenge: (name: string, land: string, soll: string, ist: string) => `${name}: IBAN z kraju ${land}: wymagana długość ${soll}, tutaj ${ist}.`,
  ibanPruefziffer: (name: string) => `${name}: Cyfry kontrolne IBAN się nie zgadzają – prosimy sprawdzić, czy nie ma literówki.`,
};

export const verkauf: T["verkauf"] = {
  nurAL: "Sprzedaż kartą lub przelewem tylko przez kierownictwo wystawy (inaczej przychód byłby gotowy do wypłaty bez potwierdzonego wpływu pieniędzy).",
  phase: "Sprzedaż dopiero po ocenie, dopóki trwa wystawa (etap „Nagrody” lub „Wystawa”).",
  registriernummer: (hinweis: string) => `Nieprawidłowy numer rejestracyjny kupującego: ${hinweis}.`,
  registriernummerHinweis: "12 cyfr, np. 276 06 535 012 0001 (kod kraju 276 można pominąć); numery zagraniczne z kodem kraju, np. NL …",
  unter16: "Kupujący poniżej 16 lat: tylko za zgodą opiekuna prawnego (§ 11c TierSchG) – prosimy podać jego nazwisko.",
  nichtVerkaeuflich: "To zwierzę nie zostało zgłoszone na sprzedaż.",
  nichtInHalle: "Zwierzęcia nie ma w hali (nie dostarczone lub już wydane).",
  nichtBewertet: "Zwierzę nie jest jeszcze ocenione – sprzedaż dopiero po ocenie.",
  gesperrt: "Zwierzę jest zablokowane w dzienniku zdrowia (chore, podejrzane lub padłe) i nie może zostać wydane.",
  bereitsVerkauft: (beleg: string) => `Już sprzedane (dowód ${beleg}).`,
  verkaufFehlt: "Nie znaleziono sprzedaży.",
  schonStorniert: "Ta sprzedaż jest już anulowana.",
  storniert: "Sprzedaż jest anulowana.",
  nurUeberweisung: "Tylko sprzedaż przelewem wymaga zaksięgowania wpłaty.",
  eingangGebucht: (beleg: string) => `Wpłata do dowodu ${beleg} jest już zaksięgowana.`,
};
