import { describe, expect, test } from "bun:test";
import { istAuslaendisch, normalisiereRegistriernummer, noetigeNachweise, pruefeGeschlecht, pruefeNachweis, tierart } from "./tiergesundheit";
import { aufbewahrenBis, datenschutzAbschnitte, fehlendeVereinsangaben, impressumAbschnitte } from "./datenschutz";
import {
  berechneAbrechnung,
  berechneMeldebetrag,
  betragInWorten,
  bewertungsText,
  brauchtObmann,
  gruppenAbteilung,
  alterAm,
  istJugendlich,
  kontingent,
  nachmeldungsNummer,
  nachmeldungsNummern,
  parseEuro,
  parseStammdatenCsv,
  pruefeBesatz,
  standardBesatz,
  tierzahl,
  pruefeBewertung,
  provision,
  pruefeNotenaenderung,
  pruefeVergabe,
  vergebeKatalognummern,
  zerlegeZeile,
  type FolgeEintrag,
  type Gebuehr,
  type Preisart,
} from "./index";

describe("Geld", () => {
  test("parseEuro versteht deutsche Schreibweise", () => {
    expect(parseEuro("11,50")).toBe(1150);
    expect(parseEuro("1.234,5")).toBe(123450);
    expect(parseEuro("6")).toBe(600);
    expect(parseEuro("12.5")).toBe(1250);
    expect(parseEuro("abc")).toBeNull();
    expect(parseEuro("")).toBeNull();
  });
});

describe("Noten", () => {
  test("Text und Obmann", () => {
    expect(bewertungsText({ punkte: 95, sondernote: null })).toBe("95 sg");
    expect(bewertungsText({ punkte: null, sondernote: "oB" })).toBe("o.B.");
    expect(brauchtObmann({ punkte: 97, sondernote: null })).toBe(true);
    expect(brauchtObmann({ punkte: 96, sondernote: null })).toBe(false);
  });
  test("Prüfung", () => {
    expect(pruefeBewertung({ punkte: 93, sondernote: null })).toBeNull();
    expect(pruefeBewertung({ punkte: 89, sondernote: null })).toContain("nicht vorgesehen");
    expect(pruefeBewertung({ punkte: null, sondernote: null })).toContain("fehlen");
    expect(pruefeBewertung({ punkte: 95, sondernote: "u" })).toContain("nicht beides");
  });
});

describe("Meldebetrag", () => {
  const gebuehren: Gebuehr[] = [
    { art: "einzeltier", jugend: false, betragCent: 1100, befreitPreisrichter: false },
    { art: "einzeltier", jugend: true, betragCent: 650, befreitPreisrichter: false },
    { art: "stamm", jugend: false, betragCent: 1800, befreitPreisrichter: false },
    { art: "kostenanteil", jugend: false, betragCent: 800, befreitPreisrichter: false },
    { art: "katalog", jugend: false, betragCent: 900, befreitPreisrichter: true },
    { art: "katalog", jugend: true, betragCent: 0, befreitPreisrichter: true },
  ];

  test("Senior mit Einzeltieren und Stamm", () => {
    const b = berechneMeldebetrag(
      [{ art: "einzeltier" }, { art: "einzeltier" }, { art: "stamm" }],
      gebuehren,
      { istJugend: false, istPreisrichter: false },
    );
    expect(b.summeCent).toBe(2 * 1100 + 1800 + 800 + 900);
  });

  test("Jugend nutzt Jugendtarif, Stamm fällt auf Seniorentarif zurück", () => {
    const b = berechneMeldebetrag([{ art: "einzeltier" }, { art: "stamm" }], gebuehren, {
      istJugend: true,
      istPreisrichter: false,
    });
    expect(b.summeCent).toBe(650 + 1800 + 800 + 0);
  });

  test("Preisrichter zahlt keinen Katalog", () => {
    const b = berechneMeldebetrag([{ art: "einzeltier" }], gebuehren, { istJugend: false, istPreisrichter: true });
    expect(b.zeilen.find((z) => z.art === "katalog")).toBeUndefined();
  });

  test("Leere Meldung kostet nichts", () => {
    expect(berechneMeldebetrag([], gebuehren, { istJugend: false, istPreisrichter: false }).summeCent).toBe(0);
  });
});

describe("Katalognummern", () => {
  const base = {
    sparteFolge: 1,
    rasseFolge: 1,
    farbFolge: 1,
    freitext: "",
    art: "einzeltier" as const,
    istJugend: false,
    ausstellerName: "Meier",
    meldungId: 1,
    position: 0,
  };
  const e = (id: number, over: Partial<FolgeEintrag>): FolgeEintrag => ({
    ...base,
    id,
    geschlecht: "1,0",
    alter: "jung",
    ...over,
  });

  test("Reihenfolge: Farbenschlag, dann 1,0 jung/alt, 0,1 jung/alt", () => {
    const eintraege = [
      e(1, { geschlecht: "0,1", alter: "alt" }),
      e(2, { geschlecht: "1,0", alter: "alt" }),
      e(3, { geschlecht: "0,1", alter: "jung" }),
      e(4, { geschlecht: "1,0", alter: "jung" }),
      e(5, { farbFolge: 0, geschlecht: "0,1", alter: "alt" }),
    ];
    const nr = vergebeKatalognummern(eintraege, { start: 1, jugendSeparat: false });
    const order = [...nr.entries()].sort((a, b) => a[1].nr - b[1].nr).map(([id]) => id);
    expect(order).toEqual([5, 4, 2, 3, 1]);
  });

  test("Tiere eines Züchters stehen im Farbenschlag zusammen (je Züchter erst 1,0, dann 0,1)", () => {
    const z = (id: number, name: string, meldungId: number, geschlecht: string, farbFolge = 1) => e(id, { ausstellerName: name, meldungId, geschlecht, farbFolge });
    const eintraege = [z(1, "Becker", 2, "0,1"), z(2, "Adam", 1, "0,1"), z(3, "Becker", 2, "1,0"), z(4, "Adam", 1, "1,0"), z(5, "Adam", 1, "1,0", 2), z(6, "Becker", 2, "0,1", 0)];
    const nr = vergebeKatalognummern(eintraege, { start: 1, jugendSeparat: false });
    const order = [...nr.entries()].sort((a, b) => a[1].nr - b[1].nr).map(([id]) => id);
    // Farbenschlag 0: Becker; Farbenschlag 1: Adam 1,0 und 0,1, dann Becker 1,0 und 0,1; Farbenschlag 2: Adam.
    expect(order).toEqual([6, 4, 2, 3, 1, 5]);
  });

  test("Jugendblock hinter den Senioren", () => {
    const nr = vergebeKatalognummern([e(1, { istJugend: true, rasseFolge: 0 }), e(2, { rasseFolge: 5 })], {
      start: 100,
      jugendSeparat: true,
    });
    expect(nr.get(2)!.nr).toBe(100);
    expect(nr.get(1)!.nr).toBe(101);
  });

  test("Volieren und Stämme als eigene Abteilungen vor den Einzeltieren", () => {
    const eintraege = [
      e(1, { sparteFolge: 0, rasseFolge: 0 }),
      e(2, { sparteFolge: 1, rasseFolge: 5, art: "stamm", geschlecht: "1,2" }),
      e(3, { sparteFolge: 0, rasseFolge: 1, art: "stamm", geschlecht: "1,1" }),
      e(4, { sparteFolge: 2, rasseFolge: 9, art: "voliere", geschlecht: "1,3" }),
      e(5, { sparteFolge: 0, rasseFolge: 0, istJugend: true, art: "stamm", geschlecht: "1,1" }),
      e(6, { sparteFolge: 0, rasseFolge: 0, istJugend: true }),
    ];
    const reihe = (opts: { start: number; jugendSeparat: boolean; staemmeVorn?: boolean }) => {
      const nr = vergebeKatalognummern(eintraege, opts);
      return [...nr.entries()].sort((a, b) => a[1].nr - b[1].nr).map(([id]) => id);
    };
    // Voliere → Stämme (in Spartenfolge) → Einzeltiere; in der Jugend genauso.
    expect(reihe({ start: 1, jugendSeparat: true, staemmeVorn: true })).toEqual([4, 3, 2, 1, 5, 6]);
    // Ohne Schalter bleibt alles bei seiner Rasse.
    expect(reihe({ start: 1, jugendSeparat: true })).toEqual([1, 3, 2, 4, 6, 5]);
    expect(gruppenAbteilung("stamm", true)).toBe("Stämme");
    expect(gruppenAbteilung("voliere", true)).toBe("Volieren");
    expect(gruppenAbteilung("einzeltier", true)).toBeNull();
    expect(gruppenAbteilung("stamm", false)).toBeNull();
  });

  test("Nachmeldung eines Stamms landet im Stämme-Block", () => {
    const opts = { start: 1, jugendSeparat: false, staemmeVorn: true };
    const vorhanden = [
      { ...e(1, { rasseFolge: 1, art: "stamm", geschlecht: "1,2" }), nr: 1, suffix: "" },
      { ...e(2, { rasseFolge: 0 }), nr: 2, suffix: "" },
      { ...e(3, { rasseFolge: 1 }), nr: 3, suffix: "" },
    ];
    expect(nachmeldungsNummer(e(9, { rasseFolge: 1, art: "stamm", geschlecht: "1,2", alter: "alt" }), vorhanden, opts)).toEqual({
      nr: 1,
      suffix: "a",
      reihenfolgeVerletzt: false,
    });
  });

  test("Einträge ohne Stammdaten ans Ende der Sparte", () => {
    const nr = vergebeKatalognummern(
      [e(1, { rasseFolge: null, farbFolge: null, freitext: "AOC Zwerg-X" }), e(2, { rasseFolge: 9 })],
      { start: 1, jugendSeparat: false },
    );
    expect(nr.get(2)!.nr).toBe(1);
  });

  test("Nachmeldung bekommt Unternummer hinter ihrem Vorgänger", () => {
    const vorhanden = [
      { ...e(1, { farbFolge: 1 }), nr: 1, suffix: "" },
      { ...e(2, { farbFolge: 2 }), nr: 2, suffix: "" },
      { ...e(3, { farbFolge: 3 }), nr: 3, suffix: "" },
    ];
    const opts = { start: 1, jugendSeparat: false };
    expect(nachmeldungsNummer(e(9, { farbFolge: 2, alter: "alt" }), vorhanden, opts)).toEqual({ nr: 2, suffix: "a", reihenfolgeVerletzt: false });
    const mitA = [...vorhanden, { ...e(9, { farbFolge: 2, alter: "alt" }), nr: 2, suffix: "a" }];
    expect(nachmeldungsNummer(e(10, { farbFolge: 2, geschlecht: "0,1" }), mitA, opts)).toEqual({ nr: 2, suffix: "b", reihenfolgeVerletzt: false });
    expect(nachmeldungsNummer(e(11, { farbFolge: 99 }), vorhanden, opts)).toEqual({ nr: 3, suffix: "a", reihenfolgeVerletzt: false });
  });

  test("Nachmeldung vor dem ersten Eintrag", () => {
    const vorhanden = [{ ...e(1, { farbFolge: 5 }), nr: 1, suffix: "" }];
    expect(nachmeldungsNummer(e(2, { farbFolge: 1 }), vorhanden, { start: 1, jugendSeparat: false })).toEqual({
      nr: 1,
      suffix: "a",
      // 1 steht in der Folge hinter dem neuen Tier, 1a aber hinter 1.
      reihenfolgeVerletzt: true,
    });
  });
});

describe("Preise", () => {
  const E: Preisart = {
    id: 1,
    kuerzel: "E",
    name: "Ehrenpreis",
    quelle: "standgeld",
    schluesselProTiere: 10,
    anzahlProSchluessel: 1,
    anzahlProPreisrichter: 0,
    mindestpunkte: 94,
    rundung: "voll",
  };
  const Band: Preisart = { ...E, id: 2, kuerzel: "B", name: "Band", schluesselProTiere: null, anzahlProPreisrichter: 2 };

  test("Kontingent", () => {
    expect(kontingent(E, 47)).toBe(4);
    expect(kontingent({ ...E, anzahlProSchluessel: 2 }, 47)).toBe(8);
    expect(kontingent(Band, 47)).toBe(2);
    expect(kontingent(E, 9)).toBe(0);
  });

  test("Rundung: angefangene Zehner und mehrere Preisrichter", () => {
    const Ea = { ...E, rundung: "angefangen" as const };
    expect(kontingent(Ea, 47)).toBe(5);
    expect(kontingent(Ea, 40)).toBe(4);
    expect(kontingent(Ea, 0)).toBe(0);
    expect(kontingent(Band, 100, 3)).toBe(6);
  });

  test("Vergabe prüfen", () => {
    const ok = { preisart: E, punkte: 95, istGeldpreis: true, hatGeldpreis: false, hatDiesePreisart: false, vergeben: 0, verfuegbar: 4 };
    expect(pruefeVergabe(ok)).toBeNull();
    expect(pruefeVergabe({ ...ok, punkte: 93 })).toContain("ab 94");
    expect(pruefeVergabe({ ...ok, vergeben: 4 })).toContain("ausgeschöpft");
    expect(pruefeVergabe({ ...ok, hatGeldpreis: true })).toContain("Geldpreis");
    // Ein Band (kein Geldpreis) darf zusätzlich zu E oder Z vergeben werden.
    expect(pruefeVergabe({ ...ok, preisart: Band, istGeldpreis: false, hatGeldpreis: true })).toBeNull();
    expect(pruefeVergabe({ ...ok, punkte: null })).toContain("keine Punkt");
  });

  test("Note ändern oder zurücksetzen, wenn schon Preise vergeben sind", () => {
    const preise = [{ name: "Ehrenpreis", mindestpunkte: 94 }, { name: "Band", mindestpunkte: null }];
    expect(pruefeNotenaenderung(95, [])).toBeNull();
    expect(pruefeNotenaenderung(null, [])).toBeNull();
    expect(pruefeNotenaenderung(96, preise)).toBeNull();
    expect(pruefeNotenaenderung(93, preise)).toContain("Ehrenpreis gibt es erst ab 94");
    expect(pruefeNotenaenderung(93, preise)).not.toContain("Band");
    expect(pruefeNotenaenderung(null, preise)).toContain("Ehrenpreis, Band");
  });
});

describe("Abrechnung", () => {
  test("Preisgeld plus Verkauf minus Provision", () => {
    const a = berechneAbrechnung({
      meldebetragCent: 5000,
      bezahltCent: 5000,
      preisgelderCent: [1100, 600],
      verkaeufe: [{ preisCent: 3000, provisionCent: provision(3000, 1500) }],
    });
    expect(a.provisionCent).toBe(450);
    expect(a.saldoCent).toBe(1100 + 600 + 3000 - 450);
  });

  test("Offenes Meldegeld wird verrechnet", () => {
    const a = berechneAbrechnung({
      meldebetragCent: 5000,
      bezahltCent: 3000,
      preisgelderCent: [],
      verkaeufe: [],
    });
    expect(a.saldoCent).toBe(-2000);
  });
});

describe("Stammdaten-CSV", () => {
  test("liest Baum in Dateireihenfolge", () => {
    const { baum, fehler } = parseStammdatenCsv(
      "Sparte;Rasse;Farbenschlag\nHühner;Wyandotten;weiß\nHühner;Wyandotten;schwarz\nTauben;Strasser;blau\nHühner;Wyandotten;weiß\nkaputt",
    );
    expect(baum.sparten.map((s) => s.name)).toEqual(["Hühner", "Tauben"]);
    expect(baum.sparten[0]!.rassen[0]!.farbenschlaege).toEqual(["weiß", "schwarz"]);
    expect(fehler).toHaveLength(2);
  });

  test("Kopfzeile nach Kommentaren wird nicht als Rasse gelesen", () => {
    const { baum } = parseStammdatenCsv("# Kommentar\n# noch einer\nSparte;Rasse;Farbenschlag\nHühner;Brahma;hell");
    expect(baum.sparten.map((s) => s.name)).toEqual(["Hühner"]);
  });
});

describe("AAB-Abgleich", () => {
  test("Sondernoten: u hat 0 Punkte, u.M. braucht den Obmann", () => {
    expect(bewertungsText({ punkte: null, sondernote: "u" })).toBe("0 u");
    expect(bewertungsText({ punkte: null, sondernote: "nA" })).toBe("n.a.");
    expect(brauchtObmann({ punkte: null, sondernote: "uM" })).toBe(true);
    expect(brauchtObmann({ punkte: null, sondernote: "oB" })).toBe(false);
    expect(pruefeBewertung({ punkte: null, sondernote: "uM" })).toBeNull();
  });

  test("Besatz von Stämmen und Volieren nach BDRG-Beschluss 2022", () => {
    expect(standardBesatz("stamm", "Hühner Wyandotten")).toBe("1,2");
    expect(standardBesatz("stamm", "Großgeflügel Pommerngänse")).toBe("1,1");
    expect(standardBesatz("voliere", "Wassergeflügel Laufenten")).toBe("1,3");
    expect(standardBesatz("voliere", "Tauben Strasser")).toBe("3,3");
    expect(standardBesatz("einzeltier", "Hühner Wyandotten")).toBeNull();
    expect(pruefeBesatz("stamm", "1,3", "Hühner Brahma")).toContain("1,2");
    expect(pruefeBesatz("stamm", "1,2", "Hühner Brahma")).toBeNull();
  });
});

describe("Audit Paket f", () => {
  const f = (id: number, over: Partial<FolgeEintrag>): FolgeEintrag => ({
    id,
    sparteFolge: 1,
    rasseFolge: 1,
    farbFolge: 1,
    freitext: "",
    art: "einzeltier",
    geschlecht: "1,0",
    alter: "jung",
    istJugend: false,
    ausstellerName: "Meier",
    ausstellerId: 1, // derselbe Züchter, auch bei Nachmeldungen (eigene Meldung)
    meldungId: id,
    position: 0,
    ...over,
  });
  const opts = { start: 1, jugendSeparat: false };

  test("Nachmeldung hinter einer späteren Unternummer meldet Reihenfolgefehler", () => {
    const vorhanden = [
      { ...f(1, {}), nr: 1, suffix: "" },
      { ...f(2, { geschlecht: "0,1" }), nr: 1, suffix: "a" },
      { ...f(3, { farbFolge: 2 }), nr: 2, suffix: "" },
    ];
    expect(nachmeldungsNummer(f(9, { alter: "alt" }), vorhanden, opts)).toEqual({ nr: 1, suffix: "b", reihenfolgeVerletzt: true });
    // Hinter der letzten Unternummer passt alles.
    expect(nachmeldungsNummer(f(10, { geschlecht: "0,1", alter: "alt" }), vorhanden, opts).reihenfolgeVerletzt).toBe(false);
  });

  test("Nachmeldungen eines Laufs werden in Ausstellungsfolge nummeriert", () => {
    const vorhanden = [
      { ...f(1, {}), nr: 1, suffix: "" },
      { ...f(3, { farbFolge: 2 }), nr: 2, suffix: "" },
    ];
    // 0,1 jung wurde zuerst gemeldet, 1,0 alt danach – trotzdem bekommt 1,0 alt die erste Unternummer.
    const nr = nachmeldungsNummern([f(5, { geschlecht: "0,1" }), f(6, { alter: "alt" })], vorhanden, opts);
    expect(nr.get(6)).toEqual({ nr: 1, suffix: "a", reihenfolgeVerletzt: false });
    expect(nr.get(5)).toEqual({ nr: 1, suffix: "b", reihenfolgeVerletzt: false });
  });

  test("CSV: Trennzeichen in Anführungszeichen bleibt im Feld", () => {
    const { baum, fehler } = parseStammdatenCsv(
      'Sparte,Rasse,Farbenschlag\nHühner,Wyandotten,"blau, gesäumt"\nHühner,Wyandotten,"blau, schwarzgesäumt"',
    );
    expect(fehler).toEqual([]);
    expect(baum.sparten[0]!.rassen[0]!.farbenschlaege).toEqual(["blau, gesäumt", "blau, schwarzgesäumt"]);
  });

  test("CSV: doppelte Anführungszeichen, Zusatzspalten und offene Anführung", () => {
    expect(zerlegeZeile('"x ""y"""', ";").teile).toEqual(['x "y"']);
    expect(zerlegeZeile('a;Zwerg "x";c', ";").teile).toEqual(["a", 'Zwerg "x"', "c"]);
    const r = parseStammdatenCsv('a;b;c;d\nHühner;Brahma;hell;;\nHühner;Brahma;"gelb');
    expect(r.fehler).toHaveLength(2);
    expect(r.fehler[0]).toContain("mehr als drei Spalten");
    expect(r.fehler[1]).toContain("nicht geschlossen");
    // Leere Spalten am Ende sind erlaubt.
    expect(r.baum.sparten[0]!.rassen[0]!.farbenschlaege).toEqual(["hell"]);
  });

  test("CSV: Trennzeichen gilt für die ganze Datei", () => {
    // Komma-Datei: ein Semikolon im Feld darf die Zeile nicht anders zerlegen.
    const { baum, fehler } = parseStammdatenCsv("Hühner,Wyandotten,weiß\nHühner,Wyandotten,blau;gesäumt");
    expect(fehler).toEqual([]);
    expect(baum.sparten[0]!.rassen[0]!.farbenschlaege).toEqual(["weiß", "blau;gesäumt"]);
  });

  test("CSV: Semikolon-Datei mit Kommas in der ersten Zeile", () => {
    const { baum, fehler } = parseStammdatenCsv("Tauben;Modeneser, Gazzi;blau, gesäumt, mit Binden\nHühner;Brahma;hell");
    expect(fehler).toEqual([]);
    expect(baum.sparten[0]!.rassen[0]).toEqual({ name: "Modeneser, Gazzi", farbenschlaege: ["blau, gesäumt, mit Binden"], gruppe: "" });
  });

  test("Jugend: Alter am Stichtag", () => {
    expect(alterAm("2008-11-14", "2026-11-14")).toBe(18);
    expect(alterAm("2008-11-15", "2026-11-14")).toBe(17);
    expect(istJugendlich("2008-11-15", "2026-11-14")).toBe(true);
    // Am 18. Geburtstag ist man nicht mehr jugendlich.
    expect(istJugendlich("2008-11-14", "2026-11-14")).toBe(false);
    expect(istJugendlich("2012-01-01", "2026-11-14", 14)).toBe(false);
    // 29.02.: Geburtstag im Nicht-Schaltjahr erst am 01.03.
    expect(alterAm("2008-02-29", "2026-02-28")).toBe(17);
    expect(alterAm("2008-02-29", "2026-03-01")).toBe(18);
  });
});

describe("Betrag in Worten", () => {
  test("Euro und Cent wie auf einer Quittung", () => {
    expect(betragInWorten(0)).toBe("null Euro");
    expect(betragInWorten(100)).toBe("ein Euro");
    expect(betragInWorten(101)).toBe("ein Euro und ein Cent");
    expect(betragInWorten(600)).toBe("sechs Euro");
    expect(betragInWorten(2150)).toBe("einundzwanzig Euro und fünfzig Cent");
    expect(betragInWorten(23550)).toBe("zweihundertfünfunddreißig Euro und fünfzig Cent");
    expect(betragInWorten(100100)).toBe("eintausendein Euro");
    expect(betragInWorten(2000100)).toBe("zwanzigtausendein Euro");
    expect(betragInWorten(1234500)).toBe("zwölftausenddreihundertfünfundvierzig Euro");
    expect(betragInWorten(-1175)).toBe("elf Euro und fünfundsiebzig Cent");
    expect(betragInWorten(100000000)).toBe("eine Million Euro");
  });
});

describe("Tierzahl", () => {
  test("Einzeltier, Stamm und Voliere", () => {
    expect(tierzahl("1,0")).toBe(1);
    expect(tierzahl("0,1")).toBe(1);
    expect(tierzahl("1,2")).toBe(3);
    expect(tierzahl("3,3")).toBe(6);
    expect(tierzahl(" 1 , 1 ")).toBe(2);
    expect(tierzahl("Paar")).toBe(1);
  });
});

describe("Datenschutz", () => {
  const leer = { name: "GZV Musterhausen e. V.", anschrift: "", email: "", telefon: "", vertretung: "", register: "", inhaltVerantwortlich: "", datenschutzbeauftragter: "", impressumZusatz: "", datenschutzZusatz: "", datenschutzText: "" };

  test("Aufbewahrung: Verkauf 3 Jahre ab Tag, Belege bis Jahresende plus 8 Jahre", () => {
    expect(aufbewahrenBis([], [])).toBeNull();
    expect(aufbewahrenBis([new Date("2026-11-07T12:00:00Z")], [])!.toISOString().slice(0, 10)).toBe("2029-11-07");
    expect(aufbewahrenBis([new Date("2026-11-07T12:00:00Z")], [new Date("2026-11-08T12:00:00Z")])!.toISOString().slice(0, 10)).toBe("2035-01-01");
  });

  test("Fehlende Pflichtangaben und Impressum aus den Feldern", () => {
    expect(fehlendeVereinsangaben(leer)).toEqual(["Anschrift", "E-Mail-Adresse", "Vertretungsberechtigter Vorstand"]);
    const v = { ...leer, anschrift: "Hauptstr. 1\n34117 Kassel", email: "info@gzv.de", vertretung: "Max Muster (1. Vorsitzender)", register: "Amtsgericht Kassel, VR 1234" };
    expect(fehlendeVereinsangaben(v)).toEqual([]);
    const imp = impressumAbschnitte(v);
    expect(imp[0]!.absaetze).toEqual(["GZV Musterhausen e. V.", "Hauptstr. 1", "34117 Kassel"]);
    expect(imp.map((a) => a.titel)).toEqual(["Angaben nach § 5 DDG", "Vertreten durch", "Kontakt", "Registereintrag"]);
  });

  test("Muster: E-Mail-Adresse nur online Pflicht, auf dem Meldebogen freiwillig", () => {
    const meldung = datenschutzAbschnitte(leer).find((a) => a.titel === "Meldung zur Schau")!.absaetze.join(" ");
    expect(meldung).toContain("Ohne Name, Anschrift, Verein und Registriernummer ist keine Meldung möglich.");
    expect(meldung).toContain("Bei der Online-Meldung brauchen wir außerdem Ihre E-Mail-Adresse");
    expect(meldung).toContain("auf dem Meldebogen (Papier) ist sie freiwillig");
    expect(meldung).not.toContain("Ohne Name, Anschrift, E-Mail-Adresse");
  });

  test("Eigener Datenschutztext ersetzt das Muster", () => {
    expect(datenschutzAbschnitte(leer).map((a) => a.titel)).toContain("Ihre Rechte");
    expect(datenschutzAbschnitte({ ...leer, datenschutzText: "Eigener Text\n\nZweiter Absatz" })).toEqual([{ titel: "", absaetze: ["Eigener Text", "Zweiter Absatz"] }]);
  });
});

describe("Tiergesundheit", () => {
  test("Tierart aus Sparte und Rasse", () => {
    expect(tierart("Hühner", "Wyandotten")).toBe("huehner");
    expect(tierart("Zwerghühner", "Sebright")).toBe("huehner");
    expect(tierart("Großgeflügel", "Deutsche Puten")).toBe("puten");
    expect(tierart("Großgeflügel", "Perlhühner")).toBe("perlhuehner");
    expect(tierart("Wassergeflügel", "Pommerngänse")).toBe("gaense");
    expect(tierart("Wassergeflügel", "Laufenten")).toBe("enten");
    expect(tierart("Tauben", "Strasser")).toBe("tauben");
    expect(tierart("Wachteln", "Japanische Legewachteln")).toBe("wachteln");
    // Teilwörter in Rassennamen: „Dorking“ enthält „king“, „Narragansett“ enthält „gans“.
    expect(tierart("Hühner", "Dorking")).toBe("huehner");
    expect(tierart("Zwerghühner", "Zwerg-Dorking mit Rosenkamm")).toBe("huehner");
    expect(tierart("Großgeflügel", "Amerikanische Narragansett Puten")).toBe("puten");
    expect(tierart("Tauben", "Kingtauben")).toBe("tauben");
    expect(tierart("", "King")).toBe("tauben");
    // Truthühner sind Großgeflügel (Besatz 1,1), nicht „übrige“.
    expect(standardBesatz("stamm", "Großgeflügel Truthühner")).toBe("1,1");
  });

  test("Nötige Nachweise je Aussteller", () => {
    expect(noetigeNachweise(["huehner", "tauben"], { wassergefluegel: false })).toEqual(["nd", "pmv"]);
    expect(noetigeNachweise(["enten"], { wassergefluegel: false })).toEqual([]);
    expect(noetigeNachweise(["enten", "puten"], { wassergefluegel: true })).toEqual(["nd", "wg"]);
    expect(noetigeNachweise(["tauben"], { wassergefluegel: false, untersuchung: "bescheinigung" })).toEqual(["pmv", "kl"]);
    expect(noetigeNachweise(["tauben"], { wassergefluegel: false, untersuchung: "einlass" })).toEqual(["pmv"]);
    // Aus dem Ausland: Gesundheitszertifikat, und auch Tauben ND-geimpft.
    expect(noetigeNachweise(["tauben"], { wassergefluegel: false, ausland: true })).toEqual(["nd", "pmv", "gz"]);
    expect(istAuslaendisch("NL 1234567")).toBe(true);
    expect(istAuslaendisch("276 06 535 012 0001")).toBe(false);
    expect(istAuslaendisch("")).toBe(false);
  });

  test("Fristen der Nachweise", () => {
    expect(pruefeNachweis("nd", { datum: null }, "2026-11-14", "2026-11-06")).toContain("fehlt");
    expect(pruefeNachweis("nd", { datum: "2026-12-01" }, "2026-11-14", "2026-11-06")).toContain("Zukunft");
    expect(pruefeNachweis("nd", { datum: "2026-08-01" }, "2026-11-14", "2026-11-06")).toBeNull();
    expect(pruefeNachweis("wg", { datum: "2026-11-06" }, "2026-11-14", "2026-11-10")).toContain("7 Tage");
    expect(pruefeNachweis("wg", { datum: "2026-11-08" }, "2026-11-14", "2026-11-10")).toBeNull();
    expect(pruefeNachweis("wg", { datum: "2026-01-10", sentinel: true }, "2026-11-14", "2026-11-10")).toBeNull();
    // Fristen nach Merkblatt (je Schau): ND 21–90 Tage, PMV ab 21 Tage; ohne Einstellung keine Frist.
    const f = { ndMin: 21, ndMax: 90, pmvMin: 21 };
    expect(pruefeNachweis("nd", { datum: "2026-08-01" }, "2026-11-14", "2026-11-06", f)).toContain("höchstens 90");
    expect(pruefeNachweis("nd", { datum: "2026-11-01" }, "2026-11-14", "2026-11-06", f)).toContain("mindestens 21");
    expect(pruefeNachweis("nd", { datum: "2026-10-01" }, "2026-11-14", "2026-11-06", f)).toBeNull();
    expect(pruefeNachweis("pmv", { datum: "2026-11-10" }, "2026-11-14", "2026-11-10", f)).toContain("mindestens 21");
    // Klinische Untersuchung: Bescheinigung höchstens 6 Tage (einstellbar); Gesundheitszertifikat mit Nummer.
    expect(pruefeNachweis("kl", { datum: "2026-11-01" }, "2026-11-14", "2026-11-10")).toContain("6 Tage");
    expect(pruefeNachweis("kl", { datum: "2026-11-10" }, "2026-11-14", "2026-11-10")).toBeNull();
    expect(pruefeNachweis("gz", { datum: "2026-11-10", text: "" }, "2026-11-14", "2026-11-10")).toContain("TRACES");
    expect(pruefeNachweis("gz", { datum: "2026-11-10", text: "INTRA.DE.2026.123" }, "2026-11-14", "2026-11-10")).toBeNull();
  });

  test("Registriernummer", () => {
    expect(normalisiereRegistriernummer("065350120001")).toBe("276 06 535 012 0001");
    expect(normalisiereRegistriernummer("276 06 535 012 0001")).toBe("276 06 535 012 0001");
    expect(normalisiereRegistriernummer("DE 06.535.012.0001")).toBe("276 06 535 012 0001");
    expect(normalisiereRegistriernummer("276 06 100740")).toBeNull();
    expect(normalisiereRegistriernummer("NL 1234567")).toBe("NL 1234567");
    expect(normalisiereRegistriernummer("at-12345678")).toBe("AT 12345678");
    // Wörter und unbekannte Ländercodes sind keine ausländische Nummer.
    expect(normalisiereRegistriernummer("keine")).toBeNull();
    expect(normalisiereRegistriernummer("unbekannt")).toBeNull();
    expect(normalisiereRegistriernummer("habe ich nicht")).toBeNull();
    expect(normalisiereRegistriernummer("xx-1")).toBeNull();
    expect(normalisiereRegistriernummer("XX 1234567")).toBeNull();
    expect(normalisiereRegistriernummer("NL 12")).toBeNull();
  });

  test("Geschlechtsangabe", () => {
    expect(pruefeGeschlecht("einzeltier", "0,0")).toContain("Mindestens");
    expect(pruefeGeschlecht("einzeltier", "1,2")).toContain("Einzeltier");
    expect(pruefeGeschlecht("stamm", "1,2")).toBeNull();
    expect(pruefeGeschlecht("voliere", "40,40")).toContain("30");
  });
});

describe("Textbausteine: Geflügelart und Merkmal", () => {
  test("Sparten des Verzeichnisses werden der Geflügelart zugeordnet", async () => {
    const { artenDerSparte, bausteinPasst } = await import("./textbausteine");
    expect(artenDerSparte("Hühner")).toEqual(["huehner"]);
    expect(artenDerSparte("Zwerghühner")).toEqual(["huehner"]);
    expect(artenDerSparte("Tauben")).toEqual(["tauben"]);
    expect(artenDerSparte("Wassergeflügel")).toEqual(["wasser"]);
    expect(artenDerSparte("Großgeflügel")).toEqual(["puten", "perlhuehner", "wasser"]);
    expect(artenDerSparte("Großgeflügel", "Pommerngänse grau")).toEqual(["wasser"]);
    expect(artenDerSparte("Großgeflügel", "Bronzeputen")).toEqual(["puten"]);
    expect(artenDerSparte("Truthühner")).toEqual(["puten"]);
    expect(artenDerSparte("Zwerg-Truthühner")).toEqual(["puten"]);
    expect(artenDerSparte("Wachteln")).toEqual(["wachteln"]);
    expect(artenDerSparte("Ziergeflügel")).toEqual(["ziergefluegel"]);
    expect(artenDerSparte("Unbekannt")).toBeNull();
    expect(bausteinPasst("alle", "Tauben")).toBe(true);
    expect(bausteinPasst("huehner", "Tauben")).toBe(false);
    expect(bausteinPasst("tauben", "Tauben")).toBe(true);
    expect(bausteinPasst("huehner", "Zwerghühner")).toBe(true);
    expect(bausteinPasst("tauben", "Unbekannt")).toBe(true);
  });
  test("Käfiggröße je Eintrag: Art, Sparte, Rasse und Regeln je Rasse", async () => {
    const { kaefigTyp } = await import("./kaefige");
    const t = (sparte: string, rasse: string, art: "einzeltier" | "stamm" | "voliere" | "bruteier" = "einzeltier") => kaefigTyp({ art, sparte, rasse });
    expect(t("Hühner", "Deutsche Wyandotten")).toBe("huehner");
    expect(t("Zwerghühner", "Zwerg-Wyandotten")).toBe("zwerghuehner");
    expect(t("Tauben", "Deutsche Schautauben")).toBe("tauben");
    expect(t("Großgeflügel", "Bronzeputen")).toBe("grosskaefig");
    expect(t("Wassergeflügel", "Pommerngänse")).toBe("grosskaefig");
    expect(t("Wassergeflügel", "Laufenten")).toBe("huehner");
    expect(t("Wachteln", "Japanische Legewachteln")).toBe("zwerghuehner");
    expect(t("Hühner", "Deutsche Wyandotten", "stamm")).toBe("stamm");
    expect(t("Tauben", "Deutsche Schautauben", "voliere")).toBe("voliere");
    expect(t("Hühner", "Deutsche Wyandotten", "bruteier")).toBeNull();
    // Regel je Rasse (nur Einzeltiere), ohne Groß-/Kleinschreibung.
    const regeln = [{ rasse: "brahma", typ: "grosskaefig" as const }];
    expect(kaefigTyp({ art: "einzeltier", sparte: "Hühner", rasse: "Brahma" }, regeln)).toBe("grosskaefig");
    expect(kaefigTyp({ art: "stamm", sparte: "Hühner", rasse: "Brahma" }, regeln)).toBe("stamm");
    expect(kaefigTyp({ art: "einzeltier", sparte: "Hühner", rasse: "Orpington" }, regeln)).toBe("huehner");
    // Wahl für ein einzelnes Tier geht vor (z. B. Zwerghuhn im letzten freien Großkäfig), auch vor der Regel der Rasse.
    expect(kaefigTyp({ art: "einzeltier", sparte: "Zwerghühner", rasse: "Zwerg-Wyandotten", wahl: "grosskaefig" })).toBe("grosskaefig");
    expect(kaefigTyp({ art: "einzeltier", sparte: "Hühner", rasse: "Brahma", wahl: "huehner" }, [{ rasse: "Brahma", typ: "grosskaefig" }])).toBe("huehner");
    expect(kaefigTyp({ art: "bruteier", sparte: "Hühner", rasse: "Brahma", wahl: "huehner" })).toBeNull();
  });
  test("Katalognummern nach Käfigblöcken: je Größe durchgehend, innen Ausstellungsfolge, Bruteier am Ende", async () => {
    const { vergebeKatalognummern, nachmeldungsNummer } = await import("./katalog");
    const e = (id: number, sparteFolge: number, rasseFolge: number, kaefigTyp: "grosskaefig" | "huehner" | "zwerghuehner" | "tauben" | "stamm" | null, art: "einzeltier" | "stamm" | "bruteier" = "einzeltier") => ({
      id, sparteFolge, rasseFolge, farbFolge: 1, freitext: "", art, geschlecht: art === "stamm" ? "1,2" : "1,0", alter: "jung" as const, istJugend: false, ausstellerName: "A", meldungId: id, position: 0, kaefigTyp,
    });
    // Sparten: 1 Großgeflügel (Gänse), 2 Hühner (darin Brahma im Großkäfig), 3 Zwerghühner, 4 Tauben.
    const tiere = [e(1, 4, 1, "tauben"), e(2, 2, 1, "huehner"), e(3, 2, 2, "grosskaefig"), e(4, 1, 1, "grosskaefig"), e(5, 3, 1, "zwerghuehner"), e(6, 2, 1, "stamm", "stamm"), e(7, 2, 1, null, "bruteier"), e(8, 2, 3, "huehner")];
    const nummer = (m: Map<number, { nr: number }>) => [...m.entries()].sort((a, b) => a[1].nr - b[1].nr).map(([id]) => id);
    // Wie bisher (nach Sparten): Gänse, Hühner (mit Brahma mittendrin), Zwerghühner, Tauben.
    expect(nummer(vergebeKatalognummern(tiere, { start: 1, jugendSeparat: false }))).toEqual([4, 2, 6, 7, 3, 8, 5, 1]);
    // Nach Käfigblöcken in der Hallenfolge: Stamm, Groß (Gänse, dann Brahma), Hühner, Zwerg, Tauben, Bruteier zuletzt.
    const folge = ["stamm", "grosskaefig", "huehner", "zwerghuehner", "tauben", "voliere"] as const;
    expect(nummer(vergebeKatalognummern(tiere, { start: 1, jugendSeparat: false, kaefigFolge: folge }))).toEqual([6, 4, 3, 2, 8, 5, 1, 7]);
    // Nachmeldung im Großkäfig landet im Großkäfig-Block (Unternummer hinter dem letzten Großkäfig), nicht bei den Hühnern.
    const vorhanden = [...vergebeKatalognummern(tiere, { start: 1, jugendSeparat: false, kaefigFolge: folge }).entries()].map(([id, n]) => ({ ...tiere.find((t) => t.id === id)!, ...n }));
    const neu = nachmeldungsNummer(e(9, 2, 2, "grosskaefig"), vorhanden, { start: 1, jugendSeparat: false, kaefigFolge: folge });
    expect(`${neu.nr}${neu.suffix}`).toBe("3a");
  });
  test("Käfig-Vorschläge aus der Recherche: Fasane, große Tauben, Strasser – große Hühnerrassen nicht", async () => {
    const { kaefigTyp, kaefigVorschlag } = await import("./kaefige");
    const auto = (sparte: string, rasse: string) => kaefigTyp({ art: "einzeltier", sparte, rasse })!;
    expect(kaefigVorschlag("Goldfasan", auto("Ziergeflügel", "Goldfasan"))?.typ).toBe("grosskaefig");
    expect(kaefigVorschlag("Römer", auto("Tauben", "Römer"))?.typ).toBe("huehner");
    expect(kaefigVorschlag("Montauban", auto("Tauben", "Montauban"))?.typ).toBe("huehner");
    expect(kaefigVorschlag("Strasser", auto("Tauben", "Strasser"))?.typ).toBe("zwerghuehner");
    expect(kaefigVorschlag("Brahma", auto("Hühner", "Brahma"))).toBeNull();
    expect(kaefigVorschlag("Deutsche Wyandotten", auto("Hühner", "Deutsche Wyandotten"))).toBeNull();
    // Schon richtig zugeordnet: kein Vorschlag.
    expect(kaefigVorschlag("Strasser", "zwerghuehner")).toBeNull();
  });
  test("Käfignummern als Bereiche, Unternummern einzeln", async () => {
    const { nummernBereiche } = await import("./kaefige");
    const n = (katalogNr: number | null, suffix = "") => ({ katalogNr, suffix });
    expect(nummernBereiche([n(3), n(1), n(2), n(7), n(9), n(8), n(12), n(100, "a"), n(5, "b"), n(null)])).toBe("1–3, 7–9, 12, 5b, 100a");
    expect(nummernBereiche([])).toBe("");
  });
  test("Bausteine je Rasse: ohne Rasse für jede Rasse der Art, mit Rasse nur für diese (ohne Groß-/Kleinschreibung)", async () => {
    const { bausteinFuerTier, rassePasst } = await import("./textbausteine");
    const wyandotte = { sparte: "Hühner", rasse: "Wyandotten", bezeichnung: "Wyandotten, weiß" };
    const taube = { sparte: "Tauben", rasse: "Deutsche Schautauben", bezeichnung: "Deutsche Schautauben, blau" };
    expect(bausteinFuerTier({ art: "huehner" }, wyandotte)).toBe(true);
    expect(bausteinFuerTier({ art: "huehner", rasse: null }, wyandotte)).toBe(true);
    expect(bausteinFuerTier({ art: "huehner", rasse: "wyandotten " }, wyandotte)).toBe(true);
    expect(bausteinFuerTier({ art: "huehner", rasse: "Orpington" }, wyandotte)).toBe(false);
    expect(bausteinFuerTier({ art: "alle", rasse: "Wyandotten" }, taube)).toBe(false);
    expect(bausteinFuerTier({ art: "huehner" }, taube)).toBe(false);
    expect(bausteinFuerTier({ art: "tauben", rasse: "Deutsche  Schautauben" }, taube)).toBe(true);
    // Tier ohne bekannte Rasse (ältere Daten): nur Bausteine ohne Rasse.
    expect(rassePasst("Wyandotten", undefined)).toBe(false);
    expect(rassePasst("", undefined)).toBe(true);
  });
  test("Merkmale in der Reihenfolge des Durchgehens, unbekannte danach alphabetisch", async () => {
    const { sortiereGruppen } = await import("./textbausteine");
    expect(sortiereGruppen(["Farbe", "Zzz", "Kamm", "Gesamteindruck", "Aaa", "Kamm"])).toEqual(["Gesamteindruck", "Kamm", "Farbe", "Aaa", "Zzz"]);
  });
});

describe("Käfigmaße", () => {
  test("eigenes Maß vor Richtwert; Stamm und Voliere mit Namen; Langform mit Verwendung", async () => {
    const { kaefigName, kaefigNameLang } = await import("./kaefige");
    expect(kaefigName("huehner")).toBe("70 × 70 × 70 cm");
    expect(kaefigName("huehner", { huehner: { breite: 70, tiefe: 60, hoehe: 72.5 } })).toBe("70 × 60 × 72,5 cm");
    expect(kaefigName("stamm")).toBe("Stammkäfig");
    expect(kaefigName("stamm", { stamm: { breite: 120, tiefe: 60, hoehe: 80 } })).toBe("Stammkäfig 120 × 60 × 80 cm");
    expect(kaefigNameLang("grosskaefig")).toBe("100 × 100 × 100 cm – Puten, Gänse, Fasane");
    expect(kaefigNameLang("voliere")).toBe("Voliere");
  });
});

describe("Adressvorschläge aus eigenen Daten", () => {
  test("Orte zur PLZ, Straßen ohne Hausnummer, Verein mit eindeutigem Kreisverband, häufigste Schreibweise", async () => {
    const { adressVorschlaege, ortZurPlz, kreisverbandZumVerein, strassenName } = await import("./adressen");
    const v = adressVorschlaege([
      { strasse: "Lindenweg 12a", plz: "35390", ort: "Gießen", verein: "RGZV Gießen", kreisverband: "KV Gießen" },
      { strasse: "Lindenweg 3", plz: "35390", ort: "gießen ", verein: "rgzv gießen", kreisverband: "KV Gießen" },
      { strasse: "Am Markt 1-3", plz: "35392", ort: "Gießen", verein: "GZV Lich", kreisverband: "KV Gießen" },
      { strasse: "Hauptstr. 5", plz: "35423", ort: "Lich", verein: "GZV Lich", kreisverband: "KV Wetterau" },
      { strasse: "", plz: "3542", ort: "", verein: "", kreisverband: "" },
      { strasse: "Weg 1", plz: "61169", ort: "Friedberg", verein: "RGZV Gießen", kreisverband: "" },
    ]);
    expect(v.orte).toEqual([{ plz: "35390", ort: "Gießen" }, { plz: "35392", ort: "Gießen" }, { plz: "35423", ort: "Lich" }, { plz: "61169", ort: "Friedberg" }]);
    expect(v.strassen.filter((s) => s.plz === "35390").map((s) => s.strasse)).toEqual(["Lindenweg"]);
    expect(strassenName("Am Markt 1-3")).toBe("Am Markt");
    expect(strassenName("Hauptstr. 5")).toBe("Hauptstr.");
    expect(strassenName("Straße des 17. Juni 4")).toBe("Straße des 17. Juni");
    expect(v.vereine).toEqual([{ verein: "GZV Lich", kreisverband: "" }, { verein: "RGZV Gießen", kreisverband: "KV Gießen" }]);
    expect(v.kreisverbaende).toEqual(["KV Gießen", "KV Wetterau"]);
    expect(ortZurPlz("35390", v.orte)).toBe("Gießen");
    expect(ortZurPlz("3539", v.orte)).toBeNull();
    expect(ortZurPlz("99999", v.orte)).toBeNull();
    expect(kreisverbandZumVerein(" rgzv  gießen", v.vereine)).toBe("KV Gießen");
    expect(kreisverbandZumVerein("GZV Lich", v.vereine)).toBeNull(); // nicht eindeutig
  });
});

describe("Hallenplan", () => {
  const tier = (id: number, typ: "huehner" | "zwerghuehner" | "grosskaefig" | "stamm" | "voliere", preisrichterId: number | null = null) => ({ id, typ, nr: String(id), rasse: "R", preisrichterId });
  const viele = (n: number, typ: "huehner" | "zwerghuehner" | "grosskaefig", ab = 1) => Array.from({ length: n }, (_, i) => tier(ab + i, typ));
  test("Wandreihen und Doppelreihen mit Gängen; Käfige in Folge durch die Reihen; Reserve", async () => {
    const { planeHalle, HALLE_STANDARD } = await import("./hallenplan");
    // 10 × 20 m, Gang 1,5 m, Hühnerkäfig 70 cm tief: 2 Wandreihen + 2 Doppelreihen = 6 Reihen zu 17 m (24 Käfige).
    const p = planeHalle({ ...HALLE_STANDARD, wandBuendig: false, richtung: "laengs" as const, hauptgang: { breite: 0, lage: "keiner" as const }, breite: 1000, laenge: 2000 }, viele(30, "huehner"), {});
    expect(p.reihen.map((r) => `${r.art}:${Math.round(r.x)}:${r.front}`)).toEqual(["wand:0:rechts", "doppel:263:links", "doppel:333:rechts", "doppel:597:links", "doppel:667:rechts", "wand:930:links"]);
    // Gänge: die überschüssige Breite verteilt sich, (860 − 280) / 3 ≈ 193 cm – mindestens 1,5 m.
    expect(p.reihen[1]!.x - 70).toBeGreaterThanOrEqual(150);
    expect(p.reihen[3]!.x - (p.reihen[2]!.x + 70)).toBeGreaterThanOrEqual(150);
    expect(p.reihen[0]!.abschnitte).toEqual([{ von: 150, bis: 1850 }]);
    // Gleich lange Reihen (ruhiges Bild): zwei Reihen werden gebraucht, also je 15 Käfige statt 24 + 6.
    expect(p.reihen[0]!.kaefige).toHaveLength(15);
    expect(p.reihen[1]!.kaefige.map((k) => k.id)).toEqual(Array.from({ length: 15 }, (_, i) => 16 + i));
    expect(p.reihen[1]!.kaefige[0]).toMatchObject({ y: 150, breite: 70, tiefe: 70 });
    expect(p.nichtPlatziert).toEqual([]);
    // Reserve: der Rest jeder Reihe (je 3 Platten zu 3 Plätzen in R1 und R2) und die vier leeren Reihen zu 24.
    expect(p.reserve).toEqual([{ typ: "huehner", anzahl: 9 + 9 + 4 * 24 }]);
  });

  test("Kein Quergang zwischen Käfiggrößen (lückenlos), passt die Platte nicht mehr: nächste Reihe; Käfige hinten (an der Wand bzw. Rücken an Rücken)", async () => {
    const { planeHalle, HALLE_STANDARD } = await import("./hallenplan");
    const tiere = [...viele(3, "huehner"), ...viele(2, "zwerghuehner", 10)];
    const p = planeHalle({ ...HALLE_STANDARD, wandBuendig: false, richtung: "laengs" as const, hauptgang: { breite: 0, lage: "keiner" as const }, breite: 1000, laenge: 2000 }, tiere, {});
    // Wandreihe links, Front rechts: der 50 cm tiefe Zwerghuhnkäfig steht an der Wand (x = 0), direkt hinter den Hühnern.
    expect(p.reihen[0]!.kaefige.map((k) => k.id)).toEqual([1, 2, 3, 10, 11]);
    // Grundplatte 210 cm: drei 70er; Zwerghühner zu viert auf ihrer eigenen Platte (4 × 50 = 200 cm). Die Platte ist immer
    // ganz, auch wenn nur zwei Zwerghühner darauf stehen – Einzelkäfige gibt es nicht.
    expect(p.reihen[0]!.kaefige[3]).toMatchObject({ x: 0, y: 150 + 210, breite: 50, tiefe: 50 });
    // Doppelreihe, 1 m tief wegen eines Großkäfigs: die Hühnerkäfige beider Hälften stehen Rücken an Rücken, die
    // übrige Tiefe liegt vorn am Gang.
    const tief = planeHalle({ ...HALLE_STANDARD, wandBuendig: false, wandreihen: false, richtung: "laengs" as const, hauptgang: { breite: 0, lage: "keiner" as const }, breite: 1000, laenge: 900, quergang: false }, [...viele(1, "grosskaefig", 90), ...viele(16, "huehner")], {});
    const [l, r] = [tief.reihen[0]!, tief.reihen[1]!];
    expect([l.tiefe, l.front, r.front]).toEqual([100, "links", "rechts"]);
    const kl = l.kaefige.find((k) => k.typ === "huehner")!, kr = r.kaefige.find((k) => k.typ === "huehner")!;
    expect(kl.x + kl.tiefe).toBe(r.x);
    expect(kr.x).toBe(r.x);
    expect(l.platten.find((pl) => pl.typ === "huehner")!.x + 70).toBe(r.x);
    expect(p.reihen[0]!.kaefige[4]).toMatchObject({ y: 150 + 210 + 50 });
    expect(p.reihen[0]!.platten.map((pl) => `${pl.typ}:${pl.belegt}/${pl.plaetze}@${pl.y}+${pl.laenge}`)).toEqual(["huehner:3/3@150+210", "zwerghuehner:2/4@360+200"]);
    const q = planeHalle({ ...HALLE_STANDARD, wandBuendig: false, richtung: "laengs" as const, hauptgang: { breite: 0, lage: "keiner" as const }, breite: 1000, laenge: 2000, quergang: false }, tiere, {});
    expect(q.reihen[0]!.kaefige[3]).toMatchObject({ y: 150 + 210 });
    // 23 Hühnerkäfige und 2 Zwerghühner brauchen zwei Reihen; gleich lang gestellt: R1 vier Hühnerplatten, R2 vier
    // Hühnerplatten (die letzte mit zwei Hühnern), das erste Zwerghuhn auf deren Rest, das zweite direkt dahinter auf einer
    // eigenen Platte (ohne Lücke).
    const voll = planeHalle({ ...HALLE_STANDARD, wandBuendig: false, richtung: "laengs" as const, hauptgang: { breite: 0, lage: "keiner" as const }, breite: 1000, laenge: 2000 }, [...viele(23, "huehner"), ...viele(2, "zwerghuehner", 50)], {});
    expect(voll.reihen[0]!.kaefige).toHaveLength(12);
    expect(voll.reihen[0]!.platten).toHaveLength(4);
    expect(voll.reihen[1]!.kaefige.filter((k) => k.typ === "zwerghuehner").map((k) => [k.id, k.y])).toEqual([[50, 920], [51, 990]]);
    // Reserve: Rest von R1 (1850 − 990: 4 Platten) und R2 (1850 − 1190: 3), dazu vier leere Reihen zu 8.
    expect(voll.reservePlatten).toBe(4 + 3 + 4 * 8);
  });

  test("Eingang schneidet Reihen mit Gang Abstand; Volieren im Volierenbereich; fehlende Maße; zu kleine Halle", async () => {
    const { planeHalle, HALLE_STANDARD } = await import("./hallenplan");
    const eingang = { name: "Eingang", art: "eingang" as const, x: 0, y: 900, breite: 100, tiefe: 200 };
    const p = planeHalle({ ...HALLE_STANDARD, wandBuendig: false, richtung: "laengs" as const, hauptgang: { breite: 0, lage: "keiner" as const }, breite: 1000, laenge: 2000, flaechen: [eingang] }, viele(2, "huehner"), {});
    // Wandreihe links: 150–900 und 1100–1850 (Gang nur vor dem Eingang, seitlich daneben nicht); die erste Doppelreihe
    // (ab x 263) liegt außerhalb des Gangs davor (bis x 250).
    expect(p.reihen[0]!.abschnitte).toEqual([{ von: 150, bis: 900 }, { von: 1100, bis: 1850 }]);
    expect(p.reihen[1]!.abschnitte).toEqual([{ von: 150, bis: 1850 }]);
    // Breiter Eingang bis x 200: Abstand bis 350 trifft auch die erste Doppelreihe.
    const breit = planeHalle({ ...HALLE_STANDARD, wandBuendig: false, richtung: "laengs" as const, hauptgang: { breite: 0, lage: "keiner" as const }, breite: 1000, laenge: 2000, flaechen: [{ ...eingang, breite: 200 }] }, viele(2, "huehner"), {});
    expect(breit.reihen[1]!.abschnitte).toHaveLength(2);
    expect(breit.reihen[3]!.abschnitte).toHaveLength(1);

    const ohneBereich = planeHalle({ ...HALLE_STANDARD, wandBuendig: false, richtung: "laengs" as const, hauptgang: { breite: 0, lage: "keiner" as const }, breite: 1000, laenge: 2000 }, [tier(1, "voliere"), tier(2, "stamm")], { voliere: { breite: 200, tiefe: 100, hoehe: 150 } });
    expect(ohneBereich.fehlendeMasse).toEqual(["stamm"]);
    expect(ohneBereich.nichtPlatziert.map((t) => t.id).sort()).toEqual([1, 2]);
    expect(ohneBereich.warnungen.join(" ")).toContain("Volierenbereich");
    const bereich = { name: "Volieren", art: "volieren" as const, x: 300, y: 1500, breite: 500, tiefe: 400 };
    const mit = planeHalle({ ...HALLE_STANDARD, wandBuendig: false, richtung: "laengs" as const, hauptgang: { breite: 0, lage: "keiner" as const }, breite: 1000, laenge: 2000, flaechen: [bereich] }, [tier(1, "voliere"), tier(2, "voliere"), tier(3, "voliere")], { voliere: { breite: 200, tiefe: 100, hoehe: 150 } });
    // Bereich 5 × 4 m ohne Wand: eine Doppelreihe Rücken an Rücken (je 2 Volieren nebeneinander), alle drei haben Platz.
    expect(mit.volieren.map((v) => `${v.x},${v.y}`)).toEqual(["300,1500", "500,1500", "300,1600"]);
    expect(mit.nichtPlatziert).toEqual([]);

    const eng = planeHalle({ ...HALLE_STANDARD, wandBuendig: false, richtung: "laengs" as const, hauptgang: { breite: 0, lage: "keiner" as const }, breite: 250, laenge: 2000 }, viele(1, "huehner"), {});
    expect(eng.warnungen.join(" ")).toContain("zu schmal");
  });

  test("Reihen quer zur Halle (Vorgabe): parallel zur kurzen Seite, Wandreihen an den Stirnwänden; Rechtecke in Hallenkoordinaten", async () => {
    const { planeHalle, HALLE_STANDARD } = await import("./hallenplan");
    // 10 m breit, 20 m lang: Reihen 7 m lang (10 Hühnerkäfige), quer über die Länge verteilt.
    const p = planeHalle({ ...HALLE_STANDARD, wandBuendig: false, hauptgang: { breite: 0, lage: "keiner" as const }, breite: 1000, laenge: 2000, flaechen: [{ name: "Eingang", art: "eingang", x: 300, y: 0, breite: 400, tiefe: 50 }] }, viele(12, "huehner"), {});
    expect(p.quer).toBe(true);
    expect(p.reihen[0]).toMatchObject({ art: "wand", x: 0, front: "rechts" });
    // Die vordere Stirnwand hat den Eingang (4 m): Reihe 1 geteilt (150–300 und 700–850) – zu kurz für eine Grundplatte.
    expect(p.reihen[0]!.abschnitte).toEqual([{ von: 150, bis: 300 }, { von: 700, bis: 850 }]);
    expect(p.reihen[0]!.flaechen[0]).toEqual({ x: 150, y: 0, b: 150, h: 70 });
    expect(p.reihen[0]!.kaefige).toHaveLength(0);
    expect(p.reihen.at(-1)).toMatchObject({ art: "wand", x: 2000 - 70, front: "links" });
    // Reihe 2 (7 m) fasst drei ganze Platten (9 Käfige); 12 Käfige brauchen also zwei Reihen – gleich lang gestellt je zwei
    // Platten (6 Käfige). Eine Platte wird nie geteilt. Erster Käfig in der Halle: ab x 150, quer liegend.
    expect(p.reihen[1]!.kaefige).toHaveLength(6);
    expect(p.reihen[1]!.platten.map((pl) => `${pl.belegt}/${pl.plaetze}`)).toEqual(["3/3", "3/3"]);
    expect(p.reihen[2]!.kaefige).toHaveLength(6);
    expect(p.reihen[1]!.kaefige[0]!.rechteck).toEqual({ x: 150, y: p.reihen[1]!.x, b: 70, h: 70 });
    expect(p.reihen[1]!.platten[0]!.rechteck).toEqual({ x: 150, y: p.reihen[1]!.x, b: 210, h: 70 });
  });

  test("passt ein großer Käfig nicht mehr, nutzen kleinere danach den Rest", async () => {
    const { planeHalle, HALLE_STANDARD } = await import("./hallenplan");
    // Eine Doppelreihe mit zwei Seiten zu 7 m: 5 Hühnerkäfige (2 Platten), dann ein Stamm (8 m) passt nirgends, dann Zwerghühner.
    const halle = { ...HALLE_STANDARD, wandBuendig: false, richtung: "laengs" as const, hauptgang: { breite: 0, lage: "keiner" as const }, breite: 440, laenge: 1000, wandreihen: false, quergang: false };
    const tiere = [...viele(5, "huehner"), tier(20, "stamm"), ...viele(3, "zwerghuehner", 30)];
    const p = planeHalle(halle, tiere, { stamm: { breite: 800, tiefe: 70, hoehe: 80 } });
    expect(p.nichtPlatziert.map((t) => t.id)).toEqual([20]);
    expect(p.reihen.flatMap((r) => r.kaefige).map((k) => k.id)).toEqual([1, 2, 3, 4, 5, 30, 31, 32]);
  });

  test("Käfige je Grundplatte: rund 2 m geteilt durch die Käfigbreite (100er 2, 70er 3, 50er 4, 40er 5), eigene Angabe geht vor", async () => {
    const { kaefigeJePlatte, HALLE_STANDARD } = await import("./hallenplan");
    expect(kaefigeJePlatte("huehner", 70, HALLE_STANDARD)).toBe(3);
    expect(kaefigeJePlatte("grosskaefig", 100, HALLE_STANDARD)).toBe(2);
    expect(kaefigeJePlatte("stamm", 120, HALLE_STANDARD)).toBe(1);
    expect(kaefigeJePlatte("zwerghuehner", 50, HALLE_STANDARD)).toBe(4);
    expect(kaefigeJePlatte("tauben", 40, HALLE_STANDARD)).toBe(5);
    expect(kaefigeJePlatte("huehner", 60, HALLE_STANDARD)).toBe(3);
    expect(kaefigeJePlatte("tauben", 40, { ...HALLE_STANDARD, jePlatte: { tauben: 4 } })).toBe(4);
    // Die frühere einheitliche Grundplatte der Halle bestimmt nichts mehr.
    expect(kaefigeJePlatte("huehner", 70, { ...HALLE_STANDARD, platte: { laenge: 140, tiefe: 70 } })).toBe(3);
  });

  test("Hauptgang an der Längsseite, an beiden oder in der Mitte; Eingang hält wie eine Sperrfläche frei", async () => {
    const { planeHalle, HALLE_STANDARD } = await import("./hallenplan");
    const basis = { ...HALLE_STANDARD, wandBuendig: false, breite: 1000, laenge: 2000 };
    // Reihen quer: sie laufen entlang der Breite (10 m); Hauptgang 3 m an der linken Längsseite.
    expect(planeHalle(basis, viele(1, "huehner"), {}).reihen[1]!.abschnitte).toEqual([{ von: 300, bis: 850 }]);
    expect(planeHalle({ ...basis, hauptgang: { breite: 300, lage: "beide" } }, viele(1, "huehner"), {}).reihen[1]!.abschnitte).toEqual([{ von: 300, bis: 700 }]);
    expect(planeHalle({ ...basis, hauptgang: { breite: 300, lage: "mitte" } }, viele(1, "huehner"), {}).reihen[1]!.abschnitte).toEqual([{ von: 150, bis: 350 }, { von: 650, bis: 850 }]);
    expect(planeHalle({ ...basis, hauptgang: { breite: 300, lage: "keiner" } }, viele(1, "huehner"), {}).reihen[1]!.abschnitte).toEqual([{ von: 150, bis: 850 }]);
    // Eingang an der hinteren Stirnwand (y 1950–2000), x 400–600: die hintere Wandreihe ist genau dort unterbrochen.
    const tuer = { name: "Haupteingang", art: "eingang" as const, x: 400, y: 1950, breite: 200, tiefe: 50 };
    const mitTuer = planeHalle({ ...basis, hauptgang: { breite: 300, lage: "keiner" }, flaechen: [tuer] }, viele(1, "huehner"), {});
    expect(mitTuer.reihen.at(-1)!.abschnitte).toEqual([{ von: 150, bis: 400 }, { von: 600, bis: 850 }]);
  });

  test("eingesetzte Volieren nehmen die Volieren der Reihe nach auf, Blöcke bleiben leer, Reihen weichen aus; gedreht", async () => {
    const { planeHalle, HALLE_STANDARD } = await import("./hallenplan");
    const basis = { ...HALLE_STANDARD, wandBuendig: false, richtung: "laengs" as const, hauptgang: { breite: 0, lage: "keiner" as const }, breite: 1000, laenge: 2000 };
    const masse = { voliere: { breite: 200, tiefe: 100, hoehe: 180 } };
    const tiere = [tier(1, "voliere"), tier(2, "voliere"), tier(3, "voliere"), ...viele(2, "huehner", 10)];
    const objekte = [
      { id: "a", art: "voliere" as const, x: 400, y: 1000, drehung: 0 as const },
      { id: "b", art: "voliere" as const, x: 400, y: 1300, drehung: 90 as const },
      { id: "c", art: "kaefigblock" as const, typ: "zwerghuehner" as const, x: 0, y: 300, drehung: 90 as const },
    ];
    const bereich = { name: "Volieren", art: "volieren" as const, x: 700, y: 1700, breite: 250, tiefe: 250 };
    const p = planeHalle({ ...basis, objekte, flaechen: [bereich] }, tiere, masse);
    expect(p.objekte.map((o) => `${o.name}:${o.tier?.id ?? "-"}:${o.rechteck.b}x${o.rechteck.h}`)).toEqual(["Voliere 1:1:200x100", "Voliere 2:2:100x200", "Block 50 × 50 × 50 cm:-:50x200"]);
    expect(p.objekte[2]!.plaetze).toBe(4);
    // Die dritte Voliere kommt in den Volierenbereich.
    expect(p.volieren.map((v) => v.id)).toEqual([3]);
    // Der gedrehte Block an der linken Wand (y 300–500, Zwerghuhnplatte 200 × 50) steht in der Wandreihe – ohne Gang davor und
    // dahinter. Er belegt nur sein Stück: der Abschnitt bleibt ganz, die Platte steht dahinter (davor ist zu wenig Platz).
    expect(p.reihen[0]!.abschnitte).toEqual([{ von: 150, bis: 1850 }]);
    expect(p.reihen[0]!.platten.map((pl) => [pl.rechteck.y, pl.rechteck.h])).toEqual([[500, 210]]);
    // Eine Voliere an derselben Stelle hält einen Gang Abstand.
    const mitVoliere = planeHalle({ ...basis, objekte: [{ id: "v", art: "voliere" as const, x: 0, y: 300, drehung: 90 as const }] }, viele(1, "huehner"), masse);
    expect(mitVoliere.reihen[0]!.abschnitte).toEqual([{ von: 650, bis: 1850 }]);
    expect(p.warnungen).toEqual([]);
  });

  test("Reihe von Hand verschieben: Käfige wandern mit; Überschneidung und Hinausragen werden gemeldet", async () => {
    const { planeHalle, HALLE_STANDARD } = await import("./hallenplan");
    const basis = { ...HALLE_STANDARD, wandBuendig: false, richtung: "laengs" as const, hauptgang: { breite: 0, lage: "keiner" as const }, breite: 1000, laenge: 2000 };
    const ohne = planeHalle(basis, viele(3, "huehner"), {});
    const mit = planeHalle({ ...basis, reihenVersatz: [{ nr: 1, dx: 40, dy: -100 }] }, viele(3, "huehner"), {});
    expect(mit.reihen[0]!.kaefige[0]!.rechteck).toEqual({ ...ohne.reihen[0]!.kaefige[0]!.rechteck, x: ohne.reihen[0]!.kaefige[0]!.rechteck.x + 40, y: 50 });
    expect(mit.reihen[0]!.versatz).toEqual({ dx: 40, dy: -100 });
    expect(mit.warnungen).toEqual([]);
    const kasse = { name: "Kasse", art: "sperre" as const, x: 300, y: 1000, breite: 200, tiefe: 200 };
    const quer = planeHalle({ ...basis, flaechen: [kasse], reihenVersatz: [{ nr: 1, dx: 300, dy: 800 }] }, viele(3, "huehner"), {});
    expect(quer.warnungen).toContain("R1 überschneidet „Kasse“.");
    const raus = planeHalle({ ...basis, reihenVersatz: [{ nr: 1, dx: -50, dy: 0 }] }, viele(3, "huehner"), {});
    expect(raus.warnungen).toContain("R1 ragt über die Halle hinaus.");
  });

  test("einzelne Grundplatte von Hand verschieben und drehen: nur ihre Käfige wandern mit; Überschneidung und Hinausragen gemeldet", async () => {
    const { planeHalle, HALLE_STANDARD, festschreiben } = await import("./hallenplan");
    const basis = { ...HALLE_STANDARD, wandBuendig: false, richtung: "laengs" as const, hauptgang: { breite: 0, lage: "keiner" as const }, breite: 1000, laenge: 2000 };
    // 9 Hühner: drei Platten zu je drei Käfigen in R1.
    const ohne = planeHalle(basis, viele(9, "huehner"), {});
    const r0 = ohne.reihen[0]!;
    expect(r0.platten.length).toBe(3);
    expect(r0.kaefige.map((k) => k.platte)).toEqual([0, 0, 0, 1, 1, 1, 2, 2, 2]);
    const mit = planeHalle({ ...basis, plattenVersatz: [{ reihe: 1, platte: 1, dx: 300, dy: 50 }] }, viele(9, "huehner"), {});
    const r1 = mit.reihen[0]!;
    // Platte 2 und ihre Käfige um (300, 50) verschoben, die anderen bleiben.
    expect(r1.platten[1]!.rechteck).toEqual({ ...r0.platten[1]!.rechteck, x: r0.platten[1]!.rechteck.x + 300, y: r0.platten[1]!.rechteck.y + 50 });
    expect(r1.platten[1]!.versatz).toEqual({ dx: 300, dy: 50 });
    for (const i of [3, 4, 5]) expect(r1.kaefige[i]!.rechteck).toEqual({ ...r0.kaefige[i]!.rechteck, x: r0.kaefige[i]!.rechteck.x + 300, y: r0.kaefige[i]!.rechteck.y + 50 });
    for (const i of [0, 1, 2, 6, 7, 8]) expect(r1.kaefige[i]!.rechteck).toEqual(r0.kaefige[i]!.rechteck);
    expect(r1.platten[0]!.versatz).toBeUndefined();
    expect(mit.warnungen).toEqual([]);
    // Gedreht um ihre Mitte: lange Seite quer, Mitte bleibt.
    const gedreht = planeHalle({ ...basis, plattenVersatz: [{ reihe: 1, platte: 1, dx: 300, dy: 0, drehung: 90 }] }, viele(9, "huehner"), {}).reihen[0]!;
    const q0 = r0.platten[1]!.rechteck, q1 = gedreht.platten[1]!.rechteck;
    expect([q1.b, q1.h]).toEqual([q0.h, q0.b]);
    expect(q1.x + q1.b / 2).toBeCloseTo(q0.x + q0.b / 2 + 300);
    expect(q1.y + q1.h / 2).toBeCloseTo(q0.y + q0.h / 2);
    // Auf die Nachbarplatte geschoben: Überschneidung; über die Wand: hinaus.
    const drauf = planeHalle({ ...basis, plattenVersatz: [{ reihe: 1, platte: 1, dx: 0, dy: -100 }] }, viele(9, "huehner"), {});
    expect(drauf.warnungen).toEqual(["R1 überschneidet R1 Platte 2."]);
    const raus = planeHalle({ ...basis, plattenVersatz: [{ reihe: 1, platte: 2, dx: -2000, dy: 0 }] }, viele(9, "huehner"), {});
    expect(raus.warnungen).toContain("R1 Platte 3 ragt über die Halle hinaus.");
    // Front links und Käfige tiefer als die Platte (Großkäfig 100 cm, Platte 70 cm): trotzdem auf ihrer Platte, und sie
    // wandern mit, wenn die Platte verschoben wird.
    const ohneWand = { ...basis, wandreihen: false };
    const gross = planeHalle(ohneWand, viele(4, "grosskaefig"), {});
    const links = gross.reihen.find((r) => r.front === "links" && r.kaefige.length)!;
    expect(links.kaefige.every((k) => k.platte != null)).toBe(true);
    const gv = planeHalle({ ...ohneWand, plattenVersatz: [{ reihe: links.nr, platte: 0, dx: 0, dy: 300 }] }, viele(4, "grosskaefig"), {}).reihen.find((r) => r.nr === links.nr)!;
    for (const k of gv.kaefige.filter((k) => k.platte === 0)) expect(k.rechteck.y).toBe(links.kaefige.find((x) => x.id === k.id)!.rechteck.y + 300);
    // Ohne Verschiebung (0/0) kein Unterschied; festgeschrieben bleibt die Verschiebung einstellbar.
    expect(planeHalle({ ...basis, plattenVersatz: [{ reihe: 1, platte: 1, dx: 0, dy: 0 }] }, viele(9, "huehner"), {}).reihen[0]!.platten[1]!.versatz).toBeUndefined();
    const fest = festschreiben(basis, mit, {}, "2026-11-12");
    expect(fest.reihen[0]!.platten.every((pl) => !("versatz" in pl))).toBe(true);
    const festMit = planeHalle({ ...basis, plattenVersatz: [{ reihe: 1, platte: 0, dx: 0, dy: 400 }] }, viele(9, "huehner"), {}, fest).reihen[0]!;
    expect(festMit.platten[0]!.rechteck.y).toBe(r0.platten[0]!.rechteck.y + 400);
    expect(festMit.platten[1]!.rechteck).toEqual(r0.platten[1]!.rechteck);
  });

  test("Plan festschreiben: Plätze bleiben, Storno macht frei, Nachmeldung in den freien Platz, sonst noch zu stellen; Maße geändert: Hinweis", async () => {
    const { planeHalle, festschreiben, HALLE_STANDARD } = await import("./hallenplan");
    const t = (id: number, typ: "huehner" | "tauben", sparte: string, nr = String(id)) => ({ id, typ, nr, rasse: "R", sparte, preisrichterId: null });
    const halle = { ...HALLE_STANDARD, richtung: "laengs" as const, wandreihen: false, wandBuendig: false, quergang: false, hauptgang: { breite: 0, lage: "keiner" as const }, breite: 800, laenge: 1000 };
    const tiere = [1, 2, 3, 4, 5, 6].map((i) => t(i, "huehner", "Hühner"));
    const plan = planeHalle(halle, tiere, {});
    const fest = festschreiben(halle, plan, {}, "2026-11-11T20:00:00Z");
    const lage = (p: typeof plan) => Object.fromEntries(p.reihen.flatMap((r) => r.kaefige.map((k) => [k.id, k.rechteck])));
    // Unverändert: gleiche Lage, Hinweis auf festen Plan.
    const gleich = planeHalle(halle, tiere, {}, fest);
    expect(lage(gleich)).toEqual(lage(plan));
    expect(gleich.fest).toEqual({ am: "2026-11-11T20:00:00Z", veraltet: false });
    // Storno von 3: Platz frei, die anderen bleiben stehen (die Automatik würde 4–6 aufrücken).
    const ohne3 = tiere.filter((x) => x.id !== 3);
    const storno = planeHalle(halle, ohne3, {}, fest);
    expect(lage(storno)).toEqual(Object.fromEntries(Object.entries(lage(plan)).filter(([id]) => id !== "3")));
    expect(storno.reihen[0]!.freiePlaetze!.map((f) => f.rechteck)).toEqual([lage(plan)[3]!]);
    // Reserve in ganzen Platten: der frei gewordene Platz, das freie Reihenende von R1 (570–850: eine Platte zu 3) und die
    // leeren Reihen R2–R4 (je 3 Platten zu 3).
    expect(storno.reserve).toEqual([{ typ: "huehner", anzahl: 1 + 3 + 27 }]);
    // Nachmeldung 2a (Huhn) kommt in den freien Platz; 6a ans freie Reihenende direkt hinter 6 – auf eine ganze neue Platte,
    // deren übrige Plätze frei bleiben; die anderen bleiben stehen.
    const nach = planeHalle(halle, [...ohne3, t(20, "huehner", "Hühner", "2a"), t(21, "huehner", "Hühner", "6a")], {}, fest);
    expect(lage(nach)[20]).toEqual(lage(plan)[3]);
    expect(lage(nach)[21]).toEqual({ ...lage(plan)[6]!, y: lage(plan)[6]!.y + 70 });
    expect(nach.nichtPlatziert).toEqual([]);
    for (const id of [1, 2, 4, 5, 6]) expect(lage(nach)[id]).toEqual(lage(plan)[id]!);
    expect(nach.reihen[0]!.platten.map((pl) => `${pl.belegt}/${pl.plaetze}@${pl.y}+${pl.laenge}`)).toEqual(["3/3@150+210", "3/3@360+210", "1/3@570+210"]);
    // Eine Taube (im Hühnerkäfig) wie jedes Tier: in den freien Platz gleicher Größe beim Nachbarn – Tauben werden nicht getrennt.
    const taube = planeHalle(halle, [...ohne3, t(30, "huehner", "Tauben", "2b")], {}, fest);
    expect(taube.nichtPlatziert).toEqual([]);
    expect(lage(taube)[30]).toEqual(lage(plan)[3]);
    // Halle voll: was keinen Platz findet, ist noch zu stellen.
    const voll = planeHalle(halle, [...ohne3, ...Array.from({ length: 50 }, (_, i) => t(100 + i, "huehner", "Hühner", `6${String.fromCharCode(97 + (i % 26))}`))], {}, fest);
    expect(voll.nichtPlatziert.length).toBeGreaterThan(0);
    expect(voll.warnungen.join(" ")).toContain("noch zu stellen");
    // Hallenmaße geändert: Hinweis, der feste Plan bleibt aber stehen.
    const anders = planeHalle({ ...halle, gang: 160 }, tiere, {}, fest);
    expect(anders.fest!.veraltet).toBe(true);
    expect(anders.warnungen[0]).toContain("nach dem Festschreiben geändert");
    // Versatz und Drehung wirken auch im festen Plan.
    const versetzt = planeHalle({ ...halle, reihenVersatz: [{ nr: 1, dx: 0, dy: 100 }] }, tiere, {}, fest);
    expect(lage(versetzt)[1]!.y).toBe(lage(plan)[1]!.y + 100);
  });

  test("Fester Plan (Gegenprüfung): Tauben direkt hinter den Hühnern, Volieren bleiben stehen, Volieren über Reihen, Startreihen ohne Wirkung", async () => {
    const { planeHalle, festschreiben, HALLE_STANDARD } = await import("./hallenplan");
    const t = (id: number, typ: "huehner" | "tauben" | "voliere", sparte: string, nr = String(id)) => ({ id, typ, nr, rasse: "R", sparte, preisrichterId: null });
    const halle = { ...HALLE_STANDARD, richtung: "laengs" as const, wandreihen: false, wandBuendig: false, quergang: false, hauptgang: { breite: 0, lage: "keiner" as const }, breite: 800, laenge: 1200 };
    // Hühner 1–6 in R1 (150–570), die Tauben 7–9 (neue Sparte) direkt dahinter auf ihrer eigenen Platte – lückenlos.
    const tiere = [...[1, 2, 3, 4, 5, 6].map((i) => t(i, "huehner", "Hühner")), ...[7, 8, 9].map((i) => t(i, "tauben", "Tauben"))];
    const plan = planeHalle(halle, tiere, {});
    const lage = (p: typeof plan) => Object.fromEntries(p.reihen.flatMap((r) => r.kaefige.map((k) => [k.id, k.rechteck])));
    expect(plan.reihen[0]!.kaefige.map((k) => k.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(plan.reihen[0]!.kaefige.filter((k) => k.typ === "tauben").map((k) => [k.id, k.y])).toEqual([[7, 570], [8, 610], [9, 650]]);
    const fest = festschreiben(halle, plan, {}, "x");
    // Storno von 2 und 8, Nachmeldungen 2a (Huhn) und 8a (Taube): je in den eigenen frei gewordenen Platz.
    const nach = planeHalle(halle, [...tiere.filter((x) => x.id !== 2 && x.id !== 8), t(20, "huehner", "Hühner", "2a"), t(21, "tauben", "Tauben", "8a")], {}, fest);
    expect(lage(nach)[20]).toEqual(lage(plan)[2]);
    expect(lage(nach)[21]).toEqual(lage(plan)[8]);
    expect(nach.nichtPlatziert).toEqual([]);

    // Volieren im Bereich bleiben stehen: Storno der ersten, die anderen rücken nicht; eine neue kommt in den freien Platz.
    const masse = { voliere: { breite: 200, tiefe: 100, hoehe: 180 } };
    const mitBereich = { ...halle, flaechen: [{ name: "Volieren", art: "volieren" as const, x: 0, y: 0, breite: 800, tiefe: 100 }] };
    const v = [t(50, "voliere", "Ziergeflügel"), t(51, "voliere", "Ziergeflügel"), t(52, "voliere", "Ziergeflügel")];
    const vPlan = planeHalle(mitBereich, [...tiere, ...v], masse);
    const vLage = (p: typeof plan) => Object.fromEntries(p.volieren.map((x) => [x.id, x.rechteck]));
    const vFest = festschreiben(mitBereich, vPlan, masse, "x");
    const ohne50 = planeHalle(mitBereich, [...tiere, v[1]!, v[2]!], masse, vFest);
    expect(vLage(ohne50)).toEqual({ 51: vLage(vPlan)[51]!, 52: vLage(vPlan)[52]! });
    const neu = planeHalle(mitBereich, [...tiere, v[1]!, v[2]!, t(53, "voliere", "Ziergeflügel")], masse, vFest);
    expect(vLage(neu)[53]).toEqual(vLage(vPlan)[50]);
    // Eingesetzte Volieren: Storno der ersten – die zweite behält ihr Tier.
    const objekte = [{ id: "a", art: "voliere" as const, x: 0, y: 900, drehung: 0 as const }, { id: "b", art: "voliere" as const, x: 300, y: 900, drehung: 0 as const }];
    const oPlan = planeHalle({ ...halle, objekte }, [...tiere, v[0]!, v[1]!], masse);
    const oFest = festschreiben({ ...halle, objekte }, oPlan, masse, "x");
    const oNach = planeHalle({ ...halle, objekte }, [...tiere, v[1]!], masse, oFest);
    expect(oNach.objekte.map((o) => o.tier?.id ?? null)).toEqual([null, 51]);

    // Volierenbereich nach dem Festschreiben über die Hühner gelegt: Warnung.
    const darueber = { ...halle, flaechen: [{ name: "Volieren", art: "volieren" as const, x: 0, y: 150, breite: 300, tiefe: 300 }] };
    const ueber = planeHalle(darueber, [...tiere, v[0]!], masse, fest);
    expect(ueber.warnungen.join(" ")).toContain("überschneidet");
    // Startreihen gelten im festen Plan nicht – keine falsche Warnung.
    const mitStart = planeHalle({ ...halle, spartenStart: [{ sparte: "Tauben", reihe: 2 }] }, tiere, {}, fest);
    expect(mitStart.warnungen.join(" ")).not.toContain("so viele Reihen");
  });

  test("Eingesetzter Käfigblock nimmt Tiere ohne Platz auf (passende Größe, Katalogfolge); Hinweis zählt neu", async () => {
    const { planeHalle, festschreiben, HALLE_STANDARD } = await import("./hallenplan");
    const t = (id: number, typ: "huehner" | "tauben", sparte: string) => ({ id, typ, nr: String(id), rasse: "R", sparte, preisrichterId: null });
    // Eine Doppelreihe 150–850: je Hälfte 3 ganze Platten zu 3 Hühnerkäfigen; 20 Hühner → 2 ohne Platz.
    const halle = { ...HALLE_STANDARD, richtung: "laengs" as const, wandreihen: false, wandBuendig: false, quergang: false, hauptgang: { breite: 0, lage: "keiner" as const }, breite: 600, laenge: 1000 };
    const tiere = Array.from({ length: 20 }, (_, i) => t(i + 1, "huehner", "Hühner"));
    const ohne = planeHalle(halle, tiere, {});
    expect(ohne.nichtPlatziert.map((x) => x.id)).toEqual([19, 20]);
    const block = { id: "b", art: "kaefigblock" as const, typ: "huehner" as const, x: 0, y: 900, drehung: 0 as const };
    const mit = planeHalle({ ...halle, objekte: [block] }, tiere, {});
    const b = mit.objekte[0]!;
    expect(b.kaefige!.map((k) => k.id)).toEqual([19, 20]);
    expect(b.kaefige!.map((k) => k.rechteck)).toEqual([{ x: 0, y: 900, b: 70, h: 70 }, { x: 70, y: 900, b: 70, h: 70 }]);
    expect(mit.nichtPlatziert).toEqual([]);
    expect(mit.warnungen.join(" ")).not.toContain("keinen Platz");
    // Tauben und Geflügel werden nicht getrennt: eine Taube im Hühnerkäfig und ein Huhn ohne Platz stehen beide im Block.
    const gemischt = planeHalle({ ...halle, objekte: [block] }, [...tiere.slice(0, 18), t(30, "huehner", "Tauben"), t(31, "huehner", "Hühner")], {});
    expect(gemischt.objekte[0]!.kaefige!.map((k) => k.id)).toEqual([30, 31]);
    expect(gemischt.nichtPlatziert).toEqual([]);
    // Auch im festen Plan: die Nachmeldung kommt in den Block.
    const fest = festschreiben(halle, planeHalle(halle, tiere.slice(0, 18), {}), {}, "2026-11-11T20:00:00Z");
    const nach = planeHalle({ ...halle, objekte: [block] }, [...tiere.slice(0, 18), t(40, "huehner", "Hühner")], {}, fest);
    expect(nach.objekte[0]!.kaefige!.map((k) => k.id)).toEqual([40]);
    expect(nach.warnungen.join(" ")).not.toContain("noch zu stellen");
  });

  test("Reihe drehen: um den Anfang der Reihe, in 90°-Schritten, danach verschoben; wandert nicht bei mehr Tieren; gedreht zählt als bewegt", async () => {
    const { planeHalle, HALLE_STANDARD, dreheRechteck, mitteVon } = await import("./hallenplan");
    // Rechteck 100 × 20 an (0, 0) um seine Mitte (50, 10) gedreht: 20 × 100, gleiche Mitte.
    expect(dreheRechteck({ x: 0, y: 0, b: 100, h: 20 }, { x: 50, y: 10 }, 90)).toEqual({ x: 40, y: -40, b: 20, h: 100 });
    expect(dreheRechteck({ x: 0, y: 0, b: 100, h: 20 }, { x: 50, y: 10 }, 270)).toEqual({ x: 40, y: -40, b: 20, h: 100 });
    expect(dreheRechteck({ x: 0, y: 0, b: 30, h: 20 }, { x: 50, y: 10 }, 180)).toEqual({ x: 70, y: 0, b: 30, h: 20 });
    const halle = { ...HALLE_STANDARD, richtung: "quer" as const, wandBuendig: false, hauptgang: { breite: 0, lage: "keiner" as const }, breite: 1500, laenge: 2500 };
    const gerade = planeHalle(halle, viele(6, "huehner"), {});
    const r1 = gerade.reihen[0]!;
    const gedreht = planeHalle({ ...halle, reihenVersatz: [{ nr: 1, dx: 0, dy: 0, drehung: 90 }] }, viele(6, "huehner"), {}).reihen[0]!;
    expect(gedreht.drehung).toBe(90);
    // Gleiche Käfige; der erste Käfig ist um den Drehpunkt (Mitte des ersten Platzes) gedreht.
    expect(gedreht.kaefige.map((k) => k.id)).toEqual(r1.kaefige.map((k) => k.id));
    expect(gedreht.drehpunkt).toEqual(r1.drehpunkt);
    expect(gedreht.kaefige[0]!.rechteck).toEqual(dreheRechteck(r1.kaefige[0]!.rechteck, r1.drehpunkt, 90));
    expect(mitteVon([gedreht.kaefige[0]!.rechteck])).toEqual(mitteVon([r1.kaefige[0]!.rechteck]));
    // Kommen Tiere dazu, bleibt die gedrehte Reihe stehen und wächst nur nach einer Seite.
    const mehr = planeHalle({ ...halle, reihenVersatz: [{ nr: 1, dx: 0, dy: 0, drehung: 90 }] }, viele(12, "huehner"), {}).reihen[0]!;
    expect(mehr.kaefige.slice(0, 6).map((k) => k.rechteck)).toEqual(gedreht.kaefige.map((k) => k.rechteck));
    const [p0, g0] = [r1.platten[0]!.rechteck, gedreht.platten[0]!.rechteck];
    expect([g0.b, g0.h]).toEqual([p0.h, p0.b]);
    expect(p0.b).not.toBe(p0.h);
    // Umriss der ganzen Reihe: Breite und Höhe getauscht.
    const umriss = (q: { x: number; y: number; b: number; h: number }[]) => [Math.max(...q.map((a) => a.x + a.b)) - Math.min(...q.map((a) => a.x)), Math.max(...q.map((a) => a.y + a.h)) - Math.min(...q.map((a) => a.y))];
    expect(umriss(gedreht.kaefige.map((k) => k.rechteck))).toEqual(umriss(r1.kaefige.map((k) => k.rechteck)).reverse());
    // Drehen und danach verschieben (3 m entlang der Hallenlänge).
    const oben = planeHalle({ ...halle, reihenVersatz: [{ nr: 1, dx: 0, dy: 300, drehung: 90 }] }, viele(6, "huehner"), {}).reihen[0]!;
    expect(oben.platten[0]!.rechteck.y).toBe(gedreht.platten[0]!.rechteck.y + 300);
    // Viermal gedreht = wie vorher; über die Wand gedreht: Hinweis.
    expect(planeHalle({ ...halle, reihenVersatz: [{ nr: 1, dx: 0, dy: 0, drehung: 0 }] }, viele(6, "huehner"), {}).reihen[0]!.kaefige[0]!.rechteck).toEqual(r1.kaefige[0]!.rechteck);
    const raus = planeHalle({ ...halle, reihenVersatz: [{ nr: 1, dx: -2000, dy: 0, drehung: 90 }] }, viele(6, "huehner"), {});
    expect(raus.warnungen.join(" ")).toContain("R1 ragt über die Halle hinaus");
  });

  test("Reihen quer: eingesetzte Teile und Reihenversatz in Hallenkoordinaten; Warnung nur einmal", async () => {
    const { planeHalle, HALLE_STANDARD } = await import("./hallenplan");
    const basis = { ...HALLE_STANDARD, wandBuendig: false, hauptgang: { breite: 0, lage: "keiner" as const }, breite: 1000, laenge: 2000 };
    const block = { id: "b", art: "kaefigblock" as const, typ: "huehner" as const, x: 400, y: 900, drehung: 0 as const };
    const p = planeHalle({ ...basis, objekte: [block], reihenVersatz: [{ nr: 2, dx: 30, dy: 0 }] }, viele(12, "huehner"), {});
    expect(p.objekte[0]!.rechteck).toEqual({ x: 400, y: 900, b: 210, h: 70 });
    // Reihen quer laufen entlang x; die Reihe unter dem Block (y 900–970) ist nur dort unterbrochen, wo er steht (x 400–610) –
    // ein Käfigblock schließt bündig an.
    const amBlock = p.reihen.find((r) => r.x < 970 && r.x + r.tiefe > 900)!;
    expect(amBlock.abschnitte).toEqual([{ von: 150, bis: 400 }, { von: 610, bis: 850 }]);
    // Reihe 2 um 30 cm entlang x verschoben (in der Halle: x).
    const ohne = planeHalle(basis, viele(12, "huehner"), {});
    expect(p.reihen[1]!.kaefige[0]!.rechteck.x).toBe(ohne.reihen[1]!.kaefige[0]!.rechteck.x + 30);
    // Teil außerhalb: genau eine Warnung.
    const raus = planeHalle({ ...basis, objekte: [{ ...block, x: 900 }] }, [], {});
    expect(raus.warnungen.filter((w) => w.includes("ragt"))).toEqual(["Block 70 × 70 × 70 cm ragt über die Halle hinaus."]);
  });

  test("bündig an Wänden: Reihenenden ohne Abstand, Hauptgang behält seinen Gang, ohne Hauptgang ein Quergang am Ende; Eingang nur dort, wo er ist", async () => {
    const { planeHalle, HALLE_STANDARD } = await import("./hallenplan");
    // Reihen quer (entlang der Breite 10 m): Hauptgang 3 m an der linken Längsseite, rechts bündig.
    const basis = { ...HALLE_STANDARD, breite: 1000, laenge: 2000 };
    expect(planeHalle(basis, viele(1, "huehner"), {}).reihen[1]!.abschnitte).toEqual([{ von: 300, bis: 1000 }]);
    // Ohne Hauptgang: Anfang bündig, am Ende ein Quergang (sonst wären die Gänge an beiden Enden zu); die Einzelreihe an der
    // Stirnwand steht ohnehin an der Wand (x 0).
    const ohneHg = planeHalle({ ...basis, hauptgang: { breite: 300, lage: "keiner" } }, viele(1, "huehner"), {});
    expect(ohneHg.reihen[1]!.abschnitte).toEqual([{ von: 0, bis: 850 }]);
    expect(ohneHg.reihen[0]).toMatchObject({ art: "wand", x: 0 });
    // Eingang an der rechten Längsseite (x 950–1000, entlang der Länge 9–11 m): nur Reihen in seiner Nähe halten Abstand.
    const tuer = { name: "Eingang", art: "eingang" as const, x: 950, y: 900, breite: 50, tiefe: 200 };
    const mitTuer = planeHalle({ ...basis, hauptgang: { breite: 300, lage: "keiner" }, flaechen: [tuer] }, viele(1, "huehner"), {});
    expect(mitTuer.reihen[1]!.abschnitte).toEqual([{ von: 0, bis: 850 }]);
    // Abschaltbar: wieder Gang an beiden Enden.
    expect(planeHalle({ ...basis, hauptgang: { breite: 300, lage: "keiner" }, wandBuendig: false }, viele(1, "huehner"), {}).reihen[1]!.abschnitte).toEqual([{ von: 150, bis: 850 }]);
  });

  test("Audit 8: automatische Volieren weichen eingesetzten Teilen und Flächen im Volierenbereich aus", async () => {
    const { planeHalle, HALLE_STANDARD } = await import("./hallenplan");
    const basis = { ...HALLE_STANDARD, richtung: "laengs" as const, wandBuendig: false, hauptgang: { breite: 0, lage: "keiner" as const }, breite: 1000, laenge: 2000 };
    const bereich = { name: "Volieren", art: "volieren" as const, x: 400, y: 1400, breite: 600, tiefe: 600 };
    const tiere = [1, 2, 3].map((id) => ({ id, typ: "voliere" as const, nr: String(id), rasse: "V", sparte: "Ziergeflügel", preisrichterId: null }));
    const p = planeHalle({ ...basis, flaechen: [bereich], objekte: [{ id: "o", art: "kaefigblock", typ: "huehner", x: 400, y: 1400, drehung: 0 }] }, tiere, { voliere: { breite: 200, tiefe: 100, hoehe: 180 } });
    const block = p.objekte[0]!.rechteck;
    const ueber = (a: { x: number; y: number; b: number; h: number }, c: typeof a) => a.x < c.x + c.b && c.x < a.x + a.b && a.y < c.y + c.h && c.y < a.y + a.h;
    for (const v of p.volieren) expect(ueber(v.rechteck, block)).toBe(false);
    expect(p.volieren.length + p.nichtPlatziert.length).toBe(3);
  });

  test("Audit 8: Käfig länger als jeder Abschnitt wird sofort aussortiert (Rechenzeit); Startreihen ohne Wirkung", async () => {
    const { planeHalle, HALLE_STANDARD } = await import("./hallenplan");
    const basis = { ...HALLE_STANDARD, richtung: "laengs" as const, wandBuendig: false, hauptgang: { breite: 0, lage: "keiner" as const }, breite: 50000, laenge: 50000, gang: 50 };
    const flaechen = Array.from({ length: 49 }, (_, i) => ({ name: `S${i}`, art: "sperre" as const, x: 0, y: 1000 * (i + 1), breite: 50000, tiefe: 10 }));
    const tiere = Array.from({ length: 2000 }, (_, i) => ({ id: i + 1, typ: "huehner" as const, nr: String(i + 1), rasse: "R", sparte: "Hühner", preisrichterId: null }));
    const start = performance.now();
    const p = planeHalle({ ...basis, flaechen }, tiere, { huehner: { breite: 1500, tiefe: 30, hoehe: 70 } });
    expect(p.nichtPlatziert).toHaveLength(2000);
    expect(performance.now() - start).toBeLessThan(400);
    const zuGross = planeHalle({ ...HALLE_STANDARD, breite: 1000, laenge: 2000, spartenStart: [{ sparte: "Tauben", reihe: 99 }] }, [{ id: 1, typ: "huehner", nr: "1", rasse: "R", sparte: "Hühner", preisrichterId: null }], {});
    expect(zuGross.warnungen).toEqual([]);
    expect(zuGross.nichtPlatziert).toHaveLength(0);
  });

  test("Wandreihe an einer Wand ohne Eingang läuft über die ganze Wand (auch durch den Hauptgang), an der Wand mit Eingang nicht", async () => {
    const { planeHalle, HALLE_STANDARD } = await import("./hallenplan");
    // Längs: Reihen entlang y, Wandreihen bei x = 0 (linke Wand, kein Eingang) und x = 930 (rechte Wand mit Eingang).
    const halle = { ...HALLE_STANDARD, richtung: "laengs" as const, wandBuendig: true, quergang: false, hauptgang: { breite: 250, lage: "ende" as const }, breite: 1000, laenge: 2000, flaechen: [{ name: "Eingang", art: "eingang" as const, x: 950, y: 1600, breite: 50, tiefe: 250 }] };
    const p = planeHalle(halle, viele(40, "huehner"), {});
    const links = p.reihen[0]!, rechts = p.reihen.at(-1)!, mitte = p.reihen[1]!;
    expect(links.art).toBe("wand");
    expect(links.abschnitte).toEqual([{ von: 0, bis: 2000 }]);
    // Die übrigen Reihen enden am Hauptgang, die rechte Wandreihe schon am Eingang (seitlich daneben kein Gang).
    expect(mitte.abschnitte).toEqual([{ von: 0, bis: 1750 }]);
    expect(rechts.abschnitte).toEqual([{ von: 0, bis: 1600 }]);
    // Ohne „bündig“ bleibt auch an der Wand ohne Eingang der Gang.
    expect(planeHalle({ ...halle, wandBuendig: false }, viele(2, "huehner"), {}).reihen[0]!.abschnitte).toEqual([{ von: 150, bis: 1750 }]);
  });

  test("Volieren: Doppelreihen Rücken an Rücken, an der Wand eine Einzelreihe, 1,50 m Gang; Hinweis bei Hand gesetzten zu nah", async () => {
    const { planeHalle, HALLE_STANDARD } = await import("./hallenplan");
    const basis = { ...HALLE_STANDARD, richtung: "laengs" as const, wandBuendig: false, hauptgang: { breite: 0, lage: "keiner" as const }, breite: 1000, laenge: 2000 };
    const masse = { voliere: { breite: 200, tiefe: 100, hoehe: 180 } };
    const tiere = Array.from({ length: 10 }, (_, i) => ({ id: i + 1, typ: "voliere" as const, nr: String(i + 1), rasse: "V", sparte: "Ziergeflügel", preisrichterId: null }));
    // Bereich 6 × 6 m an der hinteren Wand (y bis 2000): Doppelreihe bei 1400/1500, Gang, Einzelreihe an der Wand bei 1900.
    const bereich = { name: "Volieren", art: "volieren" as const, x: 400, y: 1400, breite: 600, tiefe: 600 };
    const p = planeHalle({ ...basis, flaechen: [bereich] }, tiere, masse);
    expect([...new Set(p.volieren.map((v) => v.rechteck.y))]).toEqual([1400, 1500, 1900]);
    expect(p.volieren).toHaveLength(9);
    expect(p.nichtPlatziert.map((t) => t.id)).toEqual([10]);
    // Gang zwischen Doppelreihe (bis 1600) und Wandreihe (ab 1900) mindestens 1,50 m.
    expect(1900 - 1600).toBeGreaterThanOrEqual(150);
    // Von Hand: zwei Volieren 80 cm auseinander → Hinweis; direkt Rücken an Rücken → kein Hinweis.
    const nah = planeHalle({ ...basis, objekte: [{ id: "a", art: "voliere", x: 100, y: 100, drehung: 0 }, { id: "b", art: "voliere", x: 100, y: 280, drehung: 0 }] }, [], masse);
    expect(nah.warnungen.join(" ")).toContain("Voliere 1 und Voliere 2 stehen nur 0,8 m auseinander");
    const ruecken = planeHalle({ ...basis, objekte: [{ id: "a", art: "voliere", x: 100, y: 100, drehung: 0 }, { id: "b", art: "voliere", x: 100, y: 200, drehung: 0 }] }, [], masse);
    expect(ruecken.warnungen.filter((w) => w.includes("auseinander"))).toEqual([]);
  });

  test("Grundplatte je Käfigart: so lang wie ihre Käfige, so tief wie ein Käfig (5 × 40 = 200 × 40), eigenes Maß je Art, Käfigblock und fester Plan", async () => {
    const { planeHalle, festschreiben, platteFuer, kaefigeJePlatte, HALLE_STANDARD } = await import("./hallenplan");
    const t = (id: number, typ: "huehner" | "tauben" | "zwerghuehner", sparte: string) => ({ id, typ, nr: String(id), rasse: "R", sparte, preisrichterId: null });
    const basis = { ...HALLE_STANDARD, richtung: "laengs" as const, wandreihen: false, wandBuendig: false, quergang: false, hauptgang: { breite: 0, lage: "keiner" as const }, breite: 600, laenge: 1000 };
    // Vorgabe: drei 70er auf 210 × 70, zwei 100er auf 200 × 100, fünf 40er auf 200 × 40.
    expect(platteFuer("huehner", { breite: 70, tiefe: 70 }, basis)).toEqual({ n: 3, etagen: 1, plaetze: 3, laenge: 210, tiefe: 70 });
    expect(platteFuer("grosskaefig", { breite: 100, tiefe: 100 }, basis)).toEqual({ n: 2, etagen: 1, plaetze: 2, laenge: 200, tiefe: 100 });
    expect(platteFuer("tauben", { breite: 40, tiefe: 40 }, basis)).toEqual({ n: 5, etagen: 1, plaetze: 5, laenge: 200, tiefe: 40 });
    // Eigenes Maß: 200 × 50 trägt fünf 40er; mit eigener Anzahl drei (die Platte bleibt 200 lang).
    const eigen = { ...basis, plattenMass: { tauben: { laenge: 200, tiefe: 50 } } };
    expect(platteFuer("tauben", { breite: 40, tiefe: 40 }, eigen)).toEqual({ n: 5, etagen: 1, plaetze: 5, laenge: 200, tiefe: 50 });
    expect(platteFuer("tauben", { breite: 40, tiefe: 40 }, { ...eigen, jePlatte: { tauben: 3 } })).toEqual({ n: 3, etagen: 1, plaetze: 3, laenge: 200, tiefe: 50 });
    // Eine Platte ist nie kürzer als ihre Käfige.
    expect(platteFuer("tauben", { breite: 40, tiefe: 40 }, { ...eigen, jePlatte: { tauben: 6 } }).laenge).toBe(240);
    expect(kaefigeJePlatte("tauben", 40, eigen)).toBe(5);
    // Im Plan: Taubenplatten 200 × 40 hinten in der Reihe (Rücken an Rücken), Hühnerplatten 210 × 70.
    const tauben = Array.from({ length: 7 }, (_, i) => t(i + 1, "tauben", "Tauben"));
    const p = planeHalle(basis, tauben, {});
    expect(p.reihen[0]!.platten.map((pl) => `${pl.belegt}/${pl.plaetze}@${pl.y}+${pl.laenge}x${pl.tiefe}`)).toEqual(["5/5@150+200x40", "2/5@350+200x40"]);
    const pe = planeHalle(eigen, tauben, {});
    expect(pe.reihen[0]!.platten.map((pl) => `${pl.belegt}/${pl.plaetze}@${pl.y}+${pl.laenge}x${pl.tiefe}`)).toEqual(["5/5@150+200x50", "2/5@350+200x50"]);
    // Käfigblock einer Art hat deren Platte; im festen Plan bekommt eine Nachmeldung am Reihenende eine Platte ihrer Art.
    const block = planeHalle({ ...basis, objekte: [{ id: "b", art: "kaefigblock" as const, typ: "tauben" as const, x: 0, y: 900, drehung: 0 as const }] }, [], {});
    expect(block.objekte[0]!.rechteck).toEqual({ x: 0, y: 900, b: 200, h: 40 });
    const vier = tauben.slice(0, 4);
    const fest = festschreiben(basis, planeHalle(basis, vier, {}), {}, "x");
    const nach = planeHalle(basis, [...vier, t(20, "tauben", "Tauben")], {}, fest);
    // Vier Tauben auf einer Platte zu fünf: die Nachmeldung kommt in den freien Platz, keine neue Platte.
    expect(nach.reihen[0]!.platten.map((pl) => `${pl.belegt}/${pl.plaetze}@${pl.y}+${pl.laenge}x${pl.tiefe}`)).toEqual(["5/5@150+200x40"]);
  });

  test("Nur ganze Grundplatten: am Reihenende wird keine Platte geteilt, nicht belegte Plätze bleiben frei auf der Platte", async () => {
    const { planeHalle, festschreiben, HALLE_STANDARD } = await import("./hallenplan");
    // Wandreihe 150–850 (7 m): drei Hühnerplatten (6,30 m), für eine vierte fehlen 1,40 m. Früher stand dort ein Käfig allein.
    const halle = { ...HALLE_STANDARD, richtung: "laengs" as const, wandBuendig: false, quergang: false, hauptgang: { breite: 0, lage: "keiner" as const }, breite: 1000, laenge: 1000 };
    const p = planeHalle(halle, viele(20, "huehner"), {});
    const alle = p.reihen.flatMap((r) => r.platten);
    // Jede Platte hat ihre volle Länge und alle ihre Plätze; in Reihe 1 nur ganze Platten.
    for (const pl of alle) expect([pl.laenge, pl.plaetze]).toEqual([210, 3]);
    expect(p.reihen[0]!.platten.map((pl) => pl.y)).toEqual([150, 360, 570]);
    expect(p.reihen[0]!.kaefige.map((k) => k.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    // 20 Tiere = 6 volle Platten und eine mit 2: ihr dritter Platz ist frei (für eine Nachmeldung) und zählt als Reserve.
    expect(alle.map((pl) => pl.belegt)).toEqual([3, 3, 3, 3, 3, 3, 2]);
    // R2 fasst wieder drei volle Platten (10–18), 19 und 20 stehen in R3 auf einer Platte mit einem freien Platz.
    expect(p.reihen[1]!.kaefige).toHaveLength(9);
    const r2 = p.reihen[2]!;
    expect(r2.kaefige.map((k) => k.id)).toEqual([19, 20]);
    expect(r2.freiePlaetze!.map((f) => f.y)).toEqual([r2.kaefige.at(-1)!.y + 70]);
    // Kein Käfig steht außerhalb einer Platte.
    for (const r of p.reihen)
      for (const k of r.kaefige) expect(r.platten.some((pl) => k.y >= pl.y - 0.01 && k.y + k.breite <= pl.y + pl.laenge + 0.01)).toBe(true);
    // Fester Plan: die Nachmeldung kommt in den freien Platz der angefangenen Platte, nicht als Einzelkäfig ans Reihenende.
    const fest = festschreiben(halle, p, {}, "x");
    const nach = planeHalle(halle, [...viele(20, "huehner"), tier(21, "huehner")], {}, fest);
    expect(nach.reihen[2]!.kaefige.find((k) => k.id === 21)!.y).toBe(r2.freiePlaetze![0]!.y);
    expect(nach.reihen.flatMap((r) => r.platten)).toHaveLength(7);
  });

  test("Ganze Platten (Gegenprüfung): aufsteigend, Sparten lückenlos, Belegung im festen Plan, Nachmeldung beim Nachbarn", async () => {
    const { planeHalle, festschreiben, HALLE_STANDARD } = await import("./hallenplan");
    const t = (id: number, typ: "huehner" | "zwerghuehner" | "tauben", sparte: string, nr = String(id)) => ({ id, typ, nr, rasse: sparte, sparte, preisrichterId: null });
    const basis = { ...HALLE_STANDARD, richtung: "laengs" as const, wandreihen: false, wandBuendig: false, quergang: false, hauptgang: { breite: 0, lage: "keiner" as const } };
    // Streng in Katalogfolge (Startreihen ohne Wirkung); eine neue Sparte folgt direkt (lückenlos), jede Käfigart auf ihrer
    // eigenen Platte; zwei gleich lange Reihen.
    const halleC = { ...basis, breite: 1500, laenge: 1200, spartenStart: [{ sparte: "Große Hühner", reihe: 1 }, { sparte: "Zwerghühner", reihe: 4 }] };
    const tiereC = [
      t(1, "huehner", "Große Hühner"), t(2, "huehner", "Große Hühner"), t(3, "huehner", "Große Hühner"),
      t(4, "huehner", "Wassergeflügel"), t(5, "huehner", "Wassergeflügel"), t(6, "tauben", "Tauben"), t(7, "tauben", "Tauben"),
      t(8, "huehner", "Ziergeflügel"), t(9, "zwerghuehner", "Zwerghühner"), t(10, "zwerghuehner", "Zwerghühner"), t(11, "zwerghuehner", "Zwerghühner"),
      t(12, "huehner", "Ziergeflügel"), t(13, "huehner", "Ziergeflügel"),
    ];
    const c = planeHalle(halleC, tiereC, {});
    expect(c.reihen.map((r) => r.platten.map((pl) => `${pl.typ}@${pl.y}`))).toEqual([
      ["huehner@150", "huehner@360", "tauben@570"],
      ["huehner@150", "zwerghuehner@360", "huehner@560"],
      [], [], [], [], [], [],
    ]);
    expect(c.reihen.flatMap((r) => r.kaefige.map((k) => k.id))).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
    expect(c.warnungen).toEqual([]);
    // Fester Plan: zwei Nachmeldungen hinter Huhn 6 – die erste bekommt eine neue Platte, die zweite deren freien Platz;
    // die Platte zählt beide.
    const halle = { ...basis, breite: 900, laenge: 1000 };
    const sechs = [1, 2, 3, 4, 5, 6].map((i) => t(i, "huehner", "Hühner"));
    const fest = festschreiben(halle, planeHalle(halle, sechs, {}), {}, "x");
    const d = planeHalle(halle, [...sechs, t(20, "huehner", "Hühner", "6a"), t(21, "huehner", "Hühner", "6b")], {}, fest);
    expect(d.reihen[0]!.platten.map((pl) => `${pl.belegt}/${pl.plaetze}@${pl.y}`)).toEqual(["3/3@150", "3/3@360", "2/3@570"]);
    const storno = planeHalle(halle, sechs.filter((x) => x.id !== 2), {}, fest);
    expect(storno.reihen[0]!.platten.map((pl) => pl.belegt)).toEqual([2, 3]);
    // Der nahe freie Platz gewinnt: Storno von 3, Nachmeldung 2a kommt dorthin, nicht ans Reihenende.
    const nah = planeHalle(halle, [...sechs.filter((x) => x.id !== 3), t(21, "huehner", "Hühner", "2a")], {}, fest);
    expect(nah.reihen[0]!.kaefige.find((k) => k.id === 21)?.y).toBe(290);
    // Auch ein freier Platz weiter vorn in derselben Reihe geht vor eine neue Platte: Storno von 2, Nachmeldung 6a.
    const vorn = planeHalle(halle, [...sechs.filter((x) => x.id !== 2), t(22, "huehner", "Hühner", "6a")], {}, fest);
    expect(vorn.reihen[0]!.kaefige.find((k) => k.id === 22)?.y).toBe(220);
    expect(vorn.reihen[0]!.platten).toHaveLength(2);
  });

  test("Reserve in ganzen Platten ohne Quergang; Schlüssel der Halle erkennt Änderungen, nicht die Schreibweise", async () => {
    const { planeHalle, HALLE_STANDARD, halleSchluessel } = await import("./hallenplan");
    // Eine Reihe 6,30 m (Halle längs 4,4 × 9,3 m ohne Wandreihen, ein Abschnitt): eine Hühnerplatte (2,10), Rest 4,20.
    const halle = { ...HALLE_STANDARD, richtung: "laengs" as const, wandBuendig: false, wandreihen: false, hauptgang: { breite: 0, lage: "keiner" as const }, breite: 440, laenge: 930 };
    const p = planeHalle(halle, viele(3, "huehner"), {});
    const huehner = p.reserve.find((r) => r.typ === "huehner")!;
    expect(p.reihen[0]!.kaefige).toHaveLength(3);
    // Hühner passen in den Rest von R1 (4,20 m = 2 Platten zu 3) und in R2 (6,30 m = 3 Platten).
    expect(huehner.anzahl).toBe(6 + 9);
    const mitZwerg = planeHalle(halle, [...viele(3, "huehner"), ...viele(1, "zwerghuehner", 10)], {});
    const zwerg = mitZwerg.reserve.find((r) => r.typ === "huehner")!;
    // Die Zwerghuhnplatte steht direkt hinter den Hühnern (2,00 m); im Rest von R1 (2,20 m) passt noch eine Hühnerplatte,
    // dazu R2 mit drei Platten.
    expect(mitZwerg.reihen[0]!.kaefige.map((k) => k.id)).toEqual([1, 2, 3, 10]);
    expect(zwerg.anzahl).toBe(3 + 9);
    // Reserve und Stellen stimmen überein: Was frei gemeldet wird, passt auch wirklich hinein (nur ganze Platten, freie Plätze auf angefangenen Platten zählen mit).
    const halle2 = { ...HALLE_STANDARD, richtung: "laengs" as const, wandBuendig: false, hauptgang: { breite: 0, lage: "keiner" as const }, breite: 1000, laenge: 870 };
    const frei = planeHalle(halle2, viele(1, "huehner"), {}).reserve.find((r) => r.typ === "huehner")!.anzahl;
    expect(frei).toBeGreaterThan(30);
    const genau = planeHalle(halle2, viele(1 + frei, "huehner"), {});
    expect(genau.nichtPlatziert).toHaveLength(0);
    expect(genau.reserve.find((r) => r.typ === "huehner")!.anzahl).toBe(0);
    expect(planeHalle(halle2, viele(2 + frei, "huehner"), {}).nichtPlatziert).toHaveLength(1);
    // Kein Käfig mehr als eine Käfigbreite vom vorigen entfernt (lückenlos) innerhalb eines Abschnitts.
    for (const r of genau.reihen) for (let i = 1; i < r.kaefige.length; i++) {
      const [v, k] = [r.kaefige[i - 1]!, r.kaefige[i]!];
      if (r.abschnitte.some((a) => v.y >= a.von && k.y < a.bis)) expect(k.y).toBe(v.y + v.breite);
    }
    expect(halleSchluessel(HALLE_STANDARD)).toBe(halleSchluessel({ ...HALLE_STANDARD, objekte: undefined, spartenStart: [] }));
    expect(halleSchluessel(HALLE_STANDARD)).not.toBe(halleSchluessel({ ...HALLE_STANDARD, gang: 160 }));
  });
});


describe("Vereinsmitglieder", () => {
  test("Schreibweisen des eigenen Vereins: Groß/klein, Bindestrich, Punkte und Leerzeichen zählen nicht", async () => {
    const { vereinsSchluessel, istEigenerVerein, istVereinsmitglied } = await import("./adressen");
    expect(vereinsSchluessel(" GZV  Musterdorf-Lindenau ")).toBe("gzv musterdorf lindenau");
    expect(vereinsSchluessel("R.G.Z.V. Gießen e.V.")).toBe("r g z v gießen e v");
    expect(vereinsSchluessel("")).toBe("");
    const eigene = ["GZV Musterdorf-Lindenau"];
    expect(istEigenerVerein("gzv musterdorf lindenau", eigene)).toBe(true);
    expect(istEigenerVerein("GZV Musterdorf Lindenau", eigene)).toBe(true);
    expect(istEigenerVerein("GZV Seehausen", eigene)).toBe(false);
    // Leere Vereinsangabe ist nie der eigene Verein – auch nicht, wenn versehentlich eine leere Schreibweise gespeichert ist.
    expect(istEigenerVerein("", ["", " - "])).toBe(false);
    // Von Hand gesetzt geht vor.
    expect(istVereinsmitglied({ verein: "GZV Seehausen", mitglied: true }, eigene)).toBe(true);
    expect(istVereinsmitglied({ verein: "GZV Musterdorf-Lindenau", mitglied: false }, eigene)).toBe(false);
    expect(istVereinsmitglied({ verein: "GZV Musterdorf-Lindenau", mitglied: null }, eigene)).toBe(true);
    expect(istVereinsmitglied({ verein: "GZV Feldberg", mitglied: null }, eigene)).toBe(false);
  });
});

describe("Vorschläge mit Vereinsverzeichnis", () => {
  test("eigene Schreibweise und eigener Kreisverband gehen vor, das Verzeichnis ergänzt nur Unbekanntes", async () => {
    const { adressVorschlaege, mitVerzeichnis, verzeichnisVorschlaege } = await import("./adressen");
    const eigen = [
      { verein: "GZV Musterdorf-Lindenau", kreisverband: "KV Musterkreis" },
      { verein: "GZV Musterdorf-Lindenau", kreisverband: "KV Musterkreis" },
      { verein: "GZV Feldberg 1896", kreisverband: "KV Probe" },
      // Eigener Verein ohne Kreisverband: kommt aus dem Verzeichnis (in eigener Schreibweise).
      { verein: "GZV Bassum", kreisverband: "" },
      // Eigener Verein mit zwei Kreisverbänden (mehrdeutig): bleibt ohne.
      { verein: "GZV Doppelt", kreisverband: "KV A" },
      { verein: "GZV Doppelt", kreisverband: "KV B" },
    ];
    expect(adressVorschlaege(eigen).vereine.find((x) => x.verein === "GZV Bassum")!.kreisverband).toBe("");
    const verz = verzeichnisVorschlaege([
      { verein: "gzv musterdorf-lindenau", kreisverband: "Kreisverband Musterkreis" },
      { verein: "GZV FELDBERG 1896", kreisverband: "KV PROBE" },
      { verein: "GZV FELDBERG 1896", kreisverband: "KV PROBE" },
      { verein: "RGZV Langenberg", kreisverband: "KV Gütersloh" },
      { verein: "RGZV Langenberg", kreisverband: "KV Mettmann" },
      { verein: "KTZV Ebenheim", kreisverband: "KV MUSTERKREIS" },
      { verein: "GZV Bassum", kreisverband: "KV PROBE" },
      { verein: "GZV Doppelt", kreisverband: "KV C" },
    ]);
    const v = mitVerzeichnis(eigen, verz);
    // Eigene Schreibweise und eindeutiger Kreisverband bleiben.
    expect(v.vereine.find((x) => x.verein.toLowerCase().startsWith("gzv musterdorf"))).toEqual({ verein: "GZV Musterdorf-Lindenau", kreisverband: "KV Musterkreis" });
    expect(v.vereine.find((x) => x.verein.toLowerCase().startsWith("gzv feldberg"))).toEqual({ verein: "GZV Feldberg 1896", kreisverband: "KV Probe" });
    // Aus dem Verzeichnis dazu: unbekannte Vereine; gleicher Name in zwei Kreisen ohne Kreisverband.
    // Nur im Verzeichnis: Kreisverband in eigener Schreibweise („KV Musterkreis“, nicht „KV MUSTERKREIS“).
    expect(v.vereine).toContainEqual({ verein: "KTZV Ebenheim", kreisverband: "KV Musterkreis" });
    expect(v.vereine).toContainEqual({ verein: "RGZV Langenberg", kreisverband: "" });
    expect(v.vereine).toContainEqual({ verein: "GZV Bassum", kreisverband: "KV Probe" });
    expect(v.vereine).toContainEqual({ verein: "GZV Doppelt", kreisverband: "" });
    expect(v.vereine).toHaveLength(6);
    // Kreisverbände: eigene Schreibweise bleibt („KV Probe“, nicht „KV PROBE“), unbekannte kommen dazu.
    expect(v.kreisverbaende).toEqual(["Kreisverband Musterkreis", "KV A", "KV B", "KV C", "KV Musterkreis", "KV Gütersloh", "KV Mettmann", "KV Probe"].sort(new Intl.Collator("de").compare));
  });
});
