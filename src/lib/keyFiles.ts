import { basename } from "@tauri-apps/api/path";
import { openPath } from "@tauri-apps/plugin-opener";

import { api } from "@/lib/api";
import type { KeyCategory } from "@/lib/api";
import { showStatusToast } from "@/lib/status";
import { t } from "i18next";
import { toast } from "sonner";

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

/** 导出密钥并提示（后端已在资源管理器中定位文件）。 */
export async function exportKey(
  category: KeyCategory,
  fingerprint: string,
  part?: "public" | "private",
) {
  try {
    await api.exportKey(category, fingerprint, part);
    showStatusToast("StatusKeyExported");
  } catch (error) {
    toast.error(t("ErrorExportFailed"));
    void error;
  }
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
