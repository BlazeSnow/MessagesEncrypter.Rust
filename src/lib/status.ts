import { toast } from "sonner";

import { errorCodeOf } from "@/lib/api";
import { t } from "i18next";

/** 把后端错误码转为本地化提示（toast.error）。 */
export function showErrorToast(error: unknown) {
  toast.error(t(errorCodeOf(error)));
}

/** 显示成功状态（沿用原版 Status* 文案键）。 */
export function showStatusToast(statusKey: string) {
  toast.success(t(statusKey));
}

/** 显示警告状态。 */
export function showWarningToast(messageKey: string) {
  toast.warning(t(messageKey));
}
