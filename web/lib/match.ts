/**
 * 生徒の希望から講師の候補を出す。
 * 判定はここに閉じて、Salesforce I/O も画面も持ち込まない（テストしやすくするため）。
 */
import { extraTeachersOnWeekday, type Extras } from "./extra";
import {
  STEP_MINUTES,
  WEEKDAYS,
  minutesToTime,
  occupiedSlots,
  timeToMinutes,
  type Cell,
} from "./grid";
import { markKey, type Marks } from "./marks";
import type { Bunri, Profiles } from "./profile";

export type TimeWish = { weekday: string; from: string; to: string };

/** 1コマの長さ。高校生は全員60分、中学生は90分と120分の2通り。 */
export const LESSON_MINUTES = [60, 90, 120] as const;

export type Wish = {
  /** 複数選んだときは全部教えられる講師だけを残す（AND）。2科目を1人に任せる場合があるため。 */
  subjects: string[];
  bunri: Bunri | null;
  /**
   * 志望先（大学名または学部名）。候補は減らさず、同じ大学・学部の講師を上に出すためだけに使う。
   * 医学部志望に医学部の講師を当てたいので、大学だけでなく学部でも指定できる。
   */
  preference: string | null;
  times: TimeWish[];
  lessonMinutes: number;
  /** ×を付けた枠を空きに数えない。 */
  excludeNg: boolean;
};

export const EMPTY_WISH: Wish = {
  subjects: [],
  bunri: null,
  preference: null,
  times: [],
  lessonMinutes: 60,
  excludeNg: true,
};

/**
 * 曜日をまとめて選んだときに足す希望を作る（「平日の18〜22時」を1回で入れるため）。
 * 足したあとは1件ずつの希望なので、個別に直すのも消すのも今までどおりできる。
 */
export function addTimeWishes(
  times: TimeWish[],
  weekdays: string[],
  from: string,
  to: string,
): TimeWish[] {
  if (timeToMinutes(from) >= timeToMinutes(to)) {
    return times;
  }
  const chosen = new Set(weekdays);
  const added = WEEKDAYS.filter(
    (weekday) =>
      chosen.has(weekday) &&
      // 同じ内容が既にあれば足さない（押し間違いで行が増えるのを防ぐ）
      !times.some((time) => time.weekday === weekday && time.from === from && time.to === to),
  ).map((weekday) => ({ weekday, from, to }));

  return added.length === 0 ? times : [...times, ...added];
}

export type Opening = { weekday: string; from: string; to: string; ok: boolean };

export type Candidate = {
  teacher: string;
  subjects: string[];
  bunri: Bunri | null;
  university: string | null;
  faculty: string | null;
  /** 志望先（大学または学部）と一致するか。 */
  preferred: boolean;
  /** 満たした空きに〇（入れると確認済み）が含まれるか。 */
  hasOk: boolean;
  openings: Opening[];
};

/** 候補から外れた講師の内訳。0名だった理由を画面に出すために数える。 */
export type Dropped = { profile: number; subject: number; bunri: number; time: number };

export type MatchResult = { candidates: Candidate[]; dropped: Dropped };

/** 志望先だけでは絞り込まないので、条件が「志望先のみ」なら空とみなす。 */
export function isBlankWish(wish: Wish): boolean {
  return wish.subjects.length === 0 && wish.bunri === null && wish.times.length === 0;
}

/**
 * 希望の範囲のうち、続けて空いている区間を返す。
 * `blocked` は塞がっている時刻（授業が入っている枠と、除外する×印の枠）。
 */
export function freeRuns(
  wish: TimeWish,
  blocked: Set<string>,
  step = STEP_MINUTES,
): { from: string; to: string }[] {
  const start = timeToMinutes(wish.from);
  const end = timeToMinutes(wish.to);
  const runs: { from: string; to: string }[] = [];
  let runStart: number | null = null;

  for (let minute = start; minute < end; minute += step) {
    if (blocked.has(minutesToTime(minute))) {
      if (runStart !== null) {
        runs.push({ from: minutesToTime(runStart), to: minutesToTime(minute) });
        runStart = null;
      }
      continue;
    }
    if (runStart === null) {
      runStart = minute;
    }
  }
  if (runStart !== null) {
    runs.push({ from: minutesToTime(runStart), to: minutesToTime(end) });
  }
  return runs;
}

/** その講師のその曜日で、授業が入っている時刻。 */
function busySlots(cells: Cell[], teacher: string, weekday: string): Set<string> {
  const slots = new Set<string>();
  for (const cell of cells) {
    if (cell.teacher === teacher && cell.weekday === weekday) {
      for (const slot of occupiedSlots(cell)) {
        slots.add(slot);
      }
    }
  }
  return slots;
}

/** 希望の範囲にある時刻をすべて返す。 */
function allSlots(wish: TimeWish, step = STEP_MINUTES): Set<string> {
  const slots = new Set<string>();
  const end = timeToMinutes(wish.to);
  for (let minute = timeToMinutes(wish.from); minute < end; minute += step) {
    slots.add(minutesToTime(minute));
  }
  return slots;
}

/** 希望の範囲にある時刻のうち、印が付いているもの。 */
function markedSlots(
  marks: Marks,
  teacher: string,
  wish: TimeWish,
  value: "ng" | "ok",
  step = STEP_MINUTES,
): Set<string> {
  const slots = new Set<string>();
  const end = timeToMinutes(wish.to);
  for (let minute = timeToMinutes(wish.from); minute < end; minute += step) {
    const slot = minutesToTime(minute);
    if (marks[markKey(teacher, wish.weekday, slot)] === value) {
      slots.add(slot);
    }
  }
  return slots;
}

function containsOk(run: { from: string; to: string }, ok: Set<string>, step = STEP_MINUTES) {
  const end = timeToMinutes(run.to);
  for (let minute = timeToMinutes(run.from); minute < end; minute += step) {
    if (ok.has(minutesToTime(minute))) {
      return true;
    }
  }
  return false;
}

/**
 * 対象にする講師。グリッドに出ている人と同じ範囲にする
 * （その曜日に出勤していない講師を「空いている」と言わないため）。
 */
function targetTeachers(cells: Cell[], extras: Extras, wish: Wish): string[] {
  const names = new Set<string>();
  if (wish.times.length === 0) {
    for (const cell of cells) {
      names.add(cell.teacher);
    }
    for (const key of Object.keys(extras)) {
      const teacher = key.slice(0, key.lastIndexOf("|"));
      if (teacher !== "") {
        names.add(teacher);
      }
    }
    return Array.from(names);
  }

  for (const time of wish.times) {
    for (const cell of cells) {
      if (cell.weekday === time.weekday) {
        names.add(cell.teacher);
      }
    }
    for (const teacher of extraTeachersOnWeekday(extras, time.weekday)) {
      names.add(teacher);
    }
  }
  return Array.from(names);
}

/** 希望の時間帯ごとに、1コマ分入る空きを探す。 */
function findOpenings(
  teacher: string,
  cells: Cell[],
  marks: Marks,
  wish: Wish,
  extras: Extras,
): Opening[] {
  const openings: Opening[] = [];
  for (const time of wish.times) {
    const scheduled = cells.some(
      (cell) => cell.teacher === teacher && cell.weekday === time.weekday,
    );
    const added = extraTeachersOnWeekday(extras, time.weekday).includes(teacher);
    if (!scheduled && !added) {
      continue;
    }

    const ok = markedSlots(marks, teacher, time, "ok");
    let blocked: Set<string>;
    if (scheduled) {
      // 授業がある講師は、入っていない時間を空きとみなす
      blocked = busySlots(cells, teacher, time.weekday);
      if (wish.excludeNg) {
        for (const slot of markedSlots(marks, teacher, time, "ng")) {
          blocked.add(slot);
        }
      }
    } else {
      // 手で足しただけの講師（デビュー前など）は空いている確証が無いので、
      // 〇を付けた枠だけを空きとして扱う
      blocked = allSlots(time);
      for (const slot of ok) {
        blocked.delete(slot);
      }
    }

    for (const run of freeRuns(time, blocked)) {
      if (timeToMinutes(run.to) - timeToMinutes(run.from) < wish.lessonMinutes) {
        continue;
      }
      openings.push({
        weekday: time.weekday,
        from: run.from,
        to: run.to,
        ok: containsOk(run, ok),
      });
      break; // 1つの希望につき最初に入る空きだけ出す
    }
  }
  return openings;
}

export function matchTeachers(input: {
  cells: Cell[];
  profiles: Profiles;
  marks: Marks;
  extras: Extras;
  wish: Wish;
}): MatchResult {
  const { cells, profiles, marks, extras, wish } = input;
  const dropped: Dropped = { profile: 0, subject: 0, bunri: 0, time: 0 };
  if (isBlankWish(wish)) {
    return { candidates: [], dropped };
  }

  const needsProfile = wish.subjects.length > 0 || wish.bunri !== null;
  const candidates: Candidate[] = [];

  for (const teacher of targetTeachers(cells, extras, wish)) {
    const profile = profiles[teacher];
    if (profile === undefined) {
      // 名簿から漏れた講師。条件が科目・文理なら判定できないので候補にしない
      if (needsProfile) {
        dropped.profile += 1;
        continue;
      }
    }

    const subjects = profile?.subjects ?? [];
    if (wish.subjects.some((subject) => !subjects.includes(subject))) {
      dropped.subject += 1;
      continue;
    }
    if (wish.bunri !== null && profile?.bunri !== wish.bunri) {
      dropped.bunri += 1;
      continue;
    }

    const openings = findOpenings(teacher, cells, marks, wish, extras);
    if (wish.times.length > 0 && openings.length === 0) {
      dropped.time += 1;
      continue;
    }

    candidates.push({
      teacher,
      subjects,
      bunri: profile?.bunri ?? null,
      university: profile?.university ?? null,
      faculty: profile?.faculty ?? null,
      preferred:
        wish.preference !== null &&
        (profile?.university === wish.preference || profile?.faculty === wish.preference),
      hasOk: openings.some((opening) => opening.ok),
      openings,
    });
  }

  candidates.sort(
    (a, b) =>
      Number(b.hasOk) - Number(a.hasOk) ||
      Number(b.preferred) - Number(a.preferred) ||
      b.openings.length - a.openings.length ||
      a.teacher.localeCompare(b.teacher, "ja"),
  );
  return { candidates, dropped };
}
