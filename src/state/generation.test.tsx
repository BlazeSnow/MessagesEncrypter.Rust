import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { GenerationProvider, useGeneration } from "@/state/generation";

const generateKeyPair = vi.fn(async () => {
  await new Promise((r) => setTimeout(r, 50));
  return {} as never;
});
const refresh = vi.fn(async () => undefined);

vi.mock("@/lib/api", () => ({
  api: { generateKeyPair: (...a: unknown[]) => generateKeyPair(...(a as [])) },
  errorCodeOf: () => "ErrorInternal",
}));

vi.mock("@/state/keys", () => ({
  useKeys: () => ({ refresh }),
}));

function Probe() {
  const { generation, startGeneration } = useGeneration();
  return (
    <div>
      <span>{generation ? `busy-${generation.keySize}` : "idle"}</span>
      <button
        type="button"
        onClick={() => {
          void startGeneration({
            alias: "我的密钥 1",
            keySizeBits: 8192,
            password: "pw",
            rememberPassword: false,
          });
        }}
      >
        start
      </button>
    </div>
  );
}

describe("GenerationProvider", () => {
  beforeEach(() => {
    generateKeyPair.mockClear();
    refresh.mockClear();
  });

  it("生成期间保持全局状态，完成后清除并刷新列表", async () => {
    render(
      <GenerationProvider>
        <Probe />
      </GenerationProvider>,
    );
    const user = userEvent.setup();
    expect(screen.getByText("idle")).toBeInTheDocument();

    await user.click(screen.getByText("start"));
    // 生成中：全局状态存活（切页后回到私钥页时进度卡仍可渲染）
    expect(screen.getByText("busy-8192")).toBeInTheDocument();
    expect(generateKeyPair).toHaveBeenCalledWith({
      alias: "我的密钥 1",
      keySizeBits: 8192,
      password: "pw",
      rememberPassword: false,
    });

    // 完成后：状态清除 + 刷新私钥列表
    await waitFor(() => expect(screen.getByText("idle")).toBeInTheDocument());
    expect(refresh).toHaveBeenCalledWith("private");
  });

  it("生成失败：状态清除、列表仍刷新", async () => {
    generateKeyPair.mockRejectedValueOnce({ code: "ErrorInternal" });
    render(
      <GenerationProvider>
        <Probe />
      </GenerationProvider>,
    );
    const user = userEvent.setup();
    await user.click(screen.getByText("start"));
    await waitFor(() => expect(screen.getByText("idle")).toBeInTheDocument());
    expect(refresh).toHaveBeenCalledWith("private");
  });
});
