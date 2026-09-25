import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { KeyCard } from "@/components/KeyCard";
import type { KeyEntry } from "@/lib/api";

const entry: KeyEntry = {
  category: "private",
  alias: "我的密钥",
  fingerprint: "29DBA1A963CB360848DBC9B5F7FA4A46",
  publicKeyPem: "-----BEGIN PUBLIC KEY-----",
  encryptedPrivateKeyPem: "-----BEGIN ENCRYPTED PRIVATE KEY-----",
  keyType: "RSA2048",
};

describe("KeyCard", () => {
  it("展示别名、指纹与密钥类型徽章", () => {
    render(
      <KeyCard
        entry={entry}
        actions={[{ labelKey: "删除", onSelect: vi.fn(), danger: true }]}
      />,
    );
    expect(screen.getByText("我的密钥")).toBeInTheDocument();
    expect(screen.getByText(entry.fingerprint)).toBeInTheDocument();
    expect(screen.getByText("RSA2048")).toBeInTheDocument();
  });

  it("「更多」菜单展开后展示动作并可触发", async () => {
    const onDelete = vi.fn();
    const onRename = vi.fn();
    render(
      <KeyCard
        entry={entry}
        actions={[
          { labelKey: "重命名", onSelect: onRename },
          { labelKey: "删除", onSelect: onDelete, danger: true },
        ]}
      />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "more" }));

    expect(await screen.findByText("重命名")).toBeInTheDocument();
    expect(screen.getByText("删除")).toBeInTheDocument();

    await user.click(screen.getByText("重命名"));
    expect(onRename).toHaveBeenCalledTimes(1);
    expect(onDelete).not.toHaveBeenCalled();
  });
});
