import { beforeEach, describe, expect, it, vi } from "vitest";

import { toast } from "sonner";

import { exportKey, openExportFolder, pickKeyFile } from "@/lib/keyFiles";

const exportKeyBackend = vi.fn(
  async (_c: string, _f: string, _p?: string, _o?: boolean) => "C:/out/key.pub",
);
const getAppSettings = vi.fn(async () => ({
  exportFolder: savedFolder.folder,
  displayLanguage: "zh-Hans",
  selectedRecipientFingerprint: null,
  selectedPrivateFingerprint: null,
}));
const askDialogMock = vi.fn(async (_message?: unknown, _options?: unknown) => true);

const savedFolder = { folder: null as string | null };
const picked = { path: "C:/keys/alias.pub" as string | null };
const fileContent = { text: "PEM-CONTENT" };

vi.mock("@/lib/api", () => ({
  api: {
    exportKey: (category: string, fingerprint: string, part?: string, overwrite?: boolean) =>
      exportKeyBackend(category, fingerprint, part, overwrite),
    getAppSettings: () => getAppSettings(),
  },
  errorCodeOf: (error: unknown) => {
    const code = (error as { code?: unknown } | null)?.code;
    return typeof code === "string" && code ? code : "ErrorInternal";
  },
  errorDetailOf: (error: unknown) => {
    const detail = (error as { detail?: unknown } | null)?.detail;
    return typeof detail === "string" && detail ? detail : null;
  },
}));

vi.mock("@tauri-apps/api/path", () => ({
  basename: (path: string) => path.split("/").pop() ?? path,
  downloadDir: vi.fn(async () => "C:/Users/me/Downloads"),
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: (args?: unknown) => openDialogMock(args),
  ask: (message?: unknown, options?: unknown) => askDialogMock(message, options),
}));

vi.mock("@tauri-apps/plugin-fs", () => ({
  readTextFile: (path: string) => readTextFileMock(path),
}));

vi.mock("@tauri-apps/plugin-opener", () => ({
  openPath: (path: string) => openPathMock(path),
}));

const openDialogMock = vi.fn(async (_args?: unknown) => picked.path);
const readTextFileMock = vi.fn(async (_path: string) => fileContent.text);
const openPathMock = vi.fn(async (_path: string) => undefined);

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
  },
}));

describe("keyFiles", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    savedFolder.folder = null;
    picked.path = "C:/keys/alias.pub";
    fileContent.text = "PEM-CONTENT";
  });

  it("pickKeyFile 读取公钥文件：pub/pem/txt 过滤、文件名去扩展名", async () => {
    const result = await pickKeyFile("public");

    expect(result).toEqual({ fileName: "alias", content: "PEM-CONTENT" });
    expect(openDialogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        multiple: false,
        directory: false,
        filters: [{ name: "Key files", extensions: ["pub", "pem", "txt"] }],
      }),
    );
    expect(readTextFileMock).toHaveBeenCalledWith("C:/keys/alias.pub");
  });

  it("pickKeyFile 私钥使用 pem/key/txt 过滤器", async () => {
    await pickKeyFile("private");

    expect(openDialogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        filters: [{ name: "Key files", extensions: ["pem", "key", "txt"] }],
      }),
    );
  });

  it("pickKeyFile 取消选择返回 null 且不读文件", async () => {
    picked.path = null;

    const result = await pickKeyFile("public");

    expect(result).toBeNull();
    expect(readTextFileMock).not.toHaveBeenCalled();
  });

  it("pickKeyFile 无扩展名文件时文件名原样", async () => {
    picked.path = "C:/keys/noext";

    const result = await pickKeyFile("private");

    expect(result).toEqual({ fileName: "noext", content: "PEM-CONTENT" });
  });

  it("exportKey 成功时提示密钥已导出", async () => {
    await exportKey("recipient", "FP-R", "public");

    expect(exportKeyBackend).toHaveBeenCalledWith("recipient", "FP-R", "public", undefined);
    expect(toast.success).toHaveBeenCalledWith("密钥已导出。");
  });

  it("exportKey 失败时提示导出失败且不抛出", async () => {
    exportKeyBackend.mockRejectedValueOnce({ code: "ErrorExportFailed" });

    await expect(exportKey("private", "FP-P")).resolves.toBeUndefined();
    expect(toast.error).toHaveBeenCalledWith("导出密钥失败。");
  });

  it("exportKey 同名文件确认覆盖后带 overwrite 重试并提示成功", async () => {
    exportKeyBackend.mockRejectedValueOnce({
      code: "ErrorExportFileExists",
      detail: "alias.pub",
    });

    await exportKey("recipient", "FP-R", "public");

    expect(askDialogMock).toHaveBeenCalledWith(
      "“alias.pub”已存在于导出目录中，是否覆盖？",
      expect.objectContaining({
        title: "覆盖已有文件",
        okLabel: "覆盖",
        cancelLabel: "取消",
      }),
    );
    expect(exportKeyBackend).toHaveBeenCalledTimes(2);
    expect(exportKeyBackend).toHaveBeenLastCalledWith("recipient", "FP-R", "public", true);
    expect(toast.success).toHaveBeenCalledWith("密钥已导出。");
  });

  it("exportKey 同名文件取消覆盖时不重试也不提示", async () => {
    exportKeyBackend.mockRejectedValueOnce({
      code: "ErrorExportFileExists",
      detail: "alias.pub",
    });
    askDialogMock.mockResolvedValueOnce(false);

    await exportKey("recipient", "FP-R");

    expect(exportKeyBackend).toHaveBeenCalledTimes(1);
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("exportKey 覆盖重试失败时提示导出失败", async () => {
    exportKeyBackend
      .mockRejectedValueOnce({ code: "ErrorExportFileExists", detail: "alias.pub" })
      .mockRejectedValueOnce({ code: "ErrorExportFailed" });

    await exportKey("private", "FP-P");

    expect(exportKeyBackend).toHaveBeenCalledTimes(2);
    expect(toast.error).toHaveBeenCalledWith("导出密钥失败。");
  });

  it("openExportFolder 优先打开配置的导出目录", async () => {
    savedFolder.folder = "D:/exports";

    await openExportFolder();

    expect(openPathMock).toHaveBeenCalledWith("D:/exports");
  });

  it("openExportFolder 未配置时回退系统下载目录", async () => {
    await openExportFolder();

    expect(openPathMock).toHaveBeenCalledWith("C:/Users/me/Downloads");
  });

  it("openExportFolder 设置读取失败时同样回退下载目录", async () => {
    getAppSettings.mockRejectedValueOnce({ code: "ErrorKeyStoreIntegrityInvalid" });

    await openExportFolder();

    expect(openPathMock).toHaveBeenCalledWith("C:/Users/me/Downloads");
  });

  it("openExportFolder 打开失败时提示内部错误", async () => {
    savedFolder.folder = "D:/gone";
    openPathMock.mockRejectedValueOnce(new Error("forbidden"));

    await openExportFolder();

    expect(toast.error).toHaveBeenCalledWith("发生内部错误，请重试。");
  });
});
