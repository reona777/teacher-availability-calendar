import type { Profiles } from "./profile";

export type Cell = {
  teacher: string;
  weekday: string;
  start: string;
  end: string;
  count: number;
  last_date: string;
  open_from: string | null;
  trial: boolean;
};

export type GridData = {
  generated_at: string;
  range: { from: string; to: string };
  teachers: string[];
  /** 在籍講師（Contact由来）。表に手で足すときの候補になる。 */
  roster: string[];
  /** 講師名 → 指導可能科目・文理・大学。生徒の希望から講師を探すのに使う。 */
  profiles: Profiles;
  cells: Cell[];
};

/** 表示する曜日。日曜は基本的に授業が無いので扱わない。 */
export const WEEKDAYS = ["月", "火", "水", "木", "金", "土"] as const;

/** Date#getDay() の並び（日曜始まり）。 */
const WEEKDAY_BY_INDEX = ["日", "月", "火", "水", "木", "金", "土"];

export const STEP_MINUTES = 30;

export function timeToMinutes(hhmm: string): number {
  const [hour, minute] = hhmm.split(":").map(Number);
  return hour * 60 + minute;
}

export function minutesToTime(minutes: number): string {
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

/** 表示対象の曜日のセルだけに絞る。 */
export function visibleCells(cells: Cell[]): Cell[] {
  const shown = new Set<string>(WEEKDAYS);
  return cells.filter((cell) => shown.has(cell.weekday));
}

/** 1つの枠が占める時間スロットを返す（18:00〜19:00 なら 18:00 と 18:30）。 */
export function occupiedSlots(cell: Cell, step = STEP_MINUTES): string[] {
  const start = timeToMinutes(cell.start);
  const end = timeToMinutes(cell.end);
  if (end <= start) {
    return [cell.start];
  }
  const slots: string[] = [];
  for (let minute = start; minute < end; minute += step) {
    slots.push(minutesToTime(minute));
  }
  return slots;
}

/** 全曜日で共通の時間軸（曜日を切り替えても列がずれないようにする）。 */
export function buildTimeAxis(cells: Cell[], step = STEP_MINUTES): string[] {
  if (cells.length === 0) {
    return [];
  }
  const first = Math.min(...cells.map((cell) => timeToMinutes(cell.start)));
  const last = Math.max(
    ...cells.map((cell) => Math.max(timeToMinutes(cell.end), timeToMinutes(cell.start) + step)),
  );
  const axis: string[] = [];
  for (let minute = first; minute < last; minute += step) {
    axis.push(minutesToTime(minute));
  }
  return axis;
}

/** その曜日に授業がある講師を名前順で返す。 */
export function teachersOnWeekday(cells: Cell[], weekday: string): string[] {
  const names = new Set(
    cells.filter((cell) => cell.weekday === weekday).map((cell) => cell.teacher),
  );
  return Array.from(names).sort((a, b) => a.localeCompare(b, "ja"));
}

export type TeacherRow = { teacher: string; slots: (Cell | null)[]; extra: boolean };

/**
 * 講師を縦、時間を横に並べるための行を作る。空いている時間は null。
 * `extraTeachers` は手で足した講師で、授業が無いので空きだけの行として末尾に並べる。
 */
export function buildTeacherRows(
  cells: Cell[],
  weekday: string,
  axis: string[],
  extraTeachers: string[] = [],
): TeacherRow[] {
  const onDay = cells.filter((cell) => cell.weekday === weekday);
  const indexOfSlot = new Map(axis.map((slot, index) => [slot, index]));
  const scheduled = teachersOnWeekday(cells, weekday);

  const rows = scheduled.map((teacher) => {
    const slots: (Cell | null)[] = axis.map(() => null);
    for (const cell of onDay) {
      if (cell.teacher !== teacher) {
        continue;
      }
      for (const slot of occupiedSlots(cell)) {
        const index = indexOfSlot.get(slot);
        if (index !== undefined) {
          slots[index] = cell;
        }
      }
    }
    return { teacher, slots, extra: false };
  });

  // 授業が入った講師は通常の行で出るので、足した分からは落とす。
  const known = new Set(scheduled);
  const added = Array.from(new Set(extraTeachers))
    .filter((teacher) => !known.has(teacher))
    .sort((a, b) => a.localeCompare(b, "ja"))
    .map((teacher) => ({ teacher, slots: axis.map(() => null), extra: true }));

  return [...rows, ...added];
}

/**
 * マッチした講師の行だけに絞る。`only` が null なら絞らない。
 * 並びは元のまま（名前順と、手で足した行が末尾に来る並びを保つ）。
 */
export function filterRows(rows: TeacherRow[], only: string[] | null): TeacherRow[] {
  if (only === null) {
    return rows;
  }
  const shown = new Set(only);
  return rows.filter((row) => shown.has(row.teacher));
}

/** 空き開始日を「8/4〜空」の形に整える。 */
export function formatOpenFrom(iso: string): string {
  const [, month, day] = iso.split("-");
  return `${Number(month)}/${Number(day)}〜空`;
}

/** 初期表示の曜日。日曜は表示しないので月曜へ寄せる。 */
export function weekdayFromISO(iso: string): string {
  const label = WEEKDAY_BY_INDEX[new Date(iso).getDay()];
  return (WEEKDAYS as readonly string[]).includes(label) ? label : "月";
}
