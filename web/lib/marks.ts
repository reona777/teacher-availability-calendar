/**
 * 手動で付ける印。
 * Salesforceには無い情報（講師から口頭で聞いた都合や、他校舎で行う授業）を、
 * 空いている枠に手で書き足すためのもの。
 * 粒度は (講師, 曜日, 時刻) の週テンプレートで、一度付ければ毎週その枠に出る。
 */
export type MarkValue = "ng" | "ok" | "other";

export type Marks = Record<string, MarkValue>;

/** ng=空いているが入れない / ok=入れると確認済み / other=他校舎の授業で埋まっている。 */
export const MARK_LABEL: Record<MarkValue, string> = { ng: "×", ok: "〇", other: "他" };

/**
 * マウスを乗せたときの説明。セルは34px幅で1文字しか入らないので、言葉はこちらで補う。
 * 他校舎に所属する授業は、接続しているSalesforce（`SF_LOCATION` の校舎）からは
 * 1件も見えないため、手で塞ぐ以外に表へ出す方法が無い。
 */
export const MARK_TITLE: Record<MarkValue, string> = {
  ng: "入れない",
  ok: "入れる",
  other: "他校舎の授業",
};

const MARK_VALUES = new Set<string>(["ng", "ok", "other"]);

/** 扱える印かどうか。保存前の検めと、壊れた保存値の除去に使う。 */
export function isMarkValue(value: unknown): value is MarkValue {
  return typeof value === "string" && MARK_VALUES.has(value);
}

/** 保存キー。区切りの `|` は講師名・曜日・時刻のどれにも現れない。 */
export function markKey(teacher: string, weekday: string, slot: string): string {
  return `${teacher}|${weekday}|${slot}`;
}

/** クリックのたびに 無印 → × → 〇 → 他 → 無印 と一巡させる。 */
export function nextMark(current: MarkValue | null): MarkValue | null {
  if (current === null) {
    return "ng";
  }
  if (current === "ng") {
    return "ok";
  }
  return current === "ok" ? "other" : null;
}

/**
 * そのセルに表示する印を決める。
 * 授業が入っている枠ではSalesforceを優先し、印は出さない
 * （更新して授業が入れば、手で付けた印は自動的に隠れる）。
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
    if (isMarkValue(value)) {
      marks[key] = value;
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
