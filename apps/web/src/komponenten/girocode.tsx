/**
 * Überweisung des Meldegelds für Aussteller (Entscheidung 021): Bankverbindung, Verwendungszweck mit Referenz und der
 * GiroCode zum Scannen mit der Banking-App. Inhalt und Code kommen fertig vom Server (services/ueberweisung.ts).
 */
import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { useTexte } from "../sprache";

export interface UeberweisungDaten {
  zweck: string;
  giroCode: string | null;
}

export function Ueberweisung({ bank, ue }: { bank: string; ue: UeberweisungDaten }) {
  const t = useTexte();
  const [bild, setBild] = useState<string | null>(null);
  useEffect(() => {
    let aktiv = true;
    setBild(null);
    // Fehlerkorrektur M und Ruhezone von vier Modulen, wie für den GiroCode verlangt.
    if (ue.giroCode) void QRCode.toDataURL(ue.giroCode, { errorCorrectionLevel: "M", margin: 4, width: 220 }).then((b) => aktiv && setBild(b));
    return () => {
      aktiv = false;
    };
  }, [ue.giroCode]);
  return (
    <div className="mt-3 flex flex-wrap items-start gap-4">
      {bild && <img src={bild} alt="GiroCode" width={176} height={176} className="rounded border border-linie bg-white" />}
      <div className="flex min-w-0 flex-1 flex-col gap-1 text-sm">
        {bank && (
          <p>
            {t.dank.bankverbindung} <span className="text-tinte">{bank}</span>
          </p>
        )}
        <p>
          {t.ueberweisung.verwendungszweck} <b className="font-semibold break-all">{ue.zweck}</b>
        </p>
        <p className="text-grau">{bild ? t.ueberweisung.scannen : t.ueberweisung.zweckBehalten}</p>
      </div>
    </div>
  );
}
