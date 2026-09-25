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
import { showWarningToast } from "@/lib/status";

export interface ChangePasswordSubmit {
  oldPassword: string;
  newPassword: string;
  rememberPassword: boolean;
}

interface ChangePasswordDialogProps {
  open: boolean;
  busy: boolean;
  onCancel: () => void;
  onSubmit: (args: ChangePasswordSubmit) => void;
}

/** 修改私钥密码对话框：新密码校验在此完成。 */
export function ChangePasswordDialog({
  open,
  busy,
  onCancel,
  onSubmit,
}: ChangePasswordDialogProps) {
  const { t } = useTranslation();
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [remember, setRemember] = useState(false);

  const submit = () => {
    if (!newPassword) {
      showWarningToast("ErrorPasswordRequired");
      return;
    }
    if (newPassword !== confirm) {
      showWarningToast("ErrorPasswordConfirmMismatch");
      return;
    }
    onSubmit({ oldPassword, newPassword, rememberPassword: remember });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("ChangePasswordDialogTitle")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="change-old">{t("OldPasswordBox.Header")}</Label>
            <Input
              id="change-old"
              type="password"
              value={oldPassword}
              onChange={(event) => setOldPassword(event.target.value)}
              placeholder={t("OldPasswordBox.PlaceholderText")}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="change-new">{t("NewPasswordBox.Header")}</Label>
            <Input
              id="change-new"
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              placeholder={t("NewPasswordBox.PlaceholderText")}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="change-confirm">{t("ConfirmNewPasswordBox.Header")}</Label>
            <Input
              id="change-confirm"
              type="password"
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
              placeholder={t("ConfirmNewPasswordBox.PlaceholderText")}
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
          <Button onClick={submit} disabled={busy}>
            {t("DialogOkButtonText")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
