import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";

import { api } from "@/lib/api";
import type { GenerateKeyArgs } from "@/lib/api";
import { showErrorToast, showStatusToast } from "@/lib/status";
import { useKeys } from "@/state/keys";

interface GenerationContextValue {
  /** 进行中的生成任务；null = 空闲。全局状态：切页后回到私钥页进度卡仍在。 */
  generation: { keySize: number } | null;
  startGeneration: (args: GenerateKeyArgs) => Promise<void>;
}

const GenerationContext = createContext<GenerationContextValue | null>(null);

/** 密钥生成任务的全局状态：生成跑在 spawn_blocking 上不受切页影响，
 *  状态提升到 Context 让进度卡跨页面存活，并防止并发生成。 */
export function GenerationProvider({ children }: { children: ReactNode }) {
  const { refresh } = useKeys();
  const [generation, setGeneration] = useState<{ keySize: number } | null>(null);

  const startGeneration = useCallback(
    async (args: GenerateKeyArgs) => {
      setGeneration({ keySize: args.keySizeBits });
      try {
        await api.generateKeyPair(args);
        showStatusToast("StatusKeyGenerated");
      } catch (error) {
        showErrorToast(error);
      } finally {
        setGeneration(null);
        await refresh("private");
      }
    },
    [refresh],
  );

  const value = useMemo(() => ({ generation, startGeneration }), [generation, startGeneration]);
  return <GenerationContext.Provider value={value}>{children}</GenerationContext.Provider>;
}

export function useGeneration(): GenerationContextValue {
  const context = useContext(GenerationContext);
  if (!context) {
    throw new Error("useGeneration must be used within GenerationProvider");
  }
  return context;
}
