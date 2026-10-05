import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { KeyEntry } from "@/lib/api";
import { DecryptPage } from "@/pages/DecryptPage";

vi.mock("@/state/keys", () => ({
  useKeys: () => ({
    recipientKeys: [],
    privateKeys: KEYS,
    loading: false,
    storeError: null,
    refresh: vi.fn(async () => undefined),
  }),
}));

const setSetting = vi.fn(async (_key: string, _value: string) => undefined);
const hasSavedPassword = vi.fn(async (_fp: string) => savedPassword.saved);
const decryptMessage = vi.fn(async (_args: unknown) => "解密后的明文");

// 按用例切换的桩状态（工厂内只建闭包，调用时才读取）。
const savedPassword = { saved: false };
const remembered = { fingerprint: "FP-K1" as string | null };

vi.mock("@/lib/api", () => ({
  api: {
    getAppSettings: vi.fn(async () => ({
      exportFolder: null,
      displayLanguage: "zh-Hans",
      selectedRecipientFingerprint: null,
      selectedPrivateFingerprint: remembered.fingerprint,
    })),
    listKeys: vi.fn(async () => KEYS),
    setSetting: (key: string, value: string) => setSetting(key, value),
    hasSavedPassword: (fp: string) => hasSavedPassword(fp),
    decryptMessage: (args: unknown) => decryptMessage(args),
  },
  errorCodeOf: () => "ErrorInternal",
  RSA_KEY_SIZES: [2048, 3072, 4096, 8192],
}));

vi.mock("@tauri-apps/plugin-clipboard-manager", () => ({
  readText: vi.fn(async () => "CIPHER-FROM-CLIPBOARD"),
}));

const KEYS: KeyEntry[] = [
  {
    category: "private",
    alias: "私钥甲",
    fingerprint: "FP-K1",
    publicKeyPem: null,
    encryptedPrivateKeyPem: "ENC-1",
    keyType: "RSA2048",
  },
  {
    category: "private",
    alias: "私钥乙",
    fingerprint: "FP-K2",
    publicKeyPem: null,
    encryptedPrivateKeyPem: "ENC-2",
    keyType: "RSA4096",
  },
];

describe("DecryptPage", () => {
  beforeEach(() => {
    setSetting.mockClear();
    hasSavedPassword.mockClear();
    decryptMessage.mockClear();
    savedPassword.saved = false;
    remembered.fingerprint = "FP-K1";
  });

  it("恢复记忆的已选私钥（私钥甲 / FP-K1）", async () => {
    render(<DecryptPage />);
    await waitFor(() => {
      expect(screen.getByRole("combobox").textContent).toContain("私钥甲 (FP-K1)");
    });
  });

  it("无记忆时自动选中第一把并写入记忆", async () => {
    remembered.fingerprint = null;
    render(<DecryptPage />);
    await waitFor(() => {
      expect(screen.getByRole("combobox").textContent).toContain("私钥甲 (FP-K1)");
    });
    await waitFor(() => {
      expect(setSetting).toHaveBeenCalledWith("SelectedPrivateKeyFingerprint", "FP-K1");
    });
  });

  it("切换选择会写入记忆（setSetting）", async () => {
    render(<DecryptPage />);
    await waitFor(() => {
      expect(screen.getByRole("combobox").textContent).toContain("私钥甲 (FP-K1)");
    });

    const user = userEvent.setup();
    // Radix Select 在 jsdom 下用键盘驱动：Enter 展开 → 方向键移到「私钥乙」→ Enter 提交
    const trigger = screen.getByRole("combobox");
    trigger.focus();
    await user.keyboard("[Enter]");
    await user.keyboard("[ArrowDown]");
    await user.keyboard("[Enter]");

    await waitFor(() => {
      expect(setSetting).toHaveBeenCalledWith("SelectedPrivateKeyFingerprint", "FP-K2");
    });
  });

  it("有保存的密码时直接解密（useSavedPassword 路径）", async () => {
    savedPassword.saved = true;
    render(<DecryptPage />);
    await waitFor(() => {
      expect(screen.getByRole("combobox").textContent).toContain("私钥甲 (FP-K1)");
    });

    const user = userEvent.setup();
    await user.type(screen.getByLabelText("密文包"), "CIPHER-PACKAGE");
    await user.click(screen.getByRole("button", { name: /解密/ }));

    await waitFor(() => {
      expect(decryptMessage).toHaveBeenCalledWith({
        privateFingerprint: "FP-K1",
        package: "CIPHER-PACKAGE",
        useSavedPassword: true,
        password: null,
        rememberPassword: false,
      });
    });
    await waitFor(() => {
      expect(screen.getByLabelText("明文")).toHaveValue("解密后的明文");
    });
  });

  it("无保存密码时经解锁对话框解密", async () => {
    render(<DecryptPage />);
    await waitFor(() => {
      expect(screen.getByRole("combobox").textContent).toContain("私钥甲 (FP-K1)");
    });

    const user = userEvent.setup();
    await user.type(screen.getByLabelText("密文包"), "CIPHER-PACKAGE");
    await user.click(screen.getByRole("button", { name: /解密/ }));

    // hasSavedPassword=false → 弹出解锁私钥对话框
    expect(await screen.findByText("解锁私钥")).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText("私钥密码"), "pw-123");
    await user.click(screen.getByRole("button", { name: "解锁" }));

    await waitFor(() => {
      expect(decryptMessage).toHaveBeenCalledWith({
        privateFingerprint: "FP-K1",
        package: "CIPHER-PACKAGE",
        useSavedPassword: false,
        password: "pw-123",
        rememberPassword: false,
      });
    });
    // 解密成功后对话框关闭
    await waitFor(() => {
      expect(screen.queryByText("解锁私钥")).not.toBeInTheDocument();
    });
  });

  it("解锁密码为空时不调用解密", async () => {
    render(<DecryptPage />);
    await waitFor(() => {
      expect(screen.getByRole("combobox").textContent).toContain("私钥甲 (FP-K1)");
    });

    const user = userEvent.setup();
    await user.type(screen.getByLabelText("密文包"), "CIPHER-PACKAGE");
    await user.click(screen.getByRole("button", { name: /解密/ }));
    expect(await screen.findByText("解锁私钥")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "解锁" }));

    expect(decryptMessage).not.toHaveBeenCalled();
    expect(screen.getByText("解锁私钥")).toBeInTheDocument();
  });

  it("粘贴按钮填充密文包，清空按钮清空两框", async () => {
    render(<DecryptPage />);
    await waitFor(() => {
      expect(screen.getByRole("combobox").textContent).toContain("私钥甲 (FP-K1)");
    });

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "粘贴" }));
    await waitFor(() => {
      expect(screen.getByLabelText("密文包")).toHaveValue("CIPHER-FROM-CLIPBOARD");
    });

    await user.type(screen.getByLabelText("密文包"), " 追加");
    await user.click(screen.getByRole("button", { name: "清空" }));
    expect(screen.getByLabelText("密文包")).toHaveValue("");
    expect(screen.getByLabelText("明文")).toHaveValue("");
  });
});
