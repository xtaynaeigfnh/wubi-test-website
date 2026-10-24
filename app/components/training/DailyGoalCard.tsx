"use client";

import { useState } from "react";
import { calculateDailyProgress } from "../../practice-statistics";
import type { DailyGoal } from "../../types";

type DailyGoalCardProps = {
  today: ReturnType<typeof calculateDailyProgress>;
  goal: DailyGoal;
  updateGoal: (key: keyof DailyGoal, value: number) => void;
};

export function DailyGoalCard({
  today,
  goal,
  updateGoal,
}: DailyGoalCardProps) {
  return (
    <div className="daily-progress-card">
      <header className="panel-title training-card-header">
        <div className="training-card-heading">
          <span className="eyebrow">今日进度</span>
          <h2>今天练了多少</h2>
        </div>
        <div
          className="training-card-stat"
          aria-label={`今日已完成 ${today.rounds} 轮`}
        >
          <strong>{today.rounds}</strong>
          <span>轮</span>
        </div>
      </header>
      <p className="daily-progress-note">统计今天所有已保存的练习；三步任务的完成度看上方安排。</p>
      <GoalRow
        label="文章字数"
        value={today.chars}
        target={goal.targetChars}
        unit="字"
      />
      <GoalRow
        label="有效时长"
        value={Math.round(today.minutes)}
        target={goal.targetMinutes}
        unit="分钟"
      />
      <GoalRow
        label="练习轮数"
        value={today.rounds}
        target={goal.targetRounds}
        unit="轮"
      />
      <div className="goal-editor">
        <GoalEditorInput
          label="每日字数"
          min={100}
          max={10000}
          step={100}
          value={goal.targetChars}
          onCommit={(next) => updateGoal("targetChars", next)}
        />
        <GoalEditorInput
          label="每日分钟"
          min={5}
          max={180}
          step={5}
          value={goal.targetMinutes}
          onCommit={(next) => updateGoal("targetMinutes", next)}
        />
        <GoalEditorInput
          label="每日轮数"
          min={1}
          max={20}
          step={1}
          value={goal.targetRounds}
          onCommit={(next) => updateGoal("targetRounds", next)}
        />
      </div>
    </div>
  );
}

function GoalEditorInput({
  label,
  min,
  max,
  step,
  value,
  onCommit,
}: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onCommit: (value: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const commitDraft = (raw: string) => {
    if (draft === null) return;
    setDraft(null);
    const parsed = Number(raw);
    if (raw.trim() === "" || !Number.isFinite(parsed)) return;
    onCommit(Math.min(max, Math.max(min, parsed)));
  };
  return (
    <label>
      {label}
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={draft ?? value}
        onChange={(event) => {
          const raw = event.target.value;
          const parsed = Number(raw);
          if (
            raw.trim() !== "" &&
            Number.isFinite(parsed) &&
            parsed >= min &&
            parsed <= max
          ) {
            setDraft(null);
            onCommit(parsed);
            return;
          }
          setDraft(raw);
        }}
        onBlur={(event) => commitDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") commitDraft(event.currentTarget.value);
        }}
      />
    </label>
  );
}

function GoalRow({
  label,
  value,
  target,
  unit,
}: {
  label: string;
  value: number;
  target: number;
  unit: string;
}) {
  const rate = Math.min(1, value / Math.max(1, target));
  return (
    <div className="goal-row" data-complete={rate === 1}>
      <span>{label}</span>
      <i aria-hidden="true">
        <b style={{ width: `${rate * 100}%` }} />
      </i>
      <strong>
        {value} / {target} {unit}
      </strong>
    </div>
  );
}
