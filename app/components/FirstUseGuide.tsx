"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  createAdvancedSeason,
} from "../advanced-training";
import {
  readAdvancedSeasonArchive,
} from "../advanced-season-storage";
import { createLocalId, getErrors, getSessions } from "../lib";
import { commitLocalWrites, readLocal, STORAGE, writeLocal } from "../storage";
import type { SessionResult } from "../types";

import { isOnboardingProgress, reconcileOnboarding, type OnboardingProgress } from "../onboarding";
import { Modal } from "./Ui";

import { buildBaseline, formatMetric, isBaselineSession, metricLabel } from "../onboarding-baseline";
const EMPTY_PROGRESS: OnboardingProgress = { version: 1, status: "active", sessionIds: [] };
function readProgress(): OnboardingProgress | null {
  const value = readLocal<unknown>(STORAGE.onboarding, null);
  return isOnboardingProgress(value) ? value : null;
}
function writeProgress(value: OnboardingProgress) { return writeLocal(STORAGE.onboarding, value); }

export function FirstUseGuide({ enabled, view }: { enabled: boolean; view: string }) {
  const router = useRouter();
  const [opened, setOpened] = useState(false);
  const [progress, setProgress] = useState<OnboardingProgress | null>(null);
  const [sessions, setSessions] = useState<SessionResult[]>([]);
  const [goalCreated, setGoalCreated] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [dismissedForPractice, setDismissedForPractice] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    const refresh = () => {
      const storedProgress = readProgress();
      const nextSessions = getSessions();
      const result = reconcileOnboarding(storedProgress, nextSessions);
      const changed = result.progress !== storedProgress;
      const saved = !changed || (result.progress && writeProgress(result.progress));
      setProgress(saved ? result.progress : storedProgress);
      if (result.open) {
        setDismissedForPractice(false);
        setOpened(true);
      }
      if (!saved) {
        setSaveError("成绩已保存，但引导进度未能保存，请检查浏览器存储空间后刷新重试。");
      }
      setSessions(nextSessions);
      setHydrated(true);
    };
    refresh();
    window.addEventListener("wubi:practice-saved", refresh);
    window.addEventListener("focus", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("wubi:practice-saved", refresh);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, [enabled]);

  const hasExistingHistory = sessions.length > 0 && !progress;
  const baseline = useMemo(
    () => (progress ? buildBaseline(sessions, progress) : null),
    [progress, sessions],
  );
  const visible = enabled && hydrated && opened && !dismissedForPractice;
  const current = progress ?? EMPTY_PROGRESS;
  const skip = () => {
    const next = { ...current, status: "skipped" as const };
    if (writeProgress(next)) { setProgress(next); setOpened(false); }
    else setSaveError("跳过状态未能保存，请稍后再试。");
  };

  if (!enabled || !hydrated) return null;
  if (!visible) return (view === "typing" || view === "settings") ? (
    <aside className="first-use-entry">
      <button className="button ghost" onClick={() => { setOpened(true); setDismissedForPractice(false); }}>首次使用引导{progress?.status === "active" ? " · 继续" : ""}</button>
      {!hasExistingHistory && !progress && <span>三段短测，找到练习起点。可以自由选择是否开始。</span>}
    </aside>
  ) : null;

  const tested = baseline ? 3 : current.sessionIds.length;
  const startTest = () => {
    const next = {
      ...current,
      status: "active" as const,
      startedAt: current.startedAt ?? new Date().toISOString(),
    };
    if (!writeProgress(next)) {
      setSaveError("向导状态未能保存，请检查浏览器存储空间后重试。");
      return;
    }
    setProgress(next);
    setDismissedForPractice(true);
    // A fresh document resets the completed typing session and loads the selected short text.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign(`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/?onboarding=1&step=${tested}`);
  };
  const createGoal = () => {
    if (!baseline || goalCreated) return;
    if (baseline.sessions.some((session) => session.durationSeconds < 5 || session.speed > 1000)) {
      setSaveError("短测耗时过短或速度异常，暂不据此建立目标。请重新完成自然输入的短测。"); return;
    }
    const archive = readAdvancedSeasonArchive();
    if (!archive) { setSaveError("阶段目标数据无法读取，请先检查或恢复备份。"); return; }
    if (archive.active) {
      setGoalCreated(true);
      setSaveError("已有阶段目标，保留当前目标；可直接进行推荐复练。");
      return;
    }
    const season = createAdvancedSeason(createLocalId(), new Date(), {
      durationDays: 7,
      goalMetric: baseline.metric,
    });
    const nextProgress = { ...current, goalMetric: baseline.metric };
    if (!commitLocalWrites(new Map<string, unknown>([
      [STORAGE.advancedSeason, { ...archive, active: season }],
      [STORAGE.onboarding, nextProgress],
    ]))) { setSaveError("目标未能保存，已有成绩保持不变，请重试。"); return; }
    setProgress(nextProgress);
    setGoalCreated(true);
  };
  const goToPractice = () => {
    if (!baseline) return;
    const next = { ...current, status: "active" as const, practiceStartedAt: new Date().toISOString(), practiceSessionId: undefined };
    if (!writeProgress(next)) { setSaveError("复练进度未能保存，请重试。"); return; }
    setProgress(next); setOpened(false); setDismissedForPractice(true);
    router.push(baseline.metric === "codeLength" ? "/training?tab=phrase" : getErrors().length ? "/training?tab=review" : "/training?tab=phrase");
  };

  return (
    <Modal title="首次使用引导 · 找到今天的起点" onClose={() => { if (!progress) skip(); else setOpened(false); }}>
        <div className="first-use-body">
          {!baseline ? (
            <>
              <p className="first-use-lead">不用注册，也不用先读说明。完成三次短文章测速，网站会只用本机成绩帮你找出一个最值得先练的方向。</p>
              <ol className="first-use-steps">
                {["测一次自然速度", "换一段文字复核字准和码长", "第三段确认节奏，再生成建议"].map((label, index) => (
                  <li key={label} className={index < tested ? "done" : ""}>
                    <span>{index < tested ? "✓" : `0${index + 1}`}</span>
                    <div><strong>{label}</strong><small>{index === 0 ? "约 2–3 分钟 · 不追求快" : index === 1 ? "约 2–3 分钟 · 看输入习惯" : "约 2–3 分钟 · 建立可比较的基线"}</small></div>
                  </li>
                ))}
              </ol>
              {tested > 0 && <p className="first-use-progress" role="status">已完成 {tested}/3 段。保存成绩后会自动进入下一步。</p>}
              {saveError && <p className="plan-message" role="alert">{saveError}</p>}
              {sessions.filter(isBaselineSession).length >= 3 && !current.startedAt && <button className="button ghost" onClick={() => {
                const next = { ...current, status: "active" as const, sessionIds: sessions.filter(isBaselineSession).slice(0, 3).map((s) => s.id) };
                if (writeProgress(next)) setProgress(next); else setSaveError("历史建议未能保存，请重试。");
              }}>使用已有成绩生成建议</button>}
              <div className="first-use-actions">
                <button className="button primary" type="button" onClick={startTest}>{tested ? "继续下一段测速" : "开始第一段测速"}</button>
                <button className="button ghost" type="button" onClick={skip}>先自由练习</button>
              </div>
              <p className="first-use-note">数据只保存在当前浏览器；随时可以在“设置 → 备份”中导出或清除。</p>
            </>
          ) : (
            <>
              <p className="first-use-lead">三段短测仅提供初步观察，不代表完整能力。正文不同，不能据此声称进步；七日目标会另做同文基线与复测。</p>
              {baseline.sessions.some((session) => session.durationSeconds < 5 || session.speed > 1000) && <p role="alert">样本耗时过短或速度异常，以下数值仅为原始记录，不作为可靠推荐依据。</p>}
              <div className="first-use-summary" aria-label="首次基线摘要">
                <div><span>平均速度</span><strong>{baseline.speed.toFixed(1)}</strong><small>字/分</small></div>
                <div><span>平均字准</span><strong>{baseline.accuracy.toFixed(1)}</strong><small>%</small></div>
                <div><span>平均码长</span><strong>{baseline.sessions.every((session) => (session.keyCount ?? 0) > 0) ? baseline.codeLength.toFixed(2) : "未采集"}</strong><small>键/字</small></div>
              </div>
              <div className="first-use-recommendation">
                <span className="eyebrow">PRIMARY FOCUS</span>
                <h3>先练：{metricLabel(baseline.metric)}</h3>
                <p>三段基线中的当前值为 {formatMetric(baseline)}。推荐顺序：字准低于 95% 优先准确性；有按键记录且码长高于 3 时关注码长；速度低于 40 字/分关注流畅度；节奏波动超过 35% 时关注稳定性。其余情况先观察速度，不认定存在明显弱项。</p>
              </div>
              {saveError && <p className="plan-message" role="alert">{saveError}</p>}
              {current.practiceSessionId && <section role="status"><h3>基线 → 建议 → 复练已完成</h3><p>已保存首次复练。下次打开“今日训练”的到期复习查看实际队列；没有到期条目时继续每日计划。短测与复练不是同文对照，不计算进步率。</p><button className="button primary" onClick={() => {
                const next = { ...current, status: "completed" as const, completedAt: new Date().toISOString() };
                if (writeProgress(next)) { setProgress(next); setOpened(false); }
                else setSaveError("完成状态保存失败，请重试。");
              }}>完成引导</button></section>}
              <div className="first-use-actions">
                <button className="button primary" type="button" onClick={createGoal}>{goalCreated ? "七日目标已建立" : "建立我的七日目标"}</button>
                <button className="button ghost" type="button" onClick={goToPractice}>先做一次推荐练习</button>
                <button className="button ghost" type="button" onClick={() => {
                  const next = { ...EMPTY_PROGRESS, startedAt: new Date().toISOString() };
                  if (writeProgress(next)) { setProgress(next); setGoalCreated(false); setSaveError(""); }
                  else setSaveError("重新短测状态未能保存，请重试。");
                }}>重新短测（保留已有成绩）</button>
              </div>
              <p className="first-use-note">七日目标会进入“进阶训练”，已有三次成绩不会被改写；如果你现在跳过，之后仍可从进阶训练重新建立目标。</p>
            </>
          )}
        </div>
    </Modal>
  );
}
