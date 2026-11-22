import type { OberflaecheTexte } from "..";

export const druckFormate: OberflaecheTexte["schau"]["einstellungen"]["druck"]["formate"] = {
  gespeichert: "Format zapisany.",
  hilfe: "Pomoc: formaty wydruku",
  drucksache: "Druk",
  format: "Format",
  einstellung: "Ustawienie",
  nurAnsehen: "Tylko administratorzy zmieniają formaty.",
  fest: "stały",
  katalogGestalten: "Projekt katalogu",
  hoch: "pionowo",
  quer: "poziomo",
  din5008: "DIN 5008",
  amtlich: "wzór urzędowy",
  formatWahl: "Wybierz format",
  katalog: {
    A5: "A5 pionowo (broszura)",
    A4: "A4 pionowo",
  },
  sachen: {
    aBogen: "Formularz A (zgłoszenie)",
    bBogen: "Formularz B z kartami obrączek",
    katalog: "Katalog",
    bewertungskarten: "Karty oceny",
    bewertungsliste: "Lista ocen",
    verpflichtung: "Zobowiązanie sędziego",
    preisverteilung: "Podział nagród",
    meisterschaften: "Mistrzostwa",
    kaufbeleg: "Dowód zakupu z kwitem odbioru",
    kassenbeleg: "Dowody kasowe i pokwitowanie darowizny",
    kassenbericht: "Raport kasowy",
    abrechnung: "Rozliczenie i pokwitowanie",
    abrechnungListe: "Rozliczenie wszystkich wystawców",
    zuwendung: "Potwierdzenie darowizny",
    serienbrief: "List seryjny",
    amtslisten: "Listy dla urzędu weterynaryjnego",
    hallenplan: "Plan hali",
    aufbauliste: "Lista montażu",
  },
  wahl: {
    bewertungsliste: {
      A4: "A4 pionowo, dwie listy obok siebie",
      A5: "A5 pionowo, jedna lista na stronę",
    },
    hallenplan: {
      A4: "A4, jeden arkusz",
      A3: "A3, jeden arkusz",
    },
    kaufbeleg: {
      A5: "A5 poziomo",
      A4: "A4 pionowo, dowód u góry z linią cięcia",
    },
    kassenbeleg: {
      A5: "A5 poziomo",
      A4: "A4 pionowo, dowód u góry z linią cięcia",
    },
  },
};
