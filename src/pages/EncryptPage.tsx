import { Copy, Eraser, Loader2, Lock } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { api, errorCodeOf } from "@/lib/api";
import { showErrorToast, showStatusToast } from "@/lib/status";
import { useKeys } from "@/state/keys";

const SETTING_KEY = "SelectedRecipientKeyFingerprint";

/** 消息加密页：选择接收方公钥 → 加密 → 复制密文包。 */
export function EncryptPage() {
  const { t } = useTranslation();
  const { recipientKeys, loading } = useKeys();
  const [selected, setSelected] = useState<string>("");
  const [plain, setPlain] = useState("");
  const [encrypted, setEncrypted] = useState("");
  const [busy, setBusy] = useState(false);
  // 用户手动选择过则恢复流程不得覆盖（恢复请求与手选存在竞态）。
  const userSelectedRef = useRef(false);

  // 恢复记忆的已选公钥（删除后回退到第一项，并把回退值写入记忆）。
  useEffect(() => {
    if (loading || selected) {
      return;
    }
    void (async () => {
      try {
        const settings = await api.getAppSettings();
        const remembered = settings.selectedRecipientFingerprint;
        const keys = await api.listKeys("recipient");
        if (userSelectedRef.current) {
          return;
        }
        if (remembered && keys.some((key) => key.fingerprint === remembered)) {
          setSelected(remembered);
        } else if (keys.length > 0) {
          setSelected(keys[0].fingerprint);
          void api.setSetting(SETTING_KEY, keys[0].fingerprint).catch(() => undefined);
        }
      } catch {
        // 设置不可用时忽略记忆，保持空选。
      }
    })();
  }, [loading, selected, recipientKeys.length]);

  const handleSelectChange = (fingerprint: string) => {
    userSelectedRef.current = true;
    setSelected(fingerprint);
    void api.setSetting(SETTING_KEY, fingerprint).catch(() => undefined);
  };

  const handleEncrypt = async () => {
    if (!selected) {
      toast.warning(t("ErrorRecipientKeyNotSelected"));
      return;
    }
    setBusy(true);
    try {
      const result = await api.encryptMessage(selected, plain);
      setEncrypted(result);
      showStatusToast("StatusMessageEncrypted");
    } catch (error) {
      setEncrypted("");
      showErrorToast(error);
    } finally {
      setBusy(false);
    }
  };

  const handleCopy = async () => {
    if (!encrypted) {
      return;
    }
    try {
      const { writeText } = await import("@tauri-apps/plugin-clipboard-manager");
      await writeText(encrypted);
      showStatusToast("StatusEncryptedPackageCopied");
    } catch (error) {
      toast.error(t(errorCodeOf(error)));
    }
  };

  const handleClear = () => {
    setPlain("");
    setEncrypted("");
  };

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>{t("PageTitleEncrypt")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="recipient-key">{t("RecipientKeyComboBox.Header")}</Label>
            <Select value={selected} onValueChange={handleSelectChange}>
              <SelectTrigger id="recipient-key" className="w-full">
                <SelectValue placeholder={t("RecipientKeyComboBox.Placeholder")} />
              </SelectTrigger>
              <SelectContent>
                {recipientKeys.map((key) => (
                  <SelectItem key={key.fingerprint} value={key.fingerprint}>
                    {key.alias}{" "}
                    <span className="text-muted-foreground">({key.fingerprint})</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="plain-text">{t("PlainTextBox.Header")}</Label>
            <Textarea
              id="plain-text"
              value={plain}
              onChange={(event) => setPlain(event.target.value)}
              placeholder={t("PlainTextBox.PlaceholderText")}
              className="max-h-64 min-h-44 overflow-y-auto"
            />
          </div>
          <div className="flex gap-2">
            <Button onClick={() => void handleEncrypt()} disabled={busy}>
              {busy ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Lock className="size-4" />
              )}
              {t("EncryptButton.Text")}
            </Button>
            <Button variant="outline" onClick={() => void handleCopy()} disabled={!encrypted}>
              <Copy className="size-4" />
              {t("CopyEncryptedMessageButton.Text")}
            </Button>
            <Button variant="outline" onClick={handleClear}>
              <Eraser className="size-4" />
              {t("ClearEncryptButton.Text")}
            </Button>
          </div>
          <div className="space-y-2">
            <Label htmlFor="encrypted-message">{t("EncryptedMessageTextBox.Header")}</Label>
            <Textarea
              id="encrypted-message"
              value={encrypted}
              readOnly
              placeholder={t("EncryptedMessageTextBox.PlaceholderText")}
              className="max-h-64 min-h-44 overflow-y-auto font-mono text-xs"
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
