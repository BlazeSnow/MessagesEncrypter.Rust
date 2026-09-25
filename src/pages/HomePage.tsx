import { ChevronRight, Share2, ShieldCheck } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/** 首页步骤可跳转的目标页。2 号「分享公钥」是应用外动作，不可点击。 */
export type HomeStepTarget = "encrypt" | "decrypt" | "recipient" | "private";

/** 主页：接收方 / 发送方 两列流程说明，按官网 quickstart 时间顺序编号 1~5：
 *  1 生成私钥 → 2 分享公钥 → 3 导入公钥 → 4 加密 → 5 解密；除 2 外点击跳转对应页面。 */
export function HomePage({ onNavigate }: { onNavigate: (page: HomeStepTarget) => void }) {
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
          <Step n={1} text={t("HomeDiagramReceiverPrivateKey.Text")} onClick={() => onNavigate("private")} />
          <Step n={2} text={t("HomeDiagramReceiverPublicKey.Text")} />
          <Step n={5} text={t("HomeDiagramReceiverDecrypt.Text")} onClick={() => onNavigate("decrypt")} />
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
          <Step n={3} text={t("HomeDiagramSenderImportKey.Text")} onClick={() => onNavigate("recipient")} />
          <Step n={4} text={t("HomeDiagramSenderEncrypt.Text")} onClick={() => onNavigate("encrypt")} />
        </CardContent>
      </Card>
    </div>
  );
}

function Step({ n, text, onClick }: { n: number; text: string; onClick?: () => void }) {
  const className =
    "flex w-full items-center gap-3 rounded-lg border bg-muted/40 px-3 py-2 text-left text-sm" +
    (onClick
      ? " cursor-pointer transition-colors hover:border-primary/40 hover:bg-muted/70"
      : "");
  const inner = (
    <>
      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
        {n}
      </span>
      <span className="flex-1">{text}</span>
      {onClick ? <ChevronRight className="size-4 shrink-0 text-muted-foreground" /> : null}
    </>
  );
  return onClick ? (
    <button type="button" className={className} onClick={onClick}>
      {inner}
    </button>
  ) : (
    <div className={className}>{inner}</div>
  );
}
