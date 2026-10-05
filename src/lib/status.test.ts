import { beforeEach, describe, expect, it, vi } from "vitest";

import { toast } from "sonner";

import { showErrorToast, showStatusToast, showWarningToast } from "@/lib/status";

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
  },
}));

describe("status", () => {
  beforeEach(() => {
    vi.mocked(toast.error).mockClear();
    vi.mocked(toast.success).mockClear();
    vi.mocked(toast.warning).mockClear();
  });

  it("showErrorToast 按错误码映射本地化文案", () => {
    showErrorToast({ code: "ErrorPasswordRequired" });
    expect(toast.error).toHaveBeenCalledWith("请输入私钥密码。");
  });

  it("showErrorToast 对无错误码对象回退 ErrorInternal 文案", () => {
    showErrorToast(new Error("boom"));
    expect(toast.error).toHaveBeenCalledWith("发生内部错误，请重试。");
  });

  it("showStatusToast 与 showWarningToast 使用对应级别", () => {
    showStatusToast("StatusMessageDecrypted");
    expect(toast.success).toHaveBeenCalledWith("解密成功。");
    showWarningToast("ErrorClipboardTextMissing");
    expect(toast.warning).toHaveBeenCalledWith("剪贴板中没有文本。");
  });
});
