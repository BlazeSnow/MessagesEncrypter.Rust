import { CirclePlus, FolderOpen, Import, Loader2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { KeyCard } from "@/components/KeyCard";
import type { KeyCardAction } from "@/components/KeyCard";
import { ChangePasswordDialog } from "@/components/keys/ChangePasswordDialog";
import { DeleteKeyDialog } from "@/components/keys/DeleteKeyDialog";
import { EmptyList } from "@/components/keys/EmptyList";
import { GenerateKeyDialog } from "@/components/keys/GenerateKeyDialog";
import { ImportPrivateKeyDialog } from "@/components/keys/ImportPrivateKeyDialog";
import { RenameKeyDialog } from "@/components/keys/RenameKeyDialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { api } from "@/lib/api";
import type { KeyEntry } from "@/lib/api";
import { exportKey, openExportFolder } from "@/lib/keyFiles";
import { showErrorToast, showStatusToast } from "@/lib/status";
import { useGeneration } from "@/state/generation";
import { useKeys } from "@/state/keys";

type DialogState =
  | { kind: "closed" }
  | { kind: "generate" }
  | { kind: "import" }
  | { kind: "rename"; entry: KeyEntry }
  | { kind: "delete"; entry: KeyEntry }
  | { kind: "changePassword"; entry: KeyEntry };

/** 我的私钥管理页：生成 / 导入 / 改密 / 重命名 / 删除。 */
export function PrivateKeysPage() {
  const { t } = useTranslation();
  const { privateKeys, refresh } = useKeys();
  const { generation, startGeneration } = useGeneration();
  const [dialog, setDialog] = useState<DialogState>({ kind: "closed" });
  const [busy, setBusy] = useState(false);

  const close = () => setDialog({ kind: "closed" });

  const submitImport = async (args: {
    alias: string;
    privateKeyPem: string;
    password: string;
    rememberPassword: boolean;
  }) => {
    setBusy(true);
    try {
      await api.importPrivateKey(args);
      await refresh("private");
      showStatusToast("StatusPrivateKeyImported");
      close();
    } catch (error) {
      showErrorToast(error);
    } finally {
      setBusy(false);
    }
  };

  const submitChangePassword = async (args: {
    oldPassword: string;
    newPassword: string;
    rememberPassword: boolean;
  }) => {
    if (dialog.kind !== "changePassword") {
      return;
    }
    setBusy(true);
    try {
      await api.changePrivateKeyPassword(
        dialog.entry.fingerprint,
        args.oldPassword,
        args.newPassword,
        args.rememberPassword,
      );
      await refresh("private");
      showStatusToast("StatusPrivateKeyPasswordChanged");
      close();
    } catch (error) {
      showErrorToast(error);
    } finally {
      setBusy(false);
    }
  };

  const submitRename = async (alias: string) => {
    if (dialog.kind !== "rename") {
      return;
    }
    setBusy(true);
    try {
      await api.renameKey("private", dialog.entry.fingerprint, alias);
      await refresh("private");
      showStatusToast("StatusKeyRenamed");
      close();
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
      close();
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
      onSelect: () => setDialog({ kind: "changePassword", entry }),
    },
    {
      labelKey: t("RenameKeyMenuText"),
      onSelect: () => setDialog({ kind: "rename", entry }),
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
        <Button onClick={() => setDialog({ kind: "generate" })} disabled={generation !== null}>
          <CirclePlus className="size-4" />
          {t("GeneratePrivateKeyButton.Text")}
        </Button>
        <Button variant="outline" onClick={() => setDialog({ kind: "import" })}>
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

      {dialog.kind === "generate" ? (
        <GenerateKeyDialog
          open
          defaultAlias={t("DefaultPrivateKeyAlias", { 0: privateKeys.length + 1 })}
          onCancel={close}
          onSubmit={(args) => {
            close();
            void startGeneration(args);
          }}
        />
      ) : null}

      {dialog.kind === "import" ? (
        <ImportPrivateKeyDialog
          open
          defaultAlias={t("DefaultPrivateKeyAlias", { 0: privateKeys.length + 1 })}
          busy={busy}
          onCancel={close}
          onSubmit={(args) => void submitImport(args)}
        />
      ) : null}

      {dialog.kind === "changePassword" ? (
        <ChangePasswordDialog open busy={busy} onCancel={close} onSubmit={(args) => void submitChangePassword(args)} />
      ) : null}

      {dialog.kind === "rename" ? (
        <RenameKeyDialog
          open
          initialAlias={dialog.entry.alias}
          busy={busy}
          onCancel={close}
          onSubmit={(alias) => void submitRename(alias)}
        />
      ) : null}

      <DeleteKeyDialog
        open={dialog.kind === "delete"}
        titleKey="DeletePrivateKeyDialogTitle"
        entryAlias={dialog.kind === "delete" ? dialog.entry.alias : ""}
        busy={busy}
        onCancel={close}
        onDelete={() => void submitDelete()}
      />
    </div>
  );
}
