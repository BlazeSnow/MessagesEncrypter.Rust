import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ExportOverwriteDialog } from "@/components/keys/ExportOverwriteDialog";

describe("ExportOverwriteDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("正文包含冲突文件名", () => {
    render(
      <ExportOverwriteDialog
        open
        fileName="alias.pub"
        busy={false}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );
    expect(screen.getByText(/覆盖已有文件/)).toBeInTheDocument();
    expect(screen.getByText(/alias\.pub/)).toBeInTheDocument();
  });

  it("open=false 时不渲染", () => {
    render(
      <ExportOverwriteDialog
        open={false}
        fileName="alias.pub"
        busy={false}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );
    expect(screen.queryByText(/覆盖已有文件/)).not.toBeInTheDocument();
  });

  it("「覆盖」触发确认且不触发取消，「取消」触发取消", async () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <ExportOverwriteDialog
        open
        fileName="alias.pub"
        busy={false}
        onCancel={onCancel}
        onConfirm={onConfirm}
      />,
    );
    const user = userEvent.setup();

    await user.click(screen.getByText("覆盖"));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();

    // Radix 的 Cancel 点击会同时走 onClick 与 onOpenChange 两条取消路径，
    // 应用侧取消处理幂等，这里只断言「已取消」。
    await user.click(screen.getByText("取消"));
    expect(onCancel).toHaveBeenCalled();
  });

  it("busy 时按钮禁用", () => {
    render(
      <ExportOverwriteDialog
        open
        fileName="alias.pub"
        busy
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );
    expect(screen.getByText("覆盖")).toBeDisabled();
    expect(screen.getByText("取消")).toBeDisabled();
  });
});
