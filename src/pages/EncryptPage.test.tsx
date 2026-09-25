import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { KeyEntry } from "@/lib/api";
import { EncryptPage } from "@/pages/EncryptPage";

vi.mock("@/state/keys", () => ({
  useKeys: () => ({
    recipientKeys: KEYS,
    privateKeys: [],
    loading: false,
    storeError: null,
    refresh: vi.fn(async () => undefined),
  }),
}));

const setSetting = vi.fn(async () => undefined);
const encryptMessage = vi.fn(async (_fp: string, _plain: string) => "ENCRYPTED-PACKAGE");

vi.mock("@/lib/api", () => ({
  api: {
    getAppSettings: vi.fn(async () => ({
      exportFolder: null,
      displayLanguage: "zh-Hans",
      selectedRecipientFingerprint: "FP-A",
      selectedPrivateFingerprint: null,
    })),
    listKeys: vi.fn(async () => KEYS),
    setSetting: (...args: unknown[]) => setSetting(...(args as [])),
    encryptMessage: (...args: unknown[]) => encryptMessage(...(args as [])),
  },
  errorCodeOf: () => "ErrorInternal",
  RSA_KEY_SIZES: [2048, 3072, 4096, 8192],
}));

const KEYS: KeyEntry[] = [
  {
    category: "recipient",
    alias: "甲",
    fingerprint: "FP-A",
    publicKeyPem: "PUB-A",
    encryptedPrivateKeyPem: null,
    keyType: "RSA2048",
  },
  {
    category: "recipient",
    alias: "乙",
    fingerprint: "FP-B",
    publicKeyPem: "PUB-B",
    encryptedPrivateKeyPem: null,
    keyType: "RSA4096",
  },
];

describe("EncryptPage", () => {
  beforeEach(() => {
    setSetting.mockClear();
    encryptMessage.mockClear();
  });

  it("恢复记忆的已选公钥（甲 / FP-A）", async () => {
    render(<EncryptPage />);
    await waitFor(() => {
      expect(screen.getByRole("combobox").textContent).toContain("甲 (FP-A)");
    });
  });

  it("输入明文后加密：调用后端并在输出框展示密文包", async () => {
    render(<EncryptPage />);
    await waitFor(() => {
      expect(screen.getByRole("combobox").textContent).toContain("甲 (FP-A)");
    });

    const user = userEvent.setup();
    await user.type(screen.getByLabelText("明文"), "你好 hello");
    await user.click(screen.getByRole("button", { name: /加密/ }));

    await waitFor(() => {
      expect(encryptMessage).toHaveBeenCalledWith("FP-A", "你好 hello");
    });
    await waitFor(() => {
      expect(screen.getByLabelText("密文包")).toHaveValue("ENCRYPTED-PACKAGE");
    });
  });

  it("切换选择会写入记忆（setSetting）", async () => {
    render(<EncryptPage />);
    await waitFor(() => {
      expect(screen.getByRole("combobox").textContent).toContain("甲 (FP-A)");
    });

    const user = userEvent.setup();
    // Radix Select 在 jsdom 下用键盘驱动：Enter 展开 → 方向键移到「乙」→ Enter 提交
    const trigger = screen.getByRole("combobox");
    trigger.focus();
    await user.keyboard("[Enter]");
    await user.keyboard("[ArrowDown]");
    await user.keyboard("[Enter]");

    await waitFor(() => {
      expect(setSetting).toHaveBeenCalledWith("SelectedRecipientKeyFingerprint", "FP-B");
    });
  });
});
