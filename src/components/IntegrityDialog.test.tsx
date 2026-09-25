import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { IntegrityDialog } from "@/components/IntegrityDialog";

const trustKeyStore = vi.fn(async () => undefined);
const destroy = vi.fn();

vi.mock("@/lib/api", () => ({
  api: { trustKeyStore: (...a: unknown[]) => trustKeyStore(...(a as [])) },
  // 组件 catch 分支会经 showErrorToast 调用 errorCodeOf，mock 必须提供，
  // 否则在 CI 的异步时序下会逃逸为未处理拒绝（本地时序不同可能漏检）。
  errorCodeOf: () => "ErrorInternal",
}));

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({ destroy }),
}));

describe("IntegrityDialog", () => {
  beforeEach(() => {
    trustKeyStore.mockClear();
    destroy.mockClear();
  });

  it("签名缺失与校验失败展示不同正文", () => {
    const { unmount } = render(<IntegrityDialog state="signatureMissing" onResolved={vi.fn()} />);
    expect(screen.getByText(/签名文件/)).toBeInTheDocument();
    unmount();

    render(<IntegrityDialog state="invalid" onResolved={vi.fn()} />);
    expect(screen.getByText(/完整性校验失败/)).toBeInTheDocument();
  });

  it("「忽略并重新签名」成功后回调 onResolved", async () => {
    const onResolved = vi.fn();
    render(<IntegrityDialog state="invalid" onResolved={onResolved} />);
    const user = userEvent.setup();
    await user.click(screen.getByText("忽略并重新签名"));
    await vi.waitFor(() => expect(trustKeyStore).toHaveBeenCalledTimes(1));
    await vi.waitFor(() => expect(onResolved).toHaveBeenCalledTimes(1));
  });

  it("「忽略并重新签名」失败时不回调", async () => {
    trustKeyStore.mockRejectedValueOnce({ code: "ErrorInternal" });
    const onResolved = vi.fn();
    render(<IntegrityDialog state="invalid" onResolved={onResolved} />);
    const user = userEvent.setup();
    await user.click(screen.getByText("忽略并重新签名"));
    await vi.waitFor(() => expect(trustKeyStore).toHaveBeenCalledTimes(1));
    expect(onResolved).not.toHaveBeenCalled();
  });

  it("「退出应用」销毁窗口", async () => {
    render(<IntegrityDialog state="invalid" onResolved={vi.fn()} />);
    const user = userEvent.setup();
    await user.click(screen.getByText("退出应用"));
    expect(destroy).toHaveBeenCalledTimes(1);
  });
});
