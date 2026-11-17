import type { OberflaecheTexte } from "..";

type T = OberflaecheTexte["serverKasse"];

export const kasse: T["kasse"] = {
  abgeschlossenKorrektur: "Výstava je uzavřena – pro opravy se nejprve s udáním důvodu vraťte k vyúčtování.",
  abgerechnetReklamation: (nr: string) =>
    `Vystavovatel je již vyúčtován (stvrzenka ${nr}). Jako reklamace jen vedením výstavy s udáním důvodu – rozdíl se pak objeví jako diference.`,
  abgerechnetGesperrt: (nr: string) => `Vystavovatel je již vyúčtován (stvrzenka ${nr}). Prodej, storno a ceny jsou poté zablokovány.`,
  inSepaDatei: "Vystavovatel je v otevřeném souboru SEPA. Nejprve soubor zaúčtujte nebo zahoďte.",
  lastschriftOffen: "Přihlašovací poplatek je v otevřeném souboru inkasa – nejprve zaúčtujte nebo zahoďte.",
  kassenbestand: (soll: string, danach: string) => `Podle pokladní knihy je v pokladně jen ${soll} € – potom by to bylo ${danach} €.`,
  kassenbestandHolen: (text: string) => `${text} Zkontrolujte prosím částku nebo zavolejte vedení výstavy.`,
  kassenbestandTrotzdem: (text: string) => `${text} Přesto zaúčtovat?`,
};

export const auszahlung: T["auszahlung"] = {
  abPhaseSchau: "Vyplácí se od fáze „Výstava“. Vrácení přihlašovacích poplatků předtím účtujte u přihlášky.",
  ueberweisungNurAL: "Převody účtuje vedení výstavy (administrátoři).",
  bereitsAbgerechnet: (nr: string) => `Již vyúčtováno (stvrzenka ${nr}).`,
  ibanFehlt: "Pro převod chybí IBAN vystavovatele – doplňte ho prosím u přihlášky nebo vyplaťte v hotovosti.",
  betragGeaendert: (jetzt: string, vorher: string) => `Částka se změnila: nyní ${jetzt} místo ${vorher}. Načtěte prosím stránku znovu a zkontrolujte.`,
  nachzahlungNurAL: "Doplatky a vratky účtuje vedení výstavy (administrátoři).",
  rueckforderungEingang: "Vratku převodem účtujte až poté, co peníze dorazí na účet spolku.",
  auszahlungFehlt: "Výplata nenalezena.",
  quittungStorniert: (nr: string) => `Stvrzenka ${nr} je již stornována.`,
  spaetereQuittung: (nr: string) => `Nejprve stornujte pozdější stvrzenku ${nr}.`,
};

export const kassenbuch: T["kassenbuch"] = {
  abgeschlossen: "Výstava je uzavřena – žádné další pokladní záznamy.",
  zweck: "U výběru prosím uveďte účel (např. „Vklad do banky“).",
  entnahmeNurAL: "Výběry účtuje vedení výstavy (administrátoři).",
  kuenftig: "Denní uzávěrka pro budoucí den není možná.",
  schonAbgeschlossen: (datum: string) => `Pokladní den ${datum} je již uzavřen (od té doby žádný hotovostní záznam).`,
  spaeterAbgeschlossen: "Pozdější pokladní den je již uzavřen.",
  erstAbschliessen: (datum: string) => `Nejprve uzavřete pokladní den ${datum}.`,
  keineBewegung: "V tento den nebyl žádný pohyb hotovosti.",
  differenz: (ist: string, soll: string) => `Napočítáno ${ist} €, mělo být ${soll} € – vysvětlete prosím rozdíl.`,
};

export const sepa: T["sepa"] = {
  ausfuehrungVergangen: "Datum provedení je v minulosti.",
  phaseAbrechnung: "Soubor SEPA patří do fáze „Vyúčtování“ (po výstavě).",
  vereinskonto: "Nejprve prosím zadejte účet spolku v nastavení.",
  schonOffen: "Již existuje otevřený soubor SEPA. Nejprve ho zaúčtujte nebo zahoďte.",
  lastschriftOffen: "Existuje otevřený soubor inkasa. Nejprve ho zaúčtujte nebo zahoďte, potom převody.",
  keineOffenen: "Žádné čekající převody.",
  nichtMehrOffen: "Tento soubor SEPA již není otevřený.",
  keineOffenenErstellen: "Žádné čekající převody. Nejprve prosím vytvořte soubor SEPA.",
  auswahlWeicht: "Výběr se liší od souboru SEPA.",
  keineUeberweisungen: "Žádné převody.",
  vereinskontoName: "Účet spolku",
  betragPositiv: (name: string) => `Částka pro ${name} musí být kladná.`,
  ausserhalbEwr: (name: string) => `${name}: účet mimo EHP – vyplaťte prosím v hotovosti nebo převeďte jednotlivě.`,
  ibanZeichen: (name: string) => `${name}: IBAN je neúplný nebo obsahuje neplatné znaky.`,
  ibanLaenge: (name: string, land: string, soll: string, ist: string) => `${name}: IBAN ze země ${land} má ${soll} znaků, tento má ${ist}.`,
  ibanPruefziffer: (name: string) => `${name}: Kontrolní číslice IBAN nesouhlasí – zkontrolujte prosím překlepy.`,
};

export const verkauf: T["verkauf"] = {
  nurAL: "Prodej kartou nebo převodem jen vedením výstavy (jinak by byl výnos připraven k výplatě bez potvrzeného příjmu peněz).",
  phase: "Prodej až po posuzování, dokud výstava probíhá (fáze „Ceny“ nebo „Výstava“).",
  registriernummer: (hinweis: string) => `Registrační číslo kupujícího je neplatné: ${hinweis}.`,
  registriernummerHinweis: "12 číslic, např. 276 06 535 012 0001 (kód země 276 může chybět); zahraniční čísla s kódem země, např. NL …",
  unter16: "Kupující mladší 16 let: jen se souhlasem zákonného zástupce (§ 11c TierSchG) – uveďte prosím jeho jméno.",
  nichtVerkaeuflich: "Toto zvíře nebylo přihlášeno k prodeji.",
  nichtInHalle: "Zvíře není v hale (nepřijato nebo již vydáno).",
  nichtBewertet: "Zvíře ještě není posouzeno – prodává se až po posuzování.",
  gesperrt: "Zvíře je zablokováno ve zdravotním deníku (nemocné, podezřelé nebo uhynulé) a nesmí být předáno.",
  bereitsVerkauft: (beleg: string) => `Již prodáno (doklad ${beleg}).`,
  verkaufFehlt: "Prodej nenalezen.",
  schonStorniert: "Tento prodej je již stornován.",
  storniert: "Prodej je stornován.",
  nurUeberweisung: "Příjem platby potřebují jen prodeje převodem.",
  eingangGebucht: (beleg: string) => `Příjem platby k dokladu ${beleg} je již zaúčtován.`,
};
