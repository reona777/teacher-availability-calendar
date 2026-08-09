import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildCells,
  isExcluded,
  isTrial,
  jstWeekdayLabel,
  normalizeTeacher,
  toJst,
  type LessonRecord,
} from "../lib/transform";

const lesson = (over: Partial<LessonRecord> = {}): LessonRecord => ({
  MANAERP__Teacher__c: "田中 健太",
  MANAERP__Status__c: "Published",
  Name: "[生徒]標準コースS(英):指導枠",
  MANAERP__Start_Date_Time__c: "2026-07-21T09:00:00.000+0000",
  MANAERP__End_Date_Time__c: "2026-07-21T10:00:00.000+0000",
  ...over,
});

/** 日付とUTCの時（int）から Lesson を作る。 */
const at = (day: string, startHour: number, endHour: number, over: Partial<LessonRecord> = {}) =>
  lesson({
    MANAERP__Start_Date_Time__c: `${day}T${String(startHour).padStart(2, "0")}:00:00.000+0000`,
    MANAERP__End_Date_Time__c: `${day}T${String(endHour).padStart(2, "0")}:00:00.000+0000`,
    ...over,
  });

describe("normalizeTeacher", () => {
  it("半角・全角スペースを除去する", () => {
    expect(normalizeTeacher("山田 太郎")).toBe("山田太郎");
    expect(normalizeTeacher("山田　太郎")).toBe("山田太郎");
  });

  it("実データで分裂している2表記が同じになる", () => {
    expect(normalizeTeacher("山田 太郎")).toBe(normalizeTeacher("山田太郎"));
  });

  it("空欄は null", () => {
    expect(normalizeTeacher(null)).toBeNull();
    expect(normalizeTeacher("   ")).toBeNull();
  });
});

describe("toJst / jstWeekdayLabel", () => {
  it("土 05:00 UTC は 14:00 JST", () => {
    const jst = toJst("2026-07-25T05:00:00.000+0000");
    expect(jst.getUTCHours()).toBe(14);
    expect(jstWeekdayLabel(jst)).toBe("土");
  });

  it("火 09:00 UTC は 18:00 JST", () => {
    const jst = toJst("2026-07-21T09:00:00.000+0000");
    expect(jst.getUTCHours()).toBe(18);
    expect(jstWeekdayLabel(jst)).toBe("火");
  });

  it("16:00 UTC は翌日 01:00 JST（日付繰り上がり）", () => {
    const jst = toJst("2026-07-21T16:00:00.000+0000");
    expect(jst.getUTCDate()).toBe(22);
    expect(jst.getUTCHours()).toBe(1);
  });
});

describe("isExcluded", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("キャンセルは除外", () => {
    expect(isExcluded(lesson({ MANAERP__Status__c: "Cancelled" }))).toBe(true);
  });

  it("「未定」で始まる枠は除外", () => {
    expect(isExcluded(lesson({ Name: "未定 標準コースS" }))).toBe(true);
  });

  it("「当欠」を含む枠は除外", () => {
    expect(isExcluded(lesson({ Name: "[生徒]当欠 標準コース" }))).toBe(true);
  });

  it("講師が空なら除外", () => {
    expect(isExcluded(lesson({ MANAERP__Teacher__c: null }))).toBe(true);
  });

  it("EXCLUDED_TEACHERS に挙げた講師は除外（空白の有無は問わない）", () => {
    vi.stubEnv("EXCLUDED_TEACHERS", "佐々木花子,鈴木 一郎");
    expect(isExcluded(lesson({ MANAERP__Teacher__c: "佐々木花子" }))).toBe(true);
    expect(isExcluded(lesson({ MANAERP__Teacher__c: "鈴木 一郎" }))).toBe(true);
  });

  it("EXCLUDED_TEACHERS が未設定でも落ちない", () => {
    vi.stubEnv("EXCLUDED_TEACHERS", "");
    expect(isExcluded(lesson({ MANAERP__Teacher__c: "佐々木花子" }))).toBe(false);
  });

  it("通常の授業は残す", () => {
    expect(isExcluded(lesson())).toBe(false);
  });
});

describe("isTrial", () => {
  it("授業名に「体験」が入っていれば体験", () => {
    expect(isTrial(lesson({ Name: "[生徒]体験授業" }))).toBe(true);
    expect(isTrial(lesson())).toBe(false);
  });
});

describe("buildCells", () => {
  const rangeEnd = "2026-09-21";

  it("講師名の表記揺れを1つのセルにまとめる", () => {
    const cells = buildCells(
      [
        at("2026-07-21", 9, 10, { MANAERP__Teacher__c: "山田 太郎" }),
        at("2026-07-28", 9, 10, { MANAERP__Teacher__c: "山田太郎" }),
      ],
      rangeEnd,
    );
    expect(cells).toHaveLength(1);
    expect(cells[0].teacher).toBe("山田太郎");
    expect(cells[0].count).toBe(2);
  });

  it("JSTの曜日と時刻を持つ", () => {
    const cells = buildCells([at("2026-07-21", 9, 10)], rangeEnd);
    expect(cells[0].weekday).toBe("火");
    expect(cells[0].start).toBe("18:00");
    expect(cells[0].end).toBe("19:00");
  });

  it("途中で終わる枠は次の同じ曜日が空き開始日になる", () => {
    const cells = buildCells(
      ["2026-07-21", "2026-07-28", "2026-08-04", "2026-08-11"].map((d) => at(d, 9, 10)),
      rangeEnd,
    );
    expect(cells[0].last_date).toBe("2026-08-11");
    expect(cells[0].open_from).toBe("2026-08-18");
  });

  it("取得範囲を越えて続く枠は空き扱いにしない", () => {
    const cells = buildCells(
      ["2026-09-08", "2026-09-15"].map((d) => at(d, 9, 10)),
      rangeEnd,
    );
    expect(cells[0].open_from).toBeNull();
  });

  it("除外対象は現れない", () => {
    vi.stubEnv("EXCLUDED_TEACHERS", "佐々木花子");
    const cells = buildCells(
      [
        at("2026-07-21", 9, 10, { MANAERP__Status__c: "Cancelled" }),
        at("2026-07-21", 9, 10, { MANAERP__Teacher__c: null }),
        at("2026-07-21", 9, 10, { Name: "未定 標準コース" }),
        at("2026-07-21", 9, 10, { MANAERP__Teacher__c: "佐々木花子" }),
      ],
      rangeEnd,
    );
    expect(cells).toEqual([]);
    vi.unstubAllEnvs();
  });

  it("時刻が違えば別のセル", () => {
    const cells = buildCells([at("2026-07-21", 9, 10), at("2026-07-21", 10, 11)], rangeEnd);
    expect(cells).toHaveLength(2);
    expect(new Set(cells.map((c) => c.start))).toEqual(new Set(["18:00", "19:00"]));
  });

  it("体験を含む枠には trial が立つ", () => {
    const cells = buildCells(
      [
        at("2026-07-21", 9, 10),
        at("2026-07-28", 9, 10, { Name: "[生徒]体験授業" }),
      ],
      rangeEnd,
    );
    expect(cells).toHaveLength(1);
    expect(cells[0].trial).toBe(true);
  });

  it("通常の枠は trial が false", () => {
    expect(buildCells([at("2026-07-21", 9, 10)], rangeEnd)[0].trial).toBe(false);
  });
});
