/**
 * 手動で表に足す講師。
 * Salesforceに授業が入っていない＝まだ確定していない講師でも、
 * 「その曜日なら入れるかもしれない」場合に行を出して〇×を付けられるようにする。
 * 粒度は (講師, 曜日) で、印と同じく毎週その曜日に出る。
 */
export type Extras = Record<string, true>;

const SEPARATOR = "|";

export function extraKey(teacher: string, weekday: string): string {
  return `${teacher}${SEPARATOR}${weekday}`;
}

function splitKey(key: string): { teacher: string; weekday: string } | null {
  const index = key.lastIndexOf(SEPARATOR);
  if (index <= 0 || index === key.length - 1) {
    return null;
  }
  return { teacher: key.slice(0, index), weekday: key.slice(index + 1) };
}

/** その曜日に手で足された講師を名前順で返す。 */
export function extraTeachersOnWeekday(extras: Extras, weekday: string): string[] {
  const names: string[] = [];
  for (const key of Object.keys(extras)) {
    const parsed = splitKey(key);
    if (parsed !== null && parsed.weekday === weekday) {
      names.push(parsed.teacher);
    }
  }
  return names.sort((a, b) => a.localeCompare(b, "ja"));
}

/** プルダウンに出す候補。在籍講師から、既に表に出ている人と追加済みの人を除く。 */
export function candidateTeachers(
  roster: string[],
  shown: string[],
  extras: Extras,
  weekday: string,
): string[] {
  const taken = new Set([...shown, ...extraTeachersOnWeekday(extras, weekday)]);
  return roster.filter((name) => !taken.has(name)).sort((a, b) => a.localeCompare(b, "ja"));
}

/** HGETALL の戻り（[field, value, ...] または オブジェクト）をフラグの集合に揃える。 */
export function fromRedisFlags(raw: unknown): Extras {
  const keys: string[] = [];
  if (Array.isArray(raw)) {
    for (let index = 0; index + 1 < raw.length; index += 2) {
      keys.push(String(raw[index]));
    }
  } else if (raw !== null && typeof raw === "object") {
    keys.push(...Object.keys(raw as Record<string, unknown>));
  }

  const extras: Extras = {};
  for (const key of keys) {
    if (splitKey(key) !== null) {
      extras[key] = true;
    }
  }
  return extras;
}
