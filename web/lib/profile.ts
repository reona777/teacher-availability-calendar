/**
 * 講師のプロフィール（指導可能科目・文理・大学）。
 * 生徒の希望から講師を探すために使う。Salesforceからは読み取るだけ。
 */
import { excludedTeachers, normalizeTeacher } from "./transform";

export type Bunri = "文系" | "理系";

export type TeacherProfile = {
  /** 空白を除いた講師名。特訓側のセルと同じキーになる。 */
  teacher: string;
  /** 科目マスタ名。重複を除いて名前順。 */
  subjects: string[];
  bunri: Bunri | null;
  university: string | null;
  /** 学部。医学部志望の生徒に医学部の講師を当てるために使う。 */
  faculty: string | null;
};

export type Profiles = Record<string, TeacherProfile>;

/** 在籍講師（Contact）。文理は `humanities_sciences_cd_t__c`。 */
export type ContactRecord = {
  Name: string | null;
  humanities_sciences_cd_t__c?: string | null;
  University_Name__c?: string | null;
  Faculty_Name__c?: string | null;
};

/** 指導可能科目（Contactの子オブジェクト。1科目1レコード）。 */
export type EligibleSubjectRecord = {
  MANAERP__Contact__r?: { Name: string | null } | null;
  MANAERP__Subject__r?: { Name: string | null } | null;
};

/**
 * 文理の値。picklist は 文系/理系 の2つだけだが、
 * 選択肢が 1/2/3 の別フィールド（`Humanities_Science_Code__c`）と紛らわしいので、
 * 想定外の値は取り違えとみなして落とす。
 */
const BUNRI_VALUES = new Set<string>(["文系", "理系"]);

function byName(a: string, b: string): number {
  return a.localeCompare(b, "ja");
}

function trimmed(value: string | null | undefined): string | null {
  const text = (value ?? "").trim();
  return text === "" ? null : text;
}

/** 在籍講師と指導可能科目を、講師名をキーにした1つの表にまとめる。 */
export function buildProfiles(
  contacts: ContactRecord[],
  subjects: EligibleSubjectRecord[],
): Profiles {
  const excluded = excludedTeachers();
  const collected = new Map<string, Set<string>>();

  for (const record of contacts) {
    const teacher = normalizeTeacher(record.Name);
    if (teacher === null || excluded.has(teacher)) {
      continue;
    }
    collected.set(teacher, new Set());
  }

  for (const record of subjects) {
    const teacher = normalizeTeacher(record.MANAERP__Contact__r?.Name);
    const subject = trimmed(record.MANAERP__Subject__r?.Name);
    if (teacher === null || subject === null) {
      continue;
    }
    // 名簿に無い講師（退職者など）の科目は捨てる
    collected.get(teacher)?.add(subject);
  }

  const profiles: Profiles = {};
  for (const record of contacts) {
    const teacher = normalizeTeacher(record.Name);
    if (teacher === null || !collected.has(teacher)) {
      continue;
    }
    const bunri = trimmed(record.humanities_sciences_cd_t__c);
    profiles[teacher] = {
      teacher,
      subjects: Array.from(collected.get(teacher) as Set<string>).sort(byName),
      bunri: bunri !== null && BUNRI_VALUES.has(bunri) ? (bunri as Bunri) : null,
      university: trimmed(record.University_Name__c),
      faculty: trimmed(record.Faculty_Name__c),
    };
  }
  return profiles;
}

/**
 * 科目の選択肢。科目マスタには誰も教えられない科目も含まれるので、
 * 実際に誰かが持っているものだけを出す。
 */
export function subjectOptions(profiles: Profiles): string[] {
  const names = new Set<string>();
  for (const profile of Object.values(profiles)) {
    for (const subject of profile.subjects) {
      names.add(subject);
    }
  }
  return Array.from(names).sort(byName);
}

/** 志望校の選択肢。講師が実際に在籍している大学だけを出す。 */
export function universityOptions(profiles: Profiles): string[] {
  const names = new Set<string>();
  for (const profile of Object.values(profiles)) {
    if (profile.university !== null) {
      names.add(profile.university);
    }
  }
  return Array.from(names).sort(byName);
}

/**
 * 学部で探せるようにするもの。
 * 学部はSFに入っていても探す軸として意味があるとは限らない（建築学部など）ので、
 * ここに書いたものだけを候補に出す。増やしたくなったら足す。
 */
export const SEARCHABLE_FACULTIES = ["医学部"];

/** 学部の選択肢。探す対象にしていて、かつ実際に在籍している講師がいるものだけを出す。 */
export function facultyOptions(profiles: Profiles): string[] {
  const held = new Set<string>();
  for (const profile of Object.values(profiles)) {
    if (profile.faculty !== null) {
      held.add(profile.faculty);
    }
  }
  return SEARCHABLE_FACULTIES.filter((name) => held.has(name));
}

/**
 * 志望先の選択肢。学部と大学を分けて返す。
 * 「医学部志望」のように学部で選びたい場合があるので、同じプルダウンに両方を出す。
 */
export function preferenceOptions(profiles: Profiles): {
  faculties: string[];
  universities: string[];
} {
  return { faculties: facultyOptions(profiles), universities: universityOptions(profiles) };
}
