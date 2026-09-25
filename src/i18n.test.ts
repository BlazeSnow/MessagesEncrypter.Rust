import { afterEach, describe, expect, it, vi } from "vitest";

import {
  LANGUAGE_AUTO,
  LANGUAGE_EN_US,
  LANGUAGE_ZH_HANS,
  normalizePreference,
  resolveLanguage,
  resolveSystemLanguage,
} from "@/i18n";

function stubNavigatorLanguage(language: string) {
  vi.stubGlobal("navigator", { ...navigator, language });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("语言偏好解析（沿用原版规则）", () => {
  it("normalizePreference：仅接受 zh-Hans / en-US，其余归 auto", () => {
    expect(normalizePreference(LANGUAGE_ZH_HANS)).toBe(LANGUAGE_ZH_HANS);
    expect(normalizePreference(LANGUAGE_EN_US)).toBe(LANGUAGE_EN_US);
    expect(normalizePreference(LANGUAGE_AUTO)).toBe(LANGUAGE_AUTO);
    expect(normalizePreference("fr")).toBe(LANGUAGE_AUTO);
    expect(normalizePreference(null)).toBe(LANGUAGE_AUTO);
    expect(normalizePreference(undefined)).toBe(LANGUAGE_AUTO);
  });

  it("resolveSystemLanguage：zh-Hans/zh-CN/zh-SG 前缀判中文，其余（含 zh-TW）英语", () => {
    stubNavigatorLanguage("zh-Hans-CN");
    expect(resolveSystemLanguage()).toBe(LANGUAGE_ZH_HANS);
    stubNavigatorLanguage("zh-CN");
    expect(resolveSystemLanguage()).toBe(LANGUAGE_ZH_HANS);
    stubNavigatorLanguage("zh-SG");
    expect(resolveSystemLanguage()).toBe(LANGUAGE_ZH_HANS);
    stubNavigatorLanguage("zh-TW");
    expect(resolveSystemLanguage()).toBe(LANGUAGE_EN_US);
    stubNavigatorLanguage("en-US");
    expect(resolveSystemLanguage()).toBe(LANGUAGE_EN_US);
    stubNavigatorLanguage("ja");
    expect(resolveSystemLanguage()).toBe(LANGUAGE_EN_US);
  });

  it("resolveLanguage：auto 跟随系统，显式值直通", () => {
    stubNavigatorLanguage("zh-CN");
    expect(resolveLanguage(LANGUAGE_AUTO)).toBe(LANGUAGE_ZH_HANS);
    stubNavigatorLanguage("en-US");
    expect(resolveLanguage(LANGUAGE_AUTO)).toBe(LANGUAGE_EN_US);
    expect(resolveLanguage(LANGUAGE_ZH_HANS)).toBe(LANGUAGE_ZH_HANS);
    expect(resolveLanguage("bogus")).toBe(LANGUAGE_EN_US);
  });

  it("resolveLanguage 对 null/undefined 回退系统语言", () => {
    stubNavigatorLanguage("zh-SG");
    expect(resolveLanguage(null)).toBe(LANGUAGE_ZH_HANS);
  });
});
