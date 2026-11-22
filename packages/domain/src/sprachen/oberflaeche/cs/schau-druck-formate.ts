import type { OberflaecheTexte } from "..";

export const druckFormate: OberflaecheTexte["schau"]["einstellungen"]["druck"]["formate"] = {
  gespeichert: "Formát uložen.",
  hilfe: "Nápověda k tiskovým formátům",
  drucksache: "Tiskovina",
  format: "Formát",
  einstellung: "Nastavení",
  nurAnsehen: "Formáty mění jen administrátoři.",
  fest: "pevný",
  katalogGestalten: "Upravit katalog",
  hoch: "na výšku",
  quer: "na šířku",
  din5008: "DIN 5008",
  amtlich: "úřední vzor",
  formatWahl: "Vybrat formát",
  katalog: {
    A5: "A5 na výšku (brožura)",
    A4: "A4 na výšku",
  },
  sachen: {
    aBogen: "Formulář A (přihláška)",
    bBogen: "Formulář B s kartami kroužků",
    katalog: "Katalog",
    bewertungskarten: "Posudkové listy",
    bewertungsliste: "Seznam k posuzování",
    verpflichtung: "Závazek posuzovatele",
    preisverteilung: "Rozdělení cen",
    meisterschaften: "Mistrovství",
    kaufbeleg: "Doklad o koupi s výdejkou",
    kassenbeleg: "Pokladní doklady a potvrzení daru",
    kassenbericht: "Pokladní zpráva",
    abrechnung: "Vyúčtování a stvrzenka",
    abrechnungListe: "Vyúčtování všech vystavovatelů",
    zuwendung: "Potvrzení o daru",
    serienbrief: "Hromadný dopis",
    amtslisten: "Seznamy pro veterinární úřad",
    hallenplan: "Plán haly",
    aufbauliste: "Seznam pro stavbu",
  },
  wahl: {
    bewertungsliste: {
      A4: "A4 na výšku, dva seznamy vedle sebe",
      A5: "A5 na výšku, jeden seznam na stránku",
    },
    hallenplan: {
      A4: "A4, jeden list",
      A3: "A3, jeden list",
    },
    kaufbeleg: {
      A5: "A5 na šířku",
      A4: "A4 na výšku, doklad nahoře s linkou střihu",
    },
    kassenbeleg: {
      A5: "A5 na šířku",
      A4: "A4 na výšku, doklad nahoře s linkou střihu",
    },
  },
};
