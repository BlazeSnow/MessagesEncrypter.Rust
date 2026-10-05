import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import zhHans from "@/locales/zh-Hans.json";
import { SettingsPage } from "@/pages/SettingsPage";

const setSetting = vi.fn(async (_key: string, _value: string) => undefined);
const openExportFolder = vi.fn(async () => undefined);
const chooseFolder = vi.fn(async (_args?: unknown) => chosen.folder);
const openUrl = vi.fn(async (_url: string) => undefined);

const chosen = { folder: "E:/new-exports" as string | null };

vi.mock("@/lib/api", () => ({
  api: {
    getAppSettings: vi.fn(async () => ({
      exportFolder: "D:/exports",
      displayLanguage: "zh-Hans",
      selectedRecipientFingerprint: null,
      selectedPrivateFingerprint: null,
    })),
    setSetting: (key: string, value: string) => setSetting(key, value),
    getAppVersion: vi.fn(async () => "2026.10.5"),
  },
  errorCodeOf: () => "ErrorInternal",
}));

vi.mock("@/lib/keyFiles", () => ({
  openExportFolder: () => openExportFolder(),
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: (args?: unknown) => chooseFolder(args),
}));

vi.mock("@tauri-apps/plugin-opener", () => ({
  openUrl: (url: string) => openUrl(url),
}));

describe("SettingsPage", () => {
  beforeEach(() => {
    setSetting.mockClear();
    openExportFolder.mockClear();
    chooseFolder.mockClear();
    openUrl.mockClear();
    chosen.folder = "E:/new-exports";
  });

  it("加载设置：语言、导出目录与版本", async () => {
    render(<SettingsPage />);
    expect(await screen.findByText("D:/exports")).toBeInTheDocument();
    expect(screen.getByText("2026.10.5")).toBeInTheDocument();
    expect(screen.getByRole("combobox").textContent).toContain("简体中文");
  });

  it("选择导出目录：写入设置并显示新目录", async () => {
    render(<SettingsPage />);
    expect(await screen.findByText("D:/exports")).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "选择" }));

    await waitFor(() => {
      expect(setSetting).toHaveBeenCalledWith("ExportFolderPath", "E:/new-exports");
    });
    await waitFor(() => {
      expect(screen.getByText("E:/new-exports")).toBeInTheDocument();
    });
  });

  it("取消选择导出目录时不写入设置", async () => {
    chosen.folder = null;
    render(<SettingsPage />);
    expect(await screen.findByText("D:/exports")).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "选择" }));

    await waitFor(() => {
      expect(chooseFolder).toHaveBeenCalled();
    });
    expect(setSetting).not.toHaveBeenCalledWith("ExportFolderPath", expect.anything());
    expect(screen.getByText("D:/exports")).toBeInTheDocument();
  });

  it("打开导出目录按钮委托 keyFiles.openExportFolder", async () => {
    render(<SettingsPage />);
    expect(await screen.findByText("D:/exports")).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "打开导出目录" }));
    expect(openExportFolder).toHaveBeenCalledOnce();
  });

  it("仓库与网站按钮打开对应外链", async () => {
    render(<SettingsPage />);
    expect(await screen.findByText("D:/exports")).toBeInTheDocument();

    const user = userEvent.setup();
    const openButtons = screen.getAllByRole("button", { name: "打开" });
    expect(openButtons).toHaveLength(2);

    await user.click(openButtons[0]);
    expect(openUrl).toHaveBeenCalledWith(zhHans.RepositoryUrl);
    await user.click(openButtons[1]);
    expect(openUrl).toHaveBeenCalledWith(zhHans.WebsiteUrl);
  });

  it("切换语言写入设置并即时生效（置于最后，避免污染同文件断言）", async () => {
    render(<SettingsPage />);
    expect(await screen.findByText("D:/exports")).toBeInTheDocument();

    const user = userEvent.setup();
    // Radix Select 键盘驱动：Enter 展开 → 方向键从「简体中文」移到「English」→ Enter 提交
    const trigger = screen.getByRole("combobox");
    trigger.focus();
    await user.keyboard("[Enter]");
    await user.keyboard("[ArrowDown]");
    await user.keyboard("[Enter]");

    await waitFor(() => {
      expect(setSetting).toHaveBeenCalledWith("DisplayLanguage", "en-US");
    });
    await waitFor(() => {
      expect(screen.getByRole("combobox").textContent).toContain("English");
    });
  });
});
