import { unstable_cache } from "next/cache";

import type { GridData } from "./grid";
import {
  buildProfiles,
  type ContactRecord,
  type EligibleSubjectRecord,
} from "./profile";
import { querySalesforce } from "./salesforce";
import {
  buildCells,
  excludedTeachers,
  normalizeTeacher,
  type LessonRecord,
} from "./transform";

const RANGE_DAYS = 62;
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** 更新ボタンから無効化するためのキャッシュタグ。 */
export const GRID_TAG = "grid";

/** 対象の校舎名。SOQLに埋めるのでシングルクォートだけ潰す。 */
function location(): string {
  return (process.env.SF_LOCATION ?? "").replace(/'/g, "");
}

function lessonSoql(): string {
  return (
    "SELECT Id, Name, MANAERP__Teacher__c, MANAERP__Lesson_Date__c, " +
    "MANAERP__Start_Date_Time__c, MANAERP__End_Date_Time__c, MANAERP__Status__c " +
    "FROM MANAERP__Lesson__c " +
    `WHERE MANAERP__Location__c = '${location()}' ` +
    "AND MANAERP__Lesson_Date__c >= TODAY " +
    `AND MANAERP__Lesson_Date__c <= NEXT_N_DAYS:${RANGE_DAYS} ` +
    "AND MANAERP__Status__c = 'Published'"
  );
}

/**
 * 在籍講師の名簿。Contactの拠点フィールドは運用上ほぼ空で絞りに使えないため、
 * 在籍状況と講師種別で絞っている（これで授業を持つ講師と過不足なく一致する）。
 * 文理は `humanities_sciences_cd_t__c`。選択肢が 1/2/3 の
 * `Humanities_Science_Code__c` は名前が似ているだけの別物なので使わない。
 */
const ROSTER_SOQL =
  "SELECT Name, humanities_sciences_cd_t__c, University_Name__c, Faculty_Name__c FROM Contact " +
  "WHERE RecordType.Name = 'Staff' " +
  "AND MANAERP__Working_Status__c IN ('Available', '研修中') " +
  "AND Teacher_Type__c = '通常講師'";

/**
 * 指導可能科目。Contactの子オブジェクトで1科目1レコード。
 * 絞り込み条件は ROSTER_SOQL と同じものを親をたどって指定する。
 */
const SUBJECT_SOQL =
  "SELECT MANAERP__Contact__r.Name, MANAERP__Subject__r.Name " +
  "FROM MANAERP__Eligible_Subject__c " +
  "WHERE MANAERP__Contact__r.RecordType.Name = 'Staff' " +
  "AND MANAERP__Contact__r.MANAERP__Working_Status__c IN ('Available', '研修中') " +
  "AND MANAERP__Contact__r.Teacher_Type__c = '通常講師'";

function jstNow(): Date {
  return new Date(Date.now() + JST_OFFSET_MS);
}

/** Contactの氏名を、授業側の講師名と揃う形（空白除去）に直して並べる。 */
function buildRoster(records: ContactRecord[]): string[] {
  const excluded = excludedTeachers();
  const names = new Set<string>();
  for (const record of records) {
    const name = normalizeTeacher(record.Name);
    if (name !== null && !excluded.has(name)) {
      names.add(name);
    }
  }
  return Array.from(names).sort((a, b) => a.localeCompare(b, "ja"));
}

function addDays(date: Date, days: number): Date {
  const copy = new Date(date.getTime());
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}

async function fetchGrid(): Promise<GridData> {
  const [records, contacts, subjects] = await Promise.all([
    querySalesforce<LessonRecord>(lessonSoql()),
    querySalesforce<ContactRecord>(ROSTER_SOQL),
    querySalesforce<EligibleSubjectRecord>(SUBJECT_SOQL),
  ]);
  const now = jstNow();
  const from = now.toISOString().slice(0, 10);
  const to = addDays(now, RANGE_DAYS).toISOString().slice(0, 10);
  const cells = buildCells(records, to);

  return {
    generated_at: `${now.toISOString().slice(0, 19)}+09:00`,
    range: { from, to },
    teachers: Array.from(new Set(cells.map((cell) => cell.teacher))).sort((a, b) =>
      a.localeCompare(b, "ja"),
    ),
    roster: buildRoster(contacts),
    profiles: buildProfiles(contacts, subjects),
    cells,
  };
}

/**
 * Salesforceから週グリッドを取得する。
 * 毎回ログインすると重いので10分キャッシュし、更新ボタンでタグを無効化する。
 */
export const getGrid = unstable_cache(fetchGrid, ["lesson-grid"], {
  revalidate: 600,
  tags: [GRID_TAG],
});
