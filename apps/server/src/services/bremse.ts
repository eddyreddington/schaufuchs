import { fehler } from "../trpc";

/**
 * Bremse gegen Durchprobieren von Passwörtern und PINs.
 * Ein Versuch wird gezählt, BEVOR geprüft wird (synchron, also auch bei gleichzeitigen Anfragen atomar);
 * bei Erfolg wird er wieder gutgeschrieben. So laufen auch parallele Anfragen in die Sperre.
 * Die Zähler liegen im Arbeitsspeicher; abgelaufene und auf null zurückgegebene Einträge werden entfernt, und es
 * gibt höchstens `maxEintraege` – sonst füllten abgewiesene Anfragen mit immer neuen Schlüsseln den Speicher.
 */
export class Bremse {
  private zaehler = new Map<string, { n: number; bis: number }>();

  constructor(
    readonly max: number,
    private readonly fensterMs: number,
    private readonly meldung: string,
    private readonly maxEintraege = MAX_EINTRAEGE,
  ) {
    const aufraeumen = setInterval(() => this.aufraeumen(), 5 * 60_000);
    aufraeumen.unref?.();
  }

  /** Zahl der Einträge (Tests, Überwachung). */
  get eintraege() {
    return this.zaehler.size;
  }

  /** Gezählte Versuche im laufenden Fenster. */
  anzahl(schluessel: string): number {
    const f = this.zaehler.get(schluessel);
    return f && f.bis > Date.now() ? f.n : 0;
  }

  /** Neuer Eintrag: vorher Platz schaffen (Abgelaufenes, dann die ältesten ungesperrten, zur Not die ältesten). */
  private neu(schluessel: string, n: number, bis: number) {
    if (this.zaehler.size >= this.maxEintraege) {
      this.aufraeumen();
      platzSchaffen(this.zaehler, this.maxEintraege, (f) => f.n < this.max);
    }
    this.zaehler.set(schluessel, { n, bis });
  }

  private zurueck(schluessel: string, menge: number) {
    const f = this.zaehler.get(schluessel);
    if (!f) return;
    f.n = Math.max(0, f.n - menge);
    if (f.n === 0) this.zaehler.delete(schluessel);
  }

  /** Reserviert einen Versuch für alle Schlüssel oder wirft TOO_MANY_REQUESTS. Rückgabe: bei Erfolg aufrufen. */
  versuch(schluessel: string[]): () => void {
    const jetzt = Date.now();
    for (const k of schluessel) {
      const f = this.zaehler.get(k);
      if (f && f.bis > jetzt && f.n >= this.max) throw fehler("TOO_MANY_REQUESTS", this.meldung);
    }
    for (const k of schluessel) {
      const f = this.zaehler.get(k);
      if (!f || f.bis <= jetzt) this.neu(k, 1, jetzt + this.fensterMs);
      else f.n++;
    }
    return () => {
      for (const k of schluessel) this.zurueck(k, 1);
    };
  }

  /**
   * Wie `versuch`, aber zählt `menge` Einheiten für einen Schlüssel, mit eigener Obergrenze je Aufruf (etwa Tiere je
   * Adresse nach Hallengröße). Rückgabe: aufrufen, wenn die Menge doch nicht belegt wurde.
   */
  menge(schluessel: string, menge: number, max = this.max): () => void {
    const jetzt = Date.now();
    const f = this.zaehler.get(schluessel);
    const laeuft = f && f.bis > jetzt;
    if ((laeuft ? f.n : 0) + menge > max) throw fehler("TOO_MANY_REQUESTS", this.meldung);
    if (laeuft) f.n += menge;
    else this.neu(schluessel, menge, jetzt + this.fensterMs);
    return () => this.zurueck(schluessel, menge);
  }

  /** Zähler zurücksetzen (z. B. neue PIN gesetzt): alle Schlüssel, auf die `passt` zutrifft (genau prüfen, nicht als Teiltext). */
  zuruecksetzen(passt: (schluessel: string) => boolean) {
    for (const k of this.zaehler.keys()) if (passt(k)) this.zaehler.delete(k);
  }

  /** Nur prüfen, ob gesperrt – ohne zu zählen. */
  pruefe(schluessel: string[]) {
    const jetzt = Date.now();
    for (const k of schluessel) {
      const f = this.zaehler.get(k);
      if (f && f.bis > jetzt && f.n >= this.max) throw fehler("TOO_MANY_REQUESTS", this.meldung);
    }
  }

  private aufraeumen() {
    const jetzt = Date.now();
    for (const [k, f] of this.zaehler) if (f.bis <= jetzt) this.zaehler.delete(k);
  }
}

/** Obergrenze je Bremse: genug für jede Schau (rund 100 Byte je Eintrag, also wenige MB), zu wenig für einen Speicherüberlauf. */
const MAX_EINTRAEGE = 50_000;

/**
 * Volle Map auf neun Zehntel bringen: zuerst die ältesten Einträge, die `entbehrlich` sind (z. B. nicht gesperrt), dann
 * zur Not die ältesten überhaupt (Map behält die Einfüge-Reihenfolge). Gleich ein Zehntel, damit nicht jede neue
 * Anfrage die ganze Map durchgeht.
 */
function platzSchaffen<T>(map: Map<string, T>, max: number, entbehrlich: (wert: T) => boolean) {
  const ziel = Math.floor(max * 0.9);
  for (const [k, v] of map) {
    if (map.size <= ziel) return;
    if (entbehrlich(v)) map.delete(k);
  }
  for (const k of map.keys()) {
    if (map.size <= ziel) return;
    map.delete(k);
  }
}

/**
 * Zwei Fenster über dieselben Schlüssel, etwa beim zweiten Faktor: ein kurzes gegen schnelles Durchprobieren und ein
 * langes gegen langsames über Tage und Wochen. `mitLang`: der Versuch zählt auch im langen Fenster. Zurücksetzen
 * (Ausstellungsleitung) gilt für beide.
 */
export class Stufenbremse {
  constructor(
    readonly kurz: Bremse,
    readonly lang: Bremse,
  ) {}

  versuch(schluessel: string[], mitLang = false): () => void {
    // Erst beide prüfen, dann zählen: ein abgewiesener Versuch verbraucht keinen Zähler der anderen Stufe.
    if (mitLang) this.lang.pruefe(schluessel);
    const kurz = this.kurz.versuch(schluessel);
    const lang = mitLang ? this.lang.versuch(schluessel) : () => {};
    return () => {
      kurz();
      lang();
    };
  }

  zuruecksetzen(passt: (schluessel: string) => boolean) {
    this.kurz.zuruecksetzen(passt);
    this.lang.zuruecksetzen(passt);
  }
}

/**
 * Steigende Wartezeit je Konto bzw. Preisrichter statt einer festen Sperre: Die ersten `frei` Fehlversuche kosten
 * nichts, danach verdoppelt sich die Wartezeit (1 s, 2 s, 4 s …) bis höchstens `maxMs`. Nach `ruheMs` ohne
 * Fehlversuch ist alles vergessen. Sie bremst verteiltes Durchprobieren über viele Adressen.
 * Grenzen: Ein Fremder kann sie mit wenigen Anfragen hochhalten. Deshalb gilt sie nicht für Adressen, von denen sich
 * das Konto schon erfolgreich angemeldet hat, und die Ausstellungsleitung kann sie aufheben – danach bleibt das Konto
 * `freigabeMs` lang ohne Wartezeit und auch ohne die Sperre je Adresse (die Bremse je Gerät gilt weiter). Die Meldung nennt nur Minuten.
 * Wie bei der Bremse zählt der Versuch vor der Prüfung, damit parallele Anfragen nicht vorbeikommen.
 */
export class Wartezeit {
  private stand = new Map<string, { n: number; bis: number; zuletzt: number }>();
  private bekannt = new Map<string, number>();
  private freigabe = new Map<string, number>();

  constructor(
    private readonly frei: number,
    private readonly maxMs: number,
    private readonly ruheMs: number,
    private readonly meldung: (minuten: number) => string,
    private readonly bekanntMs = 30 * 86_400_000,
    private readonly freigabeMs = 30 * 60_000,
    private readonly maxEintraege = MAX_EINTRAEGE,
  ) {
    const aufraeumen = setInterval(() => this.aufraeumen(), 5 * 60_000);
    aufraeumen.unref?.();
  }

  /** Zahl der Einträge mit Fehlversuchen (Tests, Überwachung). */
  get eintraege() {
    return this.stand.size;
  }

  private ausgenommen(schluessel: string, adresse: string, jetzt: number) {
    return (this.bekannt.get(`${schluessel}|${adresse}`) ?? 0) > jetzt || (this.freigabe.get(schluessel) ?? 0) > jetzt;
  }

  /**
   * Bekanntes Paar aus Konto und Adresse oder von der Ausstellungsleitung freigegeben: Die Sperre je Adresse gilt dann
   * nicht – sonst sperrte ein Fremder im selben Netz alle aus. Die Bremse je Gerät und Konto gilt weiter.
   */
  istAusgenommen(schluessel: string, adresse: string) {
    return this.ausgenommen(schluessel, adresse, Date.now());
  }

  /** Hat sich das Konto von dieser Adresse bzw. diesem Gerät (Gerätekennzeichen) schon erfolgreich angemeldet? */
  istBekannt(schluessel: string, adresse: string) {
    return (this.bekannt.get(`${schluessel}|${adresse}`) ?? 0) > Date.now();
  }

  /** Paar aus Konto und Adresse bzw. Gerät als bekannt merken (nach einer erfolgreichen Anmeldung). */
  merke(schluessel: string, adresse: string) {
    // Voll: die ältesten Einträge zuerst verwerfen (Map behält die Einfüge-Reihenfolge), nicht alle auf einmal.
    while (this.bekannt.size >= 20_000) this.bekannt.delete(this.bekannt.keys().next().value!);
    this.bekannt.delete(`${schluessel}|${adresse}`);
    this.bekannt.set(`${schluessel}|${adresse}`, Date.now() + this.bekanntMs);
  }

  private aktuell(schluessel: string, jetzt: number) {
    const f = this.stand.get(schluessel);
    if (f && jetzt - f.zuletzt > this.ruheMs) {
      this.stand.delete(schluessel);
      return undefined;
    }
    return f;
  }

  /** Nur prüfen, ohne zu zählen: wirft TOO_MANY_REQUESTS, wenn gewartet werden muss. */
  pruefe(schluessel: string, adresse: string) {
    const jetzt = Date.now();
    if (this.ausgenommen(schluessel, adresse, jetzt)) return;
    const f = this.aktuell(schluessel, jetzt);
    if (f && f.bis > jetzt) throw fehler("TOO_MANY_REQUESTS", this.meldung(Math.max(1, Math.ceil((f.bis - jetzt) / 60_000))));
  }

  /**
   * Reserviert einen Versuch oder wirft TOO_MANY_REQUESTS. Rückgabe aufrufen mit `true`, wenn die Anmeldung gelungen ist
   * (die Adresse gilt dann als bekannt), mit `false`, wenn der Versuch gar nicht geprüft wurde (wird zurückgegeben).
   */
  versuch(schluessel: string, adresse: string): (gelungen: boolean) => void {
    this.pruefe(schluessel, adresse);
    const jetzt = Date.now();
    const merken = () => this.merke(schluessel, adresse);
    if (this.ausgenommen(schluessel, adresse, jetzt)) return (gelungen) => gelungen && merken();
    const f = this.aktuell(schluessel, jetzt);
    const n = (f?.n ?? 0) + 1;
    const bis = n > this.frei ? jetzt + Math.min(this.maxMs, 1000 * 2 ** Math.min(30, n - this.frei - 1)) : 0;
    if (!f && this.stand.size >= this.maxEintraege) {
      this.aufraeumen();
      platzSchaffen(this.stand, this.maxEintraege, (g) => g.bis <= jetzt);
    }
    if (f) Object.assign(f, { n, bis, zuletzt: jetzt });
    else this.stand.set(schluessel, { n, bis, zuletzt: jetzt });
    return (gelungen) => {
      const g = this.stand.get(schluessel);
      if (g) {
        g.n = Math.max(0, g.n - 1);
        if (g.n <= this.frei) g.bis = 0;
        // Auf null zurück (nicht geprüft oder gelungen): kein Eintrag bleibt stehen.
        if (g.n === 0) this.stand.delete(schluessel);
      }
      if (gelungen) merken();
    };
  }

  /**
   * Wartezeit für genau diesen Schlüssel aufheben. `freigeben` (Schaltfläche der Ausstellungsleitung): danach eine Weile
   * gar keine, damit ein Fremder sie nicht gleich wieder hochtreibt. Eine neue PIN setzt nur zurück.
   */
  zuruecksetzen(schluessel: string, freigeben = false) {
    this.stand.delete(schluessel);
    if (freigeben) this.freigabe.set(schluessel, Date.now() + this.freigabeMs);
  }

  /** Muss gerade gewartet werden? (Anzeige in der Verwaltung) */
  wartet(schluessel: string): boolean {
    const jetzt = Date.now();
    return (this.freigabe.get(schluessel) ?? 0) <= jetzt && (this.stand.get(schluessel)?.bis ?? 0) > jetzt;
  }

  private aufraeumen() {
    const jetzt = Date.now();
    for (const [k, f] of this.stand) if (jetzt - f.zuletzt > this.ruheMs) this.stand.delete(k);
    for (const [k, bis] of this.bekannt) if (bis <= jetzt) this.bekannt.delete(k);
    for (const [k, bis] of this.freigabe) if (bis <= jetzt) this.freigabe.delete(k);
  }
}

/** Für Mengengrenzen: ein Anschluss hat meist ein /56-Netz, seine /64-Netze zählen zusammen. IPv4 bleibt, wie es ist. */
export function anschlussSchluessel(schluessel: string): string {
  const m = schluessel.match(/^([^:]+:[^:]+:[^:]+):([^:]+)::\/64$/);
  return m ? `${m[1]}:${(parseInt(m[2]!, 16) & 0xff00).toString(16)}::/56` : schluessel;
}

/**
 * Zweiter, großzügigerer Rahmen für Mengengrenzen: das /48-Netz (Geschäftsanschlüsse und Server haben oft ein ganzes /48,
 * also 256 /56-Netze). Für IPv4 gibt es keinen solchen Rahmen (null).
 */
export function netz48Schluessel(schluessel: string): string | null {
  const m = schluessel.match(/^([^:]+:[^:]+:[^:]+):[^:]+::\/64$/);
  return m ? `${m[1]}::/48` : null;
}

/**
 * Lokale Adresse (Schlüssel aus adressSchluessel): Hinter einem Proxy ohne TRUST_PROXY oder einem Docker-NAT haben alle
 * Besucher dieselbe. Eine harte Mengengrenze je Adresse träfe dann alle gemeinsam – dort gilt sie deshalb nicht.
 */
export function istLokaleAdresse(schluessel: string): boolean {
  return /^(unbekannt$|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|0:0:0:0::\/64$|f[cd]|fe[89ab])/i.test(schluessel);
}

/**
 * Schlüssel einer Adresse für die Bremsen: IPv4 (auch als ::ffff:a.b.c.d) unverändert, IPv6 je /64 – ein Anschluss
 * bekommt meist ein ganzes /64-Netz und könnte sonst mit jeder Adresse neu anfangen.
 */
export function adressSchluessel(ip: string): string {
  const roh = ip.split("%")[0]!.trim();
  const v4 = roh.match(/^(?:::ffff:)?(\d{1,3}(?:\.\d{1,3}){3})$/i);
  if (v4) return v4[1]!;
  if (!roh.includes(":")) return roh;
  const [kopf = "", rest] = roh.split("::");
  const a = kopf ? kopf.split(":") : [];
  const b = rest !== undefined && rest !== "" ? rest.split(":") : [];
  const teile = rest !== undefined ? [...a, ...Array(Math.max(0, 8 - a.length - b.length)).fill("0"), ...b] : a;
  return `${teile
    .slice(0, 4)
    .map((t) => t.toLowerCase().replace(/^0+(?=.)/, ""))
    .join(":")}::/64`;
}
