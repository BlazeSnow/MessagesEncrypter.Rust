import { CirclePlus, FileUp, FolderOpen, Import, Loader2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { KeyCard } from "@/components/KeyCard";
import type { KeyCardAction } from "@/components/KeyCard";
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
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import type { KeyEntry } from "@/lib/api";
import { RSA_KEY_SIZES } from "@/lib/api";
import { exportKey, openExportFolder, pickKeyFile } from "@/lib/keyFiles";
import { showErrorToast, showStatusToast, showWarningToast } from "@/lib/status";
import { EmptyList } from "@/pages/RecipientKeysPage";
import { useKeys } from "@/state/keys";

type DialogState =
  | { kind: "closed" }
  | {
      kind: "generate";
      alias: string;
      keySize: number;
      password: string;
      confirm: string;
      remember: boolean;
    }
  | {
      kind: "import";
      alias: string;
      password: string;
      content: string;
      remember: boolean;
    }
  | { kind: "rename"; entry: KeyEntry; alias: string }
  | { kind: "delete"; entry: KeyEntry }
  | {
      kind: "changePassword";
      entry: KeyEntry;
      oldPassword: string;
      newPassword: string;
      confirm: string;
      remember: boolean;
    };

/** 我的私钥管理页：生成 / 导入 / 改密 / 重命名 / 删除。 */
export function PrivateKeysPage() {
  const { t } = useTranslation();
  const { privateKeys, refresh } = useKeys();
  const [dialog, setDialog] = useState<DialogState>({ kind: "closed" });
  const [busy, setBusy] = useState(false);
  // 后台密钥生成任务：对话框立即关闭，列表区显示进度，期间可继续其他操作。
  const [generation, setGeneration] = useState<{ keySize: number } | null>(null);

  const startGenerate = () => {
    if (generation) {
      return;
    }
    setDialog({
      kind: "generate",
      alias: t("DefaultPrivateKeyAlias", { 0: privateKeys.length + 1 }),
      keySize: 4096,
      password: "",
      confirm: "",
      remember: false,
    });
  };

  const startImport = () => {
    setDialog({
      kind: "import",
      alias: t("DefaultPrivateKeyAlias", { 0: privateKeys.length + 1 }),
      password: "",
      content: "",
      remember: false,
    });
  };

  const handleImportFromFile = async () => {
    const picked = await pickKeyFile("private");
    if (picked) {
      setDialog((current) =>
        current.kind === "import"
          ? { ...current, alias: picked.fileName, content: picked.content }
          : current,
      );
    }
  };

  const submitGenerate = async () => {
    if (dialog.kind !== "generate" || generation) {
      return;
    }
    if (!dialog.password) {
      showWarningToast("ErrorPasswordRequired");
      return;
    }
    if (dialog.password !== dialog.confirm) {
      showWarningToast("ErrorPasswordConfirmMismatch");
      return;
    }
    // 立即关闭对话框并转入后台；大位数密钥生成耗时可达数十秒到数分钟。
    const { alias, keySize, password, remember } = dialog;
    setDialog({ kind: "closed" });
    setGeneration({ keySize });
    try {
      await api.generateKeyPair({
        alias,
        keySizeBits: keySize,
        password,
        rememberPassword: remember,
      });
      showStatusToast("StatusKeyGenerated");
    } catch (error) {
      showErrorToast(error);
    } finally {
      setGeneration(null);
      await refresh("private");
    }
  };

  const submitImport = async () => {
    if (dialog.kind !== "import") {
      return;
    }
    if (!dialog.password) {
      showWarningToast("ErrorPasswordRequired");
      return;
    }
    setBusy(true);
    try {
      await api.importPrivateKey({
        alias: dialog.alias,
        privateKeyPem: dialog.content,
        password: dialog.password,
        rememberPassword: dialog.remember,
      });
      await refresh("private");
      showStatusToast("StatusPrivateKeyImported");
      setDialog({ kind: "closed" });
    } catch (error) {
      showErrorToast(error);
    } finally {
      setBusy(false);
    }
  };

  const submitChangePassword = async () => {
    if (dialog.kind !== "changePassword") {
      return;
    }
    if (!dialog.newPassword) {
      showWarningToast("ErrorPasswordRequired");
      return;
    }
    if (dialog.newPassword !== dialog.confirm) {
      showWarningToast("ErrorPasswordConfirmMismatch");
      return;
    }
    setBusy(true);
    try {
      await api.changePrivateKeyPassword(
        dialog.entry.fingerprint,
        dialog.oldPassword,
        dialog.newPassword,
        dialog.remember,
      );
      await refresh("private");
      showStatusToast("StatusPrivateKeyPasswordChanged");
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
      await api.renameKey("private", dialog.entry.fingerprint, dialog.alias);
      await refresh("private");
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
      await api.deleteKey("private", dialog.entry.fingerprint);
      await refresh("private");
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
      onSelect: () => void exportKey("private", entry.fingerprint, "public"),
    },
    {
      labelKey: t("CopyPrivateKeyMenuText"),
      onSelect: () => {
        void (async () => {
          if (!entry.encryptedPrivateKeyPem) {
            return;
          }
          const { writeText } = await import("@tauri-apps/plugin-clipboard-manager");
          await writeText(entry.encryptedPrivateKeyPem);
          showStatusToast("StatusPrivateKeyCopied");
        })();
      },
    },
    {
      labelKey: t("ExportPrivateKeyMenuText"),
      onSelect: () => void exportKey("private", entry.fingerprint),
    },
    {
      labelKey: t("ChangePasswordMenuText"),
      onSelect: () =>
        setDialog({
          kind: "changePassword",
          entry,
          oldPassword: "",
          newPassword: "",
          confirm: "",
          remember: false,
        }),
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
        <Button onClick={startGenerate} disabled={generation !== null}>
          <CirclePlus className="size-4" />
          {t("GeneratePrivateKeyButton.Text")}
        </Button>
        <Button variant="outline" onClick={startImport}>
          <Import className="size-4" />
          {t("ImportPrivateKeyButton.Text")}
        </Button>
        <Button variant="outline" onClick={() => void openExportFolder()}>
          <FolderOpen className="size-4" />
          {t("OpenExportFolderButton.Text")}
        </Button>
      </div>

      {generation ? (
        <Card size="sm">
          <CardContent className="flex items-center gap-3 py-2.5">
            <Loader2 className="size-5 shrink-0 animate-spin text-primary" />
            <div className="min-w-0">
              <p className="text-sm font-medium">{t("KeyGeneratingTitle")}</p>
              <p className="text-xs text-muted-foreground">
                {t("KeyGeneratingHint", { 0: `RSA${generation.keySize}` })}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {privateKeys.length === 0 ? (
        generation ? null : (
          <EmptyList />
        )
      ) : (
        privateKeys.map((entry) => (
          <KeyCard key={entry.fingerprint} entry={entry} actions={actionsFor(entry)} />
        ))
      )}

      {/* 生成密钥 */}
      <Dialog
        open={dialog.kind === "generate"}
        onOpenChange={(open) => !open && setDialog({ kind: "closed" })}
      >
        {dialog.kind === "generate" ? (
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("GenerateKeyDialogTitle")}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="generate-alias">{t("ImportKeyAliasBox.Header")}</Label>
                <Input
                  id="generate-alias"
                  value={dialog.alias}
                  onChange={(event) => setDialog({ ...dialog, alias: event.target.value })}
                  placeholder={t("ImportKeyAliasBox.PlaceholderText")}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="generate-size">{t("RsaKeySizeComboBox.Header")}</Label>
                <Select
                  value={String(dialog.keySize)}
                  onValueChange={(value) =>
                    setDialog({ ...dialog, keySize: Number(value) })
                  }
                >
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
                  value={dialog.password}
                  onChange={(event) => setDialog({ ...dialog, password: event.target.value })}
                  placeholder={t("PrivateKeyPasswordBox.PlaceholderText")}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="generate-confirm">{t("ConfirmPasswordBox.Header")}</Label>
                <Input
                  id="generate-confirm"
                  type="password"
                  value={dialog.confirm}
                  onChange={(event) => setDialog({ ...dialog, confirm: event.target.value })}
                  placeholder={t("ConfirmPasswordBox.PlaceholderText")}
                />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={dialog.remember}
                  onCheckedChange={(checked) =>
                    setDialog({ ...dialog, remember: checked === true })
                  }
                />
                {t("RememberPrivateKeyPasswordCheckBox.Content")}
              </label>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialog({ kind: "closed" })}>
                {t("DialogCancelButtonText")}
              </Button>
              <Button onClick={() => void submitGenerate()} disabled={busy}>
                {t("DialogOkButtonText")}
              </Button>
            </DialogFooter>
          </DialogContent>
        ) : null}
      </Dialog>

      {/* 导入私钥 */}
      <Dialog
        open={dialog.kind === "import"}
        onOpenChange={(open) => !open && setDialog({ kind: "closed" })}
      >
        {dialog.kind === "import" ? (
          <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-xl">
            <DialogHeader>
              <DialogTitle>{t("ImportPrivateKeyDialogTitle")}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="import-private-alias">{t("ImportKeyAliasBox.Header")}</Label>
                <Input
                  id="import-private-alias"
                  value={dialog.alias}
                  onChange={(event) => setDialog({ ...dialog, alias: event.target.value })}
                  placeholder={t("ImportKeyAliasBox.PlaceholderText")}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="import-private-password">{t("PrivateKeyPasswordBox.Header")}</Label>
                <Input
                  id="import-private-password"
                  type="password"
                  value={dialog.password}
                  onChange={(event) => setDialog({ ...dialog, password: event.target.value })}
                  placeholder={t("PrivateKeyPasswordBox.PlaceholderText")}
                />
                <p className="text-xs text-muted-foreground">
                  {t("RememberPrivateKeyPasswordCheckBox.Content")}
                </p>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={dialog.remember}
                  onCheckedChange={(checked) =>
                    setDialog({ ...dialog, remember: checked === true })
                  }
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
                  value={dialog.content}
                  onChange={(event) => setDialog({ ...dialog, content: event.target.value })}
                  placeholder={t("ImportPrivateKeyTextBox.PlaceholderText")}
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

      {/* 修改密码 */}
      <Dialog
        open={dialog.kind === "changePassword"}
        onOpenChange={(open) => !open && setDialog({ kind: "closed" })}
      >
        {dialog.kind === "changePassword" ? (
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
                  value={dialog.oldPassword}
                  onChange={(event) =>
                    setDialog({ ...dialog, oldPassword: event.target.value })
                  }
                  placeholder={t("OldPasswordBox.PlaceholderText")}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="change-new">{t("NewPasswordBox.Header")}</Label>
                <Input
                  id="change-new"
                  type="password"
                  value={dialog.newPassword}
                  onChange={(event) =>
                    setDialog({ ...dialog, newPassword: event.target.value })
                  }
                  placeholder={t("NewPasswordBox.PlaceholderText")}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="change-confirm">{t("ConfirmNewPasswordBox.Header")}</Label>
                <Input
                  id="change-confirm"
                  type="password"
                  value={dialog.confirm}
                  onChange={(event) => setDialog({ ...dialog, confirm: event.target.value })}
                  placeholder={t("ConfirmNewPasswordBox.PlaceholderText")}
                />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={dialog.remember}
                  onCheckedChange={(checked) =>
                    setDialog({ ...dialog, remember: checked === true })
                  }
                />
                {t("RememberPrivateKeyPasswordCheckBox.Content")}
              </label>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialog({ kind: "closed" })}>
                {t("DialogCancelButtonText")}
              </Button>
              <Button onClick={() => void submitChangePassword()} disabled={busy}>
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
              <Label htmlFor="rename-private-alias">{t("RenameKeyAliasBox.Header")}</Label>
              <Input
                id="rename-private-alias"
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
              <AlertDialogTitle>{t("DeletePrivateKeyDialogTitle")}</AlertDialogTitle>
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
