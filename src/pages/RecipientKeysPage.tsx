import { FileUp, FolderOpen, KeyRound } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { KeyCard } from "@/components/KeyCard";
import type { KeyCardAction } from "@/components/KeyCard";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
import { api } from "@/lib/api";
import type { KeyEntry } from "@/lib/api";
import { exportKey, openExportFolder, pickKeyFile } from "@/lib/keyFiles";
import { showErrorToast, showStatusToast } from "@/lib/status";
import { useKeys } from "@/state/keys";

type DialogState =
  | { kind: "closed" }
  | { kind: "import"; alias: string; content: string }
  | { kind: "rename"; entry: KeyEntry; alias: string }
  | { kind: "delete"; entry: KeyEntry };

/** 接收方公钥管理页。 */
export function RecipientKeysPage() {
  const { t } = useTranslation();
  const { recipientKeys, refresh } = useKeys();
  const [dialog, setDialog] = useState<DialogState>({ kind: "closed" });
  const [busy, setBusy] = useState(false);

  const startImport = () => {
    setDialog({
      kind: "import",
      alias: t("DefaultRecipientKeyAlias", { 0: recipientKeys.length + 1 }),
      content: "",
    });
  };

  const handleImportFromFile = async () => {
    const picked = await pickKeyFile("public");
    if (picked) {
      setDialog((current) =>
        current.kind === "import"
          ? { ...current, alias: picked.fileName, content: picked.content }
          : current,
      );
    }
  };

  const submitImport = async () => {
    if (dialog.kind !== "import") {
      return;
    }
    setBusy(true);
    try {
      await api.importPublicKey({ alias: dialog.alias, publicKeyPem: dialog.content });
      await refresh("recipient");
      showStatusToast("StatusRecipientKeyImported");
      setDialog({ kind: "closed" });
    } catch (error) {
      showErrorToast(error);
    } finally {
      setBusy(false);
    }
  };

  const submitRename = async () => {
    if (dialog.kind !== "rename") {
      return;
    }
    setBusy(true);
    try {
      await api.renameKey("recipient", dialog.entry.fingerprint, dialog.alias);
      await refresh("recipient");
      showStatusToast("StatusKeyRenamed");
      setDialog({ kind: "closed" });
    } catch (error) {
      showErrorToast(error);
    } finally {
      setBusy(false);
    }
  };

  const submitDelete = async () => {
    if (dialog.kind !== "delete") {
      return;
    }
    setBusy(true);
    try {
      await api.deleteKey("recipient", dialog.entry.fingerprint);
      await refresh("recipient");
      showStatusToast("StatusKeyDeleted");
      setDialog({ kind: "closed" });
    } catch (error) {
      showErrorToast(error);
    } finally {
      setBusy(false);
    }
  };

  const actionsFor = (entry: KeyEntry): KeyCardAction[] => [
    {
      labelKey: t("CopyPublicKeyMenuText"),
      onSelect: () => {
        void (async () => {
          if (!entry.publicKeyPem) {
            return;
          }
          const { writeText } = await import("@tauri-apps/plugin-clipboard-manager");
          await writeText(entry.publicKeyPem);
          showStatusToast("StatusPublicKeyCopied");
        })();
      },
    },
    {
      labelKey: t("ExportPublicKeyMenuText"),
      onSelect: () => void exportKey("recipient", entry.fingerprint),
    },
    {
      labelKey: t("RenameKeyMenuText"),
      onSelect: () => setDialog({ kind: "rename", entry, alias: entry.alias }),
    },
    {
      labelKey: t("DeleteKeyMenuText"),
      onSelect: () => setDialog({ kind: "delete", entry }),
      danger: true,
    },
  ];

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        <Button onClick={startImport}>
          <KeyRound className="size-4" />
          {t("ImportRecipientKeyButton.Text")}
        </Button>
        <Button variant="outline" onClick={() => void openExportFolder()}>
          <FolderOpen className="size-4" />
          {t("OpenExportFolderButton.Text")}
        </Button>
      </div>

      {recipientKeys.length === 0 ? (
        <EmptyList />
      ) : (
        recipientKeys.map((entry) => (
          <KeyCard key={entry.fingerprint} entry={entry} actions={actionsFor(entry)} />
        ))
      )}

      {/* 导入公钥 */}
      <Dialog
        open={dialog.kind === "import"}
        onOpenChange={(open) => !open && setDialog({ kind: "closed" })}
      >
        {dialog.kind === "import" ? (
          <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-xl">
            <DialogHeader>
              <DialogTitle>{t("ImportRecipientKeyDialogTitle")}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="import-alias">{t("ImportKeyAliasBox.Header")}</Label>
                <Input
                  id="import-alias"
                  value={dialog.alias}
                  onChange={(event) =>
                    setDialog({ ...dialog, alias: event.target.value })
                  }
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
                  value={dialog.content}
                  onChange={(event) =>
                    setDialog({ ...dialog, content: event.target.value })
                  }
                  placeholder={t("ImportPublicKeyTextBox.PlaceholderText")}
                  className="max-h-48 min-h-40 overflow-y-auto font-mono text-xs"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialog({ kind: "closed" })}>
                {t("DialogCancelButtonText")}
              </Button>
              <Button onClick={() => void submitImport()} disabled={busy}>
                {t("DialogOkButtonText")}
              </Button>
            </DialogFooter>
          </DialogContent>
        ) : null}
      </Dialog>

      {/* 重命名 */}
      <Dialog
        open={dialog.kind === "rename"}
        onOpenChange={(open) => !open && setDialog({ kind: "closed" })}
      >
        {dialog.kind === "rename" ? (
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("RenameKeyDialogTitle")}</DialogTitle>
            </DialogHeader>
            <div className="space-y-2">
              <Label htmlFor="rename-alias">{t("RenameKeyAliasBox.Header")}</Label>
              <Input
                id="rename-alias"
                value={dialog.alias}
                onChange={(event) => setDialog({ ...dialog, alias: event.target.value })}
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialog({ kind: "closed" })}>
                {t("DialogCancelButtonText")}
              </Button>
              <Button onClick={() => void submitRename()} disabled={busy}>
                {t("DialogOkButtonText")}
              </Button>
            </DialogFooter>
          </DialogContent>
        ) : null}
      </Dialog>

      {/* 删除确认 */}
      <AlertDialog
        open={dialog.kind === "delete"}
        onOpenChange={(open) => !open && setDialog({ kind: "closed" })}
      >
        {dialog.kind === "delete" ? (
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t("DeleteRecipientKeyDialogTitle")}</AlertDialogTitle>
              <AlertDialogDescription>
                {t("DeleteKeyDialogContent", { 0: dialog.entry.alias })}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setDialog({ kind: "closed" })}>
                {t("DialogCancelButtonText")}
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={(event) => {
                  event.preventDefault();
                  void submitDelete();
                }}
                className="bg-destructive text-white hover:bg-destructive/90"
              >
                {t("DialogDeleteButtonText")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        ) : null}
      </AlertDialog>
    </div>
  );
}

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
