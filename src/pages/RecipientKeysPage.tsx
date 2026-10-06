import { Copy, FolderOpen, Import, Pencil, Share, Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { KeyCard } from "@/components/KeyCard";
import type { KeyCardAction } from "@/components/KeyCard";
import { DeleteKeyDialog } from "@/components/keys/DeleteKeyDialog";
import { EmptyList } from "@/components/keys/EmptyList";
import { ExportOverwriteDialog } from "@/components/keys/ExportOverwriteDialog";
import { ImportPublicKeyDialog } from "@/components/keys/ImportPublicKeyDialog";
import { RenameKeyDialog } from "@/components/keys/RenameKeyDialog";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import type { KeyEntry } from "@/lib/api";
import { openExportFolder, useExportKey } from "@/lib/keyFiles";
import { showErrorToast, showStatusToast } from "@/lib/status";
import { useKeys } from "@/state/keys";

type DialogState =
  | { kind: "closed" }
  | { kind: "import" }
  | { kind: "rename"; entry: KeyEntry }
  | { kind: "delete"; entry: KeyEntry };

/** 接收方公钥管理页。 */
export function RecipientKeysPage() {
  const { t } = useTranslation();
  const { recipientKeys, refresh } = useKeys();
  const { conflict, busy: overwriteBusy, exportKey, confirmOverwrite, cancelOverwrite } = useExportKey();
  const [dialog, setDialog] = useState<DialogState>({ kind: "closed" });
  const [busy, setBusy] = useState(false);

  const close = () => setDialog({ kind: "closed" });

  const submitImport = async (args: { alias: string; publicKeyPem: string }) => {
    setBusy(true);
    try {
      await api.importPublicKey(args);
      await refresh("recipient");
      showStatusToast("StatusRecipientKeyImported");
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
      await api.renameKey("recipient", dialog.entry.fingerprint, alias);
      await refresh("recipient");
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
      await api.deleteKey("recipient", dialog.entry.fingerprint);
      await refresh("recipient");
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
      icon: <Copy className="size-4" />,
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
      icon: <Share className="size-4" />,
      onSelect: () => void exportKey("recipient", entry.fingerprint),
    },
    {
      labelKey: t("RenameKeyMenuText"),
      icon: <Pencil className="size-4" />,
      onSelect: () => setDialog({ kind: "rename", entry }),
      separatorBefore: true,
    },
    {
      labelKey: t("DeleteKeyMenuText"),
      icon: <Trash2 className="size-4" />,
      onSelect: () => setDialog({ kind: "delete", entry }),
      danger: true,
      separatorBefore: true,
    },
  ];

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => setDialog({ kind: "import" })}>
          <Import className="size-4" />
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

      {dialog.kind === "import" ? (
        <ImportPublicKeyDialog
          open
          defaultAlias={t("DefaultRecipientKeyAlias", { 0: recipientKeys.length + 1 })}
          busy={busy}
          onCancel={close}
          onSubmit={(args) => void submitImport(args)}
        />
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
        titleKey="DeleteRecipientKeyDialogTitle"
        entryAlias={dialog.kind === "delete" ? dialog.entry.alias : ""}
        busy={busy}
        onCancel={close}
        onDelete={() => void submitDelete()}
      />

      <ExportOverwriteDialog
        open={conflict !== null}
        fileName={conflict?.fileName ?? ""}
        busy={overwriteBusy}
        onCancel={cancelOverwrite}
        onConfirm={() => void confirmOverwrite()}
      />
    </div>
  );
}
