import { basename } from "@tauri-apps/api/path";
import { openPath } from "@tauri-apps/plugin-opener";
import { useState } from "react";

import { api, errorCodeOf, errorDetailOf } from "@/lib/api";
import type { KeyCategory } from "@/lib/api";
import { showStatusToast } from "@/lib/status";
import { t } from "i18next";
import { toast } from "sonner";

/** 同名文件冲突信息：确认弹窗数据 + 覆盖重试参数。 */
export interface ExportConflict {
  category: KeyCategory;
  fingerprint: string;
  part?: "public" | "private";
  fileName: string;
}

export interface PickedKeyFile {
  fileName: string;
  content: string;
}

/** 从文件选择器读取密钥文件（私钥 .pem/.key/.txt，公钥 .pub/.pem/.txt）。 */
export async function pickKeyFile(kind: "public" | "private"): Promise<PickedKeyFile | null> {
  const { open } = await import("@tauri-apps/plugin-dialog");
  const { readTextFile } = await import("@tauri-apps/plugin-fs");
  const extensions =
    kind === "public" ? ["pub", "pem", "txt"] : ["pem", "key", "txt"];
  const selected = await open({
    multiple: false,
    directory: false,
    filters: [{ name: "Key files", extensions }],
  });
  if (!selected || typeof selected !== "string") {
    return null;
  }
  const content = await readTextFile(selected);
  const fileName = await basename(selected);
  const stem = fileName.includes(".") ? fileName.slice(0, fileName.lastIndexOf(".")) : fileName;
  return { fileName: stem, content };
}

/** 导出流程 hook：导出成功即提示；目标已有同名文件时记录冲突，
 *  由页面渲染 ExportOverwriteDialog 确认后覆盖重试（取消则清除）。 */
export function useExportKey() {
  const [conflict, setConflict] = useState<ExportConflict | null>(null);
  const [busy, setBusy] = useState(false);

  const exportKey = async (
    category: KeyCategory,
    fingerprint: string,
    part?: "public" | "private",
  ) => {
    try {
      await api.exportKey(category, fingerprint, part);
      showStatusToast("StatusKeyExported");
    } catch (error) {
      if (errorCodeOf(error) === "ErrorExportFileExists") {
        setConflict({ category, fingerprint, part, fileName: errorDetailOf(error) ?? "" });
        return;
      }
      toast.error(t("ErrorExportFailed"));
    }
  };

  const confirmOverwrite = async () => {
    if (!conflict) {
      return;
    }
    setBusy(true);
    try {
      await api.exportKey(conflict.category, conflict.fingerprint, conflict.part, true);
      showStatusToast("StatusKeyExported");
      setConflict(null);
    } catch (error) {
      void error;
      toast.error(t("ErrorExportFailed"));
    } finally {
      setBusy(false);
    }
  };

  const cancelOverwrite = () => setConflict(null);

  return { conflict, busy, exportKey, confirmOverwrite, cancelOverwrite };
}

/** 打开导出目录（未设置时回退系统下载目录）。 */
export async function openExportFolder() {
  try {
    let folder: string | null = null;
    try {
      const settings = await api.getAppSettings();
      folder = settings.exportFolder;
    } catch {
      folder = null;
    }
    const target =
      folder && folder.trim() !== ""
        ? folder
        : await (await import("@tauri-apps/api/path")).downloadDir();
    await openPath(target);
  } catch (error) {
    // open_path 失败的常见原因：配置的目录已不存在、或 capability scope 拒绝。
    console.error("openExportFolder failed:", error);
    toast.error(t("ErrorInternal"));
  }
}
