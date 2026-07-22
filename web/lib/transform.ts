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
 * 一覧に出さない講師名。運用では社員（特訓の割当対象外）がこれにあたる。
 * 実在の氏名なので、コードに書かず環境変数 `EXCLUDED_TEACHERS` からカンマ区切りで読む。
 */
export function excludedTeachers(): Set<string> {
  const names = (process.env.EXCLUDED_TEACHERS ?? "")
    .split(",")
    .map(normalizeTeacher)
    .filter((name): name is string => name !== null);
  return new Set(names);
}

/** 体験特訓の目印。Lesson_Type では判定できない（実データで体験特訓は0件）ため特訓名で見る。 */
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

function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
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

/** 体験特訓か判定する。講師の時間は埋まるので除外はせず、表示で色を分ける。 */
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
 * 特訓レコードを (講師, 曜日, 開始時刻) のセルへ集約する。
 * rangeEnd（取得範囲の最終日 YYYY-MM-DD）を越える場合は空き判定をしない。
 */
export function buildCells(records: LessonRecord[], rangeEnd: string): Cell[] {
  const groups = new Map<string, Group>();

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

  return Array.from(groups.values())
    .map((group) => {
      const lastDate = group.days.reduce((a, b) => (a > b ? a : b));
      const nextOccurrence = addDays(lastDate, 7);
      return {
        teacher: group.teacher,
        weekday: group.weekday,
        start: group.start,
        end: group.end,
        count: group.days.length,
        last_date: lastDate,
        open_from: nextOccurrence <= rangeEnd ? nextOccurrence : null,
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
