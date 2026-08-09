"use client";

import { useEffect, useMemo, useOptimistic, useRef, useState, useTransition } from "react";

import {
  candidateTeachers,
  extraKey,
  extraTeachersOnWeekday,
  type Extras,
} from "../lib/extra";
import {
  STEP_MINUTES,
  WEEKDAYS,
  buildTeacherRows,
  buildTimeAxis,
  filterRows,
  formatOpenFrom,
  minutesToTime,
  teachersOnWeekday,
  timeToMinutes,
  type Cell,
} from "../lib/grid";
import { EMPTY_WISH, isBlankWish, matchTeachers, type Wish } from "../lib/match";
import type { Profiles } from "../lib/profile";
import {
  MARK_LABEL,
  applyMark,
  markKey,
  nextMark,
  resolveMark,
  type MarkValue,
  type Marks,
} from "../lib/marks";
import MatchPanel from "./MatchPanel";
import { setExtraTeacher, setMark } from "./actions";

type MarkUpdate = { key: string; value: MarkValue | null };
type ExtraUpdate = { key: string; on: boolean };

/** 押し間違いで消えないように、外すのは長押ししてからにする。 */
const LONG_PRESS_MS = 600;

export default function WeekView({
  cells,
  initialWeekday,
  marks,
  extras,
  roster,
  profiles,
  subjectOptions,
  preferenceOptions,
}: {
  cells: Cell[];
  initialWeekday: string;
  marks: Marks;
  extras: Extras;
  roster: string[];
  profiles: Profiles;
  subjectOptions: string[];
  preferenceOptions: { faculties: string[]; universities: string[] };
}) {
  const [weekday, setWeekday] = useState(initialWeekday);
  const [wish, setWish] = useState<Wish>(EMPTY_WISH);
  const [pick, setPick] = useState("");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [asking, setAsking] = useState<string | null>(null);
  const [pressing, setPressing] = useState<string | null>(null);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [, startTransition] = useTransition();

  const [shownMarks, addOptimisticMark] = useOptimistic(
    marks,
    (state: Marks, update: MarkUpdate) => applyMark(state, update.key, update.value),
  );
  const [shownExtras, addOptimisticExtra] = useOptimistic(
    extras,
    (state: Extras, update: ExtraUpdate) => {
      const next = { ...state };
      if (update.on) {
        next[update.key] = true;
      } else {
        delete next[update.key];
      }
      return next;
    },
  );

  const axis = buildTimeAxis(cells);
  const added = extraTeachersOnWeekday(shownExtras, weekday);
  const allRows = buildTeacherRows(cells, weekday, axis, added);

  // 終わりの時刻も選べるように、時間軸の末尾に1コマ分足す
  const timeOptions =
    axis.length === 0
      ? []
      : [...axis, minutesToTime(timeToMinutes(axis[axis.length - 1]) + STEP_MINUTES)];

  const result = useMemo(
    () => matchTeachers({ cells, profiles, marks: shownMarks, extras: shownExtras, wish }),
    [cells, profiles, shownMarks, shownExtras, wish],
  );
  const searching = !isBlankWish(wish);
  const rows = filterRows(
    allRows,
    searching ? result.candidates.map((candidate) => candidate.teacher) : null,
  );

  const candidates = candidateTeachers(
    roster,
    teachersOnWeekday(cells, weekday),
    shownExtras,
    weekday,
  );

  function report(caught: unknown) {
    setSaveError(caught instanceof Error ? caught.message : String(caught));
  }

  function cancelPress() {
    if (pressTimer.current !== null) {
      clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
    setPressing(null);
  }

  /** 足した講師の名前を長押しすると、外すかどうかを聞く。 */
  function startPress(teacher: string) {
    cancelPress();
    setPressing(teacher);
    pressTimer.current = setTimeout(() => {
      pressTimer.current = null;
      setPressing(null);
      setAsking(teacher);
    }, LONG_PRESS_MS);
  }

  // 曜日を切り替えたら、聞きかけの確認は捨てる
  useEffect(() => {
    setAsking(null);
    cancelPress();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekday]);

  /** 空き枠をクリックしたら 無印 → × → 〇 → 無印 と切り替えて保存する。 */
  function toggleMark(teacher: string, slot: string) {
    const key = markKey(teacher, weekday, slot);
    const value = nextMark(shownMarks[key] ?? null);
    startTransition(async () => {
      addOptimisticMark({ key, value });
      try {
        await setMark(teacher, weekday, slot, value);
        setSaveError(null);
      } catch (caught) {
        report(caught);
      }
    });
  }

  function changeExtra(teacher: string, on: boolean) {
    const key = extraKey(teacher, weekday);
    startTransition(async () => {
      addOptimisticExtra({ key, on });
      try {
        await setExtraTeacher(teacher, weekday, on);
        setSaveError(null);
      } catch (caught) {
        report(caught);
      }
    });
  }

  function addPicked() {
    if (pick === "") {
      return;
    }
    changeExtra(pick, true);
    setPick("");
  }

  return (
    <>
      <MatchPanel
        wish={wish}
        onChange={setWish}
        subjects={subjectOptions}
        preferences={preferenceOptions}
        times={timeOptions}
        weekday={weekday}
        result={result}
        onJump={setWeekday}
      />

      <div className="tabs">
        {WEEKDAYS.map((day) => (
          <button
            key={day}
            type="button"
            className={day === weekday ? "tab active" : "tab"}
            onClick={() => setWeekday(day)}
          >
            {day}
          </button>
        ))}
        <span className="tabnote">
          {searching
            ? `該当${rows.length}名 / ${allRows.length}名中`
            : `${allRows.length - added.length}名が出勤${
                added.length > 0 ? ` / ${added.length}名を追加中` : ""
              }`}
        </span>
      </div>

      {saveError ? <p className="error">保存できませんでした: {saveError}</p> : null}

      {rows.length === 0 ? (
        <p className="empty">
          {searching
            ? `${weekday}曜日に条件へ合う講師はいません。`
            : `${weekday}曜日の授業はありません。`}
        </p>
      ) : (
        <div className="scroll">
          <table className="matrix">
            <thead>
              <tr>
                <th className="namecol">講師</th>
                {axis.map((slot) => (
                  <th key={slot} className={slot.endsWith(":00") ? "hour" : "half"}>
                    {slot.endsWith(":00") ? Number(slot.slice(0, 2)) : ""}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIndex) => {
                // 手で足した行はここから下、と分かるように区切る
                const firstExtra = row.extra && (rowIndex === 0 || !rows[rowIndex - 1].extra);
                return (
                  <tr key={row.teacher} className={row.extra ? "extrarow" : undefined}>
                    <th
                      className={
                        `namecol${firstExtra ? " divider" : ""}` +
                        `${pressing === row.teacher ? " pressing" : ""}`
                      }
                      title={row.extra ? `${row.teacher}（長押しで表から外す）` : undefined}
                      onPointerDown={row.extra ? () => startPress(row.teacher) : undefined}
                      onPointerUp={row.extra ? cancelPress : undefined}
                      onPointerLeave={row.extra ? cancelPress : undefined}
                      onPointerCancel={row.extra ? cancelPress : undefined}
                      onContextMenu={row.extra ? (event) => event.preventDefault() : undefined}
                    >
                      <span className="tname">{row.teacher}</span>
                    </th>
                    {row.slots.map((cell, index) => {
                      const slot = axis[index];
                      const hourEdge = slot.endsWith(":00") ? " edge" : "";
                      const divider = firstExtra ? " divider" : "";
                      const mark = resolveMark(
                        shownMarks,
                        row.teacher,
                        weekday,
                        slot,
                        cell !== null,
                      );
                      if (!cell) {
                        const markNote = mark ? `${MARK_LABEL[mark]} ` : "";
                        return (
                          <td
                            key={slot}
                            className={`free${mark ? ` ${mark}` : ""}${hourEdge}${divider}`}
                            title={`${slot} ${markNote}クリックで印を切替`}
                            onClick={() => toggleMark(row.teacher, slot)}
                          >
                            {mark ? MARK_LABEL[mark] : null}
                          </td>
                        );
                      }
                      const closing = cell.open_from ? " closing" : "";
                      const trial = cell.trial ? " trial" : "";
                      const openNote = cell.open_from
                        ? ` / ${formatOpenFrom(cell.open_from)}`
                        : "";
                      const trialNote = cell.trial ? " / 体験" : "";
                      return (
                        <td
                          key={slot}
                          className={`busy${closing}${trial}${hourEdge}${divider}`}
                          title={`${cell.start}〜${cell.end}${trialNote}${openNote}`}
                        />
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {asking !== null ? (
        <div className="confirm">
          <span>
            {asking} を{weekday}曜の表から外しますか？
          </span>
          <button
            type="button"
            className="danger"
            onClick={() => {
              changeExtra(asking, false);
              setAsking(null);
            }}
          >
            外す
          </button>
          <button type="button" className="cancel" onClick={() => setAsking(null)}>
            やめる
          </button>
        </div>
      ) : null}

      {rows.some((row) => row.extra) && asking === null ? (
        <p className="hint">追加した講師（斜体）は、名前を長押しすると外せます。</p>
      ) : null}

      <div className="addrow">
        <label htmlFor="addteacher">授業が入っていない講師を{weekday}曜に追加</label>
        <select
          id="addteacher"
          value={pick}
          onChange={(event) => setPick(event.target.value)}
          disabled={candidates.length === 0}
        >
          <option value="">
            {candidates.length === 0 ? "追加できる講師がいません" : "講師を選ぶ…"}
          </option>
          {candidates.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
        <button type="button" className="add" onClick={addPicked} disabled={pick === ""}>
          追加
        </button>
      </div>
    </>
  );
}
