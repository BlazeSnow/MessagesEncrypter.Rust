import "@testing-library/jest-dom/vitest";

import { cleanup } from "@testing-library/react";
import { afterEach, beforeAll } from "vitest";

import { initI18n } from "@/i18n";

// jsdom 环境垫片：Radix Select 依赖 PointerEvent（触发展开）与 scrollIntoView（定位选中项）。
if (!("PointerEvent" in window)) {
  class FakePointerEvent extends MouseEvent {}
  Object.defineProperty(window, "PointerEvent", { value: FakePointerEvent });
}
Element.prototype.scrollIntoView ??= () => {};

// vitest globals 关闭时 RTL 的自动 cleanup 不生效，需手动注册。
afterEach(() => {
  cleanup();
});

// 组件测试统一使用简体中文资源，断言基于中文文案。
beforeAll(async () => {
  await initI18n("zh-Hans");
});
