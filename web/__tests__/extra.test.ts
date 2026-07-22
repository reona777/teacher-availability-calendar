import { describe, expect, it } from "vitest";

import {
  candidateTeachers,
  extraKey,
  extraTeachersOnWeekday,
  fromRedisFlags,
} from "../lib/extra";

describe("extraKey", () => {
  it("講師と曜日を1つのキーにまとめる", () => {
    expect(extraKey("伊藤大輔", "火")).toBe("伊藤大輔|火");
  });
});

describe("extraTeachersOnWeekday", () => {
  const extras = {
    "伊藤大輔|火": true,
    "松本涼|火": true,
    "中村結衣|水": true,
  } as const;

  it("その曜日に追加された講師だけを名前順で返す", () => {
    expect(extraTeachersOnWeekday(extras, "火")).toEqual(["伊藤大輔", "松本涼"]);
  });

  it("該当が無ければ空", () => {
    expect(extraTeachersOnWeekday(extras, "金")).toEqual([]);
  });

  it("区切りが壊れたキーは無視する", () => {
    expect(extraTeachersOnWeekday({ こわれたキー: true }, "火")).toEqual([]);
  });
});

describe("candidateTeachers", () => {
  const roster = ["伊藤大輔", "森陸", "中村結衣", "松本涼"];

  it("在籍講師から、その曜日に既に出ている人と追加済みの人を除く", () => {
    const shown = ["森陸"];
    const extras = { "伊藤大輔|火": true } as const;
    expect(candidateTeachers(roster, shown, extras, "火")).toEqual(["松本涼", "中村結衣"]);
  });

  it("別の曜日の追加は候補から外さない", () => {
    const extras = { "伊藤大輔|水": true } as const;
    expect(candidateTeachers(roster, [], extras, "火")).toContain("伊藤大輔");
  });

  it("全員出ていれば空", () => {
    expect(candidateTeachers(roster, roster, {}, "火")).toEqual([]);
  });
});

describe("fromRedisFlags", () => {
  it("HGETALL の配列形式を組み立て直す", () => {
    expect(fromRedisFlags(["伊藤大輔|火", "1", "松本涼|水", "1"])).toEqual({
      "伊藤大輔|火": true,
      "松本涼|水": true,
    });
  });

  it("オブジェクト形式でも読める", () => {
    expect(fromRedisFlags({ "伊藤大輔|火": "1" })).toEqual({ "伊藤大輔|火": true });
  });

  it("空・未設定は空オブジェクト", () => {
    expect(fromRedisFlags([])).toEqual({});
    expect(fromRedisFlags(null)).toEqual({});
  });
});
