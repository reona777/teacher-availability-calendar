"use client";

import { useState } from "react";

import { WEEKDAYS, timeToMinutes } from "../lib/grid";
import {
  EMPTY_WISH,
  LESSON_MINUTES,
  addTimeWishes,
  isBlankWish,
  type MatchResult,
  type TimeWish,
  type Wish,
} from "../lib/match";
import type { Bunri } from "../lib/profile";

const LESSON_LABEL: Record<number, string> = {
  60: "60分（高校生）",
  90: "90分（中学生）",
  120: "120分（中学生）",
};

/** よく使う曜日のまとまり。1つずつ押さずに済ませるための近道。 */
const WEEKDAY_PRESETS: { label: string; weekdays: string[] }[] = [
  { label: "平日", weekdays: ["月", "火", "水", "木", "金"] },
  { label: "土", weekdays: ["土"] },
  { label: "全部", weekdays: [...WEEKDAYS] },
];

/** 希望を足すときの既定の時間。時間軸のまん中あたりから2コマ分。 */
function defaultRange(times: string[]): { from: string; to: string } {
  const start = Math.min(Math.floor(times.length / 2), Math.max(times.length - 3, 0));
  return {
    from: times[start] ?? "18:00",
    to: times[Math.min(start + 2, times.length - 1)] ?? "19:00",
  };
}

export default function MatchPanel({
  wish,
  onChange,
  subjects,
  preferences,
  times,
  weekday,
  result,
  onJump,
}: {
  wish: Wish;
  onChange: (next: Wish) => void;
  subjects: string[];
  preferences: { faculties: string[]; universities: string[] };
  times: string[];
  weekday: string;
  result: MatchResult;
  onJump: (weekday: string) => void;
}) {
  const [open, setOpen] = useState(false);
  // まとめて追加するときの選択。表示中の曜日から始める。
  const [days, setDays] = useState<string[]>([weekday]);
  const [range, setRange] = useState(() => defaultRange(times));
  const searching = !isBlankWish(wish);
  const { candidates, dropped } = result;
  const total =
    candidates.length + dropped.profile + dropped.subject + dropped.bunri + dropped.time;

  function patch(changes: Partial<Wish>) {
    onChange({ ...wish, ...changes });
  }

  function toggleSubject(subject: string) {
    patch({
      subjects: wish.subjects.includes(subject)
        ? wish.subjects.filter((name) => name !== subject)
        : [...wish.subjects, subject],
    });
  }

  function changeTime(index: number, changes: Partial<TimeWish>) {
    patch({
      times: wish.times.map((time, at) => (at === index ? { ...time, ...changes } : time)),
    });
  }

  function toggleDay(day: string) {
    setDays(days.includes(day) ? days.filter((name) => name !== day) : [...days, day]);
  }

  if (!open) {
    return (
      <div className="matchbar">
        <button type="button" className="add" onClick={() => setOpen(true)}>
          生徒の希望から探す
        </button>
        {searching ? <span className="tabnote">{candidates.length}名が該当中</span> : null}
      </div>
    );
  }

  return (
    <div className="match">
      <div className="matchhead">
        <strong>生徒の希望から探す</strong>
        <div>
          <button type="button" className="cancel" onClick={() => onChange(EMPTY_WISH)}>
            条件をクリア
          </button>
          <button type="button" className="cancel" onClick={() => setOpen(false)}>
            閉じる
          </button>
        </div>
      </div>

      <div className="field">
        <span className="label">科目（選んだ科目を全部教えられる講師を探します）</span>
        <div className="chips">
          {subjects.map((subject) => (
            <button
              key={subject}
              type="button"
              className={wish.subjects.includes(subject) ? "chip on" : "chip"}
              onClick={() => toggleSubject(subject)}
            >
              {subject}
            </button>
          ))}
        </div>
      </div>

      <div className="field row">
        <label>
          <span className="label">文理</span>
          <select
            value={wish.bunri ?? ""}
            onChange={(event) => patch({ bunri: (event.target.value || null) as Bunri | null })}
          >
            <option value="">指定なし</option>
            <option value="文系">文系</option>
            <option value="理系">理系</option>
          </select>
        </label>

        <label>
          <span className="label">志望校・志望学部（同じ講師を上に出します）</span>
          <select
            value={wish.preference ?? ""}
            onChange={(event) => patch({ preference: event.target.value || null })}
          >
            <option value="">指定なし</option>
            {preferences.faculties.length > 0 ? (
              <optgroup label="学部">
                {preferences.faculties.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </optgroup>
            ) : null}
            <optgroup label="大学">
              {preferences.universities.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </optgroup>
          </select>
        </label>

        <label>
          <span className="label">1コマの長さ</span>
          <select
            value={wish.lessonMinutes}
            onChange={(event) => patch({ lessonMinutes: Number(event.target.value) })}
          >
            {LESSON_MINUTES.map((minutes) => (
              <option key={minutes} value={minutes}>
                {LESSON_LABEL[minutes]}
              </option>
            ))}
          </select>
        </label>

        <label className="check">
          <input
            type="checkbox"
            checked={wish.excludeNg}
            onChange={(event) => patch({ excludeNg: event.target.checked })}
          />
          ×を付けた枠は空きに数えない
        </label>
      </div>

      <div className="field">
        <span className="label">
          希望の時間帯（どれか1つでも1コマ分空いていれば候補にします）
        </span>

        <div className="bulk">
          <div className="chips">
            {WEEKDAYS.map((day) => (
              <button
                key={day}
                type="button"
                className={days.includes(day) ? "chip on" : "chip"}
                onClick={() => toggleDay(day)}
              >
                {day}
              </button>
            ))}
            {WEEKDAY_PRESETS.map((preset) => (
              <button
                key={preset.label}
                type="button"
                className="chip preset"
                onClick={() => setDays(preset.weekdays)}
              >
                {preset.label}
              </button>
            ))}
          </div>
          <div className="timerow">
            <select
              value={range.from}
              onChange={(event) => setRange({ ...range, from: event.target.value })}
            >
              {times.map((slot) => (
                <option key={slot} value={slot}>
                  {slot}
                </option>
              ))}
            </select>
            <span>〜</span>
            <select
              value={range.to}
              onChange={(event) => setRange({ ...range, to: event.target.value })}
            >
              {times.map((slot) => (
                <option key={slot} value={slot}>
                  {slot}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="add"
              disabled={days.length === 0 || timeToMinutes(range.from) >= timeToMinutes(range.to)}
              onClick={() => patch({ times: addTimeWishes(wish.times, days, range.from, range.to) })}
            >
              選んだ曜日にまとめて追加
            </button>
          </div>
        </div>

        {wish.times.map((time, index) => (
          <div key={index} className="timerow">
            <select
              value={time.weekday}
              onChange={(event) => changeTime(index, { weekday: event.target.value })}
            >
              {WEEKDAYS.map((day) => (
                <option key={day} value={day}>
                  {day}
                </option>
              ))}
            </select>
            <select
              value={time.from}
              onChange={(event) => changeTime(index, { from: event.target.value })}
            >
              {times.map((slot) => (
                <option key={slot} value={slot}>
                  {slot}
                </option>
              ))}
            </select>
            <span>〜</span>
            <select
              value={time.to}
              onChange={(event) => changeTime(index, { to: event.target.value })}
            >
              {times.map((slot) => (
                <option key={slot} value={slot}>
                  {slot}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="cancel"
              onClick={() => patch({ times: wish.times.filter((_, at) => at !== index) })}
            >
              削除
            </button>
          </div>
        ))}
      </div>

      {searching ? (
        <div className="result">
          <p className="resulthead">
            {candidates.length}名が該当
            <span className="tabnote">
              対象{total}名
              {dropped.subject > 0 ? ` / 科目で${dropped.subject}名` : ""}
              {dropped.bunri > 0 ? ` / 文理で${dropped.bunri}名` : ""}
              {dropped.time > 0 ? ` / 時間で${dropped.time}名` : ""}
              {dropped.profile > 0 ? ` / プロフィール未取得で${dropped.profile}名` : ""}
              が外れました
            </span>
          </p>
          {candidates.length === 0 ? (
            <p className="empty">
              条件を緩めてください。授業がまだ無い講師は、表に足して〇を付けると候補に入ります。
            </p>
          ) : (
            <ol className="cands">
              {candidates.map((candidate) => (
                <li key={candidate.teacher}>
                  <span className="cname">{candidate.teacher}</span>
                  <span className="cmeta">
                    {[candidate.university, candidate.faculty, candidate.bunri]
                      .filter(Boolean)
                      .join("・") || "—"}
                  </span>
                  {candidate.preferred ? <span className="badge">志望に一致</span> : null}
                  {candidate.hasOk ? <span className="badge ok">〇</span> : null}
                  <span className="copen">
                    {candidate.openings.map((opening) => (
                      <button
                        key={`${opening.weekday}${opening.from}`}
                        type="button"
                        className="slot"
                        onClick={() => onJump(opening.weekday)}
                      >
                        {opening.weekday} {opening.from}〜{opening.to}
                      </button>
                    ))}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </div>
      ) : null}
    </div>
  );
}
