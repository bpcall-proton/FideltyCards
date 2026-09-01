import { useEffect, useRef } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { t } from "@/lib/i18n";

export default function QrScanner({ onScan, onError }: { onScan: (text: string) => void; onError?: (msg: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const done = useRef(false);

  useEffect(() => {
    const id = "qr-reader-" + Math.random().toString(36).slice(2);
    if (ref.current) ref.current.id = id;
    const scanner = new Html5Qrcode(id, { verbose: false });
    scanner
      .start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 240, height: 240 } },
        (text) => {
          if (done.current) return;
          done.current = true;
          onScan(text);
        },
        () => {},
      )
      .catch((e) => onError?.(e instanceof Error ? e.message : t("cameraUnavailable")));
    return () => {
      scanner.stop().then(() => scanner.clear()).catch(() => {});
    };
  }, [onScan, onError]);

  return <div ref={ref} className="w-full overflow-hidden rounded-lg bg-black" />;
}
