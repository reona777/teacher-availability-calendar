import type { Cell } from "./grid";

export type LessonRecord = {
  Name?: string | null;
  MANAERP__Teacher__c?: string | null;
  MANAERP__Status__c?: string | null;
  MANAERP__Start_Date_Time__c: string;
  MANAERP__End_Date_Time__c: string;
};

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const WEEKDAY_BY_INDEX = ["日", "月", "火", "水", "木", "金", "土"];
const EXCLUDED_STATUSES = new Set(["Cancelled"]);

/**
 * 一覧に出さない講師名。運用では社員（授業の割当対象外）がこれにあたる。
 * 実在の氏名なので、コードに書かず環境変数 `EXCLUDED_TEACHERS` からカンマ区切りで読む。
 */
export function excludedTeachers(): Set<string> {
  const names = (process.env.EXCLUDED_TEACHERS ?? "")
    .split(",")
    .map(normalizeTeacher)
    .filter((name): name is string => name !== null);
  return new Set(names);
}

/** 体験授業の目印。Lesson_Type では判定できない（実データで体験授業は0件）ため授業名で見る。 */
export const TRIAL_KEYWORD = "体験";

/**
 * 講師名の空白差を吸収する。
 * 姓名の間の空白の有無が入力者によって揺れており、同じ人が別人として分裂するため。
 */
export function normalizeTeacher(name: string | null | undefined): string | null {
  if (!name) {
    return null;
  }
  return name.replace(/[\s　]/g, "") || null;
}

/**
 * SalesforceのUTC文字列をJSTへずらした Date を返す。
 * 以降は getUTC* 系で読むことで、サーバーのタイムゾーンに依存しない。
 */
export function toJst(value: string): Date {
  return new Date(new Date(value).getTime() + JST_OFFSET_MS);
}

export function jstWeekdayLabel(jst: Date): string {
  return WEEKDAY_BY_INDEX[jst.getUTCDay()];
}

function jstTime(jst: Date): string {
  const hours = String(jst.getUTCHours()).padStart(2, "0");
  const minutes = String(jst.getUTCMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

function jstDate(jst: Date): string {
  return jst.toISOString().slice(0, 10);
}

/** 表示対象外のレコードか判定する（キャンセル・講師空・社員・講師未定・当欠）。 */
export function isExcluded(record: LessonRecord): boolean {
  if (EXCLUDED_STATUSES.has(record.MANAERP__Status__c ?? "")) {
    return true;
  }
  const teacher = normalizeTeacher(record.MANAERP__Teacher__c);
  if (teacher === null || excludedTeachers().has(teacher)) {
    return true;
  }
  const name = record.Name ?? "";
  return name.startsWith("未定") || name.includes("当欠");
}

/** 体験授業か判定する。講師の時間は埋まるので除外はせず、表示で色を分ける。 */
export function isTrial(record: LessonRecord): boolean {
  return (record.Name ?? "").includes(TRIAL_KEYWORD);
}

type Group = {
  teacher: string;
  weekday: string;
  start: string;
  end: string;
  days: string[];
  trial: boolean;
};

/**
 * 授業レコードを (講師, 曜日, 開始時刻) のセルへ集約する。
 *
 * 空き開始日は「同じ曜日で**次に校舎が動いている日**」。単純に翌週(+7日)にすると、
 * 休講日（長期休暇や行事で、その曜日に授業が1件も無い日）がそのまま空き開始日になり、
 * 取得範囲の末尾が休講日に当たるとその曜日の全セルが一斉に「途中で終わる枠」になる。
 * 開催日は取得範囲内のレコードから作るので、範囲の終わりまで続く枠は自然に空き扱いにならない。
 */
export function buildCells(records: LessonRecord[]): Cell[] {
  const groups = new Map<string, Group>();
  const lessonDays = new Map<string, Set<string>>();

  for (const record of records) {
    if (isExcluded(record)) {
      continue;
    }
    const teacher = normalizeTeacher(record.MANAERP__Teacher__c) as string;
    const start = toJst(record.MANAERP__Start_Date_Time__c);
    const end = toJst(record.MANAERP__End_Date_Time__c);
    const weekday = jstWeekdayLabel(start);
    const startTime = jstTime(start);
    const key = `${teacher}|${weekday}|${startTime}`;

    const days = lessonDays.get(weekday);
    if (days) {
      days.add(jstDate(start));
    } else {
      lessonDays.set(weekday, new Set([jstDate(start)]));
    }

    const group = groups.get(key);
    if (group) {
      group.days.push(jstDate(start));
      group.trial = group.trial || isTrial(record);
    } else {
      groups.set(key, {
        teacher,
        weekday,
        start: startTime,
        end: jstTime(end),
        days: [jstDate(start)],
        trial: isTrial(record),
      });
    }
  }

  const openDays = new Map(
    Array.from(lessonDays, ([weekday, days]) => [weekday, Array.from(days).sort()]),
  );

  return Array.from(groups.values())
    .map((group) => {
      const lastDate = group.days.reduce((a, b) => (a > b ? a : b));
      const nextOpen = openDays.get(group.weekday)?.find((day) => day > lastDate);
      return {
        teacher: group.teacher,
        weekday: group.weekday,
        start: group.start,
        end: group.end,
        count: group.days.length,
        last_date: lastDate,
        open_from: nextOpen ?? null,
        trial: group.trial,
      };
    })
    .sort(
      (a, b) =>
        a.teacher.localeCompare(b.teacher, "ja") ||
        a.weekday.localeCompare(b.weekday, "ja") ||
        a.start.localeCompare(b.start),
    );
}
