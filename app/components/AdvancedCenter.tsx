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
  applyTypingDelaySample,
  calculateTypingMetrics,
  classifyWubiHand,
  countCommittedAttempts,
  createLocalId,
  getSessions,
  isWubiLetterKey,
  loadArticles,
  readLocal,
  saveAdvancedPracticeOutcome,
  savePracticeOutcome,
  shouldDeferInputCommit,
  STORAGE,
  takeSessionValue,
  writeLocal,
} from "../lib";
import {
  archiveFinishedSeason,
  buildAdvancedScenarioLibrary,
  completeAdvancedSeasonDay,
  createAdvancedSeason,
  expireAdvancedSeason,
  isAdvancedSeasonArchive,
  selectWeakestScenarioCategory,
  seasonComparison,
} from "../advanced-training";
import {
  buildRhythmSummary,
  MAX_PHYSICAL_RHYTHM_SAMPLES,
  type PhysicalRhythmSample,
} from "../rhythm-lab";
import type {
  AdvancedScenario,
  AdvancedSeason,
  AdvancedSeasonArchive,
  RhythmSummary,
  RhythmWeakSegment,
  ScenarioCategory,
  SessionResult,
} from "../types";
import { usePendingSaveGuard } from "./Ui";

type AdvancedTab = "rhythm" | "scenario" | "season";

interface PracticeTarget {
  id: string;
  title: string;
  text: string;
  type: "rhythm" | "scenario";
  category?: ScenarioCategory;
  season?: AdvancedSeason;
  seasonDay?: number;
}

const tabs: Array<{ id: AdvancedTab; label: string; note: string }> = [
  { id: "rhythm", label: "节奏", note: "看清启动、波动与恢复" },
  { id: "scenario", label: "实战", note: "日常、办公与文学" },
  { id: "season", label: "14 日计划", note: "按自己的节奏稳定进阶" },
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
  return (
    <div className="advanced-rhythm-curve" aria-label="压缩节奏曲线">
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
  const [saveFailed, setSaveFailed] = useState(false);
  usePendingSaveGuard(saveFailed);
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
      errors: Math.max(
        0,
        attemptCountRef.current - correctAttemptCountRef.current,
      ),
      keyCount: keyCountRef.current,
      rhythmSummary,
      scenarioId: target.type === "scenario" ? target.id : undefined,
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
        <button className="button secondary" disabled={saveFailed} onClick={onCancel}>
          退出本次练习
        </button>
        <button
          className="button secondary"
          disabled={!hasStarted || saveFailed}
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
  return {
    id: selectedScenario?.id ?? `season-rhythm-${season.currentDay}`,
    title: `第 ${season.currentDay} 天 · ${day.title}`,
    text: selectedScenario?.text ?? RHYTHM_PRACTICE_TEXT,
    type: selectedScenario ? "scenario" : "rhythm",
    category: selectedScenario?.category,
    season,
    seasonDay: season.currentDay,
  };
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

  useEffect(() => {
    loadArticles()
      .then((articles) => setScenarios(buildAdvancedScenarioLibrary(articles)))
      .catch(() => setScenarios([]));
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
    if (session.seasonId && archive.active?.id === session.seasonId) {
      const season = completeAdvancedSeasonDay(archive.active, session, new Date(session.date));
      const nextArchive = archiveFinishedSeason(archive, season);
      setArchive(nextArchive);
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
    const season = createAdvancedSeason(createLocalId());
    const next = { ...archive, active: season };
    if (writeLocal(STORAGE.advancedSeason, next)) {
      setArchive(next);
      setSeasonSaveFailed(false);
    } else {
      setSeasonSaveFailed(true);
    }
  };

  const startSeasonPractice = () => {
    if (!archive.active) return;
    const current = expireAdvancedSeason(archive.active);
    if (current.status !== "active") {
      const next = archiveFinishedSeason(archive, current);
      if (writeLocal(STORAGE.advancedSeason, next)) setArchive(next);
      else setSeasonSaveFailed(true);
      return;
    }
    startPractice(targetForSeason(current, scenarios, getSessions()));
  };

  const activeTab = tabs.find((item) => item.id === tab) ?? tabs[0];
  const latestSummary = latestSession?.rhythmSummary;
  const completedFinal = archive.history.find((season) => season.status === "completed");
  const finalSession = completedFinal?.days[13]?.sessionId
    ? getSessions().find((session) => session.id === completedFinal.days[13].sessionId) ?? null
    : null;
  const comparison = seasonComparison(completedFinal?.baseline, finalSession);

  if (practice) {
    return (
      <section className="subpage advanced-page">
        <AdvancedPractice
          key={practiceKey}
          target={practice}
          roundLabel={repeat ? `三连复练 · 第 ${repeat.completed + 1} 轮` : practice.seasonDay ? `十四日计划 · 第 ${practice.seasonDay} 天` : undefined}
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
        {tabs.map((item) => (
          <button
            key={item.id}
            role="tab"
            aria-selected={tab === item.id}
            aria-controls={`advanced-${item.id}`}
            className={tab === item.id ? "active" : ""}
            onClick={() => setTab(item.id)}
          >
            <strong>{item.label}</strong>
            <span>{item.note}</span>
          </button>
        ))}
      </div>
      <section className="advanced-module" role="tabpanel" id={`advanced-${tab}`} aria-label={activeTab.label}>
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
              {!scenarios.length && <div className="advanced-empty">实战题库正在准备，请稍后重试。</div>}
            </div>
          </>
        )}
        {tab === "season" && (
          <>
            <div className="advanced-module-heading">
              <div><span className="eyebrow">N3 · 十四日静流计划</span><h2>十四个训练日，最多二十一天完成</h2></div>
              {!archive.active && <button className="button primary" onClick={startSeason}>开始新的十四日计划</button>}
            </div>
            {archive.active ? (
              <div className="season-layout">
                <div className="season-progress-card">
                  <span>当前训练日</span>
                  <strong>{archive.active.currentDay}<small> / 14</small></strong>
                  <p>{archive.active.days[archive.active.currentDay - 1].title}</p>
                  <button className="button primary" disabled={!scenarios.length} onClick={startSeasonPractice}>开始今天的十五分钟</button>
                  {optionalPractice && (
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
                      <span>{day.day}</span><strong>{day.title}</strong><small>{day.completedAt ? "已完成" : day.day === archive.active?.currentDay ? "今天" : "待开始"}</small>
                    </li>
                  ))}
                </ol>
              </div>
            ) : (
              <div className="season-intro">
                {seasonSaveFailed && <p className="advanced-save-error">计划未能保存，请检查浏览器存储空间后重试。</p>}
                <p>漏练不会扣分，训练日会顺延。每天只有一项核心任务和一项可选短练，最终只与自己的第一天比较。</p>
                {comparison && (
                  <div className="season-comparison">
                    <strong>{comparison.accuracyProtected ? "最近一期完成得更稳" : "最近一期速度变化仍待巩固"}</strong>
                    <span>速度 {comparison.speedPercent === null ? "暂无" : `${comparison.speedPercent >= 0 ? "+" : ""}${comparison.speedPercent.toFixed(1)}%`}</span>
                    <span>字准 {comparison.accuracyPoints >= 0 ? "+" : ""}{comparison.accuracyPoints.toFixed(1)} 个百分点</span>
                    <span>节奏波动 {comparison.variationPoints === null ? "样本不足，无法判断" : `${comparison.variationPoints >= 0 ? "缩小" : "增加"} ${Math.abs(comparison.variationPoints).toFixed(1)} 个百分点`}</span>
                    <span>启动 {comparison.startupMs === null ? "样本不足，无法判断" : `${comparison.startupMs >= 0 ? "快" : "慢"} ${Math.abs(Math.round(comparison.startupMs))} 毫秒`}</span>
                    <span>恢复 {comparison.recoveryMs === null ? "样本不足，无法判断" : `${comparison.recoveryMs >= 0 ? "快" : "慢"} ${Math.abs(Math.round(comparison.recoveryMs))} 毫秒`}</span>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </section>
    </section>
  );
}
