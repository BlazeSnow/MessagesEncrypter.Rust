import i18next from "i18next";
import { initReactI18next } from "react-i18next";

import en from "./locales/en.json";
import zhHans from "./locales/zh-Hans.json";

export const LANGUAGE_AUTO = "auto";
export const LANGUAGE_ZH_HANS = "zh-Hans";
export const LANGUAGE_EN_US = "en-US";
export const LANGUAGE_PREFERENCES = [LANGUAGE_AUTO, LANGUAGE_ZH_HANS, LANGUAGE_EN_US];

/** 资源键为扁平点号命名（与原版 resw 对齐），禁用 i18next 的分隔符解析。 */
export function normalizePreference(preference: string | null | undefined): string {
  if (preference === LANGUAGE_ZH_HANS || preference === LANGUAGE_EN_US) {
    return preference;
  }
  return LANGUAGE_AUTO;
}

/** auto：仅 zh-Hans、zh-CN、zh-SG 前缀判为中文，其余一律英语（沿用原版规则）。 */
export function resolveSystemLanguage(): string {
  const language = navigator.language.toLowerCase();
  if (
    language.startsWith("zh-hans") ||
    language.startsWith("zh-cn") ||
    language.startsWith("zh-sg")
  ) {
    return LANGUAGE_ZH_HANS;
  }
  return LANGUAGE_EN_US;
}

export function resolveLanguage(preference: string | null | undefined): string {
  const normalized = normalizePreference(preference);
  return normalized === LANGUAGE_AUTO ? resolveSystemLanguage() : normalized;
}

let initialized = false;

export async function initI18n(preference?: string | null): Promise<string> {
  const language = resolveLanguage(preference);
  if (!initialized) {
    await i18next.use(initReactI18next).init({
      resources: {
        "zh-Hans": { translation: zhHans },
        en: { translation: en },
      },
      lng: language,
      fallbackLng: "en",
      keySeparator: false,
      nsSeparator: false,
      interpolation: {
        // 资源文案沿用原版 {0} 占位风格；内容由 React 转义，无需二次转义。
        prefix: "{",
        suffix: "}",
        escapeValue: false,
      },
      returnEmptyString: false,
    });
    initialized = true;
  } else {
    await i18next.changeLanguage(language);
  }
  return language;
}
