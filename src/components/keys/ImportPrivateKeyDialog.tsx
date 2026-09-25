import { FileUp } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import { pickKeyFile } from "@/lib/keyFiles";
import { showWarningToast } from "@/lib/status";

export interface ImportPrivateKeySubmit {
  alias: string;
  privateKeyPem: string;
  password: string;
  rememberPassword: boolean;
}

interface ImportPrivateKeyDialogProps {
  open: boolean;
  defaultAlias: string;
  busy: boolean;
  onCancel: () => void;
  onSubmit: (args: ImportPrivateKeySubmit) => void;
}

/** 导入私钥对话框：支持粘贴与从文件导入；密码校验在此完成。 */
export function ImportPrivateKeyDialog({
  open,
  defaultAlias,
  busy,
  onCancel,
  onSubmit,
}: ImportPrivateKeyDialogProps) {
  const { t } = useTranslation();
  const [alias, setAlias] = useState(defaultAlias);
  const [password, setPassword] = useState("");
  const [content, setContent] = useState("");
  const [remember, setRemember] = useState(false);

  const handleImportFromFile = async () => {
    const picked = await pickKeyFile("private");
    if (picked) {
      setAlias(picked.fileName);
      setContent(picked.content);
    }
  };

  const submit = () => {
    if (!password) {
      showWarningToast("ErrorPasswordRequired");
      return;
    }
    onSubmit({ alias, privateKeyPem: content, password, rememberPassword: remember });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("ImportPrivateKeyDialogTitle")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="import-private-alias">{t("ImportKeyAliasBox.Header")}</Label>
            <Input
              id="import-private-alias"
              value={alias}
              onChange={(event) => setAlias(event.target.value)}
              placeholder={t("ImportKeyAliasBox.PlaceholderText")}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="import-private-password">{t("PrivateKeyPasswordBox.Header")}</Label>
            <Input
              id="import-private-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder={t("PrivateKeyPasswordBox.PlaceholderText")}
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={remember}
              onCheckedChange={(checked) => setRemember(checked === true)}
            />
            {t("RememberPrivateKeyPasswordCheckBox.Content")}
          </label>
          <Button variant="outline" onClick={() => void handleImportFromFile()}>
            <FileUp className="size-4" />
            {t("ImportPrivateKeyFromFileButtonText")}
          </Button>
          <div className="space-y-2">
            <Label htmlFor="import-private-content">{t("ImportPrivateKeyTextBox.Header")}</Label>
            <Textarea
              id="import-private-content"
              value={content}
              onChange={(event) => setContent(event.target.value)}
              placeholder={t("ImportPrivateKeyTextBox.PlaceholderText")}
              className="max-h-48 min-h-40 overflow-y-auto font-mono text-xs"
            />
          </div>
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
