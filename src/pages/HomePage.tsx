import { Share2, ShieldCheck } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/** 主页：接收方 / 发送方 两列流程说明，按官网 quickstart 时间顺序编号 1~5：
 *  1 生成私钥 → 2 分享公钥 → 3 导入公钥 → 4 加密 → 5 解密。 */
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
          <Step n={1} text={t("HomeDiagramReceiverPrivateKey.Text")} />
          <Step n={2} text={t("HomeDiagramReceiverPublicKey.Text")} />
          <Step n={5} text={t("HomeDiagramReceiverDecrypt.Text")} />
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
          <Step n={3} text={t("HomeDiagramSenderImportKey.Text")} />
          <Step n={4} text={t("HomeDiagramSenderEncrypt.Text")} />
        </CardContent>
      </Card>
    </div>
  );
}

function Step({ n, text }: { n: number; text: string }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border bg-muted/40 px-3 py-2">
      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
        {n}
      </span>
      <span>{text}</span>
    </div>
  );
}
