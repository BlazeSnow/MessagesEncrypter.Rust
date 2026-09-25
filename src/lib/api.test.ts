import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { errorCodeOf } from "@/lib/api";

describe("errorCodeOf", () => {
  it("提取后端 AppError 序列化对象中的稳定错误码", () => {
    expect(errorCodeOf({ code: "ErrorDuplicateKey" })).toBe("ErrorDuplicateKey");
  });

  it("非对象、缺 code、空 code 一律回退 ErrorInternal", () => {
    expect(errorCodeOf(undefined)).toBe("ErrorInternal");
    expect(errorCodeOf(null)).toBe("ErrorInternal");
    expect(errorCodeOf("ErrorX")).toBe("ErrorInternal");
    expect(errorCodeOf({})).toBe("ErrorInternal");
    expect(errorCodeOf({ code: "" })).toBe("ErrorInternal");
    expect(errorCodeOf({ code: 42 })).toBe("ErrorInternal");
  });
});
