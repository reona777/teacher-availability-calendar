"use server";

import { revalidatePath, updateTag } from "next/cache";

import { GRID_TAG } from "../lib/data";
import { extraKey } from "../lib/extra";
import { isMarkValue, markKey, type MarkValue } from "../lib/marks";
import { saveExtra, saveMark } from "../lib/marks-store";

/**
 * 更新ボタン: キャッシュを捨てて次の描画でSalesforceから取り直す。
 *
 * Next.js 16 の updateTag はその場で古い値を捨てるので、押した本人がすぐ新しい表を見る。
 * 引数1つの revalidateTag と同じ挙動で、16 では非推奨になったこちらが後継。
 */
export async function refreshGrid(): Promise<void> {
  updateTag(GRID_TAG);
}

/** 空き枠の「入れる／入れない」の印を保存する。value が null なら印を消す。 */
export async function setMark(
  teacher: string,
  weekday: string,
  slot: string,
  value: MarkValue | null,
): Promise<void> {
  // クライアントから呼ばれるので、保存前に受け取った値を検める。
  if (typeof teacher !== "string" || typeof weekday !== "string" || typeof slot !== "string") {
    throw new Error("印の指定が不正です");
  }
  if (value !== null && !isMarkValue(value)) {
    throw new Error("印の値が不正です");
  }
  await saveMark(markKey(teacher, weekday, slot), value);
  revalidatePath("/");
}

/** 授業が確定していない講師の行を、その曜日の表に足す・外す。 */
export async function setExtraTeacher(
  teacher: string,
  weekday: string,
  on: boolean,
): Promise<void> {
  if (typeof teacher !== "string" || typeof weekday !== "string") {
    throw new Error("講師の指定が不正です");
  }
  if (teacher.trim() === "" || teacher.includes("|") || weekday.includes("|")) {
    throw new Error("講師名が不正です");
  }
  await saveExtra(extraKey(teacher, weekday), on === true);
  revalidatePath("/");
}
