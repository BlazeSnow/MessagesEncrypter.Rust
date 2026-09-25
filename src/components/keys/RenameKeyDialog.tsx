import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface RenameKeyDialogProps {
  open: boolean;
  initialAlias: string;
  busy: boolean;
  onCancel: () => void;
  onSubmit: (alias: string) => void;
}

/** 重命名密钥对话框（接收方公钥 / 我的私钥 共用）。 */
export function RenameKeyDialog({ open, initialAlias, busy, onCancel, onSubmit }: RenameKeyDialogProps) {
  const { t } = useTranslation();
  const [alias, setAlias] = useState(initialAlias);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("RenameKeyDialogTitle")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="rename-alias">{t("RenameKeyAliasBox.Header")}</Label>
          <Input
            id="rename-alias"
            value={alias}
            onChange={(event) => setAlias(event.target.value)}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            {t("DialogCancelButtonText")}
          </Button>
          <Button onClick={() => onSubmit(alias)} disabled={busy}>
            {t("DialogOkButtonText")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
