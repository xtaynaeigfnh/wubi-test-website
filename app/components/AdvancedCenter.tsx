"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from "react";
import {
  createLocalId,
  getSessions,
  readLocal,
  saveAdvancedPracticeOutcome,
  savePracticeOutcome,
  STORAGE,
  takeSessionValue,
  writeLocal,
} from "../lib";
import { loadArticles } from "../content-loader";
import {
  applyTypingDelaySample,
  calculateKeyAccuracy,
  calculatePhraseRate,
  calculateTypingMetrics,
  classifyWubiHand,
  countCommittedEdit,
  countCommittedAttempts,
  isImeSelectionKey,
  isWubiLetterKey,
  shouldDeferInputCommit,
} from "../typing-metrics";
import {
  ADVANCED_GOAL_LABELS,
  archiveFinishedSeason,
  buildAdvancedAssessmentIdentity,
  buildAdvancedSeasonEvaluation,
  buildAdvancedScenarioLibrary,
  canCompleteAdvancedSeasonToday,
  cancelAdvancedSeason,
  completeAdvancedSeasonDay,
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
import {
  buildRhythmSummary,
  MAX_PHYSICAL_RHYTHM_SAMPLES,
  type PhysicalRhythmSample,
} from "../rhythm-lab";
import type {
  AdvancedScenario,
  AdvancedAssessmentIdentity,
  AdvancedGoalMetric,
  AdvancedSeason,
  AdvancedSeasonArchive,
  RhythmSummary,
  RhythmWeakSegment,
  ScenarioCategory,
  SessionResult,
} from "../types";
import { ErrorState, usePendingSaveGuard } from "./Ui";

type AdvancedTab = "rhythm" | "scenario" | "season";

interface PracticeTarget {
  id: string;
  title: string;
  text: string;
  type: "rhythm" | "scenario";
  category?: ScenarioCategory;
  season?: AdvancedSeason;
  seasonDay?: number;
  assessmentIdentity?: AdvancedAssessmentIdentity;
}

const tabs: Array<{ id: AdvancedTab; label: string; note: string }> = [
  { id: "rhythm", label: "节奏", note: "看清启动、波动与恢复" },
  { id: "scenario", label: "实战", note: "日常、办公与文学" },
  { id: "season", label: "阶段目标", note: "7 或 14 日同条件评测" },
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

function ms(value: number | null): string {
  return value === null ? "暂无" : `${Math.round(value)} 毫秒`;
}

function RhythmCurve({ summary }: { summary: RhythmSummary }) {
  const max = Math.max(1, ...summary.curve.map((point) => point.intervalMs));
  const curveLabel = summary.curve.length
    ? `压缩节奏曲线，共 ${summary.curve.length} 个采样点，中位间隔${ms(summary.medianIntervalMs)}，第九十分位间隔${ms(summary.p90IntervalMs)}`
    : "压缩节奏曲线，本次没有足够数据";
  return (
    <div className="advanced-rhythm-curve" role="img" aria-label={curveLabel}>
      {summary.curve.map((point, index) => (
        <i
          key={point.characterCount}
          style={{
            "--rhythm-index": index,
            height: `${Math.max(8, (point.intervalMs / max) * 100)}%`,
          } as CSSProperties}
          title={`第 ${point.characterCount} 字附近 ${point.intervalMs} 毫秒`}
        />
      ))}
      {!summary.curve.length && <span>本次没有足够数据绘制曲线</span>}
    </div>
  );
}

export function RhythmSummaryView({
  summary,
  onPractice,
}: {
  summary: RhythmSummary;
  onPractice?: (segment: RhythmWeakSegment) => void;
}) {
  const secondHalfChange =
    summary.firstHalfMedianMs && summary.secondHalfMedianMs
      ? ((summary.secondHalfMedianMs - summary.firstHalfMedianMs) /
          summary.firstHalfMedianMs) *
        100
      : null;
  return (
    <section className="rhythm-result" aria-labelledby="rhythm-result-title">
      <div className="panel-title">
        <div>
          <span className="eyebrow">本次节奏</span>
          <h2 id="rhythm-result-title">上屏间隔与恢复</h2>
        </div>
        <span>{summary.characterCount} 字样本</span>
      </div>
      <div className="rhythm-metric-grid">
        <div><span>启动</span><strong>{ms(summary.startupMs)}</strong></div>
        <div><span>中位间隔</span><strong>{ms(summary.medianIntervalMs)}</strong></div>
        <div><span>波动</span><strong>{summary.variationPercent === null ? "暂无" : `${summary.variationPercent}%`}</strong></div>
        <div><span>恢复</span><strong>{ms(summary.recoveryMs)}</strong></div>
        <div><span>最快十字</span><strong>{summary.fastestTenCpm === null ? "暂无" : `${summary.fastestTenCpm} 字/分`}</strong></div>
        <div><span>后半程</span><strong>{secondHalfChange === null ? "暂无" : `${secondHalfChange > 0 ? "慢 " : "快 "}${Math.abs(secondHalfChange).toFixed(1)}%`}</strong></div>
      </div>
      <RhythmCurve summary={summary} />
      <div className="rhythm-hand-note">
        <span>同手间隔 {ms(summary.sameHandMedianMs)}</span>
        <span>换手间隔 {ms(summary.crossHandMedianMs)}</span>
        <span>P90 间隔 {ms(summary.p90IntervalMs)}</span>
      </div>
      {!!summary.weakSegments.length && onPractice && (
        <div className="rhythm-weak-list">
          <h3>值得再练三次的片段</h3>
          {summary.weakSegments.map((segment) => (
            <button key={`${segment.start}-${segment.text}`} onClick={() => onPractice(segment)}>
              <span>{segment.text}</span>
              <small>最慢停顿 {segment.delayMs} 毫秒 · 三连复练</small>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

function AdvancedPractice({
  target,
  roundLabel,
  onCancel,
  onSave,
  onComplete,
}: {
  target: PracticeTarget;
  roundLabel?: string;
  onCancel: () => void;
  onSave: (session: SessionResult) => boolean;
  onComplete: (session: SessionResult) => void;
}) {
  const cleanTarget = useMemo(() => target.text.replace(/\s+/g, ""), [target.text]);
  const targetCharacters = useMemo(() => Array.from(cleanTarget), [cleanTarget]);
  const dailyLines = useMemo(
    () => target.category === "daily"
      ? target.text.split("\n").map((line) => Array.from(line.replace(/\s/g, ""))).filter((line) => line.length)
      : null,
    [target.category, target.text],
  );
  const [typed, setTyped] = useState("");
  const [inputValue, setInputValue] = useState("");
  const [paused, setPaused] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [finished, setFinished] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  usePendingSaveGuard(
    saveFailed || (hasStarted && !finished),
    saveFailed
      ? "本次成绩尚未保存，请先重试保存。"
      : "练习正在进行，退出会丢失本次输入。",
  );
  const startedAtRef = useRef<number | null>(null);
  const lastCommitAtRef = useRef<number | null>(null);
  const inactiveAtRef = useRef<number | null>(null);
  const inactiveMsRef = useRef(0);
  const pauseAtRef = useRef<number | null>(null);
  const pausedMsRef = useRef(0);
  const delaysRef = useRef<number[]>([]);
  const physicalRef = useRef<PhysicalRhythmSample[]>([]);
  const keyCountRef = useRef(0);
  const letterKeysRef = useRef(0);
  const backspaceCountRef = useRef(0);
  const correctionCountRef = useRef(0);
  const selectionCountRef = useRef(0);
  const phraseCharsRef = useRef(0);
  const pauseCountRef = useRef(0);
  const attemptCountRef = useRef(0);
  const correctAttemptCountRef = useRef(0);
  const pendingSaveRef = useRef<SessionResult | null>(null);
  const retrySaveLockRef = useRef(false);
  const finishedRef = useRef(false);
  const composingRef = useRef(false);
  const committedRef = useRef("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const compositionCommitTimerRef = useRef<number | null>(null);

  const activeElapsed = useCallback((now: number) => {
    if (startedAtRef.current === null) return 0;
    const currentPause = pauseAtRef.current === null ? 0 : now - pauseAtRef.current;
    const currentInactive = inactiveAtRef.current === null ? 0 : now - inactiveAtRef.current;
    return Math.max(
      0,
      now - startedAtRef.current - pausedMsRef.current - inactiveMsRef.current - currentPause - currentInactive,
    );
  }, []);

  useEffect(() => {
    const onVisibility = () => {
      const now = performance.now();
      if (document.visibilityState === "hidden") {
        if (
          startedAtRef.current === null ||
          pauseAtRef.current !== null ||
          inactiveAtRef.current !== null
        ) return;
        inactiveAtRef.current = now;
      } else if (inactiveAtRef.current !== null) {
        inactiveMsRef.current += Math.max(0, now - inactiveAtRef.current);
        inactiveAtRef.current = null;
        lastCommitAtRef.current = activeElapsed(now);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [activeElapsed]);

  useEffect(
    () => () => {
      if (compositionCommitTimerRef.current !== null) {
        window.clearTimeout(compositionCommitTimerRef.current);
      }
    },
    [],
  );

  const startTimer = () => {
    if (startedAtRef.current !== null) return;
    startedAtRef.current = performance.now();
    setHasStarted(true);
  };

  const finish = (committed: string) => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    setFinished(true);
    const now = performance.now();
    const durationSeconds = Math.max(0.1, activeElapsed(now) / 1000);
    const metrics = calculateTypingMetrics({
      typed: committed,
      target: cleanTarget,
      durationSeconds,
      keyCount: keyCountRef.current,
      letterKeys: letterKeysRef.current,
      attemptCount: attemptCountRef.current,
      correctAttemptCount: correctAttemptCountRef.current,
    });
    const rhythmSummary = buildRhythmSummary({
      text: cleanTarget,
      delays: delaysRef.current,
      physicalSamples: physicalRef.current,
    });
    const session: SessionResult = {
      id: createLocalId(),
      type: target.type,
      title: target.title,
      date: new Date().toISOString(),
      durationSeconds,
      ...metrics,
      keyAccuracy: calculateKeyAccuracy({
        keyCount: keyCountRef.current,
        backspaceCount: backspaceCountRef.current,
        correctionCount: correctionCountRef.current,
        codeLength: metrics.codeLength,
      }),
      phraseRate: calculatePhraseRate(phraseCharsRef.current, metrics.correctChars),
      errors: Math.max(
        0,
        attemptCountRef.current - correctAttemptCountRef.current,
      ),
      keyCount: keyCountRef.current,
      backspaceCount: backspaceCountRef.current,
      correctionCount: correctionCountRef.current,
      selectionCount: selectionCountRef.current,
      pauseCount: pauseCountRef.current,
      pauseSeconds: pausedMsRef.current / 1000,
      rhythmSummary,
      scenarioId: target.type === "scenario" ? target.id : undefined,
      assessmentIdentity: target.assessmentIdentity,
      seasonId: target.season?.id,
      seasonDay: target.seasonDay,
    };
    pendingSaveRef.current = session;
    if (!onSave(session)) {
      setSaveFailed(true);
      return;
    }
    pendingSaveRef.current = null;
    onComplete(session);
  };

  const retrySave = () => {
    const session = pendingSaveRef.current;
    if (!session || retrySaveLockRef.current) return;
    retrySaveLockRef.current = true;
    if (!onSave(session)) {
      retrySaveLockRef.current = false;
      return;
    }
    pendingSaveRef.current = null;
    retrySaveLockRef.current = false;
    setSaveFailed(false);
    onComplete(session);
  };

  const commitValue = (value: string) => {
    if (paused || finishedRef.current) return;
    const committed = Array.from(value.replace(/[\r\n\s]/g, ""))
      .slice(0, targetCharacters.length)
      .join("");
    const previous = committedRef.current;
    if (committed === previous) {
      setInputValue(committed);
      return;
    }
    const now = performance.now();
    if (committed && startedAtRef.current === null) {
      startedAtRef.current = now;
      setHasStarted(true);
    }
    const elapsed = activeElapsed(now);
    const transition = lastCommitAtRef.current === null ? elapsed : Math.max(0, elapsed - lastCommitAtRef.current);
    const attempt = countCommittedAttempts(previous, committed, cleanTarget);
    const edit = countCommittedEdit(previous, committed);
    correctionCountRef.current += edit.removed;
    phraseCharsRef.current += edit.phraseChars;
    attemptCountRef.current += attempt.attempts;
    correctAttemptCountRef.current += attempt.correct;
    if (Array.from(committed).length >= Array.from(previous).length) {
      delaysRef.current = applyTypingDelaySample({
        previous,
        next: committed,
        target: cleanTarget,
        delayMs: transition,
        delays: delaysRef.current,
      });
      lastCommitAtRef.current = elapsed;
    }
    committedRef.current = committed;
    setInputValue(committed);
    setTyped(committed);
    if (Array.from(committed).length >= targetCharacters.length) finish(committed);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (paused || finishedRef.current) return;
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const now = performance.now();
    if (
      startedAtRef.current === null &&
      (event.key.length === 1 || event.key === "Process" || event.key === "Unidentified")
    ) {
      startTimer();
    }
    if (!["Shift", "Control", "Alt", "Meta", "CapsLock"].includes(event.key)) {
      keyCountRef.current += 1;
    }
    if (event.key === "Backspace") backspaceCountRef.current += 1;
    if (
      (composingRef.current || event.nativeEvent.isComposing) &&
      isImeSelectionKey(event.key)
    ) {
      selectionCountRef.current += 1;
    }
    if (isWubiLetterKey(event.key, event.code)) {
      letterKeysRef.current += 1;
      const hand = classifyWubiHand(event.key, event.code);
      if (hand && physicalRef.current.length < MAX_PHYSICAL_RHYTHM_SAMPLES) {
        physicalRef.current.push({ elapsedMs: activeElapsed(now), hand });
      }
    }
  };

  const togglePause = () => {
    if (startedAtRef.current === null) return;
    const now = performance.now();
    if (paused) {
      if (pauseAtRef.current !== null) pausedMsRef.current += Math.max(0, now - pauseAtRef.current);
      pauseAtRef.current = null;
      lastCommitAtRef.current = activeElapsed(now);
      setPaused(false);
    } else {
      pauseAtRef.current = now;
      pauseCountRef.current += 1;
      setPaused(true);
    }
  };

  const typedCharacters = Array.from(typed);
  let displayStart = 0;
  let displayCharacters = targetCharacters;
  let dailyLineNumber = 0;
  if (dailyLines) {
    dailyLineNumber = dailyLines.findIndex((_, index) =>
      typedCharacters.length < dailyLines
        .slice(0, index + 1)
        .reduce((sum, line) => sum + line.length, 0),
    );
    if (dailyLineNumber < 0) dailyLineNumber = dailyLines.length - 1;
    displayStart = dailyLines.slice(0, dailyLineNumber).reduce((sum, line) => sum + line.length, 0);
    displayCharacters = dailyLines[dailyLineNumber] ?? targetCharacters;
  }
  return (
    <section className="advanced-practice" aria-labelledby="advanced-practice-title">
      <div className="panel-title">
        <div>
          <span className="eyebrow">{roundLabel ?? "静流练习"}</span>
          <h2 id="advanced-practice-title">{target.title}</h2>
        </div>
        <span>{dailyLines ? `第 ${dailyLineNumber + 1} / ${dailyLines.length} 句 · ` : ""}{typedCharacters.length} / {targetCharacters.length}</span>
      </div>
      <div className="advanced-practice-text" aria-label="练习正文">
        {displayCharacters.map((character, index) => {
          const absoluteIndex = displayStart + index;
          return (
          <span
            key={absoluteIndex}
            className={
              absoluteIndex < typedCharacters.length
                ? typedCharacters[absoluteIndex] === character ? "correct" : "wrong"
                : absoluteIndex === typedCharacters.length ? "current" : ""
            }
          >
            {character}
          </span>
          );
        })}
      </div>
      <textarea
        ref={inputRef}
        autoFocus
        value={inputValue}
        disabled={paused || saveFailed}
        aria-label="进阶训练输入区"
        placeholder={paused ? "练习已暂停" : "在这里开始输入"}
        onKeyDown={onKeyDown}
        onPaste={(event) => event.preventDefault()}
        onDrop={(event) => event.preventDefault()}
        onBeforeInput={(event) => {
          const inputType = (event.nativeEvent as InputEvent).inputType;
          if (inputType === "insertFromPaste" || inputType === "insertFromDrop") {
            event.preventDefault();
          }
        }}
        onChange={(event) => {
          const next = event.target.value;
          const nativeEvent = event.nativeEvent as InputEvent;
          if (
            shouldDeferInputCommit(
              composingRef.current,
              nativeEvent.isComposing,
            )
          ) {
            setInputValue(next);
            return;
          }
          commitValue(next);
        }}
        onCompositionStart={() => {
          composingRef.current = true;
          startTimer();
        }}
        onCompositionEnd={(event) => {
          composingRef.current = false;
          const endedValue = event.currentTarget.value;
          if (compositionCommitTimerRef.current !== null) {
            window.clearTimeout(compositionCommitTimerRef.current);
          }
          compositionCommitTimerRef.current = window.setTimeout(() => {
            compositionCommitTimerRef.current = null;
            commitValue(inputRef.current?.value ?? endedValue);
          }, 0);
        }}
      />
      {saveFailed && (
        <div className="advanced-save-error" role="alert">
          <p>本次成绩未保存，请检查浏览器存储空间后重试。</p>
          <button className="button danger" onClick={retrySave}>重试保存</button>
        </div>
      )}
      <div className="advanced-practice-actions">
        <button
          className="button secondary"
          disabled={saveFailed}
          onClick={() => {
            if (hasStarted && !finished && !window.confirm("退出会丢失本次输入，确定退出吗？")) return;
            onCancel();
          }}
        >
          退出本次练习
        </button>
        <button
          className="button secondary"
          disabled={!hasStarted || saveFailed}
          aria-pressed={paused}
          onClick={togglePause}
        >
          {paused ? "继续" : "暂停"}
        </button>
      </div>
    </section>
  );
}

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

export function AdvancedCenter() {
  const [tab, setTab] = useState<AdvancedTab>("rhythm");
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
      writeLocal(STORAGE.advancedSeason, EMPTY_ARCHIVE);
    }
    if (stored.active) {
      const active = expireAdvancedSeason(stored.active);
      const normalized = archiveFinishedSeason(stored, active);
      setArchive(normalized);
      if (JSON.stringify(normalized) !== JSON.stringify(stored)) {
        writeLocal(STORAGE.advancedSeason, normalized);
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

  useEffect(() => {
    const baselineScenario = scenarios.find((item) => item.id === "quiet-office-one");
    if (!baselineScenario) return;
    const currentIdentity = buildAdvancedAssessmentIdentity(baselineScenario);
    setArchive((current) => {
      if (!current.active) return current;
      const invalidated = invalidateAdvancedSeasonForContent(
        current.active,
        currentIdentity,
      );
      if (invalidated === current.active) return current;
      const next = archiveFinishedSeason(current, invalidated);
      if (!writeLocal(STORAGE.advancedSeason, next)) {
        setSeasonSaveFailed(true);
        setSeasonMessage("正文变化状态未能保存，请检查浏览器存储空间。");
        return current;
      }
      setSeasonMessage("评测正文已经变化，旧周期已转为只读摘要。");
      return next;
    });
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
    if (session.seasonId && archive.active?.id === session.seasonId) {
      const season = completeAdvancedSeasonDay(archive.active, session, new Date(session.date));
      const nextArchive = archiveFinishedSeason(archive, season);
      setArchive(nextArchive);
      if (season.days[(session.seasonDay ?? 1) - 1]?.sessionId === session.id) {
        setSeasonMessage(`第 ${session.seasonDay} 个训练日已完成，成绩已保存。`);
      }
      if (season.days[(session.seasonDay ?? 1) - 1]?.sessionId === session.id) {
        setOptionalPractice({
          id: `optional-${session.seasonDay}`,
          title: `第 ${session.seasonDay} 天 · 可选三分钟短练`,
          text: Array.from(RHYTHM_PRACTICE_TEXT).slice(0, 48).join(""),
          type: "rhythm",
        });
      }
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

  const startSeason = () => {
    if (archive.active || seasonActionLockRef.current) return;
    seasonActionLockRef.current = true;
    const season = createAdvancedSeason(createLocalId(), new Date(), {
      durationDays,
      goalMetric,
    });
    const next = { ...archive, active: season };
    if (writeLocal(STORAGE.advancedSeason, next)) {
      setArchive(next);
      setSeasonSaveFailed(false);
      setSeasonMessage("阶段目标已建立；完成第一天后会生成个人观察区间。");
    } else {
      setSeasonSaveFailed(true);
      setSeasonMessage("计划未能保存，请检查浏览器存储空间后重试。");
    }
    window.setTimeout(() => { seasonActionLockRef.current = false; }, 0);
  };

  const updateSeason = (
    update: (season: AdvancedSeason) => AdvancedSeason,
    successMessage: string,
  ) => {
    if (!archive.active || seasonActionLockRef.current) return;
    seasonActionLockRef.current = true;
    const season = update(archive.active);
    const next = archiveFinishedSeason(archive, season);
    if (writeLocal(STORAGE.advancedSeason, next)) {
      setArchive(next);
      setSeasonSaveFailed(false);
      setSeasonMessage(successMessage);
    } else {
      setSeasonSaveFailed(true);
      setSeasonMessage("计划状态未能保存，原状态保持不变。");
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

  const startSeasonPractice = () => {
    if (!archive.active || archive.active.status === "paused") return;
    const current = expireAdvancedSeason(archive.active);
    if (current.status !== "active") {
      const next = archiveFinishedSeason(archive, current);
      if (writeLocal(STORAGE.advancedSeason, next)) setArchive(next);
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
          roundLabel={repeat ? `三连复练 · 第 ${repeat.completed + 1} 轮` : practice.seasonDay ? `阶段目标 · 第 ${practice.seasonDay} 天` : undefined}
          onCancel={() => { setPractice(null); setRepeat(null); }}
          onSave={(session) => {
            if (!session.seasonId || archive.active?.id !== session.seasonId) {
              return savePracticeOutcome(session);
            }
            const season = completeAdvancedSeasonDay(archive.active, session, new Date(session.date));
            return saveAdvancedPracticeOutcome(
              session,
              archiveFinishedSeason(archive, season),
            );
          }}
          onComplete={completePractice}
        />
      </section>
    );
  }

  return (
    <section className="subpage advanced-page">
      <div className="subpage-heading advanced-heading">
        <span className="eyebrow">静流 · 高手进阶</span>
        <h1>不催促，只看见节奏</h1>
        <p>从一次输入的启动、稳定与恢复出发，把熟练变成可以理解、可以复练的手感。</p>
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
            onClick={() => setTab(item.id)}
            onKeyDown={(event) => {
              if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
              event.preventDefault();
              const offset = event.key === "ArrowRight" ? 1 : -1;
              const next = tabs[(index + offset + tabs.length) % tabs.length];
              setTab(next.id);
              window.requestAnimationFrame(() => document.getElementById(`advanced-tab-${next.id}`)?.focus());
            }}
          >
            <strong>{item.label}</strong>
            <span>{item.note}</span>
          </button>
        ))}
      </div>
      {scenarioLoadError && tab !== "rhythm" && (
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
        {tab === "rhythm" && (
          <>
            <div className="advanced-module-heading">
              <div><span className="eyebrow">N1 · 节奏实验室</span><h2>先听见自己的输入节奏</h2></div>
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
