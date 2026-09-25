import {
  House,
  KeyRound,
  Lock,
  LockOpen,
  Settings as SettingsIcon,
  ShieldKeyhole,
} from "lucide-react";
import { useState } from "react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { IntegrityDialog } from "@/components/IntegrityDialog";
import { Toaster } from "@/components/ui/sonner";
import { DecryptPage } from "@/pages/DecryptPage";
import { EncryptPage } from "@/pages/EncryptPage";
import { HomePage } from "@/pages/HomePage";
import { PrivateKeysPage } from "@/pages/PrivateKeysPage";
import { RecipientKeysPage } from "@/pages/RecipientKeysPage";
import { SettingsPage } from "@/pages/SettingsPage";
import { KeysProvider, useKeys } from "@/state/keys";

type PageId = "home" | "encrypt" | "decrypt" | "recipient" | "private" | "settings";

const NAV_ITEMS: { id: PageId; labelKey: string; icon: ReactNode }[] = [
  { id: "home", labelKey: "HomeNavItem.Content", icon: <House className="size-4" /> },
  { id: "encrypt", labelKey: "EncryptNavItem.Content", icon: <Lock className="size-4" /> },
  { id: "decrypt", labelKey: "DecryptNavItem.Content", icon: <LockOpen className="size-4" /> },
  { id: "recipient", labelKey: "RecipientKeysNavItem.Content", icon: <KeyRound className="size-4" /> },
  { id: "private", labelKey: "PrivateKeysNavItem.Content", icon: <ShieldKeyhole className="size-4" /> },
  { id: "settings", labelKey: "SettingsNavItem.Content", icon: <SettingsIcon className="size-4" /> },
];

function Shell() {
  const { t } = useTranslation();
  const [page, setPage] = useState<PageId>("home");
  const { storeError, refresh } = useKeys();

  // 完整性失败弹窗（缺失 / 校验失败两种状态）。
  const integrityState =
    storeError === "ErrorKeyStoreIntegrityMissing"
      ? "signatureMissing"
      : storeError === "ErrorKeyStoreIntegrityInvalid"
        ? "invalid"
        : null;

  const content: Record<PageId, ReactNode> = {
    home: <HomePage onNavigate={setPage} />,
    encrypt: <EncryptPage />,
    decrypt: <DecryptPage />,
    recipient: <RecipientKeysPage />,
    private: <PrivateKeysPage />,
    settings: <SettingsPage />,
  };

  return (
    <div className="flex h-full">
      <nav className="flex w-56 shrink-0 flex-col gap-1 border-r bg-sidebar p-3 text-sidebar-foreground">
        <div className="mb-3 px-2 py-1 text-sm font-semibold tracking-tight">
          MessagesEncrypter
        </div>
        {NAV_ITEMS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setPage(item.id)}
            className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${
              page === item.id
                ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
            }`}
          >
            {item.icon}
            {t(item.labelKey)}
          </button>
        ))}
      </nav>
      <main className="flex-1 overflow-y-auto p-6">{content[page]}</main>

      {integrityState ? (
        <IntegrityDialog state={integrityState} onResolved={() => void refresh()} />
      ) : null}
    </div>
  );
}

export default function App() {
  return (
    <KeysProvider>
      <Shell />
      <Toaster position="bottom-right" richColors />
    </KeysProvider>
  );
}
