# 授業カレンダー（teacher-availability-calendar）

学習塾の校舎で、**講師の空き時間を一目で判断する**ための社内ツール。
Salesforce に入っている授業データを読み取り、「講師 × 時間」のマトリクスで週単位に表示する。

実際に校舎の事務で運用しているツールの、固有名を環境変数に切り出した公開用コピー。

## 何を解決したか

授業の割当や代講の調整では「この時間に空いている講師は誰か」を知りたい。
ところが Salesforce の標準ビューはレコードの一覧なので、
**曜日 × 時間 × 講師の空き**という形では見えず、毎回いくつも条件を変えて検索する必要があった。

このツールは、その判断に必要な情報だけを1枚の表に落とす。

- 縦が講師、横が時間（30分刻み）。曜日はタブで切替（月〜土）
- 授業ありは青、体験は緑、途中で終わる枠はオレンジ（マウスオーバーで「8/17〜空」）、空きは空白
- **セルに出すのは講師名だけ**。生徒名は表示しない
- Salesforce へは書き戻さない（読み取り専用）

さらに、生徒の希望から講師を逆引きできる。
科目・文理・志望校/志望学部・コマの長さ・希望時間帯（複数可）を入れると、
条件を満たす講師が候補として並び、グリッドが該当講師だけに絞られる。

## Salesforce に無い情報を手で足せる

現場には「空いているが入れない」「ここなら入れる」のような、
Salesforce に入っていない事情がある。これを画面から足せるようにした。

- 空きセルのクリックで 無印 → ×（空いているが入れない）→ 〇（入れる）→ 他（他校舎の授業）→ 無印
- 表の下のプルダウンで、まだ授業が確定していない在籍講師をその曜日に追加

**「他」だけは「実際に埋まっている」印**として扱う。他校舎に所属する授業は、接続先の
Salesforce（`SF_LOCATION` の校舎）からは1件も見えないのに、担当する講師はその時間に
埋まっている。×は「入れない」という都合なので設定で無視できるが、他は無視できない。

どちらも `(講師, 曜日, 時刻)` の週単位で全員に共有される。
**描画時は常に Salesforce を優先する**ので、授業が入れば手で付けた印は隠れ、
足した講師は通常の段へ移る。保存値は消さないため、授業がなくなれば元の印が戻る。

## 構成

Next.js（App Router）だけで完結し、サーバー側から直接 Salesforce を読む。

- `web/lib/salesforce.ts` … SOAPログイン → REST API で SOQL 実行（ページング対応・読み取り専用）
- `web/lib/transform.ts` … JST変換・名寄せ・除外・体験判定・週集計・空き算出（純関数）
- `web/lib/profile.ts` … 講師プロフィール（指導可能科目・文理・大学・学部）の組み立て（純関数）
- `web/lib/match.ts` … 生徒の希望と空き枠の突き合わせ（純関数）
- `web/lib/grid.ts` … 画面用の時間軸と講師行の組み立て（純関数）
- `web/lib/marks.ts` / `web/lib/extra.ts` … 手で足す印と追加講師のキー・切替・表示解決（純関数）
- `web/lib/data.ts` … 取得とキャッシュ（10分 / タグ `grid`）
- `web/lib/marks-store.ts` … 印と追加講師の保存。本番は Upstash Redis、ローカルは `.data/*.json`
- `web/app/` … 画面。更新ボタンは Server Action で `updateTag` を呼ぶ
- `web/proxy.ts` … 共通パスワードによる閲覧保護（Next.js 16 で middleware から改名）

**判断ロジックはすべて純関数に寄せてある**（`lib/` の大半）。
Salesforce と React から切り離してあるので、テストは実データ無しで書ける。

仕様は `SPEC.md`、実装の経緯と受入基準は `TASKS.md` に残してある。

## 設計上の判断

**生徒名を出さない。** 空き判断に不要で、閲覧範囲が広がるほど扱いが重くなるため。

**Salesforce を唯一の正とする。** 手で付けた印は保存するが、描画では必ず Salesforce が勝つ。
現場の入力と Salesforce がずれても、実際の予定が正しく見える。

**日次バッチをやめた。** 当初は Python バッチが JSON を生成する構成だったが、
更新ボタンが Vercel 上で機能しないため、Next.js から直接読む構成に変えた（`SPEC.md` 9章）。

**Vercel Blob を使わない。** 無料枠では公開URLになり、講師名が認証なしで読めてしまうため、
印の保存先は Upstash Redis にした。

## ローカル実行

```bash
cd web
cp .env.local.example .env.local    # 値を埋める
npm install
npm run dev                          # http://localhost:3000
```

環境変数（`web/.env.local.example` に一覧がある）:

- `SITE_PASSWORD` … 画面を開くための共通パスワード
- `SF_USERNAME` / `SF_PASSWORD` / `SF_SECURITY_TOKEN` … Salesforce の資格情報
- `SF_LOGIN_DOMAIN` … My Domain のホスト。未設定なら `login.salesforce.com`
- `SF_LOCATION` … 対象の校舎名（`MANAERP__Location__c` と完全一致）
- `SITE_NAME` … 画面に出す組織名。未設定なら出さない
- `EXCLUDED_TEACHERS` … 一覧に出さない講師名（カンマ区切り）
- `OTHER_LOCATION_PREFIXES` … 他校舎の講師を見分ける氏名の接頭辞（カンマ区切り）。
  Contactの氏名の先頭に校舎名が付く運用のとき、その講師をグリッドにも名簿にも出さない
- `KV_REST_API_URL` / `KV_REST_API_TOKEN` … Upstash Redis。未設定ならローカルファイルに保存

環境変数が既にあればそちらを優先し、無ければ `web/.env.local` を `lib/env.ts` が読む。

## 検証

```bash
cd web
npm test          # vitest 153件（8ファイル）
npm run lint      # tsc --noEmit
npm run build
```

内訳は 判定ロジック `transform` 28件 / 画面の組み立て `grid` 23件 / 生徒マッチング `match` 43件 /
講師プロフィール `profile` 17件 / 手入力の印 `marks` 17件・`marks-store` 10件 /
追加講師 `extra` 10件 / 認証 `auth` 5件。
**Salesforce に接続せずに全部通る**（判定ロジックを純関数に寄せてあるため）。

注意: `npm run dev` を動かしたまま `npm run build` すると `.next` が壊れて 500 になる。
その場合は dev を止めて `.next` を消してから再起動する。

## デプロイ

Vercel。Root Directory を `web` にして、上記の環境変数を設定する。
既定ブランチに push すると自動でデプロイされる。

環境変数を足したら再デプロイが必要。
日次バッチや GitHub Actions は不要で、画面を開いた時点で取得し、更新ボタンで取り直す。

## Salesforce 側で分かったこと

実データを調べて確定させたもの。同じ ERP パッケージ（`MANAERP__`）を触る人の参考に。

- 授業の実体は `MANAERP__Lesson__c`。**講師名が入るのはここだけ**で、
  定期枠テンプレの `MANAERP__Lesson_Schedule__c` 側はほぼ空
- 在籍講師の名簿は `Contact`（RecordType=Staff / `MANAERP__Working_Status__c` が
  Available か研修中 / `Teacher_Type__c` = 通常講師）。
  拠点フィールド `MANAERP__Main_Location__c` は全件空で絞りに使えないが、
  講師種別で絞れば実際に授業を持つ講師と過不足なく一致する
- 指導可能科目は Contact 直下ではなく子オブジェクト `MANAERP__Eligible_Subject__c`（1科目1レコード）
- 文理は `humanities_sciences_cd_t__c`。名前が似た `Humanities_Science_Code__c` は
  選択肢が 1/2/3 の別物なので使わない
- datetime は UTC 保存。表示は JST（UTC+9）
- 講師名に表記揺れがある（姓名の間の空白の有無）。空白を除去して名寄せしている
- 体験授業は `MANAERP__Lesson_Type__c` では判定できない（実データで0件）。授業名の「体験」で判定

## 公開版について

このリポジトリは社内ツールの公開用コピーで、以下を実際の値から差し替えてある。

- 講師名・組織名・Salesforce のテナントはすべて環境変数へ（コードには残していない）
- テストに出てくる人名・コース名はすべて架空のもの。
  除外の判定は「未定」「当欠」で行うので、コース名を変えてもロジックには影響しない
- 資格情報は元から環境変数で、リポジトリに含めたことはない

機能は本体と同じ内容で、実運用側でも判定ロジックの変更は入っていない。

## ライセンス

MIT License
