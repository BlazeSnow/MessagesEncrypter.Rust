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

interface ExportOverwriteDialogProps {
  open: boolean;
  /** 后端报告的冲突文件名（含扩展名）。 */
  fileName: string;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

/** 导出同名文件确认对话框（接收方公钥 / 我的私钥 共用）。 */
export function ExportOverwriteDialog({
  open,
  fileName,
  busy,
  onCancel,
  onConfirm,
}: ExportOverwriteDialogProps) {
  const { t } = useTranslation();

  return (
    <AlertDialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("ExportOverwriteDialogTitle")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("ExportOverwriteDialogContent", { 0: fileName })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel} disabled={busy}>
            {t("DialogCancelButtonText")}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={(event) => {
              event.preventDefault();
              onConfirm();
            }}
            disabled={busy}
          >
            {t("DialogOverwriteButtonText")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
