import { CirclePlus } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
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
import { RSA_KEY_SIZES } from "@/lib/api";
import type { GenerateKeyArgs } from "@/lib/api";
import { showWarningToast } from "@/lib/status";

export type GenerateKeySubmit = GenerateKeyArgs;

interface GenerateKeyDialogProps {
  open: boolean;
  defaultAlias: string;
  onCancel: () => void;
  onSubmit: (args: GenerateKeySubmit) => void;
}

/** 生成密钥对对话框：密码校验在此完成，提交后页面转入后台生成。 */
export function GenerateKeyDialog({ open, defaultAlias, onCancel, onSubmit }: GenerateKeyDialogProps) {
  const { t } = useTranslation();
  const [alias, setAlias] = useState(defaultAlias);
  const [keySize, setKeySize] = useState(4096);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [remember, setRemember] = useState(false);

  const submit = () => {
    if (!password) {
      showWarningToast("ErrorPasswordRequired");
      return;
    }
    if (password !== confirm) {
      showWarningToast("ErrorPasswordConfirmMismatch");
      return;
    }
    onSubmit({ alias, keySizeBits: keySize, password, rememberPassword: remember });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("GenerateKeyDialogTitle")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="generate-alias">{t("ImportKeyAliasBox.Header")}</Label>
            <Input
              id="generate-alias"
              value={alias}
              onChange={(event) => setAlias(event.target.value)}
              placeholder={t("ImportKeyAliasBox.PlaceholderText")}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="generate-size">{t("RsaKeySizeComboBox.Header")}</Label>
            <Select value={String(keySize)} onValueChange={(value) => setKeySize(Number(value))}>
              <SelectTrigger id="generate-size" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RSA_KEY_SIZES.map((size) => (
                  <SelectItem key={size} value={String(size)}>
                    RSA{size}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="generate-password">{t("PrivateKeyPasswordBox.Header")}</Label>
            <Input
              id="generate-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder={t("PrivateKeyPasswordBox.PlaceholderText")}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="generate-confirm">{t("ConfirmPasswordBox.Header")}</Label>
            <Input
              id="generate-confirm"
              type="password"
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
              placeholder={t("ConfirmPasswordBox.PlaceholderText")}
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={remember}
              onCheckedChange={(checked) => setRemember(checked === true)}
            />
            {t("RememberPrivateKeyPasswordCheckBox.Content")}
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            {t("DialogCancelButtonText")}
          </Button>
          <Button onClick={submit}>
            <CirclePlus className="size-4" />
            {t("DialogOkButtonText")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
