import { useTranslation } from "react-i18next";

import { Card, CardContent } from "@/components/ui/card";

/** 密钥列表空态提示（私钥/公钥页共用）。 */
export function EmptyList() {
  const { t } = useTranslation();
  return (
    <Card size="sm">
      <CardContent className="flex flex-col items-center gap-1 py-10 text-center">
        <p className="text-sm font-medium">{t("KeyListEmptyText")}</p>
        <p className="text-xs text-muted-foreground">{t("KeyListEmptyHint")}</p>
      </CardContent>
    </Card>
  );
}
