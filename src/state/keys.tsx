import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

import { api } from "@/lib/api";
import type { KeyCategory, KeyEntry } from "@/lib/api";

interface KeysContextValue {
  recipientKeys: KeyEntry[];
  privateKeys: KeyEntry[];
  loading: boolean;
  storeError: string | null;
  refresh: (category?: KeyCategory) => Promise<void>;
}

const KeysContext = createContext<KeysContextValue | null>(null);

export function KeysProvider({ children }: { children: ReactNode }) {
  const [recipientKeys, setRecipientKeys] = useState<KeyEntry[]>([]);
  const [privateKeys, setPrivateKeys] = useState<KeyEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [storeError, setStoreError] = useState<string | null>(null);

  const refresh = useCallback(async (category?: KeyCategory) => {
    const targets = category ? [category] : (["recipient", "private"] as const);
    const jobs = targets.map(async (target) => {
      try {
        const keys = await api.listKeys(target);
        if (target === "recipient") {
          setRecipientKeys(keys);
        } else {
          setPrivateKeys(keys);
        }
        setStoreError(null);
      } catch (error) {
        // 完整性异常等场景下列表置空，由 App 级弹窗处理恢复流程。
        const message = (error as { code?: string }).code ?? "ErrorInternal";
        setStoreError(message);
        if (target === "recipient") {
          setRecipientKeys([]);
        } else {
          setPrivateKeys([]);
        }
      }
    });
    setLoading(true);
    await Promise.all(jobs);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo(
    () => ({ recipientKeys, privateKeys, loading, storeError, refresh }),
    [recipientKeys, privateKeys, loading, storeError, refresh],
  );

  return <KeysContext.Provider value={value}>{children}</KeysContext.Provider>;
}

export function useKeys(): KeysContextValue {
  const context = useContext(KeysContext);
  if (!context) {
    throw new Error("useKeys must be used within KeysProvider");
  }
  return context;
}
