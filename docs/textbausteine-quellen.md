# Textbausteine Bewertungskarte – Quellen und Methode

Stand: 10.11.2026 · Datei: `textbausteine.json` (700 Bausteine) · Generator: `bausteine_bauen.py` (gleicher Ordner)

## Executive Summary

Der Grundbestand umfasst 700 Bausteine in den Rubriken Vorzüge, Wünsche und Mängel. Sie sind auf 20 Körpermerkmal-Gruppen und 8 Geflügelarten verteilt, ohne doppelten Text. Die Formulierungen sind selbst geschrieben und folgen dem knappen Kartenstil: Vorzug als Eigenschaft („breite Brust“), Wunsch als Komparativ („Brust voller“, „Rücken etwas kürzer“), Mangel als Feststellung („Brust zu flach“). Für Rahmen, Abstufung und grobe Fehler bzw. Ausschlussfehler gibt es belastbare Quellen: EE-Referat, EE-Richtlinien Tauben, EE-Beschlüsse, VDT-Material. Eine öffentlich zugängliche, vollständige Liste mit Kartenformulierungen gibt es dagegen nicht. Der Wortschatz beruht deshalb großenteils auf Fachkenntnis und muss vor dem Einsatz von einem Preisrichter durchgesehen werden. Das gilt vor allem für Wasser- und Großgeflügel, Wachteln und Ziergeflügel.

## Kernkonzepte

- **Drei Rubriken:** Vorzüge, Wünsche, Mängel, in dieser Reihenfolge. Ein Eintrag unter Mängel schließt „sg“ und höhere Noten aus. Die Wortwahl zeigt die Gewichtung, z. B. ist „Rücken etwas kürzer“ ein Wunsch, „Rücken etwas lang“ oder „Rücken zu lang“ ein Mangel (Möckel, EE-Referat).
- **Gewichtung:** Form, Typ und Größe zuerst, dann besondere Rassemerkmale (Haube, Bart, Kamm, Fußwerk), dann Gefieder, Farbe vor Zeichnung, dann Kopf. Nebenmerkmale (Lauf-, Schnabel-, Augenfarbe) kommen zuletzt.
- **Noten:** Die Skala reicht von 97 bis 90. Bei 0/u gilt: Ausschlussfehler, kein Rassewert oder Kreuzung. Daneben gibt es o.B. (z. B. Ring, Pflege, Krankheit, Sichtbehinderung durch die Haube), u.M./uH (Manipulation) und n.a.
- **Tierschutz:** Übertypisierung ist zu kritisieren. Zitterhals, Sichtbehinderung und verkrampftes Stelzen werden ausdrücklich genannt.

## Gruppenliste (feste Liste, 20)

Gesamteindruck · Form · Haltung · Größe · Kopf · Kamm · Kehllappen/Ohrscheiben · Augen · Schnabel/Warzen · Hals · Rücken · Brust · Flügel · Schwanz · Läufe/Zehen · Gefieder · Farbe · Zeichnung · Federschmuck (Haube, Kappe, Bart, Rosetten, Brustbart, Schmuckfedern) · Kondition/Pflege

Zuordnung von Sonderfällen: Bauchwamme liegt bei Form, Kiel bei Brust, Kehlwamme bei Hals, Bohne bei Schnabel/Warzen, Augenrand bei Augen, Stirn und Kopfpunkte bei Kopf, Belatschung und Geierfedern bei Läufe/Zehen. Helm (Perlhuhn) und Stirnzapfen (Pute) gehören zu Kopf. Rad (Pute) und Erpellocken stehen bei Schwanz, Flügelspiegel und Halsring bei Zeichnung.

## Anzahl je Kategorie und Art

| Art | Vorzug | Wunsch | Mangel | Summe |
|---|---|---|---|---|
| alle | 99 | 100 | 147 | 346 |
| huehner | 45 | 39 | 62 | 146 |
| tauben | 37 | 27 | 41 | 105 |
| wasser | 19 | 11 | 21 | 51 |
| puten | 7 | 4 | 6 | 17 |
| perlhuehner | 5 | 3 | 5 | 13 |
| wachteln | 3 | 1 | 2 | 6 |
| ziergefluegel | 6 | 3 | 7 | 16 |
| **Summe** | **221** | **188** | **291** | **700** |

Jede Gruppe hat Einträge in allen drei Kategorien. Zwerghühner sind unter `huehner` erfasst. Für Puten, Perlhühner, Wachteln, Wasser- und Ziergeflügel gelten zusätzlich alle Bausteine mit `art: "alle"`. Die Oberfläche sollte also je Tier `alle` plus die eigene Art anbieten.

## Methode

1. Websuche (Begriffe mit und ohne 2026) zu Bewertungskarte, Rubriken, groben Fehlern und Ausschlussfehlern, Schauberichten sowie Tauben, Wassergeflügel, Puten, Perlhühnern, Wachteln und Ziergeflügel. Die PDFs wurden lokal in Text umgewandelt und ausgewertet.
2. Aus den Quellen übernommen: Rubriklogik, Abstufung Wunsch/Mangel, Gewichtung sowie konkrete Fehler- und Grenzfälle. Beispiele: Querfalten in den Kehllappen als grober Fehler, Entenfüßigkeit, S-förmiges Brustbein, Ring eingewachsen und Zitterhals als Ausschluss. Bei Tauben: Brustbein „nicht einwandfrei“ höchstens 94, also Wunsch; 10×9 Handschwingen als Wunsch; 11/13 Schwanzfedern als grober Fehler, 10/14 als Ausschluss; äußere Schwinge länger als vorletzte als grober Fehler. Fehlende Kralle an der Hinterzehe bei Enten höchstens 95, also Wunsch. Fehlende Sporen beim Althahn, Stoppeln an den Füßen bei Tauben als Mangel (b90), Fußbefiederung je nach Ausprägung Wunsch oder Mangel. Dazu Augenrand und Warzen (feucht, schwammig, sichtbehindernd) und o.B.-Gründe (Ring, Pflege, Ungeziefer, beschnittene Federränder).
3. Formulierungen selbst verfasst, keine Liste und kein Standardtext übernommen, keine rassespezifischen Standardbeschreibungen. Der erste Entwurf hatte 976 Bausteine. Er wurde auf den Richtwert gekürzt, indem bedeutungsnahe Varianten gestrichen wurden (Streichliste im Generator, also nachvollziehbar und umkehrbar).
4. Automatisch geprüft: höchstens 60 Zeichen (längster Baustein 47), kein Punkt am Ende, kein Text doppelt (auch nicht zwischen Rubriken), gültiges UTF-8-JSON.

## Unsicherheiten und Lücken

- **Kein öffentlicher Formulierungskatalog:** Für die Wendungen selbst ließen sich keine drei unabhängigen Quellen je Gruppe finden. Belegt sind Rahmen und Fehlerkategorien, nicht jeder einzelne Baustein. Eine Durchsicht durch Preisrichter ist nötig, getrennt nach Zulassungsgruppen (A Groß-/Wassergeflügel, B/D Hühner/Zwerghühner, Tauben-Gruppen, Z Ziergeflügel).
- **Wasser-, Großgeflügel, Wachteln, Ziergeflügel:** Hier gab es kaum Online-Quellen (nur EE-Beschlüsse und OGBZ als Bewertungsgrundlage). Bausteine wie „Sattelschnabel“, „Ansatz eines Kiels“, „Kehlwamme“, „Rad lückenhaft“, „Helm schief“ und „Wildzeichnung verwaschen“ sind fachlich plausibel, aber nicht belegt. Wachteln (6) und Perlhühner (13) sind bewusst dünn besetzt.
- **Richtung ist rasseabhängig:** Vieles ist je nach Rasse Vorzug oder Mangel, z. B. Haltung steil/flach, Flügel hoch/tief, Gefieder hart/weich, Kiel, Bauchwamme, Augenfarbe hell/dunkel, gekreuzte Flügel (bei manchen Tauben erwünscht). Die Bausteine sind deshalb neutral oder paarweise formuliert. Eine Rassen-Filterung ist nicht enthalten.
- **Schwere grober Fehler:** Ob ein Mangel zu b90, o.B. oder u/0 führt, regeln AAB und Standard je Rasse. Die AAB-Fassung (§ 7) war online nicht einsehbar, sie wird nur in VDT-Folien zitiert. Die Bausteine tragen deshalb keine Notenfolge. Für die App wäre ein zusätzliches Feld `schwere` (mangel / grob / ausschluss / oB / uM) sinnvoll und von Fachleuten zu befüllen.
- **„Seitenfedern im Kamm“** aus dem Auftrag ist als „Seitensprossen am Kamm“ umgesetzt (fachüblicher Begriff). Federn am Kamm selbst ließen sich nicht als eigener Fehlerbegriff belegen.
- **Ring- und o.B.-Vermerke:** Sie stehen unter Kondition/Pflege als Mangel. Nach den Bestimmungen entfällt bei unberingten Tieren die Kritik ganz, „Ring fehlt“ wurde deshalb nicht aufgenommen.
- **Nutzungsrechte:** Es ist kein BDRG-Standardtext enthalten. Entscheidung `docs/entscheidungen/007-keine-bdrg-daten.md` bleibt unberührt.

## Quellenverzeichnis

- [Möckel: Bewertung und Bewertungssystem unseres Rassegeflügels (Referat EE Linz, Kleintiere Schweiz)](https://www.kleintiere-schweiz.ch/resources/3/uploads/Bewertung%20und%20Bewertungssystem%20unseres%20Rassegefl%C3%BCgels%20_2_.pdf)
- [EE: Allgemeine Bewertungsrichtlinien für Rassetauben, Status 2016](https://entente-ee.eu/wp-content/uploads/2023/10/EE-Allgemeine-Bewertungsrichtlinien-fur-Rassetauben-Status-2016.pdf)
- [EE: General Guidelines for the judging of fancy Pigeons](https://entente-ee.eu/wp-content/uploads/2023/10/EE-General-Guidelines-for-the-judging-of-fancy-Pigeons.docx.pdf)
- [EE: Beschlüsse der EE-Tagungen Sparte Geflügel, Generelles (Stand 16.05.2025)](https://entente-ee.eu/wp-content/uploads/Beschlusse2025d_Generelles.pdf)
- [EE: Reglement zur Durchführung rassebezogener Europaschauen](https://entente-ee.eu/wp-content/uploads/2023/10/Reglement-zur-Durchfuhrung-Rassebezogener-Europaschauen-1.pdf)
- [VDT: Schaubericht HSS Brünner Kröpfer Leipzig 2023](https://vdt-online.de/wp-content/uploads/2024/07/VDT-Online_2023_Schaubericht_HSS-Leipzig_Bruenner-Kroepfer.pdf)
- [VDT: Schausaison SV Persische Roller](https://www.vdt-online.de/?p=28306)
- [VDT: Weichold, Praxisbeispiele Tierschutz (VDT-Meeting 2024)](https://vdt-online.de/wp-content/uploads/2024/09/Praxisbeispiele_Tierschutz_Juergen_Weichold.pdf)
- [PV Berlin-Brandenburg: Hinweise für Ausstellungen und Preisrichter](https://rgz-lvbb.de/images/stories/pdf/pv-b_brb-hinweise.pdf)
- [Kleintiere Schweiz: Zucht und Haltung von Hühnern mit befiederten Füßen](https://www.kleintiere-schweiz.ch/resources/3/uploads/Gefluegel_Federfu%CC%88ssige_Hu%CC%88hnerrassen_RG_HM.pdf)
- [Rheinpfalz: Gefiederte Schönheiten (Bewertungskarte am Käfig)](https://www.rheinpfalz.de/lokal/kaiserslautern_artikel,-gefiederte-sch%C3%B6nheiten-_arid,725345.html)
- [BDRG: Rassenverzeichnis 2024 (Artenumfang inkl. Wachteln, Puten, Perlhühner)](https://www.bdrg.de/media/user_upload/Rassenverzeichnis_BDRG_2024.pdf)
- [Vogelbund: Bewertung von Vögeln mit Extremmerkmalen](https://vogelbund.de/wp-content/uploads/2022/03/Bewertung-von-Voegeln-mit-Extremmerkmalen.pdf)
