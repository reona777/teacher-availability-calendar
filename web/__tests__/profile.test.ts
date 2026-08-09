import { describe, expect, it, vi } from "vitest";

import {
  buildProfiles,
  preferenceOptions,
  subjectOptions,
  universityOptions,
  type ContactRecord,
  type EligibleSubjectRecord,
} from "../lib/profile";

function contact(
  name: string,
  bunri: string | null = null,
  university: string | null = null,
  faculty: string | null = null,
): ContactRecord {
  return {
    Name: name,
    humanities_sciences_cd_t__c: bunri,
    University_Name__c: university,
    Faculty_Name__c: faculty,
  };
}

function eligible(teacher: string, subject: string): EligibleSubjectRecord {
  return {
    MANAERP__Contact__r: { Name: teacher },
    MANAERP__Subject__r: { Name: subject },
  };
}

describe("buildProfiles", () => {
  it("在籍講師の文理・大学・学部を取り込む", () => {
    const profiles = buildProfiles([contact("小林 愛", "理系", "東京女子医科大学", "医学部")], []);
    expect(profiles["小林愛"]).toEqual({
      teacher: "小林愛",
      subjects: [],
      bunri: "理系",
      university: "東京女子医科大学",
      faculty: "医学部",
    });
  });

  it("講師名の空白差を吸収して科目を突き合わせる", () => {
    // Contact は「伊藤 大輔」、授業側は「伊藤大輔」と実データで揺れている
    const profiles = buildProfiles(
      [contact("伊藤 大輔", "理系", "東京大学")],
      [eligible("伊藤大輔", "高校数学（ⅡB）"), eligible("伊藤 大輔", "高校英語")],
    );
    expect(profiles["伊藤大輔"].subjects).toEqual(["高校英語", "高校数学（ⅡB）"]);
  });

  it("同じ科目が重複していても1つにまとめる", () => {
    // 実データに「高校国語（古文）」が2件ある講師がいる
    const profiles = buildProfiles(
      [contact("渡辺 翔")],
      [eligible("渡辺翔", "高校国語（古文）"), eligible("渡辺翔", "高校国語（古文）")],
    );
    expect(profiles["渡辺翔"].subjects).toEqual(["高校国語（古文）"]);
  });

  it("科目が1件も無い講師もプロフィールに載せる", () => {
    // 担当が事務の講師が実在するので、科目0件でも名簿からは消さない
    const profiles = buildProfiles([contact("清水 蓮", "文系")], []);
    expect(profiles["清水蓮"].subjects).toEqual([]);
  });

  it("文理・大学・学部が空なら null にする", () => {
    const profiles = buildProfiles([contact("渡辺 翔", null, "", "")], []);
    expect(profiles["渡辺翔"].bunri).toBeNull();
    expect(profiles["渡辺翔"].university).toBeNull();
    expect(profiles["渡辺翔"].faculty).toBeNull();
  });

  it("想定外の文理の値は null にする", () => {
    // 選択肢が 1/2/3 の別フィールドを取り違えても画面が壊れないようにする
    const profiles = buildProfiles([contact("伊藤 大輔", "2")], []);
    expect(profiles["伊藤大輔"].bunri).toBeNull();
  });

  it("EXCLUDED_TEACHERS に挙げた講師は除く", () => {
    vi.stubEnv("EXCLUDED_TEACHERS", "佐々木花子,鈴木一郎");
    const profiles = buildProfiles([contact("佐々木 花子"), contact("鈴木 一郎")], []);
    expect(profiles).toEqual({});
    vi.unstubAllEnvs();
  });

  it("名簿に無い講師の科目レコードは捨てる", () => {
    const profiles = buildProfiles([contact("伊藤 大輔")], [eligible("退職済講師", "高校英語")]);
    expect(Object.keys(profiles)).toEqual(["伊藤大輔"]);
  });

  it("氏名や科目名が欠けたレコードは無視する", () => {
    const profiles = buildProfiles(
      [contact("伊藤 大輔"), { Name: null }],
      [
        { MANAERP__Contact__r: null, MANAERP__Subject__r: { Name: "高校英語" } },
        { MANAERP__Contact__r: { Name: "伊藤大輔" }, MANAERP__Subject__r: null },
      ],
    );
    expect(Object.keys(profiles)).toEqual(["伊藤大輔"]);
    expect(profiles["伊藤大輔"].subjects).toEqual([]);
  });
});

describe("subjectOptions", () => {
  it("誰かが実際に持っている科目だけを名前順で返す", () => {
    const profiles = buildProfiles(
      [contact("伊藤 大輔"), contact("中村 結衣")],
      [
        eligible("伊藤大輔", "高校数学（ⅡB）"),
        eligible("伊藤大輔", "高校英語"),
        eligible("中村結衣", "高校英語"),
      ],
    );
    expect(subjectOptions(profiles)).toEqual(["高校英語", "高校数学（ⅡB）"]);
  });

  it("誰も持っていなければ空", () => {
    expect(subjectOptions(buildProfiles([contact("伊藤 大輔")], []))).toEqual([]);
  });
});

describe("universityOptions", () => {
  it("重複を除いて名前順で返す", () => {
    const profiles = buildProfiles(
      [
        contact("伊藤 大輔", null, "早稲田大学"),
        contact("中村 結衣", null, "東京大学"),
        contact("松本 涼", null, "早稲田大学"),
      ],
      [],
    );
    expect(universityOptions(profiles)).toEqual(["早稲田大学", "東京大学"]);
  });

  it("大学が空の講師は数えない", () => {
    expect(universityOptions(buildProfiles([contact("伊藤 大輔")], []))).toEqual([]);
  });
});

describe("preferenceOptions", () => {
  const profiles = buildProfiles(
    [
      contact("小林 愛", "理系", "東京女子医科大学", "医学部"),
      contact("中村 結衣", "理系", "東邦大学", "医学部"),
      contact("高橋 美咲", "理系", "芝浦工業大学", "建築学部"),
      contact("伊藤 大輔", "文系", "早稲田大学"),
    ],
    [],
  );

  it("志望学部と志望校を分けて返す", () => {
    expect(preferenceOptions(profiles)).toEqual({
      faculties: ["医学部"],
      universities: ["芝浦工業大学", "早稲田大学", "東京女子医科大学", "東邦大学"],
    });
  });

  it("同じ学部が複数いても1つにまとめる", () => {
    expect(preferenceOptions(profiles).faculties).toEqual(["医学部"]);
  });

  it("探す対象にしていない学部は候補に出さない", () => {
    // 高橋美咲の建築学部はSFに入っているが、学部で探したいのは医学部だけ
    expect(preferenceOptions(profiles).faculties).not.toContain("建築学部");
  });

  it("学部が誰にも入っていなければ空", () => {
    const none = buildProfiles([contact("伊藤 大輔", "文系", "早稲田大学")], []);
    expect(preferenceOptions(none).faculties).toEqual([]);
  });
});
