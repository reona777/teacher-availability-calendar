/**
 * 手動で付ける「入れる／入れない」の印。
 * Salesforceには無い情報（講師から口頭で聞いた都合）を、空いている枠に手で書き足すためのもの。
 * 粒度は (講師, 曜日, 時刻) の週テンプレートで、一度付ければ毎週その枠に出る。
 */
export type MarkValue = "ng" | "ok";

export type Marks = Record<string, MarkValue>;

/** ng=空いているが入れない / ok=入れると確認済み。 */
export const MARK_LABEL: Record<MarkValue, string> = { ng: "×", ok: "〇" };

const MARK_VALUES = new Set<string>(["ng", "ok"]);

/** 保存キー。区切りの `|` は講師名・曜日・時刻のどれにも現れない。 */
export function markKey(teacher: string, weekday: string, slot: string): string {
  return `${teacher}|${weekday}|${slot}`;
}

/** クリックのたびに 無印 → × → 〇 → 無印 と一巡させる。 */
export function nextMark(current: MarkValue | null): MarkValue | null {
  if (current === null) {
    return "ng";
  }
  return current === "ng" ? "ok" : null;
}

/**
 * そのセルに表示する印を決める。
 * 特訓が入っている枠ではSalesforceを優先し、印は出さない
 * （更新して特訓が入れば、手で付けた印は自動的に隠れる）。
 */
export function resolveMark(
  marks: Marks,
  teacher: string,
  weekday: string,
  slot: string,
  occupied: boolean,
): MarkValue | null {
  if (occupied) {
    return null;
  }
  return marks[markKey(teacher, weekday, slot)] ?? null;
}

/** 印を1つ更新した新しいオブジェクトを返す。null なら消す。 */
export function applyMark(marks: Marks, key: string, value: MarkValue | null): Marks {
  const next = { ...marks };
  if (value === null) {
    delete next[key];
  } else {
    next[key] = value;
  }
  return next;
}

/** 保存されている値のうち、扱える印だけを残す（壊れたデータで画面が崩れないように）。 */
export function sanitizeMarks(raw: unknown): Marks {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return {};
  }
  const marks: Marks = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === "string" && MARK_VALUES.has(value)) {
      marks[key] = value as MarkValue;
    }
  }
  return marks;
}

/** HGETALL の戻り（[field, value, ...] の配列 または オブジェクト）を Marks に揃える。 */
export function fromRedisHash(raw: unknown): Marks {
  if (Array.isArray(raw)) {
    const flat: Record<string, unknown> = {};
    for (let index = 0; index + 1 < raw.length; index += 2) {
      flat[String(raw[index])] = raw[index + 1];
    }
    return sanitizeMarks(flat);
  }
  return sanitizeMarks(raw);
}
