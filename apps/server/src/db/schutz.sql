-- Unveränderbarkeit von Protokoll und Kassendaten (GoBD: Unveränderbarkeit, Nachvollziehbarkeit).
-- Wird nach jeder Migration ausgeführt (migrate.ts) und ist wiederholbar.
-- Ausnahmen: Storno-Spalten setzen (einmalig), Anonymisieren nach Datenschutz-Fristen (jedes Leeren wird vermerkt),
-- Löschen von Belegen nach Ablauf der Aufbewahrungsfrist, und das LÖSCHEN ganzer Demo-/Test-Vereine mit
-- SET LOCAL schau.loeschen = 'ja' in derselben Transaktion – ändern erlaubt dieser Schalter nichts, und jede so
-- gelöschte Protokollzeile wird vermerkt, damit die Kettenprüfung sie von einer heimlichen Löschung unterscheidet.

CREATE TABLE IF NOT EXISTS aenderung_kette (id integer PRIMARY KEY DEFAULT 1, letzte_id integer, letzter_hash text);
INSERT INTO aenderung_kette (id) VALUES (1) ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS aenderung_geloescht (id integer PRIMARY KEY, schau_id integer, zeitpunkt timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS aenderung_anonymisiert (id integer PRIMARY KEY, zeitpunkt timestamptz NOT NULL DEFAULT now());

CREATE OR REPLACE FUNCTION schau_loeschen_erlaubt() RETURNS boolean AS $$
  SELECT coalesce(current_setting('schau.loeschen', true), '') = 'ja';
$$ LANGUAGE sql STABLE;

-- Hash eines Protokolleintrags als JSON-Array (eindeutig, auch bei „|“ im Text und NULL).
-- Personenbezogenes (alt, neu und ab Aufbau 3 der Freitext-Grund) geht als eigener Inhalts-Hash ein, damit eine
-- Anonymisierung nach Art. 17 DSGVO die Kette nicht bricht. Aufbau 2 (Grund im Eintrags-Hash) wird weiter geprüft.
CREATE OR REPLACE FUNCTION aenderung_inhalt_hash(alt jsonb, neu jsonb) RETURNS text AS $$
  SELECT encode(sha256(convert_to(jsonb_build_array(alt, neu)::text, 'UTF8')), 'hex');
$$ LANGUAGE sql IMMUTABLE;
CREATE OR REPLACE FUNCTION aenderung_inhalt_hash(alt jsonb, neu jsonb, grund text) RETURNS text AS $$
  SELECT encode(sha256(convert_to(jsonb_build_array(alt, neu, grund)::text, 'UTF8')), 'hex');
$$ LANGUAGE sql IMMUTABLE;

CREATE OR REPLACE FUNCTION aenderung_eintrag_hash(a aenderung) RETURNS text AS $$
  SELECT encode(sha256(convert_to(jsonb_build_array(
    a.vorher_hash, a.id, a.schau_id, a.tabelle, a.datensatz_id, a.aktion, a.benutzer_id, a.preisrichter_id, a.wer,
    CASE WHEN a.hash_version = 2 THEN a.grund END,
    to_char(a.zeitpunkt AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US'), a.inhalt_hash)::text, 'UTF8')), 'hex');
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION aenderung_kette_fn() RETURNS trigger AS $$
DECLARE k record;
BEGIN
  SELECT * INTO k FROM aenderung_kette WHERE id = 1 FOR UPDATE;
  NEW.vorher_id := k.letzte_id;
  NEW.vorher_hash := k.letzter_hash;
  NEW.hash_version := 3;
  NEW.inhalt_hash := aenderung_inhalt_hash(NEW.alt, NEW.neu, NEW.grund);
  NEW.hash := aenderung_eintrag_hash(NEW);
  UPDATE aenderung_kette SET letzte_id = NEW.id, letzter_hash = NEW.hash WHERE id = 1;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS aenderung_kette_tr ON aenderung;
CREATE TRIGGER aenderung_kette_tr BEFORE INSERT ON aenderung FOR EACH ROW EXECUTE FUNCTION aenderung_kette_fn();

CREATE OR REPLACE FUNCTION aenderung_schutz_fn() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF NOT schau_loeschen_erlaubt() THEN RAISE EXCEPTION 'Protokolleinträge lassen sich nicht löschen.'; END IF;
    INSERT INTO aenderung_geloescht (id, schau_id) VALUES (OLD.id, OLD.schau_id) ON CONFLICT DO NOTHING;
    RETURN OLD;
  END IF;
  -- Erlaubt ist nur das Leeren der Inhalte (Anonymisierung), alles andere bleibt, wie es war.
  -- Den Grund leeren geht erst ab Aufbau 3 – vorher steckt er im Eintrags-Hash.
  IF (NEW.alt IS NOT NULL AND NEW.alt IS DISTINCT FROM OLD.alt) OR (NEW.neu IS NOT NULL AND NEW.neu IS DISTINCT FROM OLD.neu)
     OR (NEW.grund IS DISTINCT FROM OLD.grund AND (NEW.grund <> '' OR coalesce(OLD.hash_version, 0) < 3))
     OR (to_jsonb(NEW) - 'alt' - 'neu' - 'grund') IS DISTINCT FROM (to_jsonb(OLD) - 'alt' - 'neu' - 'grund') THEN
    RAISE EXCEPTION 'Protokolleinträge lassen sich nicht ändern.';
  END IF;
  -- Jedes Leeren wird vermerkt: die Prüfung unterscheidet so Anonymisieren von heimlichem Leeren.
  IF NEW.alt IS DISTINCT FROM OLD.alt OR NEW.neu IS DISTINCT FROM OLD.neu OR NEW.grund IS DISTINCT FROM OLD.grund THEN
    INSERT INTO aenderung_anonymisiert (id) VALUES (OLD.id) ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS aenderung_schutz_tr ON aenderung;
CREATE TRIGGER aenderung_schutz_tr BEFORE UPDATE OR DELETE ON aenderung FOR EACH ROW EXECUTE FUNCTION aenderung_schutz_fn();

-- Die Vermerke selbst: nicht änderbar, löschen nur zusammen mit einem ganzen Demo-/Test-Verein.
CREATE OR REPLACE FUNCTION vermerk_schutz_fn() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' AND schau_loeschen_erlaubt() THEN RETURN OLD; END IF;
  RAISE EXCEPTION 'Vermerke im Protokoll lassen sich nicht ändern oder löschen.';
END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS aenderung_geloescht_schutz_tr ON aenderung_geloescht;
CREATE TRIGGER aenderung_geloescht_schutz_tr BEFORE UPDATE OR DELETE ON aenderung_geloescht FOR EACH ROW EXECUTE FUNCTION vermerk_schutz_fn();
DROP TRIGGER IF EXISTS aenderung_anonymisiert_schutz_tr ON aenderung_anonymisiert;
CREATE TRIGGER aenderung_anonymisiert_schutz_tr BEFORE UPDATE OR DELETE ON aenderung_anonymisiert FOR EACH ROW EXECUTE FUNCTION vermerk_schutz_fn();

-- Verkauf: nur Storno (einmalig) und Anonymisieren der Käuferdaten (auf leer bzw. „Gelöscht“).
CREATE OR REPLACE FUNCTION verkauf_schutz_fn() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' AND schau_loeschen_erlaubt() THEN RETURN OLD; END IF;
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Verkäufe lassen sich nicht löschen – bitte stornieren.'; END IF;
  IF (to_jsonb(NEW) - 'storniert_am' - 'storniert_von' - 'storno_grund' - 'kaeufer_name' - 'kaeufer_anschrift' - 'kaeufer_registriernummer' - 'kaeufer_erziehungsberechtigter')
     IS DISTINCT FROM (to_jsonb(OLD) - 'storniert_am' - 'storniert_von' - 'storno_grund' - 'kaeufer_name' - 'kaeufer_anschrift' - 'kaeufer_registriernummer' - 'kaeufer_erziehungsberechtigter')
     OR (OLD.storniert_am IS NOT NULL AND (NEW.storniert_am, NEW.storniert_von, NEW.storno_grund) IS DISTINCT FROM (OLD.storniert_am, OLD.storniert_von, OLD.storno_grund))
     OR (NEW.kaeufer_name IS DISTINCT FROM OLD.kaeufer_name AND NEW.kaeufer_name <> 'Gelöscht')
     OR (NEW.kaeufer_anschrift IS DISTINCT FROM OLD.kaeufer_anschrift AND NEW.kaeufer_anschrift <> '')
     OR (NEW.kaeufer_registriernummer IS DISTINCT FROM OLD.kaeufer_registriernummer AND NEW.kaeufer_registriernummer <> '')
     OR (NEW.kaeufer_erziehungsberechtigter IS DISTINCT FROM OLD.kaeufer_erziehungsberechtigter AND NEW.kaeufer_erziehungsberechtigter <> '') THEN
    RAISE EXCEPTION 'Verkäufe lassen sich nicht ändern – bitte stornieren und neu buchen.';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS verkauf_schutz_tr ON verkauf;
CREATE TRIGGER verkauf_schutz_tr BEFORE UPDATE OR DELETE ON verkauf FOR EACH ROW EXECUTE FUNCTION verkauf_schutz_fn();

-- Auszahlung: nur Storno (einmalig).
CREATE OR REPLACE FUNCTION auszahlung_schutz_fn() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' AND schau_loeschen_erlaubt() THEN RETURN OLD; END IF;
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Auszahlungen lassen sich nicht löschen – bitte stornieren.'; END IF;
  IF (to_jsonb(NEW) - 'storniert_am' - 'storniert_von' - 'storno_grund') IS DISTINCT FROM (to_jsonb(OLD) - 'storniert_am' - 'storniert_von' - 'storno_grund')
     OR OLD.storniert_am IS NOT NULL THEN
    RAISE EXCEPTION 'Auszahlungen lassen sich nicht ändern.';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS auszahlung_schutz_tr ON auszahlung;
CREATE TRIGGER auszahlung_schutz_tr BEFORE UPDATE OR DELETE ON auszahlung FOR EACH ROW EXECUTE FUNCTION auszahlung_schutz_fn();

-- Zahlungen, Kassenbewegungen und Tagesabschlüsse: gar nicht änderbar (Korrektur = Gegenbuchung).
CREATE OR REPLACE FUNCTION unveraenderbar_fn() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' AND schau_loeschen_erlaubt() THEN RETURN OLD; END IF;
  RAISE EXCEPTION '% sind unveränderbar – Korrekturen bitte als Gegenbuchung.', TG_TABLE_NAME;
END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS zahlung_schutz_tr ON zahlung;
CREATE TRIGGER zahlung_schutz_tr BEFORE UPDATE OR DELETE ON zahlung FOR EACH ROW EXECUTE FUNCTION unveraenderbar_fn();
DROP TRIGGER IF EXISTS kassenbewegung_schutz_tr ON kassenbewegung;
CREATE TRIGGER kassenbewegung_schutz_tr BEFORE UPDATE OR DELETE ON kassenbewegung FOR EACH ROW EXECUTE FUNCTION unveraenderbar_fn();
DROP TRIGGER IF EXISTS kassenabschluss_schutz_tr ON kassenabschluss;
CREATE TRIGGER kassenabschluss_schutz_tr BEFORE UPDATE OR DELETE ON kassenabschluss FOR EACH ROW EXECUTE FUNCTION unveraenderbar_fn();
DROP TRIGGER IF EXISTS verkauf_zahlungseingang_schutz_tr ON verkauf_zahlungseingang;
CREATE TRIGGER verkauf_zahlungseingang_schutz_tr BEFORE UPDATE OR DELETE ON verkauf_zahlungseingang FOR EACH ROW EXECUTE FUNCTION unveraenderbar_fn();

-- Belege: unveränderbar; löschen erst nach Ablauf der Aufbewahrungsfrist (Ende des Belegjahres + 8 Jahre, § 147 AO).
CREATE OR REPLACE FUNCTION beleg_schutz_fn() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' AND schau_loeschen_erlaubt() THEN RETURN OLD; END IF;
  IF TG_OP = 'DELETE' AND date_trunc('year', OLD.created_at) + interval '9 years' <= now() THEN RETURN OLD; END IF;
  RAISE EXCEPTION 'Belege sind unveränderbar und werden erst nach Ablauf der Aufbewahrungsfrist gelöscht.';
END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS beleg_schutz_tr ON beleg;
CREATE TRIGGER beleg_schutz_tr BEFORE UPDATE OR DELETE ON beleg FOR EACH ROW EXECUTE FUNCTION beleg_schutz_fn();

-- Testschauen: Test-Aussteller (aussteller.test_schau_id) nur in ihrer Testschau, echte nur in echten Schauen
-- (services/testschau.ts). Die Anwendung prüft das selbst; der Trigger fängt jeden anderen Weg ab.
CREATE OR REPLACE FUNCTION meldung_testschau_fn() RETURNS trigger AS $$
DECLARE t integer; st boolean;
BEGIN
  SELECT test_schau_id INTO t FROM aussteller WHERE id = NEW.aussteller_id;
  SELECT test INTO st FROM schau WHERE id = NEW.schau_id;
  IF (CASE WHEN st THEN t IS DISTINCT FROM NEW.schau_id ELSE t IS NOT NULL END) THEN
    RAISE EXCEPTION 'Test-Aussteller gehören nur in ihre Testschau, echte Aussteller nicht in eine Testschau.';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS meldung_testschau_tr ON meldung;
CREATE TRIGGER meldung_testschau_tr AFTER INSERT OR UPDATE OF aussteller_id, schau_id ON meldung FOR EACH ROW EXECUTE FUNCTION meldung_testschau_fn();

CREATE OR REPLACE FUNCTION aussteller_testschau_fn() RETURNS trigger AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM meldung m JOIN schau s ON s.id = m.schau_id
    WHERE m.aussteller_id = NEW.id AND (CASE WHEN s.test THEN s.id IS DISTINCT FROM NEW.test_schau_id ELSE NEW.test_schau_id IS NOT NULL END)
  ) THEN
    RAISE EXCEPTION 'Der Aussteller ist in einer Schau gemeldet, zu der dieses Testschau-Kennzeichen nicht passt.';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS aussteller_testschau_tr ON aussteller;
CREATE TRIGGER aussteller_testschau_tr AFTER UPDATE OF test_schau_id ON aussteller FOR EACH ROW WHEN (OLD.test_schau_id IS DISTINCT FROM NEW.test_schau_id) EXECUTE FUNCTION aussteller_testschau_fn();

-- Eine Testschau bleibt Testschau (sonst kämen ihre Aussteller in echte Schauen).
CREATE OR REPLACE FUNCTION schau_test_fn() RETURNS trigger AS $$
BEGIN
  IF OLD.test AND NOT NEW.test THEN RAISE EXCEPTION 'Eine Testschau lässt sich nicht wieder zur echten Schau machen.'; END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS schau_test_tr ON schau;
CREATE TRIGGER schau_test_tr BEFORE UPDATE OF test ON schau FOR EACH ROW EXECUTE FUNCTION schau_test_fn();

-- TRUNCATE umgeht die Zeilen-Trigger: auf den geschützten Tabellen nur beim Löschen einer Schau bzw. des Demo-Vereins
-- (schau.loeschen = 'ja' in derselben Transaktion), sonst nie.
CREATE OR REPLACE FUNCTION kein_truncate_fn() RETURNS trigger AS $$
BEGIN
  IF schau_loeschen_erlaubt() THEN RETURN NULL; END IF;
  RAISE EXCEPTION '% lässt sich nicht leeren (Protokoll und Kassendaten sind unveränderbar).', TG_TABLE_NAME;
END $$ LANGUAGE plpgsql;
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['aenderung', 'aenderung_geloescht', 'aenderung_anonymisiert', 'verkauf', 'verkauf_zahlungseingang', 'auszahlung', 'zahlung', 'kassenbewegung', 'kassenabschluss', 'beleg'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', t || '_truncate_tr', t);
    EXECUTE format('CREATE TRIGGER %I BEFORE TRUNCATE ON %I FOR EACH STATEMENT EXECUTE FUNCTION kein_truncate_fn()', t || '_truncate_tr', t);
  END LOOP;
END $$;
