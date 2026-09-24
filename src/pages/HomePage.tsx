import { KeyRound, Lock, LockKeyhole, Share2, ShieldCheck } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/** 主页：接收方 / 发送方 两列流程说明（与原版 HomeView 对齐）。 */
export function HomePage() {
  const { t } = useTranslation();

  return (
    <div className="mx-auto grid w-full max-w-3xl gap-4 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="size-5 text-primary" />
            {t("HomeDiagramReceiverTitle")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <Step icon={<KeyRound className="size-4" />} text={t("HomeDiagramReceiverPrivateKey.Text")} />
          <Step icon={<Share2 className="size-4" />} text={t("HomeDiagramReceiverPublicKey.Text")} />
          <Step icon={<LockKeyhole className="size-4" />} text={t("HomeDiagramReceiverDecrypt.Text")} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Share2 className="size-5 text-primary" />
            {t("HomeDiagramSenderTitle")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <Step icon={<Share2 className="size-4" />} text={t("HomeDiagramSenderImportKey.Text")} />
          <Step icon={<Lock className="size-4" />} text={t("HomeDiagramSenderEncrypt.Text")} />
        </CardContent>
      </Card>
    </div>
  );
}

function Step({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border bg-muted/40 px-3 py-2">
      <span className="text-muted-foreground">{icon}</span>
      <span>{text}</span>
    </div>
  );
}
