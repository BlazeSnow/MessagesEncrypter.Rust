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

interface DeleteKeyDialogProps {
  open: boolean;
  /** 页面专属标题资源键（删除接收方公钥 / 删除私钥）。 */
  titleKey: string;
  entryAlias: string;
  busy: boolean;
  onCancel: () => void;
  onDelete: () => void;
}

/** 删除密钥确认对话框（接收方公钥 / 我的私钥 共用）。 */
export function DeleteKeyDialog({
  open,
  titleKey,
  entryAlias,
  busy,
  onCancel,
  onDelete,
}: DeleteKeyDialogProps) {
  const { t } = useTranslation();

  return (
    <AlertDialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t(titleKey)}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("DeleteKeyDialogContent", { 0: entryAlias })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel} disabled={busy}>
            {t("DialogCancelButtonText")}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={(event) => {
              event.preventDefault();
              onDelete();
            }}
            disabled={busy}
            className="bg-destructive text-white hover:bg-destructive/90"
          >
            {t("DialogDeleteButtonText")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
