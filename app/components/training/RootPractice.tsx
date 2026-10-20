"use client";

import { ROOT_ZONES } from "../../training-plan";
import type { TrainingTask, WubiEntry } from "../../types";
import { CodeDrill } from "./CodeDrill";

type RootPracticeProps = {
  zone: (typeof ROOT_ZONES)[number];
  prescribedRoots: TrainingTask | undefined;
  pendingDrillSave: boolean;
  selectRootZone: (zone: (typeof ROOT_ZONES)[number]) => void;
  drillResetRevision: number;
  loading: boolean;
  rootPool: WubiEntry[];
  playKeySound: () => void;
  handlePendingSaveChange: (pending: boolean) => void;
  handleDrillProgressChange: (inProgress: boolean) => void;
  onSessionSaved: () => void;
  selectTrainingTab: (next: "plan", force?: boolean) => boolean;
};

export function RootPractice({
  zone,
  prescribedRoots,
  pendingDrillSave,
  selectRootZone,
  drillResetRevision,
  loading,
  rootPool,
  playKeySound,
  handlePendingSaveChange,
  handleDrillProgressChange,
  onSessionSaved,
  selectTrainingTab,
}: RootPracticeProps) {
  return (
    <div
      id="training-panel-roots"
      className="root-training"
      role="tabpanel"
      aria-labelledby="training-tab-roots"
    >
      <div className="root-zone-rail" role="tablist" aria-label="五码根区">
        {ROOT_ZONES.map((item) => (
          <button
            key={item.id}
            role="tab"
            aria-selected={zone.id === item.id}
            tabIndex={zone.id === item.id ? 0 : -1}
            className={zone.id === item.id ? "active" : ""}
            disabled={Boolean(prescribedRoots) || pendingDrillSave}
            onClick={() => selectRootZone(item)}
            onKeyDown={(event) => {
              if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
              event.preventDefault();
              const index = ROOT_ZONES.findIndex((entry) => entry.id === item.id);
              const offset = event.key === "ArrowRight" ? 1 : -1;
              const next = ROOT_ZONES[(index + offset + ROOT_ZONES.length) % ROOT_ZONES.length];
              selectRootZone(next);
              const buttons = event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>("[role=tab]");
              buttons?.[(index + offset + ROOT_ZONES.length) % ROOT_ZONES.length]?.focus();
            }}
          >
            <b>{item.keys}</b>
            <strong>{item.label}</strong>
            <small>{item.note}</small>
          </button>
        ))}
      </div>
      <CodeDrill
        key={`${drillResetRevision}:${prescribedRoots?.id ?? zone.id}`}
        title={prescribedRoots?.title ?? `${zone.label}专项`}
        description={prescribedRoots?.reason ?? `${zone.keys} 为首码的常用单字，集中训练起笔判断与键位记忆。`}
        emptyText={loading ? "正在整理题库…" : "这一分区暂时没有可用题目。"}
        pool={prescribedRoots?.items ?? rootPool}
        sessionType="roots"
        playKeySound={playKeySound}
        planTask={prescribedRoots}
        onPendingSaveChange={handlePendingSaveChange}
        onInProgressChange={handleDrillProgressChange}
        onSessionSaved={() => {
          onSessionSaved();
          if (prescribedRoots) selectTrainingTab("plan", true);
        }}
      />
    </div>
  );
}
