import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import QRCode from "qrcode";
import { Star } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import type { StudentStatus } from "@/lib/types";
import { fmtInt } from "@/lib/utils";
import { buttonVariants, Card, CardContent } from "@/components/ui";

const cardId = (uid: string) => uid.replace(/[^A-Za-z0-9]/g, "").slice(0, 12).toUpperCase().replace(/(.{4})/g, "$1 ").trim();

export default function StudentCard() {
  const { t } = useI18n();
  const { user } = useAuth();
  const [qr, setQr] = useState<string>("");
  const [status, setStatus] = useState<StudentStatus | null>(null);

  useEffect(() => {
    if (!user) return;
    void QRCode.toDataURL(`student:${user.id}`, { margin: 1, width: 320, errorCorrectionLevel: "M" }).then(setQr);
    void api.myStatus().then(setStatus);
  }, [user]);

  if (!user) return null;
  const points = status?.counters.points ?? 0;

  return (
    <div className="max-w-md mx-auto space-y-4">
      <Card className="overflow-hidden bg-gradient-to-br from-sidebar to-primary text-sidebar-foreground shadow-xl">
        <CardContent className="pt-6 space-y-4">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-xs tracking-widest opacity-80">{t("cardTitle")}</div>
              <div className="text-xl font-black">{t("appName")}</div>
            </div>
            <div className="text-right">
              <div className="text-xs opacity-80">{t("cardLevel", { n: user.level })}</div>
              <div className="text-2xl font-black flex items-center gap-1 justify-end">
                <Star className="h-5 w-5 text-amber-300 fill-amber-300" /> {fmtInt(points)}
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl p-3 mx-auto w-fit">
            {qr ? <img src={qr} alt="QR" className="h-56 w-56" /> : <div className="h-56 w-56" />}
          </div>
          <div>
            <div className="text-xs opacity-80">{t("cardMember")}</div>
            <div className="text-lg font-bold">{user.name}</div>
            <div className="text-xs opacity-80 mt-1">{t("cardId")}</div>
            <div className="font-mono tracking-widest">{cardId(user.id)}</div>
          </div>
        </CardContent>
      </Card>
      <p className="text-sm text-center text-muted-foreground">{t("cardShowHint")}</p>
      <Link to="/redeem" className={buttonVariants({ size: "lg", className: "w-full" })}>{t("meEnterCode")}</Link>
    </div>
  );
}
