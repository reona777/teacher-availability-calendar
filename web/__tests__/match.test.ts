import { describe, expect, it } from "vitest";

import type { Cell } from "../lib/grid";
import { markKey, type Marks } from "../lib/marks";
import type { Bunri, Profiles } from "../lib/profile";
import { EMPTY_WISH, freeRuns, isBlankWish, matchTeachers, type Wish } from "../lib/match";

function cell(teacher: string, weekday: string, start: string, end: string): Cell {
  return {
    teacher,
    weekday,
    start,
    end,
    count: 8,
    last_date: "2026-09-01",
    open_from: null,
    trial: false,
  };
}

function profiles(
  entries: [string, string[], Bunri | null, string | null, string?][],
): Profiles {
  const built: Profiles = {};
  for (const [teacher, subjects, bunri, university, faculty] of entries) {
    built[teacher] = { teacher, subjects, bunri, university, faculty: faculty ?? null };
  }
  return built;
}

function wish(overrides: Partial<Wish> = {}): Wish {
  return { ...EMPTY_WISH, ...overrides };
}

/** 火曜に 13:00-14:00 と 15:00-16:00 の特訓がある講師。空きは 14:00-15:00 の60分。 */
const KATO_TUESDAY = [
  cell("伊藤大輔", "火", "13:00", "14:00"),
  cell("伊藤大輔", "火", "15:00", "16:00"),
];

describe("freeRuns", () => {
  it("希望の範囲から、続けて空いている区間を切り出す", () => {
    const blocked = new Set(["13:00", "13:30", "15:00", "15:30"]);
    expect(freeRuns({ weekday: "火", from: "13:00", to: "16:00" }, blocked)).toEqual([
      { from: "14:00", to: "15:00" },
    ]);
  });

  it("希望の端まで空いていれば端で区切る", () => {
    expect(freeRuns({ weekday: "火", from: "18:00", to: "20:00" }, new Set())).toEqual([
      { from: "18:00", to: "20:00" },
    ]);
  });

  it("塞がっている枠を挟むと区間が分かれる", () => {
    const blocked = new Set(["15:00"]);
    expect(freeRuns({ weekday: "火", from: "14:00", to: "16:00" }, blocked)).toEqual([
      { from: "14:00", to: "15:00" },
      { from: "15:30", to: "16:00" },
    ]);
  });

  it("全部塞がっていれば空", () => {
    const blocked = new Set(["14:00", "14:30"]);
    expect(freeRuns({ weekday: "火", from: "14:00", to: "15:00" }, blocked)).toEqual([]);
  });

  it("開始と終了が逆でも壊れない", () => {
    expect(freeRuns({ weekday: "火", from: "16:00", to: "14:00" }, new Set())).toEqual([]);
  });
});

describe("isBlankWish", () => {
  it("何も入れていなければ空とみなす", () => {
    expect(isBlankWish(EMPTY_WISH)).toBe(true);
  });

  it("条件が1つでもあれば空ではない", () => {
    expect(isBlankWish(wish({ subjects: ["高校英語"] }))).toBe(false);
    expect(isBlankWish(wish({ bunri: "理系" }))).toBe(false);
    expect(isBlankWish(wish({ times: [{ weekday: "火", from: "14:00", to: "15:00" }] }))).toBe(
      false,
    );
  });

  it("志望校だけでは絞り込めないので空のままにする", () => {
    expect(isBlankWish(wish({ preference: "早稲田大学" }))).toBe(true);
  });
});

describe("matchTeachers 時間の判定", () => {
  const base = {
    cells: KATO_TUESDAY,
    profiles: profiles([["伊藤大輔", ["高校英語"], "理系", "東京大学"]]),
    marks: {} as Marks,
    extras: {},
  };

  it("1コマ分の連続した空きがあれば候補になる", () => {
    const result = matchTeachers({
      ...base,
      wish: wish({
        times: [{ weekday: "火", from: "13:00", to: "16:00" }],
        lessonMinutes: 60,
      }),
    });
    expect(result.candidates.map((c) => c.teacher)).toEqual(["伊藤大輔"]);
    expect(result.candidates[0].openings).toEqual([
      { weekday: "火", from: "14:00", to: "15:00", ok: false },
    ]);
  });

  it("連続した空きがコマ長に足りなければ候補にならない", () => {
    const result = matchTeachers({
      ...base,
      wish: wish({
        times: [{ weekday: "火", from: "13:00", to: "16:00" }],
        lessonMinutes: 90,
      }),
    });
    expect(result.candidates).toEqual([]);
    expect(result.dropped.time).toBe(1);
  });

  it("複数の希望はどれか1つを満たせばよい", () => {
    const result = matchTeachers({
      ...base,
      wish: wish({
        times: [
          { weekday: "火", from: "13:00", to: "14:00" },
          { weekday: "火", from: "16:00", to: "18:00" },
        ],
        lessonMinutes: 60,
      }),
    });
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].openings).toEqual([
      { weekday: "火", from: "16:00", to: "18:00", ok: false },
    ]);
  });

  it("1つの希望からは最初に入る空きだけを出す", () => {
    // 満たした希望の数で並べ替えるので、1希望が2件に膨らむと数がずれる
    const result = matchTeachers({
      ...base,
      wish: wish({
        times: [{ weekday: "火", from: "13:00", to: "18:00" }],
        lessonMinutes: 60,
      }),
    });
    expect(result.candidates[0].openings).toEqual([
      { weekday: "火", from: "14:00", to: "15:00", ok: false },
    ]);
  });

  it("その曜日に出ていない講師は対象にしない", () => {
    const result = matchTeachers({
      ...base,
      wish: wish({
        times: [{ weekday: "水", from: "13:00", to: "20:00" }],
        lessonMinutes: 60,
      }),
    });
    expect(result.candidates).toEqual([]);
  });

  describe("手で足した講師（特訓がまだ無い人）", () => {
    // デビュー前などで特訓が1件も無い講師は、表に出ていないだけで来られないとは限らない。
    // ただし空いている確証も無いので、〇を付けた枠だけを空きとみなす。
    const added = {
      ...base,
      extras: { "中村結衣|水": true as const },
      profiles: profiles([
        ["伊藤大輔", ["高校英語"], "理系", "東京大学"],
        ["中村結衣", ["高校英語"], "文系", "東邦大学", "医学部"],
      ]),
    };
    const times = [{ weekday: "水", from: "13:00", to: "20:00" }];

    it("〇が付いていなければ候補にしない", () => {
      const result = matchTeachers({ ...added, wish: wish({ times, lessonMinutes: 60 }) });
      expect(result.candidates).toEqual([]);
      expect(result.dropped.time).toBe(1);
    });

    it("〇が1コマ分続いていれば候補になる", () => {
      const marks: Marks = {
        [markKey("中村結衣", "水", "14:00")]: "ok",
        [markKey("中村結衣", "水", "14:30")]: "ok",
      };
      const result = matchTeachers({ ...added, marks, wish: wish({ times, lessonMinutes: 60 }) });
      expect(result.candidates.map((c) => c.teacher)).toEqual(["中村結衣"]);
      expect(result.candidates[0].openings).toEqual([
        { weekday: "水", from: "14:00", to: "15:00", ok: true },
      ]);
    });

    it("〇が1コマ分に足りなければ候補にしない", () => {
      const marks: Marks = { [markKey("中村結衣", "水", "14:00")]: "ok" };
      const result = matchTeachers({ ...added, marks, wish: wish({ times, lessonMinutes: 60 }) });
      expect(result.candidates).toEqual([]);
    });

    it("×を数える設定にしても、〇だけを見る扱いは変えない", () => {
      const marks: Marks = { [markKey("中村結衣", "水", "14:00")]: "ok" };
      const result = matchTeachers({
        ...added,
        marks,
        wish: wish({ times, lessonMinutes: 60, excludeNg: false }),
      });
      expect(result.candidates).toEqual([]);
    });
  });
});

describe("matchTeachers ×〇の印", () => {
  const cells = [cell("伊藤大輔", "火", "13:00", "14:00")];
  const base = {
    cells,
    profiles: profiles([["伊藤大輔", ["高校英語"], "理系", null]]),
    extras: {},
  };
  const times = [{ weekday: "火", from: "14:00", to: "16:00" }];

  it("×の枠は空きに数えないので連続が切れる", () => {
    const marks: Marks = { [markKey("伊藤大輔", "火", "15:00")]: "ng" };
    const result = matchTeachers({
      ...base,
      marks,
      wish: wish({ times, lessonMinutes: 90, excludeNg: true }),
    });
    expect(result.candidates).toEqual([]);
  });

  it("×を無視する設定なら連続したままになる", () => {
    const marks: Marks = { [markKey("伊藤大輔", "火", "15:00")]: "ng" };
    const result = matchTeachers({
      ...base,
      marks,
      wish: wish({ times, lessonMinutes: 90, excludeNg: false }),
    });
    expect(result.candidates).toHaveLength(1);
  });

  it("〇が付いた枠を含む空きには印を立てる", () => {
    const marks: Marks = { [markKey("伊藤大輔", "火", "14:00")]: "ok" };
    const result = matchTeachers({
      ...base,
      marks,
      wish: wish({ times, lessonMinutes: 60 }),
    });
    expect(result.candidates[0].hasOk).toBe(true);
    expect(result.candidates[0].openings[0].ok).toBe(true);
  });
});

describe("matchTeachers 科目・文理・志望校", () => {
  const cells = [
    cell("伊藤大輔", "火", "13:00", "14:00"),
    cell("中村結衣", "火", "13:00", "14:00"),
    cell("清水蓮", "火", "13:00", "14:00"),
  ];
  const base = {
    cells,
    profiles: profiles([
      ["伊藤大輔", ["高校英語", "高校数学（ⅡB）"], "理系", "東京大学"],
      ["中村結衣", ["高校英語"], "文系", "早稲田大学"],
      ["清水蓮", [], "文系", "早稲田大学"],
    ]),
    marks: {} as Marks,
    extras: {},
  };

  it("複数の科目を選んだら全部教えられる講師だけが残る", () => {
    const result = matchTeachers({
      ...base,
      wish: wish({ subjects: ["高校英語", "高校数学（ⅡB）"] }),
    });
    expect(result.candidates.map((c) => c.teacher)).toEqual(["伊藤大輔"]);
    expect(result.dropped.subject).toBe(2);
  });

  it("科目を1つ選べばそれを持つ講師が残る", () => {
    const result = matchTeachers({ ...base, wish: wish({ subjects: ["高校英語"] }) });
    expect(result.candidates.map((c) => c.teacher).sort()).toEqual(["中村結衣", "伊藤大輔"]);
  });

  it("科目が1件も無い講師は科目を指定すると落ちる", () => {
    const result = matchTeachers({ ...base, wish: wish({ subjects: ["高校英語"] }) });
    expect(result.candidates.map((c) => c.teacher)).not.toContain("清水蓮");
  });

  it("文理で絞れる", () => {
    const result = matchTeachers({ ...base, wish: wish({ bunri: "理系" }) });
    expect(result.candidates.map((c) => c.teacher)).toEqual(["伊藤大輔"]);
    expect(result.dropped.bunri).toBe(2);
  });

  it("文理を指定しなければ誰も落とさない", () => {
    const result = matchTeachers({ ...base, wish: wish({ subjects: ["高校英語"] }) });
    expect(result.dropped.bunri).toBe(0);
  });

  it("志望校は人数を変えず、並び順だけを変える", () => {
    const withoutWish = matchTeachers({ ...base, wish: wish({ subjects: ["高校英語"] }) });
    const withWish = matchTeachers({
      ...base,
      wish: wish({ subjects: ["高校英語"], preference: "早稲田大学" }),
    });
    expect(withWish.candidates).toHaveLength(withoutWish.candidates.length);
    expect(withWish.candidates[0].teacher).toBe("中村結衣");
    expect(withWish.candidates[0].preferred).toBe(true);
  });

  it("志望学部でも同じように上に出す（医学部志望に医学部の講師を当てるため）", () => {
    const medical = {
      cells: [
        cell("伊藤大輔", "火", "13:00", "14:00"),
        cell("小林愛", "火", "13:00", "14:00"),
      ],
      profiles: profiles([
        ["伊藤大輔", ["高校英語"], "理系", "東京大学"],
        ["小林愛", ["高校英語"], "理系", "東京女子医科大学", "医学部"],
      ]),
      marks: {} as Marks,
      extras: {},
    };
    const result = matchTeachers({
      ...medical,
      wish: wish({ subjects: ["高校英語"], preference: "医学部" }),
    });
    expect(result.candidates.map((c) => c.teacher)).toEqual(["小林愛", "伊藤大輔"]);
    expect(result.candidates[0].preferred).toBe(true);
    expect(result.candidates[1].preferred).toBe(false);
  });

  it("プロフィールが無い講師は科目を指定すると落ち、件数を数える", () => {
    const result = matchTeachers({
      ...base,
      profiles: profiles([["伊藤大輔", ["高校英語"], "理系", null]]),
      wish: wish({ subjects: ["高校英語"] }),
    });
    expect(result.candidates.map((c) => c.teacher)).toEqual(["伊藤大輔"]);
    expect(result.dropped.profile).toBe(2);
  });
});

describe("matchTeachers 並び順", () => {
  const cells = [
    cell("松本涼", "火", "13:00", "14:00"),
    cell("伊藤大輔", "火", "13:00", "14:00"),
    cell("中村結衣", "火", "13:00", "14:00"),
  ];
  const base = {
    cells,
    profiles: profiles([
      ["松本涼", ["高校英語"], "文系", "早稲田大学"],
      ["伊藤大輔", ["高校英語"], "文系", "東京大学"],
      ["中村結衣", ["高校英語"], "文系", "東京大学"],
    ]),
    extras: {},
  };
  const times = [{ weekday: "火", from: "14:00", to: "15:00" }];

  it("〇印が志望校より先に来る", () => {
    // 名前順（伊藤大輔 < 松本涼 < 中村結衣）と逆になるよう割り当て、
    // 名前順に落ちただけの結果と区別できるようにする。
    const marks: Marks = { [markKey("中村結衣", "火", "14:00")]: "ok" };
    const result = matchTeachers({
      ...base,
      marks,
      wish: wish({ times, lessonMinutes: 60, preference: "早稲田大学" }),
    });
    expect(result.candidates.map((c) => c.teacher)).toEqual(["中村結衣", "松本涼", "伊藤大輔"]);
  });

  it("条件が同じなら名前順", () => {
    const result = matchTeachers({
      ...base,
      marks: {},
      wish: wish({ times, lessonMinutes: 60 }),
    });
    expect(result.candidates.map((c) => c.teacher)).toEqual(["伊藤大輔", "松本涼", "中村結衣"]);
  });

  it("満たした希望が多い講師が先に来る", () => {
    const result = matchTeachers({
      cells: [cell("伊藤大輔", "火", "14:00", "15:00")],
      profiles: profiles([
        ["伊藤大輔", ["高校英語"], "文系", null],
        ["中村結衣", ["高校英語"], "文系", null],
      ]),
      marks: {
        [markKey("中村結衣", "火", "14:00")]: "ok",
        [markKey("中村結衣", "火", "14:30")]: "ok",
        [markKey("中村結衣", "水", "14:00")]: "ok",
        [markKey("中村結衣", "水", "14:30")]: "ok",
      },
      extras: { "中村結衣|火": true as const, "中村結衣|水": true as const },
      wish: wish({
        times: [
          { weekday: "火", from: "14:00", to: "15:00" },
          { weekday: "水", from: "14:00", to: "15:00" },
        ],
        lessonMinutes: 60,
      }),
    });
    expect(result.candidates.map((c) => c.teacher)).toEqual(["中村結衣"]);
    expect(result.candidates[0].openings).toHaveLength(2);
  });
});

describe("matchTeachers 条件なし", () => {
  it("条件が空なら候補を出さない", () => {
    const result = matchTeachers({
      cells: KATO_TUESDAY,
      profiles: profiles([["伊藤大輔", ["高校英語"], "理系", null]]),
      marks: {},
      extras: {},
      wish: EMPTY_WISH,
    });
    expect(result.candidates).toEqual([]);
    expect(result.dropped).toEqual({ profile: 0, subject: 0, bunri: 0, time: 0 });
  });
});
