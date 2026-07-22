import { describe, expect, it } from "vitest";

import {
  MARK_LABEL,
  applyMark,
  fromRedisHash,
  markKey,
  nextMark,
  resolveMark,
  sanitizeMarks,
} from "../lib/marks";

describe("markKey", () => {
  it("講師・曜日・時刻を1つのキーにまとめる", () => {
    expect(markKey("田中健太", "火", "18:00")).toBe("田中健太|火|18:00");
  });
});

describe("nextMark", () => {
  it("無印 → × → 〇 → 無印 の順に一巡する", () => {
    expect(nextMark(null)).toBe("ng");
    expect(nextMark("ng")).toBe("ok");
    expect(nextMark("ok")).toBeNull();
  });
});

describe("MARK_LABEL", () => {
  it("ngは×、okは〇", () => {
    expect(MARK_LABEL.ng).toBe("×");
    expect(MARK_LABEL.ok).toBe("〇");
  });
});

describe("resolveMark", () => {
  const marks = { "A|火|18:00": "ng" as const };

  it("空きセルには保存された印を出す", () => {
    expect(resolveMark(marks, "A", "火", "18:00", false)).toBe("ng");
  });

  it("特訓が入っているセルでは印を出さない（Salesforceを優先する）", () => {
    expect(resolveMark(marks, "A", "火", "18:00", true)).toBeNull();
  });

  it("印が無ければnull", () => {
    expect(resolveMark(marks, "A", "火", "19:00", false)).toBeNull();
  });
});

describe("applyMark", () => {
  it("印を設定する", () => {
    expect(applyMark({}, "A|火|18:00", "ng")).toEqual({ "A|火|18:00": "ng" });
  });

  it("nullを渡すとキーごと消す", () => {
    expect(applyMark({ "A|火|18:00": "ng" }, "A|火|18:00", null)).toEqual({});
  });

  it("元のオブジェクトを書き換えない", () => {
    const before = { "A|火|18:00": "ng" as const };
    applyMark(before, "A|火|18:00", "ok");
    expect(before).toEqual({ "A|火|18:00": "ng" });
  });
});

describe("sanitizeMarks", () => {
  it("ng と ok だけを残す", () => {
    const raw = { "A|火|18:00": "ng", "B|水|10:00": "ok", "C|木|11:00": "maybe" };
    expect(sanitizeMarks(raw)).toEqual({ "A|火|18:00": "ng", "B|水|10:00": "ok" });
  });

  it("オブジェクトでなければ空にする", () => {
    expect(sanitizeMarks(null)).toEqual({});
    expect(sanitizeMarks("ng")).toEqual({});
    expect(sanitizeMarks([1, 2])).toEqual({});
  });
});

describe("fromRedisHash", () => {
  it("HGETALL の配列形式を組み立て直す", () => {
    expect(fromRedisHash(["A|火|18:00", "ng", "B|水|10:00", "ok"])).toEqual({
      "A|火|18:00": "ng",
      "B|水|10:00": "ok",
    });
  });

  it("オブジェクト形式でそのまま返ることもある", () => {
    expect(fromRedisHash({ "A|火|18:00": "ng" })).toEqual({ "A|火|18:00": "ng" });
  });

  it("空・未設定は空オブジェクト", () => {
    expect(fromRedisHash([])).toEqual({});
    expect(fromRedisHash(null)).toEqual({});
  });
});
