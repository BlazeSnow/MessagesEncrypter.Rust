import { render, renderHook, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { KeyEntry } from "@/lib/api";
import { KeysProvider, useKeys } from "@/state/keys";

// 值为密钥列表；为 { error } 时桩实现改为 reject（模拟 invoke rejection）。
const lists: Record<string, KeyEntry[] | { error: { code: string } }> = {};

const listKeys = vi.fn(async (category: string) => {
  const value = lists[category];
  if (value && "error" in value) {
    throw value.error;
  }
  return value ?? [];
});

vi.mock("@/lib/api", () => ({
  api: {
    listKeys: (category: string) => listKeys(category),
  },
  errorCodeOf: () => "ErrorInternal",
}));

const RECIPIENT: KeyEntry[] = [
  {
    category: "recipient",
    alias: "对方甲",
    fingerprint: "FP-R1",
    publicKeyPem: "PUB-R1",
    encryptedPrivateKeyPem: null,
    keyType: "RSA2048",
  },
];
const PRIVATE: KeyEntry[] = [
  {
    category: "private",
    alias: "自己甲",
    fingerprint: "FP-P1",
    publicKeyPem: null,
    encryptedPrivateKeyPem: "ENC-P1",
    keyType: "RSA2048",
  },
];

function Probe() {
  const { recipientKeys, privateKeys, loading, storeError, refresh } = useKeys();
  return (
    <div>
      <span data-testid="loading">{String(loading)}</span>
      <span data-testid="storeError">{storeError ?? ""}</span>
      <span data-testid="recipient">{recipientKeys.map((k) => k.fingerprint).join(",")}</span>
      <span data-testid="private">{privateKeys.map((k) => k.fingerprint).join(",")}</span>
      <button type="button" onClick={() => void refresh("recipient")}>
        refresh-recipient
      </button>
    </div>
  );
}

function renderProbe() {
  return render(
    <KeysProvider>
      <Probe />
    </KeysProvider>,
  );
}

describe("KeysProvider", () => {
  beforeEach(() => {
    listKeys.mockClear();
    lists.recipient = RECIPIENT;
    lists.private = PRIVATE;
  });

  it("初始加载两个类别并结束 loading", async () => {
    renderProbe();

    await waitFor(() => {
      expect(screen.getByTestId("loading").textContent).toBe("false");
    });
    expect(screen.getByTestId("recipient").textContent).toBe("FP-R1");
    expect(screen.getByTestId("private").textContent).toBe("FP-P1");
    expect(screen.getByTestId("storeError").textContent).toBe("");
    expect(listKeys).toHaveBeenCalledWith("recipient");
    expect(listKeys).toHaveBeenCalledWith("private");
  });

  it("列表加载失败时置空并暴露错误码（完整性弹窗依赖此状态）", async () => {
    const integrityError = { code: "ErrorKeyStoreIntegrityInvalid" };
    lists.recipient = { error: integrityError };
    lists.private = { error: integrityError };
    renderProbe();

    await waitFor(() => {
      expect(screen.getByTestId("storeError").textContent).toBe(
        "ErrorKeyStoreIntegrityInvalid",
      );
    });
    expect(screen.getByTestId("recipient").textContent).toBe("");
    expect(screen.getByTestId("private").textContent).toBe("");
    expect(screen.getByTestId("loading").textContent).toBe("false");
  });

  it("refresh(category) 只刷新指定类别", async () => {
    renderProbe();
    await waitFor(() => {
      expect(screen.getByTestId("loading").textContent).toBe("false");
    });

    lists.recipient = [
      { ...RECIPIENT[0], fingerprint: "FP-R2", alias: "对方乙" },
    ];
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "refresh-recipient" }));

    await waitFor(() => {
      expect(screen.getByTestId("recipient").textContent).toBe("FP-R2");
    });
    // 私钥列表未被重取，保持原值
    expect(screen.getByTestId("private").textContent).toBe("FP-P1");
    expect(listKeys.mock.calls.filter(([c]) => c === "private")).toHaveLength(1);
    expect(listKeys.mock.calls.filter(([c]) => c === "recipient")).toHaveLength(2);
  });

  it("Provider 外使用 useKeys 抛出明确错误", () => {
    expect(() => renderHook(() => useKeys())).toThrow(
      "useKeys must be used within KeysProvider",
    );
  });
});
