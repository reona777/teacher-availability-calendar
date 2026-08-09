import { describe, expect, it } from "vitest";

import {
  WEEKDAYS,
  buildTeacherRows,
  buildTimeAxis,
  filterRows,
  formatOpenFrom,
  minutesToTime,
  occupiedSlots,
  teachersOnWeekday,
  timeToMinutes,
  visibleCells,
  weekdayFromISO,
  type Cell,
} from "../lib/grid";

const cell = (over: Partial<Cell> = {}): Cell => ({
  teacher: "田中健太",
  weekday: "火",
  start: "18:00",
  end: "19:00",
  count: 8,
  last_date: "2026-09-15",
  open_from: null,
  trial: false,
  ...over,
});

describe("WEEKDAYS", () => {
  it("月〜土の6日（日曜は授業が無いので扱わない）", () => {
    expect(WEEKDAYS).toEqual(["月", "火", "水", "木", "金", "土"]);
  });
});

describe("visibleCells", () => {
  it("日曜のセルを除外する", () => {
    const result = visibleCells([cell(), cell({ weekday: "日" })]);
    expect(result).toHaveLength(1);
    expect(result[0].weekday).toBe("火");
  });
});

describe("時刻ユーティリティ", () => {
  it("timeToMinutes", () => {
    expect(timeToMinutes("18:30")).toBe(18 * 60 + 30);
  });

  it("minutesToTime", () => {
    expect(minutesToTime(18 * 60 + 30)).toBe("18:30");
  });
});

describe("occupiedSlots", () => {
  it("1時間の枠は30分スロット2つを占める", () => {
    expect(occupiedSlots(cell({ start: "18:00", end: "19:00" }))).toEqual(["18:00", "18:30"]);
  });

  it("1時間半の枠は3つ", () => {
    expect(occupiedSlots(cell({ start: "14:00", end: "15:30" }))).toEqual([
      "14:00",
      "14:30",
      "15:00",
    ]);
  });

  it("終了が開始以下でも開始スロットは埋める", () => {
    expect(occupiedSlots(cell({ start: "14:00", end: "14:00" }))).toEqual(["14:00"]);
  });
});

describe("buildTimeAxis", () => {
  it("最小開始から最大終了まで30分刻みで並べる", () => {
    const axis = buildTimeAxis([
      cell({ start: "10:00", end: "11:00" }),
      cell({ start: "18:00", end: "19:00" }),
    ]);
    expect(axis[0]).toBe("10:00");
    expect(axis[axis.length - 1]).toBe("18:30");
    expect(axis).toContain("14:00");
  });

  it("空なら空配列", () => {
    expect(buildTimeAxis([])).toEqual([]);
  });
});

describe("teachersOnWeekday", () => {
  it("その曜日に授業がある講師だけを名前順で返す", () => {
    const list = teachersOnWeekday(
      [
        cell({ teacher: "B", weekday: "火" }),
        cell({ teacher: "A", weekday: "火" }),
        cell({ teacher: "C", weekday: "水" }),
      ],
      "火",
    );
    expect(list).toEqual(["A", "B"]);
  });
});

describe("buildTeacherRows", () => {
  const axis = ["18:00", "18:30", "19:00"];

  it("埋まっている時間にセルが入り、空き時間は null になる", () => {
    const rows = buildTeacherRows(
      [cell({ teacher: "A", start: "18:00", end: "19:00" })],
      "火",
      axis,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].teacher).toBe("A");
    expect(rows[0].slots[0]).not.toBeNull();
    expect(rows[0].slots[1]).not.toBeNull();
    expect(rows[0].slots[2]).toBeNull();
  });

  it("他の曜日のセルは入らない", () => {
    expect(buildTeacherRows([cell({ teacher: "A", weekday: "水" })], "火", axis)).toEqual([]);
  });

  it("手で足した講師は空きだけの行として末尾に付く", () => {
    const rows = buildTeacherRows([cell({ teacher: "B" })], "火", axis, ["A"]);
    expect(rows.map((row) => row.teacher)).toEqual(["B", "A"]);
    expect(rows[0].extra).toBe(false);
    expect(rows[1].extra).toBe(true);
    expect(rows[1].slots).toEqual([null, null, null]);
  });

  it("既に授業がある講師は二重に出さない", () => {
    const rows = buildTeacherRows([cell({ teacher: "A" })], "火", axis, ["A"]);
    expect(rows).toHaveLength(1);
    expect(rows[0].extra).toBe(false);
  });

  it("足した講師が複数なら名前順で並ぶ", () => {
    const rows = buildTeacherRows([], "火", axis, ["松本涼", "伊藤大輔"]);
    expect(rows.map((row) => row.teacher)).toEqual(["伊藤大輔", "松本涼"]);
  });
});

describe("filterRows", () => {
  const axis = ["18:00", "18:30"];
  const rows = buildTeacherRows(
    [cell({ teacher: "伊藤大輔" }), cell({ teacher: "中村結衣" })],
    "火",
    axis,
    ["松本涼"],
  );

  it("絞り込まないときは素通しする", () => {
    expect(filterRows(rows, null)).toBe(rows);
  });

  it("候補の講師だけを、元の並びのまま残す", () => {
    const filtered = filterRows(rows, ["松本涼", "伊藤大輔"]);
    expect(filtered.map((row) => row.teacher)).toEqual(["伊藤大輔", "松本涼"]);
  });

  it("手で足した行も候補でなければ落とす", () => {
    expect(filterRows(rows, ["伊藤大輔"]).map((row) => row.teacher)).toEqual(["伊藤大輔"]);
  });

  it("候補が空なら1行も残さない", () => {
    expect(filterRows(rows, [])).toEqual([]);
  });
});

describe("formatOpenFrom", () => {
  it("ゼロ埋めを外して M/D 表記にする", () => {
    expect(formatOpenFrom("2026-08-04")).toBe("8/4〜空");
  });
});

describe("weekdayFromISO", () => {
  it("2026-07-21は火曜", () => {
    expect(weekdayFromISO("2026-07-21T12:00:00+09:00")).toBe("火");
  });

  it("日曜は表示しないので月曜にフォールバックする", () => {
    expect(weekdayFromISO("2026-07-26T12:00:00+09:00")).toBe("月");
  });
});
