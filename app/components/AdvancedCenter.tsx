"use client";

import { writeAdvancedSeasonArchive, saveCurrentAdvancedPracticeOutcome } from "../practice-transactions";
/* eslint-disable react-hooks/set-state-in-effect */

import { AdvancedPractice, type PracticeTarget } from "./advanced/AdvancedPractice";
import { RhythmSummaryView } from "./advanced/RhythmSummaryView";
import { useSkin } from "./SkinContext";
import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { createLocalId, getSessions } from "../practice-transactions";
import { readLocal, STORAGE, takeSessionValue } from "../storage";
import {
  readAdvancedSeasonArchive,
} from "../advanced-season-storage";
import { loadArticles } from "../content-loader";
import {
  ADVANCED_GOAL_LABELS,
  archiveFinishedSeason,
  buildAdvancedAssessmentIdentity,
  buildAdvancedSeasonEvaluation,
  buildAdvancedScenarioLibrary,
  canCompleteAdvancedSeasonToday,
  cancelAdvancedSeason,
  createAdvancedSeason,
  expireAdvancedSeason,
  getAdvancedGoalValue,
  getAdvancedSeasonDuration,
  invalidateAdvancedSeasonForContent,
  isAdvancedSeasonArchive,
  pauseAdvancedSeason,
  resumeAdvancedSeason,
  selectWeakestScenarioCategory,
} from "../advanced-training";
import type {
  AdvancedScenario,
  AdvancedAssessmentIdentity,
  AdvancedGoalMetric,
  AdvancedSeason,
  AdvancedSeasonArchive,
  KeySoundPlayer,
  RhythmWeakSegment,
  ScenarioCategory,
  SessionResult,
} from "../types";
import { ErrorState } from "./Ui";
import { useLocalDataSync } from "./hooks/useLocalDataSync";

const seasonSyncKeys = [STORAGE.advancedSeason];

const ChallengeView = dynamic(
  () => import("./views/ChallengeView").then((m) => m.ChallengeView),
  { loading: () => <p role="status">正在加载字码挑战…</p> },
);

type AdvancedTab = "rhythm" | "scenario" | "season" | "challenge";

const tabs: Array<{ id: AdvancedTab; label: string; note: string }> = [
  { id: "rhythm", label: "节奏", note: "看清启动、波动与恢复" },
  { id: "scenario", label: "实战", note: "日常、办公与文学" },
  { id: "season", label: "阶段目标", note: "7 或 14 日同条件评测" },
  { id: "challenge", label: "字码挑战", note: "单字、词组与限时原码输入" },
];

const categoryLabels: Record<ScenarioCategory, string> = {
  daily: "日常",
  office: "办公",
  literature: "文学",
};

const RHYTHM_PRACTICE_TEXT =
  "窗外的风慢慢停下，桌上的纸页也恢复安静。先让手指找到熟悉的位置，再用平稳的节奏写完眼前这段话。遇到迟疑时不必追赶，只要看清停顿之后怎样重新开始。";
const PENDING_RHYTHM_SEGMENT_KEY = "wubi-test:pending-rhythm-segment:v1";

const EMPTY_ARCHIVE: AdvancedSeasonArchive = {
  version: 1,
  active: null,
  history: [],
};

function targetForSeason(
  season: AdvancedSeason,
  scenarios: AdvancedScenario[],
  sessions: SessionResult[],
): PracticeTarget {
  const day = season.days[season.currentDay - 1];
  const exactCategory = ["daily", "office", "literature"].includes(day.focus)
    ? (day.focus as ScenarioCategory)
    : null;
  const baselineScenario = scenarios.find((item) => item.id === "quiet-office-one") ?? scenarios[0];
  const adaptiveCategory = day.focus === "adaptive"
    ? selectWeakestScenarioCategory(season, sessions)
    : null;
  const selectedScenario = exactCategory || adaptiveCategory
    ? scenarios.find((item) => item.category === (exactCategory ?? adaptiveCategory))
    : ["baseline", "retest", "final", "adaptive", "integrated"].includes(day.focus)
      ? baselineScenario
      : undefined;
  const identitySource = selectedScenario ?? {
    id: `season-rhythm-${season.currentDay}`,
    version: 1,
    text: RHYTHM_PRACTICE_TEXT,
  };
  return {
    id: selectedScenario?.id ?? `season-rhythm-${season.currentDay}`,
    title: `第 ${season.currentDay} 天 · ${day.title}`,
    text: selectedScenario?.text ?? RHYTHM_PRACTICE_TEXT,
    type: selectedScenario ? "scenario" : "rhythm",
    category: selectedScenario?.category,
    season,
    seasonDay: season.currentDay,
    assessmentIdentity: buildAdvancedAssessmentIdentity(identitySource),
  };
}

const goalMetricOrder: AdvancedGoalMetric[] = [
  "speed",
  "characterAccuracy",
  "keyAccuracy",
  "codeLength",
  "phrase",
  "stability",
];

const goalMetricNotes: Record<AdvancedGoalMetric, string> = {
  speed: "在准确底线内观察有效速度",
  characterAccuracy: "减少错字和重复修正",
  keyAccuracy: "减少退格与无效按键成本",
  codeLength: "用更短编码完成相同正文",
  phrase: "提高连续上屏的词组比例",
  stability: "缩小整段输入的节奏波动",
};

function formatGoalValue(metric: AdvancedGoalMetric, value: number | null | undefined) {
  if (value === null || value === undefined) return "暂无";
  if (metric === "speed") return `${value.toFixed(1)} 字/分`;
  if (metric === "codeLength") return `${value.toFixed(2)} 键/字`;
  return `${value.toFixed(1)}%`;
}

function SeasonEvaluationView({
  season,
  currentIdentity,
}: {
  season: AdvancedSeason;
  currentIdentity?: AdvancedAssessmentIdentity;
}) {
  const evaluation = buildAdvancedSeasonEvaluation(season, currentIdentity);
  const metric = season.goal?.metric ?? "speed";
  const goalLabel = ADVANCED_GOAL_LABELS[metric];
  const stageRetestValue = evaluation.stageRetest
    ? getAdvancedGoalValue(evaluation.stageRetest.metrics, metric)
    : null;
  const tradeoffLabel = (
    value: "protected" | "cost" | "unavailable",
    protectedText: string,
    costText: string,
  ) => value === "unavailable" ? "暂无可比数据" : value === "protected" ? protectedText : costText;
  return (
    <section className="season-evaluation" aria-labelledby={`season-evaluation-${season.id}`}>
      <div>
        <span className="eyebrow">阶段评测 · {goalLabel}</span>
        <h3 id={`season-evaluation-${season.id}`}>基线、过程与复测</h3>
        <p className="season-status-note">{evaluation.message}</p>
      </div>
      <div className="season-evaluation-grid">
        <div><span>首日基线</span><strong>{formatGoalValue(metric, evaluation.primaryBaseline)}</strong></div>
        <div><span>过程平均</span><strong>{formatGoalValue(metric, evaluation.processAverage)}</strong><small>{evaluation.processSampleCount} 个过程样本，仅作观察</small></div>
        <div><span>阶段复测</span><strong>{formatGoalValue(metric, stageRetestValue)}</strong><small>仅比较同正文、同评测条件</small></div>
        <div><span>最终复测</span><strong>{formatGoalValue(metric, evaluation.primaryFinal)}</strong></div>
        <div><span>建议区间</span><strong>{season.goal?.targetMin === undefined || season.goal.targetMax === undefined ? "完成基线后生成" : `${formatGoalValue(metric, season.goal.targetMin)}–${formatGoalValue(metric, season.goal.targetMax)}`}</strong></div>
      </div>
      {evaluation.status === "comparable" && (
        <ul className="season-tradeoffs">
          <li>{evaluation.targetReached === null ? "目标仍待观察" : evaluation.targetReached ? "已进入建议观察区间" : "尚未进入建议观察区间"}</li>
          <li>字准：{tradeoffLabel(evaluation.tradeoffs.characterAccuracy, "未见明显代价", "出现下降代价")}</li>
          <li>键准：{tradeoffLabel(evaluation.tradeoffs.keyAccuracy, "未见明显代价", "出现下降代价")}</li>
          <li>码长：{tradeoffLabel(evaluation.tradeoffs.codeLength, "未见明显代价", "出现上升代价")}</li>
        </ul>
      )}
      <p className="season-status-note">
        {evaluation.confidence === "moderate"
          ? `已有 ${evaluation.retests.length} 个同正文样本，不使用单次最好成绩。`
          : evaluation.confidence === "limited"
            ? "可比样本较少，结果不代表长期水平。"
            : "数据不足时不会生成提升结论。"}
      </p>
    </section>
  );
}

export function AdvancedCenter({ playKeySound, initialTab = "rhythm" }: {
  playKeySound: KeySoundPlayer;
  initialTab?: AdvancedTab;
}) {
  const skin = useSkin();
  const router = useRouter();
  const [tab, setTab] = useState<AdvancedTab>(initialTab);
  const challengeLeaveRef = useRef<(() => boolean) | null>(null);
  useEffect(() => {
    if (initialTab === "challenge") {
      router.replace("/advanced?tab=challenge");
      return;
    }
    const requested = new URLSearchParams(window.location.search).get("tab");
    if (tabs.some((item) => item.id === requested)) setTab(requested as AdvancedTab);
  }, [initialTab, router]);
  const selectTab = (next: AdvancedTab) => {
    if (next === tab) return true;
    if (challengeLeaveRef.current && !challengeLeaveRef.current()) return false;
    setTab(next);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", next);
    window.history.replaceState(window.history.state, "", url);
    return true;
  };
  const [scenarios, setScenarios] = useState<AdvancedScenario[]>([]);
  const [practice, setPractice] = useState<PracticeTarget | null>(null);
  const [latestSession, setLatestSession] = useState<SessionResult | null>(null);
  const [archive, setArchive] = useState<AdvancedSeasonArchive>(EMPTY_ARCHIVE);
  const [repeat, setRepeat] = useState<{ target: PracticeTarget; completed: number } | null>(null);
  const [practiceKey, setPracticeKey] = useState(0);
  const [optionalPractice, setOptionalPractice] = useState<PracticeTarget | null>(null);
  const [seasonSaveFailed, setSeasonSaveFailed] = useState(false);
  const [seasonMessage, setSeasonMessage] = useState("");
  const [goalMetric, setGoalMetric] = useState<AdvancedGoalMetric>("speed");
  const [durationDays, setDurationDays] = useState<7 | 14>(14);
  const [seasonClock, setSeasonClock] = useState(() => Date.now());
  const [scenarioLoadError, setScenarioLoadError] = useState("");
  const [scenarioLoading, setScenarioLoading] = useState(true);
  const [scenarioLoadAttempt, setScenarioLoadAttempt] = useState(0);
  const [completionMessage, setCompletionMessage] = useState("");
  const seasonActionLockRef = useRef(false);
  const resultFocusRef = useRef<HTMLElement>(null);

  useEffect(() => {
    let active = true;
    setScenarioLoadError("");
    setScenarioLoading(true);
    loadArticles()
      .then((articles) => {
        if (active) {
          setScenarios(buildAdvancedScenarioLibrary(articles));
          setScenarioLoading(false);
        }
      })
      .catch((error: unknown) => {
        if (!active) return;
        setScenarios([]);
        setScenarioLoading(false);
        setScenarioLoadError(
          error instanceof Error ? error.message : "进阶实战题库加载失败",
        );
      });
    return () => {
      active = false;
    };
  }, [scenarioLoadAttempt]);

  useEffect(() => {
    if (practice || !completionMessage) return;
    const frame = window.requestAnimationFrame(() => resultFocusRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [completionMessage, practice]);

  useEffect(() => {
    setLatestSession(getSessions().find((session) => session.rhythmSummary) ?? null);
    const rawStored = readLocal<unknown>(STORAGE.advancedSeason, EMPTY_ARCHIVE);
    const stored = isAdvancedSeasonArchive(rawStored) ? rawStored : EMPTY_ARCHIVE;
    if (!isAdvancedSeasonArchive(rawStored)) {
      setSeasonSaveFailed(true);
      setSeasonMessage("阶段目标数据无法读取，原始数据已保留，请检查或恢复备份。");
    }
    if (stored.active) {
      const active = expireAdvancedSeason(stored.active);
      const normalized = archiveFinishedSeason(stored, active);
      setArchive(normalized);
      if (JSON.stringify(normalized) !== JSON.stringify(stored)) {
        void writeAdvancedSeasonArchive(stored, normalized).then((saved) => {
          if (!saved) setSeasonSaveFailed(true);
        });
      }
    } else {
      setArchive(stored);
    }
    try {
      const pending = takeSessionValue(PENDING_RHYTHM_SEGMENT_KEY);
      if (pending) {
        const segment = JSON.parse(pending) as Partial<RhythmWeakSegment>;
        const length = typeof segment.text === "string" ? Array.from(segment.text).length : 0;
        if (
          Number.isInteger(segment.start) &&
          Number(segment.start) >= 0 &&
          length >= 8 &&
          length <= 15 &&
          Number.isInteger(segment.delayMs) &&
          Number(segment.delayMs) >= 0 &&
          Number(segment.delayMs) <= 10 * 60 * 1000
        ) {
          const target: PracticeTarget = {
            id: `weak-${segment.start}`,
            title: "弱节奏片段三连练",
            text: segment.text!,
            type: "rhythm",
          };
          setRepeat({ target, completed: 0 });
          setPracticeKey((value) => value + 1);
          setPractice(target);
        }
      }
    } catch {
      // Malformed cross-route data is ignored; takeSessionValue already removes it safely.
    }
  }, []);

  useLocalDataSync(() => {
    const current = readAdvancedSeasonArchive();
    if (current) setArchive(current);
    setSeasonClock(Date.now());
  }, { keys: seasonSyncKeys, immediate: false });

  useEffect(() => {
    const baselineScenario = scenarios.find((item) => item.id === "quiet-office-one");
    if (!baselineScenario) return;
    const currentIdentity = buildAdvancedAssessmentIdentity(baselineScenario);
    let active = true;
    const current = readAdvancedSeasonArchive();
    if (!current?.active) return;
    const invalidated = invalidateAdvancedSeasonForContent(current.active, currentIdentity);
    if (invalidated === current.active) return;
    const next = archiveFinishedSeason(current, invalidated);
    void writeAdvancedSeasonArchive(current, next).then((saved) => {
      if (!active) return;
      if (!saved) {
        setSeasonSaveFailed(true);
        setSeasonMessage("正文变化状态未能保存，其他窗口可能已更新，请重试。");
        return;
      }
      setArchive(readAdvancedSeasonArchive() ?? next);
      setSeasonMessage("评测正文已经变化，旧周期已转为只读摘要。");
    });
    return () => { active = false; };
  }, [scenarios]);

  useEffect(() => {
    if (!archive.active) return;
    const now = new Date();
    const nextDay = new Date(now);
    nextDay.setHours(24, 0, 0, 100);
    const timer = window.setTimeout(
      () => setSeasonClock(Date.now()),
      Math.max(1_000, nextDay.getTime() - now.getTime()),
    );
    return () => window.clearTimeout(timer);
  }, [archive.active]);

  const startPractice = (target: PracticeTarget) => {
    setPracticeKey((value) => value + 1);
    setPractice(target);
  };

  const practiceWeakSegment = (segment: RhythmWeakSegment) => {
    const target: PracticeTarget = {
      id: `weak-${segment.start}`,
      title: "弱节奏片段三连练",
      text: segment.text,
      type: "rhythm",
    };
    setRepeat({ target, completed: 0 });
    startPractice(target);
  };

  const completePractice = (session: SessionResult) => {
    setLatestSession(session);
    setCompletionMessage(`${session.title}已完成，成绩已保存。`);
    const savedArchive = readAdvancedSeasonArchive();
    if (savedArchive) setArchive(savedArchive);
    const savedSeason = savedArchive?.active?.id === session.seasonId
      ? savedArchive?.active
      : savedArchive?.history.find((season) => season.id === session.seasonId);
    if (savedSeason?.days[(session.seasonDay ?? 1) - 1]?.sessionId === session.id) {
      setSeasonMessage(`第 ${session.seasonDay} 个训练日已完成，成绩已保存。`);
      setOptionalPractice({
        id: `optional-${session.seasonDay}`,
        title: `第 ${session.seasonDay} 天 · 可选三分钟短练`,
        text: Array.from(RHYTHM_PRACTICE_TEXT).slice(0, 48).join(""),
        type: "rhythm",
      });
    }
    if (repeat) {
      const completed = repeat.completed + 1;
      if (completed < 3) {
        const next = { ...repeat, completed };
        setRepeat(next);
        setPracticeKey((value) => value + 1);
        setPractice(next.target);
        return;
      }
      setRepeat(null);
    }
    setPractice(null);
  };

  const startSeason = async () => {
    if (archive.active || seasonActionLockRef.current) return;
    seasonActionLockRef.current = true;
    const season = createAdvancedSeason(createLocalId(), new Date(), {
      durationDays,
      goalMetric,
    });
    const next = { ...archive, active: season };
    if (await writeAdvancedSeasonArchive(archive, next)) {
      setArchive(next);
      setSeasonSaveFailed(false);
      setSeasonMessage("阶段目标已建立；完成第一天后会生成个人观察区间。");
    } else {
      setSeasonSaveFailed(true);
      setSeasonMessage("计划未能保存，其他页面可能已更新计划。请刷新后重试，并检查浏览器存储空间。");
    }
    window.setTimeout(() => { seasonActionLockRef.current = false; }, 0);
  };

  const updateSeason = async (
    update: (season: AdvancedSeason) => AdvancedSeason,
    successMessage: string,
  ) => {
    if (!archive.active || seasonActionLockRef.current) return;
    seasonActionLockRef.current = true;
    const season = update(archive.active);
    const next = archiveFinishedSeason(archive, season);
    if (await writeAdvancedSeasonArchive(archive, next)) {
      setArchive(next);
      setSeasonSaveFailed(false);
      setSeasonMessage(successMessage);
    } else {
      setSeasonSaveFailed(true);
      setSeasonMessage("计划状态未能保存，其他页面可能已更新计划。请刷新后重试，并检查浏览器存储空间。");
    }
    window.setTimeout(() => { seasonActionLockRef.current = false; }, 0);
  };

  const toggleSeasonPause = () => {
    if (archive.active?.status === "paused") {
      updateSeason((season) => resumeAdvancedSeason(season), "计划已继续，暂停时间不会占用完成窗口。");
    } else {
      updateSeason((season) => pauseAdvancedSeason(season), "计划已暂停，已有成绩和基线均会保留。");
    }
  };

  const cancelSeason = () => {
    if (!archive.active || !window.confirm("确定取消当前阶段目标吗？已有练习成绩会保留，周期只读摘要也会留在本机。")) return;
    updateSeason((season) => cancelAdvancedSeason(season), "阶段目标已取消；已有成绩没有删除。");
  };

  const startSeasonPractice = async () => {
    if (!archive.active || archive.active.status === "paused") return;
    const current = expireAdvancedSeason(archive.active);
    if (current.status !== "active") {
      const next = archiveFinishedSeason(archive, current);
      if (await writeAdvancedSeasonArchive(archive, next)) setArchive(next);
      else setSeasonSaveFailed(true);
      return;
    }
    if (!canCompleteAdvancedSeasonToday(current, new Date())) {
      setSeasonMessage("今天的核心任务已经完成，下一训练日会在本地日期变化后开放。");
      return;
    }
    startPractice(targetForSeason(current, scenarios, getSessions()));
  };

  const activeTab = tabs.find((item) => item.id === tab) ?? tabs[0];
  const latestSummary = latestSession?.rhythmSummary;
  const baselineScenario = scenarios.find((item) => item.id === "quiet-office-one");
  const currentBaselineIdentity = baselineScenario
    ? buildAdvancedAssessmentIdentity(baselineScenario)
    : undefined;
  const latestSeason = archive.history[0];
  const canTrainToday = archive.active
    ? canCompleteAdvancedSeasonToday(archive.active, new Date(seasonClock))
    : false;

  if (practice) {
    return (
      <section className="subpage advanced-page">
        <AdvancedPractice
          key={practiceKey}
          target={practice}
          playKeySound={playKeySound}
          roundLabel={repeat ? `三连复练 · 第 ${repeat.completed + 1} 轮` : practice.seasonDay ? `阶段目标 · 第 ${practice.seasonDay} 天` : undefined}
          onCancel={() => { setPractice(null); setRepeat(null); }}
          onSave={saveCurrentAdvancedPracticeOutcome}
          onComplete={completePractice}
        />
      </section>
    );
  }

  return (
    <section className="subpage advanced-page">
      <div className="subpage-heading advanced-heading">
        <span className="eyebrow">{skin === "focus" ? "熟练度 · 节奏 · 阶段目标" : "静流 · 高手进阶"}</span>
        <h1>{skin === "focus" ? "进阶训练" : "不催促，只看见节奏"}</h1>
        <p>{skin === "focus" ? "按今天的目标，选择字码挑战、节奏实验或中文实战。" : "从字码熟练度到输入节奏、中文实战与阶段目标，把熟练变成可以理解、可以复练的手感。"}</p>
      </div>
      <div className="advanced-tabs" role="tablist" aria-label="进阶训练模块">
        {tabs.map((item, index) => (
          <button
            key={item.id}
            id={`advanced-tab-${item.id}`}
            role="tab"
            aria-selected={tab === item.id}
            aria-controls="advanced-panel"
            tabIndex={tab === item.id ? 0 : -1}
            className={tab === item.id ? "active" : ""}
            onClick={() => selectTab(item.id)}
            onKeyDown={(event) => {
              if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
              event.preventDefault();
              const offset = event.key === "ArrowRight" ? 1 : -1;
              const next = tabs[(index + offset + tabs.length) % tabs.length];
              if (!selectTab(next.id)) return;
              window.requestAnimationFrame(() => document.getElementById(`advanced-tab-${next.id}`)?.focus());
            }}
          >
            <strong>{item.label}</strong>
            <span>{item.note}</span>
          </button>
        ))}
      </div>
      {scenarioLoadError && (tab === "scenario" || tab === "season") && (
        <ErrorState
          title="进阶实战题库没有加载成功"
          message={scenarioLoadError}
          onRetry={() => setScenarioLoadAttempt((value) => value + 1)}
        />
      )}
      {completionMessage && <p className="season-status-note" role="status" aria-live="polite">{completionMessage}</p>}
      <section
        ref={resultFocusRef}
        className="advanced-module"
        role="tabpanel"
        id="advanced-panel"
        aria-labelledby={`advanced-tab-${activeTab.id}`}
        tabIndex={-1}
      >
        {tab === "challenge" && <ChallengeView playKeySound={playKeySound} leaveGuardRef={challengeLeaveRef} />}
        {tab === "rhythm" && (
          <>
            <div className="advanced-module-heading">
              <div><span className="eyebrow">{skin === "focus" ? "节奏实验室" : "N1 · 节奏实验室"}</span><h2>先听见自己的输入节奏</h2></div>
              <button className="button primary" onClick={() => startPractice({ id: "rhythm-baseline", title: "节奏基线", text: RHYTHM_PRACTICE_TEXT, type: "rhythm" })}>开始节奏练习</button>
            </div>
            {latestSummary ? (
              <RhythmSummaryView summary={latestSummary} onPractice={practiceWeakSegment} />
            ) : (
              <div className="advanced-empty">完成一次节奏或实战练习后，这里会显示启动、波动、恢复与压缩曲线。</div>
            )}
          </>
        )}
        {tab === "scenario" && (
          <>
            <div className="advanced-module-heading">
              <div><span className="eyebrow">N2 · 中文实战场</span><h2>三种中文节奏，分别练习</h2></div>
            </div>
            {latestSession?.type === "scenario" && latestSession.rhythmSummary && (
              <div className="advanced-scenario-result">
                <div className="panel-title">
                  <div><span className="eyebrow">刚刚完成</span><h2>{latestSession.title}</h2></div>
                </div>
                <div className="rhythm-metric-grid">
                  <div><span>速度</span><strong>{latestSession.speed} 字/分</strong></div>
                  <div><span>字准</span><strong>{latestSession.accuracy.toFixed(1)}%</strong></div>
                  <div><span>实测码长</span><strong>{latestSession.codeLength.toFixed(2)}</strong></div>
                  <div><span>键速</span><strong>{latestSession.kps.toFixed(2)} 键/秒</strong></div>
                </div>
                <RhythmSummaryView summary={latestSession.rhythmSummary} onPractice={practiceWeakSegment} />
              </div>
            )}
            <div className="scenario-grid">
              {scenarios.map((scenario) => (
                <article key={scenario.id} className={`scenario-card ${scenario.category}`}>
                  <span>{categoryLabels[scenario.category]}</span>
                  <h3>{scenario.title}</h3>
                  <p>{scenario.category === "daily" ? "快速启动与句间恢复" : scenario.category === "office" ? "连续准确与清楚推进" : "长文耐力与后半程稳定"}</p>
                  <small>{Array.from(scenario.text.replace(/\s/g, "")).length} 字 · 约 {scenario.suggestedMinutes} 分钟</small>
                  <button className="button secondary" onClick={() => startPractice({ ...scenario, type: "scenario" })}>开始这项实战</button>
                </article>
              ))}
              {scenarioLoading && <div className="advanced-empty" role="status">实战题库正在准备，请稍后重试。</div>}
            </div>
          </>
        )}
        {tab === "season" && (
          <>
            <div className="advanced-module-heading">
              <div><span className="eyebrow">N3 · 阶段目标与评测</span><h2>只选一个主目标，用同一正文复测</h2></div>
            </div>
            {seasonMessage && <p className="season-status-note" role="status">{seasonMessage}</p>}
            {seasonSaveFailed && <p className="advanced-save-error" role="alert">计划状态未能保存，请检查浏览器存储空间。</p>}
            {archive.active ? (
              <>
                <div className="season-goal-card">
                  <div>
                    <span className="eyebrow">当前主目标</span>
                    <h3>{ADVANCED_GOAL_LABELS[archive.active.goal?.metric ?? "speed"]}</h3>
                    <p>{goalMetricNotes[archive.active.goal?.metric ?? "speed"]}</p>
                  </div>
                  <div>
                    <span>个人观察区间</span>
                    <strong>
                      {archive.active.goal?.targetMin === undefined || archive.active.goal.targetMax === undefined
                        ? "完成首日基线后生成"
                        : `${formatGoalValue(archive.active.goal.metric, archive.active.goal.targetMin)}–${formatGoalValue(archive.active.goal.metric, archive.active.goal.targetMax)}`}
                    </strong>
                  </div>
                  <div className="season-controls">
                    <button className="button secondary" onClick={toggleSeasonPause}>
                      {archive.active.status === "paused" ? "继续目标" : "暂停目标"}
                    </button>
                    <button className="button danger" onClick={cancelSeason}>取消目标</button>
                  </div>
                </div>
                <div className="season-layout">
                  <div className="season-progress-card">
                    <span>{archive.active.status === "paused" ? "计划已暂停" : "当前训练日"}</span>
                    <strong>{archive.active.currentDay}<small> / {getAdvancedSeasonDuration(archive.active)}</small></strong>
                    <p>{archive.active.days[archive.active.currentDay - 1].title}</p>
                    <button
                      className="button primary"
                      disabled={!scenarios.length || archive.active.status === "paused" || !canTrainToday}
                      onClick={startSeasonPractice}
                    >
                      {archive.active.status === "paused"
                        ? "继续目标后训练"
                        : canTrainToday
                          ? "开始今天的核心任务"
                          : "下一训练日明天开放"}
                    </button>
                    {optionalPractice && archive.active.status !== "paused" && (
                      <button
                        className="button secondary"
                        onClick={() => {
                          const target = optionalPractice;
                          setOptionalPractice(null);
                          startPractice(target);
                        }}
                      >
                        可选三分钟短练
                      </button>
                    )}
                  </div>
                  <ol className="season-day-list">
                    {archive.active.days.map((day) => (
                      <li key={day.day} className={day.completedAt ? "completed" : day.day === archive.active?.currentDay ? "current" : ""}>
                        <span>{day.day}</span><strong>{day.title}</strong><small>{day.completedAt ? "已完成" : day.day === archive.active?.currentDay ? archive.active.status === "paused" ? "暂停中" : "当前" : "待开始"}</small>
                      </li>
                    ))}
                  </ol>
                </div>
                <SeasonEvaluationView season={archive.active} currentIdentity={currentBaselineIdentity} />
              </>
            ) : (
              <>
                <div className="season-setup">
                  <div>
                    <span className="eyebrow">选择唯一主目标</span>
                    <h3>本周期最想验证什么？</h3>
                    <p>其他指标只作为保护项，不会和主目标争夺结论。</p>
                  </div>
                  <div className="season-goal-grid" role="group" aria-label="阶段训练主目标">
                    {goalMetricOrder.map((metric) => (
                      <button
                        key={metric}
                        className="season-goal-option"
                        aria-pressed={goalMetric === metric}
                        onClick={() => setGoalMetric(metric)}
                      >
                        <strong>{ADVANCED_GOAL_LABELS[metric]}</strong>
                        <span>{goalMetricNotes[metric]}</span>
                      </button>
                    ))}
                  </div>
                  <div className="season-duration-options" role="group" aria-label="训练周期长度">
                    {([7, 14] as const).map((duration) => (
                      <button key={duration} aria-pressed={durationDays === duration} onClick={() => setDurationDays(duration)}>
                        <strong>{duration} 个训练日</strong>
                        <span>{duration === 7 ? "未暂停时 10 天内完成" : "未暂停时 21 天内完成"}</span>
                      </button>
                    ))}
                  </div>
                  <p>首日完成固定正文后，系统才会按个人基线生成合理观察区间，不承诺固定提升幅度。</p>
                  <button className="button primary" disabled={scenarioLoading || !!scenarioLoadError || !scenarios.length} onClick={startSeason}>建立阶段目标</button>
                  {(scenarioLoading || scenarioLoadError) && <p role="status">{scenarioLoadError ? "题库加载失败，重试成功后才能建立目标。" : "题库准备完成后即可建立目标。"}</p>}
                </div>
                {latestSeason && (
                  <div className="season-history-summary">
                    <span className="eyebrow">最近一期只读摘要</span>
                    <strong>{latestSeason.status === "completed" ? "已完成" : latestSeason.status === "cancelled" ? "已取消" : latestSeason.status === "invalidated" ? "正文变化后失效" : "未完成"}</strong>
                    <SeasonEvaluationView season={latestSeason} currentIdentity={currentBaselineIdentity} />
                  </div>
                )}
              </>
            )}
          </>
        )}
      </section>
    </section>
  );
}
