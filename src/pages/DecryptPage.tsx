import { ClipboardPaste, Eraser, Loader2, LockKeyhole } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
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

const SETTING_KEY = "SelectedPrivateKeyFingerprint";

/** 消息解密页：选择私钥 → 粘贴密文包 → 解锁（必要时） → 解密。 */
export function DecryptPage() {
  const { t } = useTranslation();
  const { privateKeys, loading } = useKeys();
  const [selected, setSelected] = useState("");
  const [cipher, setCipher] = useState("");
  const [plain, setPlain] = useState("");
  const [busy, setBusy] = useState(false);
  // 用户手动选择过则恢复流程不得覆盖（恢复请求与手选存在竞态）。
  const userSelectedRef = useRef(false);

  // 解锁对话框状态。
  const [unlockOpen, setUnlockOpen] = useState(false);
  const [unlockPassword, setUnlockPassword] = useState("");
  const [rememberPassword, setRememberPassword] = useState(false);

  useEffect(() => {
    if (loading || selected || privateKeys.length === 0) {
      return;
    }
    void (async () => {
      try {
        const settings = await api.getAppSettings();
        const remembered = settings.selectedPrivateFingerprint;
        const keys = await api.listKeys("private");
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
        // 设置不可用时忽略记忆。
      }
    })();
  }, [loading, selected, privateKeys.length]);

  const handleSelectChange = (fingerprint: string) => {
    userSelectedRef.current = true;
    setSelected(fingerprint);
    void api.setSetting(SETTING_KEY, fingerprint).catch(() => undefined);
  };

  const runDecrypt = async (useSavedPassword: boolean, password: string, remember: boolean) => {
    setBusy(true);
    try {
      const result = await api.decryptMessage({
        privateFingerprint: selected,
        package: cipher,
        useSavedPassword,
        password: useSavedPassword ? null : password,
        rememberPassword: remember,
      });
      setPlain(result);
      showStatusToast("StatusMessageDecrypted");
      return true;
    } catch (error) {
      setPlain("");
      showErrorToast(error);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const handleDecrypt = async () => {
    if (!selected) {
      toast.warning(t("ErrorPrivateKeyNotSelected"));
      return;
    }
    let saved = false;
    try {
      saved = await api.hasSavedPassword(selected);
    } catch {
      saved = false;
    }
    if (saved) {
      await runDecrypt(true, "", false);
    } else {
      setUnlockPassword("");
      setRememberPassword(false);
      setUnlockOpen(true);
    }
  };

  const handleUnlock = async () => {
    if (!unlockPassword) {
      toast.warning(t("ErrorPasswordRequired"));
      return;
    }
    const ok = await runDecrypt(false, unlockPassword, rememberPassword);
    if (ok) {
      setUnlockOpen(false);
    }
  };

  const handlePaste = async () => {
    try {
      const { readText } = await import("@tauri-apps/plugin-clipboard-manager");
      const text = await readText();
      if (!text) {
        toast.warning(t("ErrorClipboardTextMissing"));
        return;
      }
      setCipher(text);
      showStatusToast("StatusEncryptedMessagePasted");
    } catch (error) {
      toast.error(t(errorCodeOf(error)));
    }
  };

  const handleClear = () => {
    setCipher("");
    setPlain("");
  };

  const selectedEntry = privateKeys.find((key) => key.fingerprint === selected);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <div className="space-y-2">
        <Label htmlFor="private-key">{t("PrivateKeyComboBox.Header")}</Label>
        <Select value={selected} onValueChange={handleSelectChange}>
          <SelectTrigger id="private-key" className="w-full">
            <SelectValue placeholder={t("PrivateKeyComboBox.Placeholder")} />
          </SelectTrigger>
          <SelectContent>
            {privateKeys.map((key) => (
              <SelectItem key={key.fingerprint} value={key.fingerprint}>
                {key.alias}{" "}
                <span className="text-muted-foreground">({key.fingerprint})</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="cipher-text">{t("CipherTextBox.Header")}</Label>
        <Textarea
          id="cipher-text"
          value={cipher}
          onChange={(event) => setCipher(event.target.value)}
          placeholder={t("CipherTextBox.PlaceholderText")}
          className="max-h-64 min-h-40 overflow-y-auto font-mono text-xs"
        />
      </div>
      <div className="flex gap-2">
        <Button onClick={() => void handleDecrypt()} disabled={busy}>
          {busy ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <LockKeyhole className="size-4" />
          )}
          {t("DecryptButton.Text")}
        </Button>
        <Button variant="outline" onClick={() => void handlePaste()}>
          <ClipboardPaste className="size-4" />
          {t("PasteCipherButton.Text")}
        </Button>
        <Button variant="outline" onClick={handleClear}>
          <Eraser className="size-4" />
          {t("ClearDecryptButton.Text")}
        </Button>
      </div>
      <div className="space-y-2">
        <Label htmlFor="decrypted-message">{t("DecryptedMessageTextBox.Header")}</Label>
        <Textarea
          id="decrypted-message"
          value={plain}
          readOnly
          placeholder={t("DecryptedMessageTextBox.PlaceholderText")}
          className="max-h-64 min-h-40 overflow-y-auto"
        />
      </div>

      <Dialog open={unlockOpen} onOpenChange={setUnlockOpen}>
        <DialogContent>
      <DialogHeader>
        <DialogTitle>{t("UnlockPrivateKeyDialogTitle")}</DialogTitle>
        <DialogDescription>
          {t("UnlockPrivateKeyDialogMessage", { 0: selectedEntry?.alias ?? "" })}
        </DialogDescription>
      </DialogHeader>
      <Input
        type="password"
        value={unlockPassword}
        onChange={(event) => setUnlockPassword(event.target.value)}
        placeholder={t("UnlockPrivateKeyPasswordBox.PlaceholderText")}
      />
      <label className="flex items-center gap-2 text-sm">
        <Checkbox
          checked={rememberPassword}
          onCheckedChange={(checked) => setRememberPassword(checked === true)}
        />
        {t("RememberPrivateKeyPasswordCheckBox.Content")}
      </label>
      <DialogFooter>
        <Button variant="outline" onClick={() => setUnlockOpen(false)}>
          {t("DialogCancelButtonText")}
        </Button>
        <Button onClick={() => void handleUnlock()} disabled={busy}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : null}
          {t("DialogUnlockButtonText")}
        </Button>
      </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
