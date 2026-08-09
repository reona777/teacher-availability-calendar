# 授業カレンダー 実装計画・タスク

参照: SPEC.md / 最終更新 2026-07-22

## Phase 2: 実装計画

### 構成要素と依存
1. 変換ロジック（Python 純関数, `batch/transform.py`）… 他の土台。最初に作る。
2. データ生成バッチ（`batch/build_grid.py`）… SF取得→変換→`grid.json`。1に依存。
3. フロント週グリッド（`web/`）… `grid.json` を描画。2の出力形式に依存。
4. 認証（`web/middleware.ts`）… 3に付与。独立。
5. 更新運用・デプロイ（GitHub Actions / Vercel）… 2・3の後。

### 実装順（逐次）
transform（TDD） → build_grid配線＋実データ少数検証 → web雛形＋グリッド描画 → 認証 → デプロイ/日次更新

### リスクと対応
- 講師名の表記揺れ（山田の2表記）: 名寄せ（空白除去）をtransformで吸収。テストで固定。
- 同姓の別人が空白除去で衝突する可能性: 実データに現れたら姓名フル一致で確認（現状は同一人物のみ確認済み）。
- タイムゾーン: UTC→JST(+9)をtransform中央で1回だけ実施。二重変換しない。
- SF資格情報: `sf_login.py`（.env）経由のみ。`grid.json` は非public・認証保護下。コミットしない。
- データ鮮度: 日次更新のため当日の直前変更は反映されない旨を画面に更新時刻表示。

## Phase 3: タスク

- [x] T1: batchプロジェクト雛形
  - 内容: `batch/` に requirements（simple_salesforce, python-dotenv, flake8, pytest）、`transform.py` 空実装、`test/` 用意。
  - 受入: `flake8 batch` と `pytest batch/test`（0件でも）が通る。
  - 検証: 両コマンド実行。
  - Files: batch/requirements.txt, batch/transform.py, batch/test/__init__.py

- [x] T2: 変換ロジック（TDD）
  - 内容: UTC→JST変換 / 講師名名寄せ / 除外（Cancelled・未定・当欠・Teacher空）/ `(講師,曜日,時刻)` 週集計 / 空き開始日算出、を純関数で実装。
  - 受入: 代表ケース（SPEC 8章）が全て緑。山田2表記→1人、途中終了枠→空き開始日一致。
  - 検証: `pytest batch/test`、`flake8 batch`。
  - Files: batch/transform.py, batch/test/test_transform.py

- [x] T3: データ生成バッチ配線（実測: SF COUNT 1257 = 取得1257 / セル188 / 講師28名）
  - 内容: `build_grid.py` でSF取得（SPEC 2章のSOQL）→ transform → `web/data/grid.json`。`--write` で書き出し、無指定はdry-run。
  - 受入: 実行してJSON生成、件数がSFのCOUNT（対象校舎・62日・Published）と整合。
  - 検証: 実データで実行し件数照合（pytest不可領域は実行結果で確認）。
  - Files: batch/build_grid.py

- [x] T4: web雛形＋週グリッド描画（build成功 / 生徒名の混入0件を確認）
  - 内容: Next.js（App Router, TS）初期化。`lib/grid.ts` でJSON→表示モデル、画面で 縦=時間/横=曜日 グリッドにセル＝講師名を描画。空きセルは視覚的に区別。各枠に「MM/DD から空き」。
  - 受入: `npm run build` 成功。ローカルで現行アプリ相当のグリッドが講師名のみで表示。
  - 検証: `npm test`（lib/grid のユニット）、`npm run dev` 目視。
  - Files: web/（app, lib/grid.ts, __tests__/grid.test.ts）

- [x] T5: 共通パスワード認証（未認証307→/login、正しいcookieのみ200 を確認）
  - 内容: `middleware.ts` で未認証を弾き、パスワード入力ページ→cookie発行。`grid.json`・全ページを保護。
  - 受入: 未認証で全経路が入力ページへ。正パスワードで閲覧可。
  - 検証: `npm run dev` で経路確認。
  - Files: web/middleware.ts, web/app/login/

- [~] T6: 日次更新・デプロイ（workflow と README は作成済み。GitHub/Vercel の設定と公開は未実施＝要許可）
  - 内容: バッチの定期実行（GitHub Actions 想定）でgrid.json更新→Vercel反映。更新時刻を画面表示。
  - 受入: スケジュール実行で最新化される。Vercelで認証付き公開。
  - 検証: 手動トリガー実行、公開URL確認。
  - Files: .github/workflows/, web の更新時刻表示

## 検証の基本
- `npm test`（vitest）+ `npm run lint`（tsc --noEmit）+ `npm run build`。
- SF実データに依存する部分は、実際に画面を出して確認する。

## 構成変更（2026-07-21）

更新ボタンを本番（Vercel）でも動かすため、PythonバッチをやめてNext.jsから直接Salesforceを読む構成へ変更した。

- T3（Pythonバッチ）と T6（日次GitHub Actions）は廃止。変換ロジックは `web/lib/transform.ts` に移植済み
- 表示時に取得して10分キャッシュ、更新ボタンが `revalidateTag` でキャッシュを捨てる
- 旧構成のファイル（`batch/` / `setup.cfg` / `.github/workflows/build-grid.yml`）は削除済み
- 本番: Vercel で稼働中（Root Directory=`web`）

## 機能追加: 手動の〇×（2026-07-21）

「空いているが講師の都合で入れられない」時間帯に印を付けたい、という要望に対応した。

- [x] T7: 印の付与と共有
  - 内容: 空きセルのクリックで 無印 → × → 〇 → 無印。`(講師, 曜日, 時刻)` 単位で保存し全員で共有。
    授業が入っている枠では表示しない（Salesforce優先）。
  - 受入: 印が保存されて他の端末でも見える。授業が入った枠では印が隠れる。
  - 検証: `npm test`（marks / marks-store 計24件）、実データの画面で ×・〇 の描画と
    授業枠での非表示を確認済み。
  - Files: web/lib/marks.ts, web/lib/marks-store.ts, web/app/{actions.ts,WeekView.tsx,page.tsx,globals.css}
  - 保存先: Vercel の Upstash Redis（`lesson-calendar-marks` / Tokyo / Free）。接続済み

- [x] T8: 授業が確定していない講師を手で足す
  - 内容: 表の下のプルダウンで在籍講師（Contact）を選び、その曜日の表に行を足す。
    足した行は末尾に区切って並べ、〇×を付けられる。授業が入れば通常の段へ移る。
  - 受入: 候補がその曜日に出ていない在籍講師だけになる。足した行が共有される。
    授業が入った講師は二重に出ず、印が残る。
  - 検証: `npm test`（extra 10件 / 行の組み立て 3件を追加、計78件）。
    実データで「授業のある講師を足しても上の段に1行だけ出て印が残る」ことを確認済み。
  - Files: web/lib/{extra.ts,data.ts,grid.ts,marks-store.ts}, web/app/{actions.ts,WeekView.tsx,page.tsx,globals.css}

## 機能追加: 生徒マッチング（2026-07-22）

仕様は SPEC.md 12章。生徒の希望（科目・時間帯・文理・志望校）から講師の候補を出す。

**2026-07-22 に本番反映済み**。
デプロイ後に画面で確認し、既存の〇×が残っていること・マッチングが動くことを確認した。
印の保存まわり（`marks.ts` / `marks-store.ts` / `extra.ts` / `actions.ts`）は
この機能追加で1文字も変えていないので、Upstash のデータには影響しない。

### 構成要素と依存

1. 講師プロフィール（`lib/profile.ts` + `data.ts`）… 科目・文理・大学をSFから足す。土台。
2. マッチ判定（`lib/match.ts`）… 空きスロット→連続空き→希望判定→並べ替え。1に依存。**純関数**。
3. 条件入力と候補リスト（`app/MatchPanel.tsx`）… 2に依存。
4. グリッドの絞り込み（`lib/grid.ts` + `WeekView.tsx`）… 2に依存。3と同じ画面を触るので後。

条件の状態は `WeekView`（既存のクライアントコンポーネント）に持たせ、`MatchPanel` を子として描く。
曜日タブと同じ場所に置くと、希望時間帯の曜日と表示中の曜日を連動させやすい。

### リスクと対応

- **プロフィールが無い講師**: 実測では授業に出る26名は全員が在籍名簿29名に含まれ、漏れは0。
  ただし将来ずれる可能性はあるので、プロフィールが無い講師は科目・文理を指定した時点で候補から外し、
  「プロフィール未取得 N名」と画面に出す（黙って消さない）。
- **SOQLが1本増える**: 既存2本と合わせて3本。`Promise.all` で並列に投げ、既存の10分キャッシュに同居させる。
  Eligible_Subject は実測184件なのでページングの心配は無い。
- **`WeekView.tsx` が既に300行**: マッチの状態を足すと膨らむ。分割が必要になったら**着手前に確認する**
  （指示外のリファクタリングを避けるため）。
- **既存機能の巻き込み**: 〇×クリック・講師追加・更新ボタンは触らない。既存テスト78件を回帰確認に使う。
- **選択肢が実データ依存**: 科目18種・大学17種は `profiles` から動的に作る。ハードコードしない。

### タスク

- [x] T9: 講師プロフィールの取得
  - 内容: `MANAERP__Eligible_Subject__c` と Contact の文理・大学を取得し、`GridData` に `profiles` を足す。
    SFレコード→`Profiles` の組み立ては `lib/profile.ts` の純関数に置く。名寄せは既存の `normalizeTeacher`。
  - 受入: 在籍講師分のプロフィールが取れ、科目・文理・大学が入る。**既存の画面表示は変わらない**。
  - 検証: `npm test` 91件（既存78＋profile 13）、`npm run lint`、`npm run build` 済み。
    実データで SOQL を実行し、科目184件・プロフィール29名・科目16種・志望校15種・文理29名全員を確認。
  - Files: web/lib/profile.ts, web/lib/data.ts, web/lib/grid.ts, web/__tests__/profile.test.ts
  - 分かったこと: 科目184件のうち9件は社員の分で捨てる。重複レコードが1件あり除去が必要だった。
    **中学数学・中学英語は社員の鈴木一郎しか持っていないため選択肢に出ない**（SPEC 12.3）。

- [x] T10: マッチ判定（TDD）
  - 内容: 空きスロット判定（授業なし＋×印を除く）、希望範囲内の連続空き、複数希望のOR、
    科目AND・文理の絞り込み、〇印→志望校→希望数→名前の並べ替え、落ちた理由の集計。
  - 受入: SPEC 12.8 の代表ケースが通る。志望校は人数を変えず順序だけ変える。
  - 検証: `npm test` 119件（match 28件を追加）、`npm run lint`、`npm run build` 済み。
  - Files: web/lib/match.ts, web/__tests__/match.test.ts
  - 決めたこと: 対象講師は**その曜日のグリッドに出ている人＋手で足した人**に限る
    （出勤していない曜日を「空いている」と言わないため）。
    1つの希望からは最初に入る空きだけを出す（`openings.length` を「満たした希望の数」として並べ替えに使うため）。
    志望校だけの指定は絞り込みにならないので `isBlankWish` は true のまま。

- [x] T11: 条件入力と候補リスト
  - 内容: 科目（複数・AND）／文理／志望校／コマ長（60・90・120）／希望時間帯（複数・追加削除）の入力と、
    候補リストの表示。条件が空なら何も出さない。候補0名なら落ちた理由を出す。
  - 受入: 条件を入れると候補が出る。生徒名の入力欄が無い。既存の画面が条件なしで元のまま。
  - 検証: `npm test` 119件 / `npm run lint` / `npm run build` / 本番の画面で確認済み。
  - Files: web/app/MatchPanel.tsx, web/app/WeekView.tsx, web/app/page.tsx, web/app/globals.css
  - 決めたこと: 既定は畳んでおき「生徒の希望から探す」を押すと開く（条件なしの画面を今までどおりに保つため）。
    候補の空き時間帯を押すとその曜日のタブに切り替わる。

- [x] T12: グリッドの絞り込み
  - 内容: 絞り込み中は該当講師の行だけ表示する。解除で元に戻る。
  - 受入: 該当行のみになる。〇×クリックと講師追加が絞り込み中も動く。
  - 検証: `npm test` 123件（filterRows 4件を追加） / `npm run lint` / `npm run build` 済み。
    本番の画面で確認済み。
  - Files: web/lib/grid.ts, web/app/WeekView.tsx
  - 決めたこと: 絞り込み中は曜日タブ横の表示を「該当N名 / M名中」に変え、
    0名のときは「授業はありません」ではなく「条件へ合う講師はいません」と出し分ける。

- [x] T13: 志望学部（医学部）で優先する
  - 内容: 学部 `Faculty_Name__c` をプロフィールに足し、志望先のプルダウンに学部と大学を分けて出す。
    一致判定は大学名か学部名のどちらかで良い。`Wish.university` は `preference` に、
    `Candidate.wantedUniversity` は `preferred` に改名した（大学だけを指すものではなくなったため）。
  - 受入: 志望先に「医学部」を選ぶと医学部の講師が上に来る。候補の人数は変わらない。
  - 検証: `npm test` 127件 / `npm run lint` / `npm run build` / 本番の画面で確認済み。
  - Files: web/lib/{profile.ts,match.ts,data.ts}, web/app/{MatchPanel.tsx,WeekView.tsx,page.tsx},
    web/__tests__/{profile.test.ts,match.test.ts}
  - 反映済み: 小林愛・井上拓真・中村結衣の学部を医学部にした
    （別途スクリプトで反映。undo用に変更前の値をJSONに残してある）。
    学部の候補は `SEARCHABLE_FACULTIES` に書いたものだけ出す（現在は医学部のみ。
    高橋美咲の建築学部はSFにあるが探す軸にしない）。

- [x] T14: 授業がまだ無い講師は〇を付けたときだけ候補にする
  - 内容: 手で足しただけの講師（その曜日に授業が無い）は、〇印の枠だけを空きとして扱う。
  - 経緯: 医学部の3名のうち中村結衣は今後62日で授業が0件のため、表にもマッチングにも出なかった。
    デビュー前なので出なくてよいが、手で足して〇を付けたら候補に入れたい、と確認した。
  - 受入: 〇が無ければ候補にならない。〇が1コマ分続いていれば候補になる。
    授業がある講師の扱いは変わらない。
  - 検証: `npm test` 131件 / `npm run lint` 済み。
  - Files: web/lib/match.ts, web/app/MatchPanel.tsx, web/__tests__/match.test.ts
