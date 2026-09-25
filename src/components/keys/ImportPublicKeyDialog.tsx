import { FileUp } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import { pickKeyFile } from "@/lib/keyFiles";

export interface ImportPublicKeySubmit {
  alias: string;
  publicKeyPem: string;
}

interface ImportPublicKeyDialogProps {
  open: boolean;
  defaultAlias: string;
  busy: boolean;
  onCancel: () => void;
  onSubmit: (args: ImportPublicKeySubmit) => void;
}

/** 导入接收方公钥对话框：支持粘贴与从文件导入。 */
export function ImportPublicKeyDialog({
  open,
  defaultAlias,
  busy,
  onCancel,
  onSubmit,
}: ImportPublicKeyDialogProps) {
  const { t } = useTranslation();
  const [alias, setAlias] = useState(defaultAlias);
  const [content, setContent] = useState("");

  const handleImportFromFile = async () => {
    const picked = await pickKeyFile("public");
    if (picked) {
      setAlias(picked.fileName);
      setContent(picked.content);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("ImportRecipientKeyDialogTitle")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="import-alias">{t("ImportKeyAliasBox.Header")}</Label>
            <Input
              id="import-alias"
              value={alias}
              onChange={(event) => setAlias(event.target.value)}
              placeholder={t("ImportKeyAliasBox.PlaceholderText")}
            />
          </div>
          <Button variant="outline" onClick={() => void handleImportFromFile()}>
            <FileUp className="size-4" />
            {t("ImportRecipientKeyFromFileButtonText")}
          </Button>
          <div className="space-y-2">
            <Label htmlFor="import-public">{t("ImportPublicKeyTextBox.Header")}</Label>
            <Textarea
              id="import-public"
              value={content}
              onChange={(event) => setContent(event.target.value)}
              placeholder={t("ImportPublicKeyTextBox.PlaceholderText")}
              className="max-h-48 min-h-40 overflow-y-auto font-mono text-xs"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            {t("DialogCancelButtonText")}
          </Button>
          <Button onClick={() => onSubmit({ alias, publicKeyPem: content })} disabled={busy}>
            {t("DialogOkButtonText")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
