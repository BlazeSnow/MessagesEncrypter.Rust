import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { HomePage } from "@/pages/HomePage";

/** 首页：1~5 全局序号；除 2 分享公钥外均可点击跳转对应页面。 */
describe("HomePage", () => {
  const renderHome = () => {
    const onNavigate = vi.fn();
    render(<HomePage onNavigate={onNavigate} />);
    return { onNavigate };
  };

  it("渲染 1~5 五条步骤", () => {
    renderHome();
    for (const n of [1, 2, 3, 4, 5]) {
      expect(screen.getByText(String(n))).toBeInTheDocument();
    }
    expect(screen.getByText("生成私钥")).toBeInTheDocument();
    expect(screen.getByText("分享公钥")).toBeInTheDocument();
    expect(screen.getByText("导入公钥")).toBeInTheDocument();
    expect(screen.getByText("加密消息")).toBeInTheDocument();
    expect(screen.getByText("解密密文包")).toBeInTheDocument();
  });

  it("2 分享公钥不可点击，其余为按钮", () => {
    renderHome();
    expect(screen.queryByRole("button", { name: /分享公钥/ })).not.toBeInTheDocument();
    for (const label of ["生成私钥", "导入公钥", "加密消息", "解密密文包"]) {
      expect(screen.getByRole("button", { name: new RegExp(label) })).toBeInTheDocument();
    }
  });

  it("点击步骤跳转对应页面", async () => {
    const { onNavigate } = renderHome();
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: /生成私钥/ }));
    expect(onNavigate).toHaveBeenLastCalledWith("private");

    await user.click(screen.getByRole("button", { name: /导入公钥/ }));
    expect(onNavigate).toHaveBeenLastCalledWith("recipient");

    await user.click(screen.getByRole("button", { name: /加密消息/ }));
    expect(onNavigate).toHaveBeenLastCalledWith("encrypt");

    await user.click(screen.getByRole("button", { name: /解密密文包/ }));
    expect(onNavigate).toHaveBeenLastCalledWith("decrypt");

    expect(onNavigate).toHaveBeenCalledTimes(4);
  });
});
