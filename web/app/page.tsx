import { getGrid } from "../lib/data";
import { visibleCells, weekdayFromISO, type GridData } from "../lib/grid";
import { type Extras } from "../lib/extra";
import { type Marks } from "../lib/marks";
import { loadExtras, loadMarks } from "../lib/marks-store";
import { preferenceOptions, subjectOptions } from "../lib/profile";
import RefreshButton from "./RefreshButton";
import WeekView from "./WeekView";
import { refreshGrid } from "./actions";

export default async function Page() {
  let data: GridData | null = null;
  let error: string | null = null;
  let marks: Marks = {};
  let extras: Extras = {};
  let marksError: string | null = null;

  try {
    data = await getGrid();
  } catch (caught) {
    error = caught instanceof Error ? caught.message : String(caught);
  }

  // 手で足した情報が読めなくても特訓の表は出す（読めなかったことは画面に出す）。
  try {
    [marks, extras] = await Promise.all([loadMarks(), loadExtras()]);
  } catch (caught) {
    marksError = caught instanceof Error ? caught.message : String(caught);
  }

  return (
    <main>
      <header className="head">
        <div>
          <h1>特訓カレンダー</h1>
          {process.env.SITE_NAME ? <p className="sub">{process.env.SITE_NAME}</p> : null}
        </div>
        <div className="meta">
          {data ? (
            <>
              <p>
                {data.range.from} 〜 {data.range.to}
              </p>
              <p className="dim">取得 {data.generated_at.slice(0, 16).replace("T", " ")}</p>
            </>
          ) : null}
          <form action={refreshGrid}>
            <RefreshButton />
          </form>
        </div>
      </header>

      {error ? (
        <p className="error">Salesforceから取得できませんでした: {error}</p>
      ) : data ? (
        <>
          <p className="legend">
            <span className="swatch busy" />
            特訓あり
            <span className="swatch trial" />
            体験
            <span className="swatch closing" />
            途中で終わる枠（マウスを乗せると空き開始日）
            <span className="swatch free" />
            空き
            <span className="swatch ng">×</span>
            空いているが入れない
            <span className="swatch ok">〇</span>
            入れる
            <span className="note">空きセルをクリックで印を切替（全員に共有されます）</span>
          </p>

          {marksError ? <p className="error">印を読み込めませんでした: {marksError}</p> : null}

          <WeekView
            cells={visibleCells(data.cells)}
            initialWeekday={weekdayFromISO(data.generated_at)}
            marks={marks}
            extras={extras}
            roster={data.roster}
            profiles={data.profiles}
            subjectOptions={subjectOptions(data.profiles)}
            preferenceOptions={preferenceOptions(data.profiles)}
          />
        </>
      ) : null}
    </main>
  );
}
