import { invoke } from "@tauri-apps/api/core";

export type KeyCategory = "recipient" | "private";

export interface KeyEntry {
  category: KeyCategory;
  alias: string;
  fingerprint: string;
  publicKeyPem: string | null;
  encryptedPrivateKeyPem: string | null;
  keyType: string;
}

export interface AppSettings {
  exportFolder: string | null;
  displayLanguage: string;
  selectedRecipientFingerprint: string | null;
  selectedPrivateFingerprint: string | null;
}

export interface GenerateKeyArgs {
  [key: string]: unknown;

  alias: string;
  keySizeBits: number;
  password: string;
  rememberPassword: boolean;
}

export interface ImportPublicKeyArgs {
  [key: string]: unknown;

  alias: string;
  publicKeyPem: string;
}

export interface ImportPrivateKeyArgs {
  [key: string]: unknown;

  alias: string;
  privateKeyPem: string;
  password: string;
  rememberPassword: boolean;
}

export interface DecryptArgs {
  [key: string]: unknown;

  privateFingerprint: string;
  package: string;
  useSavedPassword: boolean;
  password?: string | null;
  rememberPassword: boolean;
}

export const RSA_KEY_SIZES = [2048, 3072, 4096, 8192];

export const api = {
  getKeyStoreState: () => invoke<string>("get_key_store_state"),
  trustKeyStore: () => invoke<void>("trust_key_store"),

  listKeys: (category: KeyCategory) => invoke<KeyEntry[]>("list_keys", { category }),
  generateKeyPair: (args: GenerateKeyArgs) => invoke<KeyEntry>("generate_key_pair", args),
  importPublicKey: (args: ImportPublicKeyArgs) => invoke<KeyEntry>("import_public_key", args),
  importPrivateKey: (args: ImportPrivateKeyArgs) => invoke<KeyEntry>("import_private_key", args),
  renameKey: (category: KeyCategory, fingerprint: string, alias: string) =>
    invoke<void>("rename_key", { category, fingerprint, alias }),
  deleteKey: (category: KeyCategory, fingerprint: string) =>
    invoke<void>("delete_key", { category, fingerprint }),
  changePrivateKeyPassword: (
    fingerprint: string,
    oldPassword: string,
    newPassword: string,
    rememberPassword: boolean,
  ) =>
    invoke<void>("change_private_key_password", {
      fingerprint,
      oldPassword,
      newPassword,
      rememberPassword,
    }),

  encryptMessage: (recipientFingerprint: string, plainText: string) =>
    invoke<string>("encrypt_message", { recipientFingerprint, plainText }),
  decryptMessage: (args: DecryptArgs) => invoke<string>("decrypt_message", args),
  hasSavedPassword: (privateFingerprint: string) =>
    invoke<boolean>("has_saved_password", { privateFingerprint }),

  exportKey: (category: KeyCategory, fingerprint: string) =>
    invoke<string>("export_key", { category, fingerprint }),

  getAppSettings: () => invoke<AppSettings>("get_app_settings"),
  setSetting: (key: string, value: string) => invoke<void>("set_setting", { key, value }),
  getAppVersion: () => invoke<string>("get_app_version"),
};

/** 从 invoke 的 rejection 中提取稳定错误码。 */
export function errorCodeOf(error: unknown): string {
  if (error && typeof error === "object" && "code" in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string" && code) {
      return code;
    }
  }
  return "ErrorInternal";
}
