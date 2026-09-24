import { useState } from "react";

import { useTranslation } from "react-i18next";

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
import { api } from "@/lib/api";
import { showErrorToast } from "@/lib/status";

interface IntegrityDialogProps {
  state: "signatureMissing" | "invalid";
  onResolved: () => void;
}

/** 密钥库完整性失败弹窗：「忽略并重新签名」（危险）或「退出应用」。 */
export function IntegrityDialog({ state, onResolved }: IntegrityDialogProps) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);

  const contentKey =
    state === "signatureMissing"
      ? "KeyStoreIntegrityDialogMissingContent"
      : "KeyStoreIntegrityDialogInvalidContent";

  const handleTrust = async () => {
    setBusy(true);
    try {
      await api.trustKeyStore();
      onResolved();
    } catch (error) {
      showErrorToast(error);
    } finally {
      setBusy(false);
    }
  };

  const handleExit = () => {
    void import("@tauri-apps/api/window").then(({ getCurrentWindow }) => {
      void getCurrentWindow().destroy();
    });
  };

  return (
    <AlertDialog open>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("KeyStoreIntegrityDialogTitle")}</AlertDialogTitle>
          <AlertDialogDescription>{t(contentKey)}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={handleExit} disabled={busy}>
            {t("KeyStoreIntegrityExitButtonText")}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={(event) => {
              event.preventDefault();
              void handleTrust();
            }}
            disabled={busy}
            className="bg-destructive text-white hover:bg-destructive/90"
          >
            {t("KeyStoreIntegrityIgnoreAndResignButtonText")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
