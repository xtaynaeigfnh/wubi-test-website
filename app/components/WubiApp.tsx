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
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  addCustomArticlesWithinLimit,
  addHesitationQueueItem,
  buildCommonPracticeArticle,
  buildCustomArticle,
  commonCharacterPresets,
  createLocalId,
  defaultCustomTheme,
  defaultSettings,
  formatDuration,
  getCustomArticles,
  getProgress,
  getSessions,
  lengthLabels,
  MAX_CUSTOM_TEXT_LENGTH,
  readLocal,
  readLocalArray,
  readHesitationQueue,
  readSettings,
  readTrainingPlan,
  recordKeyUsage,
  saveHesitationPracticeOutcome,
  savePracticeOutcome,
  isCommonPracticeArticle,
  localDateKey,
  selectInitialArticle,
  startHesitationQueueItem,
  STORAGE,
  writeLocal,
  type PhraseOpportunityInput,
} from "../lib";
import {
  FALLBACK_ARTICLE_COUNT,
  loadArticles,
  loadCommonCharacters,
  loadWubi,
} from "../content-loader";
import {
  applyTypingDelaySample,
  buildMinimumCodeLengthIndex,
  buildTypingHeatmap,
  calculateActiveDurationSeconds,
  calculateKeyAccuracy,
  calculatePhraseRate,
  calculateTheoreticalMinimumCodeLength,
  calculateTypingTransitionMs,
  calculateTypingMetrics,
  canCompleteTyping,
  classifyWubiHand,
  countCommittedEdit,
  countCommittedAttempts,
  getCommittedEditRange,
  getHesitationLevel,
  isImeSelectionKey,
  isWubiLetterKey,
  preferShortestWubiCodes,
  shouldDeferInputCommit,
  type MinimumCodeLengthIndex,
} from "../typing-metrics";
import {
  analyzeCodeLengthCoach,
  buildCodeLengthCoachIndex,
  type CodeLengthCoachIndex,
} from "../code-length-coach";
import {
  buildGhostTimeline,
  compareGhostSegments,
  getGhostArticleIdentity,
  getGhostElapsedAtProgress,
  getGhostPositionAtElapsed,
  getGhostSampleStep,
  selectGhostSessions,
  type GhostProgressPoint,
} from "../ghost-race";
import type {
  AppView,
  ArticleFilter,
  ArticleProgress,
  CommonCharacterData,
  CommonCharacterPreset,
  GhostTimeline,
  HesitationPracticeAttempt,
  HesitationPracticeQueue,
  HesitationPracticeTarget,
  PracticeArticle,
  SessionResult,
  ThemeId,
  UserSettings,
  WeakObservation,
} from "../types";
import {
  buildHesitationObservations,
  buildHesitationPracticeResult,
  buildHesitationSession,
} from "../hesitation-practice";
import { downloadShareCard } from "../share-card";
import { TrainingCenter } from "./TrainingCenter";
import { AdvancedCenter, RhythmSummaryView } from "./AdvancedCenter";
import {
  DiagnosticMetric,
  ErrorState,
  Modal,
  usePendingSaveGuard,
} from "./Ui";
import { KeySummary } from "./KeySummary";
import { HesitationHeatmap } from "./HesitationHeatmap";
import { HesitationPracticeModal } from "./HesitationPracticeModal";
import { LookupView } from "./views/LookupView";
import { SettingsView } from "./views/SettingsView";
import { ChallengeView } from "./views/ChallengeView";
import { HistoryView } from "./views/HistoryView";
import { openRhythmSegmentPractice } from "../rhythm-navigation";
import { buildCustomThemeVariables, themeLabels } from "../theme";
import {
  buildRhythmSummary,
  MAX_PHYSICAL_RHYTHM_SAMPLES,
  type PhysicalRhythmSample,
} from "../rhythm-lab";

type GhostMode = "off" | "best" | "recent";

const basicThemeCycle: Record<"system" | "light" | "dark", ThemeId> = {
  system: "light",
  light: "dark",
  dark: "system",
};

function getNextQuickTheme(theme: ThemeId): ThemeId {
  return theme === "system" || theme === "light" || theme === "dark"
    ? basicThemeCycle[theme]
    : "system";
}

const navItems: Array<{
  view: AppView;
  href: string;
  label: string;
  coordinate: string;
}> = [
  { view: "typing", href: "/", label: "文章测速", coordinate: "QW" },
  { view: "training", href: "/training", label: "今日训练", coordinate: "ER" },
  { view: "advanced", href: "/advanced", label: "进阶", coordinate: "DF" },
  { view: "challenge", href: "/challenge", label: "字码挑战", coordinate: "TY" },
  { view: "lookup", href: "/lookup", label: "五笔查码", coordinate: "UI" },
  { view: "history", href: "/history", label: "本地成绩", coordinate: "OP" },
  { view: "summary", href: "/summary", label: "统计", coordinate: "JK" },
  { view: "settings", href: "/settings", label: "设置", coordinate: "AS" },
];

const isNavItemActive = (view: AppView, itemView: AppView) => view === itemView;

type KeySoundPlayer = (options?: { force?: boolean }) => void;

type HesitationAttemptTuple = [
  HesitationPracticeAttempt,
  HesitationPracticeAttempt,
  HesitationPracticeAttempt,
];

interface ActiveHesitationPractice {
  target: HesitationPracticeTarget;
  queueItemId?: string;
}

function useKeySound(enabled: boolean): KeySoundPlayer {
  const audioContextRef = useRef<AudioContext | null>(null);

  useEffect(
    () => () => {
      void audioContextRef.current?.close();
    },
    [],
  );

  return useCallback(
    ({ force = false } = {}) => {
      if (!enabled && !force) return;
      const AudioContextClass =
        window.AudioContext ||
        (
          window as typeof window & {
            webkitAudioContext?: typeof AudioContext;
          }
        ).webkitAudioContext;
      if (!AudioContextClass) return;

      const context =
        audioContextRef.current ??
        (audioContextRef.current = new AudioContextClass());
      const emit = () => {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = "sine";
        oscillator.frequency.value = 620;
        gain.gain.setValueAtTime(0.045, context.currentTime);
        gain.gain.exponentialRampToValueAtTime(
          0.0001,
          context.currentTime + 0.04,
        );
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start();
        oscillator.stop(context.currentTime + 0.04);
      };

      if (context.state === "suspended") {
        void context.resume().then(emit, () => undefined);
      } else {
        emit();
      }
    },
    [enabled],
  );
}

export function WubiApp({ view }: { view: AppView }) {
  const [settings, setSettings] = useState<UserSettings>(defaultSettings);
  const [settingsReady, setSettingsReady] = useState(false);
  const [settingsSaveError, setSettingsSaveError] = useState("");
  const [hesitationQueue, setHesitationQueue] =
    useState<HesitationPracticeQueue | null>(null);
  const [masteredAtByFingerprint, setMasteredAtByFingerprint] = useState(
    new Map<string, string>(),
  );
  const [activeHesitationPractice, setActiveHesitationPractice] =
    useState<ActiveHesitationPractice | null>(null);
  const [hesitationSaveRevision, setHesitationSaveRevision] = useState(0);
  const mainNavRef = useRef<HTMLElement>(null);
  const playKeySound = useKeySound(settings.sound);

  const refreshHesitationState = useCallback(() => {
    setHesitationQueue(readHesitationQueue());
    const mastered = new Map<string, string>();
    for (const session of getSessions()) {
      const practice = session.hesitationPractice;
      if (!practice || practice.outcome !== "mastered") continue;
      const previous = mastered.get(practice.target.fingerprint);
      if (!previous || previous < practice.completedAt) {
        mastered.set(practice.target.fingerprint, practice.completedAt);
      }
    }
    setMasteredAtByFingerprint(mastered);
  }, []);

  useEffect(refreshHesitationState, [refreshHesitationState]);

  const addHesitationToQueue = useCallback(
    (target: HesitationPracticeTarget) => {
      const result = addHesitationQueueItem(target);
      setHesitationQueue(result.queue);
      if (result.result === "duplicate") {
        window.alert("这一段已在今日加练中。");
      } else if (result.result === "full") {
        window.alert("今日最多加入 5 个卡顿片段，请先完成已有加练。");
      } else if (result.result === "invalid") {
        window.alert("这个卡顿片段已经损坏，无法加入今日加练。");
      } else if (result.result === "storage-error") {
        window.alert("今日加练未能保存，请检查浏览器存储空间。");
      }
    },
    [],
  );

  const startQueuedHesitationPractice = useCallback(
    (itemId: string, target: HesitationPracticeTarget) => {
      if (!itemId) {
        setActiveHesitationPractice({ target });
        return;
      }
      const queue = startHesitationQueueItem(itemId);
      if (!queue) {
        window.alert("加练状态未能保存，请检查浏览器存储空间后再试。");
        return;
      }
      setHesitationQueue(queue);
      setActiveHesitationPractice({ target, queueItemId: itemId });
    },
    [],
  );

  const saveHesitationAttempts = useCallback(
    (attempts: HesitationAttemptTuple) => {
      if (!activeHesitationPractice) {
        return { ok: false, message: "练习目标已经失效，请关闭后重新进入。" };
      }
      const result = buildHesitationPracticeResult(
        activeHesitationPractice.target,
        attempts,
        attempts[2].completedAt,
      );
      const session = buildHesitationSession(result);
      const saved = saveHesitationPracticeOutcome(
        session,
        buildHesitationObservations(result),
        activeHesitationPractice.queueItemId,
      );
      if (!saved) {
        return {
          ok: false,
          message: "本次结果未能保存，请检查浏览器存储空间后重试。",
        };
      }
      refreshHesitationState();
      setHesitationSaveRevision((value) => value + 1);
      return { ok: true };
    },
    [activeHesitationPractice, refreshHesitationState],
  );

  const queuedFingerprints = useMemo(
    () =>
      new Set(
        hesitationQueue?.items.map((item) => item.target.fingerprint) ?? [],
      ),
    [hesitationQueue],
  );

  useEffect(() => {
    setSettings(readSettings());
    setSettingsReady(true);
  }, []);

  useEffect(() => {
    if (!settingsReady) return;
    const root = document.documentElement;
    root.dataset.theme = settings.theme;
    const customTheme = settings.customTheme ?? defaultCustomTheme;
    const customVariables = buildCustomThemeVariables(
      customTheme.accent,
      customTheme.canvas,
    );
    for (const [property, value] of Object.entries(customVariables)) {
      root.style.setProperty(property, value);
    }
  }, [settings, settingsReady]);

  useEffect(() => {
    const navigation = mainNavRef.current;
    const activeItem = navigation?.querySelector<HTMLElement>(
      '[aria-current="page"]',
    );
    if (
      !navigation ||
      !activeItem ||
      navigation.scrollWidth <= navigation.clientWidth
    ) {
      return;
    }
    navigation.scrollLeft = Math.max(
      0,
      activeItem.offsetLeft -
        (navigation.clientWidth - activeItem.offsetWidth) / 2,
    );
  }, [view]);

  const currentThemeName = themeLabels[settings.theme];
  const quickTheme = getNextQuickTheme(settings.theme);
  const updateSettings = (next: UserSettings) => {
    if (!writeLocal(STORAGE.settings, next)) {
      setSettingsSaveError("设置未能保存，原设置保持不变。请检查浏览器存储空间后重试。");
      return false;
    }
    setSettings(next);
    setSettingsSaveError("");
    return true;
  };
  const cycleTheme = () =>
    updateSettings({
      ...settings,
      theme: getNextQuickTheme(settings.theme),
    });

  return (
    <div className="app-shell" data-view={view}>
      <a className="skip-link" href="#main-content">
        跳到主要内容
      </a>
      <header className="site-header">
        <div className="header-inner">
          <Link href="/" className="brand" aria-label="五笔测试网站首页">
            <span className="brand-mark" aria-hidden="true">
              <i>五</i>
              <b>86</b>
            </span>
            <span>
              <strong>五笔测试网站</strong>
              <small>WUBI 86 / LOCAL PRACTICE</small>
            </span>
          </Link>
          <nav ref={mainNavRef} className="main-nav" aria-label="主导航">
            {navItems.map((item) => (
              <Link
                key={item.view}
                href={item.href}
                className={isNavItemActive(view, item.view) ? "nav-item active" : "nav-item"}
                aria-current={isNavItemActive(view, item.view) ? "page" : undefined}
              >
                <span aria-hidden="true">{item.coordinate}</span>
                <strong>{item.label}</strong>
              </Link>
            ))}
          </nav>
          <div className="header-utilities">
            <button
              className="theme-switch"
              type="button"
              onClick={cycleTheme}
              aria-label={`当前${currentThemeName}主题，点击切换为${themeLabels[quickTheme]}主题`}
              title={`主题：${currentThemeName}`}
            >
              <span aria-hidden="true">{
                settings.theme === "dark" ? "◐" : settings.theme === "light" ? "◑" : "◒"
              }</span>
              <b>{currentThemeName}</b>
            </button>
            <div className="local-badge">
              <i />
              <span><b>LOCAL</b> 数据只存本机</span>
            </div>
          </div>
        </div>
      </header>

      <main className="page-wrap" id="main-content">
        {settingsSaveError && (
          <p className="plan-message" role="alert">{settingsSaveError}</p>
        )}
        {view === "typing" && (
          <TypingView
            settings={settings}
            settingsReady={settingsReady}
            onShowGhostGapChange={(value) =>
              updateSettings({
                ...settings,
                showGhostGap: value,
              })
            }
            playKeySound={playKeySound}
            onPracticeHesitation={(target) =>
              setActiveHesitationPractice({ target })
            }
            onAddHesitationToQueue={addHesitationToQueue}
            queuedFingerprints={queuedFingerprints}
            masteredAtByFingerprint={masteredAtByFingerprint}
            hesitationPracticeOpen={Boolean(activeHesitationPractice)}
          />
        )}
        {view === "training" && (
          <TrainingCenter
            playKeySound={playKeySound}
            hesitationQueue={hesitationQueue}
            hesitationSaveRevision={hesitationSaveRevision}
            onPracticeHesitation={startQueuedHesitationPractice}
          />
        )}
        {view === "advanced" && <AdvancedCenter />}
        {view === "challenge" && (
          <ChallengeView playKeySound={playKeySound} />
        )}
        {view === "lookup" && <LookupView />}
        {view === "history" && (
          <HistoryView
            onPracticeHesitation={(target) =>
              setActiveHesitationPractice({ target })
            }
            onAddHesitationToQueue={addHesitationToQueue}
            queuedFingerprints={queuedFingerprints}
            masteredAtByFingerprint={masteredAtByFingerprint}
            hesitationSaveRevision={hesitationSaveRevision}
          />
        )}
        {view === "summary" && <KeySummary />}
        {view === "settings" && (
          <SettingsView
            settings={settings}
            onChange={updateSettings}
            playKeySound={playKeySound}
          />
        )}
      </main>

      {activeHesitationPractice && (
        <HesitationPracticeModal
          target={activeHesitationPractice.target}
          onClose={() => setActiveHesitationPractice(null)}
          onSave={saveHesitationAttempts}
        />
      )}

      <footer className="site-footer">
        <span><b>86 / OFFLINE</b> 慢慢练，手会记住。</span>
        <span>
          86 版码表来自 Rime 五笔方案（LGPL-3.0） · 记录不会离开当前浏览器
        </span>
      </footer>
    </div>
  );
}

function TypingView({
  settings,
  settingsReady,
  onShowGhostGapChange,
  playKeySound,
  onPracticeHesitation,
  onAddHesitationToQueue,
  queuedFingerprints,
  masteredAtByFingerprint,
  hesitationPracticeOpen,
}: {
  settings: UserSettings;
  settingsReady: boolean;
  onShowGhostGapChange: (value: boolean) => void;
  playKeySound: KeySoundPlayer;
  onPracticeHesitation: (target: HesitationPracticeTarget) => void;
  onAddHesitationToQueue: (target: HesitationPracticeTarget) => void;
  queuedFingerprints: ReadonlySet<string>;
  masteredAtByFingerprint: ReadonlyMap<string, string>;
  hesitationPracticeOpen: boolean;
}) {
  const router = useRouter();
  const [articles, setArticles] = useState<PracticeArticle[]>([]);
  const [articlesLoading, setArticlesLoading] = useState(true);
  const [articlesError, setArticlesError] = useState("");
  const [articleSaveError, setArticleSaveError] = useState("");
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [customTexts, setCustomTexts] = useState<PracticeArticle[]>([]);
  const [article, setArticle] = useState<PracticeArticle | null>(null);
  const [filter, setFilter] = useState<ArticleFilter>({
    length: settings.preferredLength,
    topic: "all",
    status: "all",
  });
  const [focusMode, setFocusMode] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const [commonOpen, setCommonOpen] = useState(false);
  const [commonData, setCommonData] = useState<CommonCharacterData | null>(null);
  const [commonLoading, setCommonLoading] = useState(false);
  const [commonError, setCommonError] = useState("");
  const [customTitle, setCustomTitle] = useState("我的自定义练习");
  const [customText, setCustomText] = useState("");
  const [customError, setCustomError] = useState("");
  const [inputValue, setInputValue] = useState("");
  const [typed, setTyped] = useState("");
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [keyCount, setKeyCount] = useState(0);
  const [letterKeys, setLetterKeys] = useState(0);
  const [backspaceCount, setBackspaceCount] = useState(0);
  const [correctionCount, setCorrectionCount] = useState(0);
  const [enterCount, setEnterCount] = useState(0);
  const [selectionCount, setSelectionCount] = useState(0);
  const [phraseChars, setPhraseChars] = useState(0);
  const [leftHandKeys, setLeftHandKeys] = useState(0);
  const [rightHandKeys, setRightHandKeys] = useState(0);
  const [pauseCount, setPauseCount] = useState(0);
  const [pausedDurationMs, setPausedDurationMs] = useState(0);
  const [pausedAt, setPausedAt] = useState<number | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [attemptCount, setAttemptCount] = useState(0);
  const [correctAttemptCount, setCorrectAttemptCount] = useState(0);
  const [errorCount, setErrorCount] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [lastSession, setLastSession] = useState<SessionResult | null>(null);
  const [sessionSaveFailed, setSessionSaveFailed] = useState(false);
  const practiceInProgress = startedAt !== null && !completed;
  usePendingSaveGuard(
    sessionSaveFailed || practiceInProgress,
    sessionSaveFailed
      ? "本次成绩尚未保存，请先重试保存。"
      : "本次练习尚未完成，请先完成或重来后再离开。",
  );
  const [progress, setProgress] = useState<ArticleProgress[]>([]);
  const composing = useRef(false);
  const recorded = useRef(false);
  const pendingPracticeSave = useRef<{
    session: SessionResult;
    observations: WeakObservation[];
    phraseOpportunities: PhraseOpportunityInput[];
  } | null>(null);
  const committedValue = useRef("");
  const startedAtRef = useRef<number | null>(null);
  const lastTimingAtRef = useRef<number | null>(null);
  const pendingTimingMsRef = useRef(0);
  const typingDelaysRef = useRef<number[]>([]);
  const physicalRhythmSamplesRef = useRef<PhysicalRhythmSample[]>([]);
  const correctionPositionsRef = useRef(new Map<number, number>());
  const wubiCodesRef = useRef(new Map<string, string>());
  const compositionCommitTimer = useRef<number | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const articleTextRef = useRef<HTMLDivElement>(null);
  const currentCharacterRef = useRef<HTMLSpanElement>(null);
  const errorPositions = useRef(new Set<number>());
  const customSaveLock = useRef(false);
  const [codeHints, setCodeHints] = useState<Map<string, string>>(new Map());
  const [codeHintsError, setCodeHintsError] = useState("");
  const [minimumCodeIndex, setMinimumCodeIndex] =
    useState<MinimumCodeLengthIndex | null>(null);
  const [codeLengthCoachIndex, setCodeLengthCoachIndex] =
    useState<CodeLengthCoachIndex | null>(null);
  const [minimumCodeError, setMinimumCodeError] = useState("");
  const [codeLengthLoadAttempt, setCodeLengthLoadAttempt] = useState(0);
  const [ghostMode, setGhostMode] = useState<GhostMode>("off");
  const [showGhostGap, setShowGhostGap] = useState(settings.showGhostGap);
  const [ghostRevision, setGhostRevision] = useState(0);
  const [, setClockRevision] = useState(0);
  const [completedGhostTimeline, setCompletedGhostTimeline] =
    useState<GhostTimeline | null>(null);
  const [activeGhostTimelineState, setActiveGhostTimelineState] =
    useState<GhostTimeline | null>(null);
  const [activeGhostMode, setActiveGhostMode] =
    useState<GhostMode>("off");
  const ghostProgressPointsRef = useRef<GhostProgressPoint[]>([]);
  const selectedGhostTimelineRef = useRef<GhostTimeline | null>(null);
  const completionElapsedRef = useRef<number | null>(null);
  const inactiveAtRef = useRef<number | null>(null);
  const inactiveDurationMsRef = useRef(0);

  useEffect(() => {
    let active = true;
    setArticlesLoading(true);
    setArticlesError("");
    loadArticles()
      .then((rows) => {
        if (active) setArticles(rows);
      })
      .catch((error: unknown) => {
        if (active) {
          setArticlesError(
            error instanceof Error ? error.message : "练习文章加载失败",
          );
        }
      })
      .finally(() => {
        if (active) setArticlesLoading(false);
      });
    return () => {
      active = false;
    };
  }, [loadAttempt]);

  useEffect(() => {
    setCustomTexts(getCustomArticles());
  }, []);

  useEffect(() => {
    let active = true;
    setMinimumCodeError("");
    loadWubi()
      .then((rows) => {
        if (active) {
          setMinimumCodeIndex(buildMinimumCodeLengthIndex(rows));
          setCodeLengthCoachIndex(buildCodeLengthCoachIndex(rows));
          wubiCodesRef.current = new Map(
            preferShortestWubiCodes(
              rows.filter(([text]) => Array.from(text).length === 1),
            ).map(([text, code]) => [text, code]),
          );
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setMinimumCodeError(
            error instanceof Error ? error.message : "理论码长计算数据加载失败",
          );
        }
      });
    return () => {
      active = false;
    };
  }, [codeLengthLoadAttempt]);

  useEffect(() => {
    setFilter((value) => ({
      ...value,
      length: settings.preferredLength,
    }));
  }, [settings.preferredLength]);

  useEffect(() => {
    const root = document.documentElement;
    if (focusMode) root.dataset.focusMode = "true";
    else delete root.dataset.focusMode;

    const exitFocusMode = (event: globalThis.KeyboardEvent) => {
      if (
        event.key === "Escape" &&
        focusMode &&
        !pickerOpen &&
        !customOpen &&
        !commonOpen &&
        !hesitationPracticeOpen
      ) {
        setFocusMode(false);
      }
    };
    document.addEventListener("keydown", exitFocusMode);
    return () => {
      document.removeEventListener("keydown", exitFocusMode);
      delete root.dataset.focusMode;
    };
  }, [commonOpen, customOpen, focusMode, hesitationPracticeOpen, pickerOpen]);

  useEffect(() => {
    if (!settings.showCodeHints) {
      setCodeHints(new Map());
      setCodeHintsError("");
      return;
    }
    let active = true;
    setCodeHintsError("");
    loadWubi()
      .then((rows) => {
        if (!active) return;
        const singleCharacters = rows.filter(
          ([text]) => Array.from(text).length === 1,
        );
        setCodeHints(
          new Map(
            preferShortestWubiCodes(singleCharacters).map(([text, code]) => [
              text,
              code,
            ]),
          ),
        );
      })
      .catch((error: unknown) => {
        if (active) {
          setCodeHintsError(
            error instanceof Error ? error.message : "编码提示加载失败",
          );
        }
      });
    return () => {
      active = false;
    };
  }, [settings.showCodeHints]);

  useEffect(
    () => () => {
      if (compositionCommitTimer.current !== null) {
        window.clearTimeout(compositionCommitTimer.current);
      }
    },
    [],
  );

  useEffect(() => {
    setProgress(getProgress());
  }, [completed]);
  const progressMap = useMemo(
    () => new Map(progress.map((row) => [row.articleId, row])),
    [progress],
  );
  const availableArticles = useMemo(
    () => [...customTexts, ...articles],
    [articles, customTexts],
  );
  const topics = useMemo(
    () =>
      Array.from(new Set(availableArticles.map((item) => item.topic))).sort(),
    [availableArticles],
  );
  const filtered = useMemo(
    () =>
      availableArticles.filter((item) => {
        const record = progressMap.get(item.id);
        if (filter.length !== "all" && item.length !== filter.length) return false;
        if (filter.topic !== "all" && item.topic !== filter.topic) return false;
        if (filter.status === "new" && record) return false;
        if (filter.status === "practiced" && !record) return false;
        return true;
      }),
    [availableArticles, filter, progressMap],
  );

  const startTimer = useCallback(() => {
    if (startedAtRef.current !== null) return;
    const now = Date.now();
    startedAtRef.current = now;
    lastTimingAtRef.current = now;
    setActiveGhostTimelineState(selectedGhostTimelineRef.current);
    setActiveGhostMode(selectedGhostTimelineRef.current ? ghostMode : "off");
    setStartedAt(now);
  }, [ghostMode]);

  const chooseArticle = useCallback(
    (
      next: PracticeArticle,
      focusInput = true,
      nextRetryCount = 0,
      nextGhostMode: GhostMode = "off",
    ) => {
      if (pendingPracticeSave.current) {
        window.alert("本次成绩尚未保存，请先重试保存。");
        return false;
      }
      const previousCurrent = readLocal<string | null>(STORAGE.current, null);
      const previousGenerated = readLocal<PracticeArticle | null>(
        STORAGE.currentGenerated,
        null,
      );
      const previousRecent = readLocalArray<string>(STORAGE.recent);
      const nextRecent = [
        next.id,
        ...previousRecent.filter((id) => id !== next.id),
      ].slice(0, 10);
      const selectionSaved =
        writeLocal(STORAGE.current, next.id) &&
        writeLocal(
          STORAGE.currentGenerated,
          next.kind === "common" ? next : null,
        ) &&
        (next.kind === "common" || writeLocal(STORAGE.recent, nextRecent));
      if (!selectionSaved) {
        writeLocal(STORAGE.current, previousCurrent);
        writeLocal(STORAGE.currentGenerated, previousGenerated);
        if (next.kind !== "common") {
          writeLocal(STORAGE.recent, previousRecent);
        }
        const message =
          "文章选择未能保存，原练习保持不变。请检查浏览器存储空间后重试。";
        setArticleSaveError(message);
        window.alert(message);
        return false;
      }
      setArticleSaveError("");
      if (compositionCommitTimer.current !== null) {
        window.clearTimeout(compositionCommitTimer.current);
        compositionCommitTimer.current = null;
      }
      setArticle(next);
      setInputValue("");
      setTyped("");
      setStartedAt(null);
      setElapsed(0);
      setKeyCount(0);
      setLetterKeys(0);
      setBackspaceCount(0);
      setCorrectionCount(0);
      setEnterCount(0);
      setSelectionCount(0);
      setPhraseChars(0);
      setLeftHandKeys(0);
      setRightHandKeys(0);
      setPauseCount(0);
      setPausedDurationMs(0);
      setPausedAt(null);
      setRetryCount(nextRetryCount);
      setAttemptCount(0);
      setCorrectAttemptCount(0);
      setErrorCount(0);
      setCompleted(false);
      setLastSession(null);
      setSessionSaveFailed(false);
      setGhostMode(nextGhostMode);
      setCompletedGhostTimeline(null);
      setActiveGhostTimelineState(null);
      setActiveGhostMode("off");
      pendingPracticeSave.current = null;
      composing.current = false;
      recorded.current = false;
      committedValue.current = "";
      startedAtRef.current = null;
      lastTimingAtRef.current = null;
      pendingTimingMsRef.current = 0;
      typingDelaysRef.current = [];
      physicalRhythmSamplesRef.current = [];
      correctionPositionsRef.current = new Map();
      errorPositions.current = new Set();
      ghostProgressPointsRef.current = [];
      selectedGhostTimelineRef.current = null;
      completionElapsedRef.current = null;
      inactiveAtRef.current = null;
      inactiveDurationMsRef.current = 0;
      setClockRevision((value) => value + 1);
      setPickerOpen(false);
      window.setTimeout(() => {
        articleTextRef.current?.scrollTo({ top: 0, behavior: "auto" });
        if (focusInput) inputRef.current?.focus();
      }, 50);
      return true;
    },
    [],
  );

  const fetchCommonCharacterData = useCallback(async () => {
    setCommonLoading(true);
    setCommonError("");
    try {
      const data = await loadCommonCharacters();
      setCommonData(data);
      return data;
    } catch (error: unknown) {
      setCommonError(
        error instanceof Error ? error.message : "常用字表加载失败",
      );
      return null;
    } finally {
      setCommonLoading(false);
    }
  }, []);

  const openCommonPractice = () => {
    setCommonOpen(true);
    if (!commonData && !commonLoading) void fetchCommonCharacterData();
  };

  const startCommonPractice = (
    preset: CommonCharacterPreset,
    shuffled = false,
  ) => {
    if (!commonData) return;
    if (chooseArticle(buildCommonPracticeArticle(commonData, preset, shuffled))) {
      setCommonOpen(false);
    }
  };

  const shuffleCurrentCommonPractice = async () => {
    if (!isCommonPracticeArticle(article)) return;
    const data = commonData ?? (await fetchCommonCharacterData());
    if (!data) return;
    chooseArticle(buildCommonPracticeArticle(data, article.preset, true));
  };

  useEffect(() => {
    const currentId = readLocal<string | null>(STORAGE.current, null);
    const generated = readLocal<unknown>(STORAGE.currentGenerated, null);
    if (currentId && isCommonPracticeArticle(generated) && generated.id === currentId) {
      chooseArticle(generated, false);
    }
  }, [chooseArticle]);

  const randomArticle = useCallback(() => {
    if (!filtered.length) return;
    const recent = new Set(readLocalArray<string>(STORAGE.recent));
    const fresh = filtered.filter((item) => !recent.has(item.id));
    const candidates = fresh.length ? fresh : filtered;
    chooseArticle(candidates[Math.floor(Math.random() * candidates.length)]);
  }, [chooseArticle, filtered]);

  useEffect(() => {
    if (
      !settingsReady ||
      articlesLoading ||
      !availableArticles.length ||
      article
    ) {
      return;
    }
    const storedCurrentId = readLocal<string | null>(STORAGE.current, null);
    const trainingPlan = readTrainingPlan();
    const trainingArticleId =
      trainingPlan?.date === localDateKey(new Date())
        ? trainingPlan.tasks.find(
            (task) =>
              task.type === "article" && task.status === "in-progress",
          )?.articleId
        : undefined;
    const currentId = trainingArticleId ?? storedCurrentId;
    const initialArticle = selectInitialArticle(
      availableArticles,
      articles,
      currentId,
      settings.preferredLength,
      Boolean(trainingArticleId),
    );
    if (initialArticle) chooseArticle(initialArticle, false);
  }, [
    article,
    articles,
    articlesLoading,
    availableArticles,
    chooseArticle,
    settings.preferredLength,
    settingsReady,
  ]);

  useEffect(() => {
    if (!startedAt || completed) return;
    const updateElapsed = () =>
      setElapsed(
        calculateActiveDurationSeconds({
          startedAt,
          now: Date.now(),
          pausedDurationMs,
          pausedAt,
          inactiveDurationMs: inactiveDurationMsRef.current,
          inactiveAt: inactiveAtRef.current,
        }),
      );
    updateElapsed();
    const timer = window.setInterval(updateElapsed, 250);
    return () => window.clearInterval(timer);
  }, [completed, pausedAt, pausedDurationMs, startedAt]);

  useEffect(() => {
    if (!startedAt || completed) return;
    const handleVisibilityChange = () => {
      const now = Date.now();
      if (document.hidden) {
        if (pausedAt !== null || inactiveAtRef.current !== null) return;
        pendingTimingMsRef.current = calculateTypingTransitionMs({
          lastActiveAt: lastTimingAtRef.current,
          now,
          pendingMs: pendingTimingMsRef.current,
        });
        lastTimingAtRef.current = null;
        inactiveAtRef.current = now;
        setClockRevision((value) => value + 1);
        return;
      }
      if (inactiveAtRef.current === null) return;
      inactiveDurationMsRef.current += Math.max(
        0,
        now - inactiveAtRef.current,
      );
      inactiveAtRef.current = null;
      lastTimingAtRef.current = now;
      setClockRevision((value) => value + 1);
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () =>
      document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [completed, pausedAt, startedAt]);

  const visibleText = article?.text || "";
  // Paragraph breaks are presentation, not typing targets. Keeping them in the
  // comparison made users enter invisible newline characters between paragraphs.
  const targetText = useMemo(
    () => visibleText.replace(/[\r\n]/g, ""),
    [visibleText],
  );
  const paragraphBoundaries = useMemo(
    () =>
      visibleText
      .split(/[\r\n]+/)
      .filter((paragraph) => paragraph.length > 0)
        .reduce<number[]>((boundaries, paragraph) => {
          const previous = boundaries.at(-1) ?? 0;
          return [...boundaries, previous + Array.from(paragraph).length];
        }, []),
    [visibleText],
  );
  const ghostIdentity = useMemo(
    () => (article ? getGhostArticleIdentity(article) : null),
    [article],
  );
  const ghostSessions = useMemo(
    () => {
      void ghostRevision;
      return ghostIdentity
        ? selectGhostSessions(getSessions(), ghostIdentity)
        : { best: null, recent: null };
    },
    [ghostIdentity, ghostRevision],
  );
  const selectedGhostSession =
    ghostMode === "best"
      ? ghostSessions.best
      : ghostMode === "recent"
        ? ghostSessions.recent
        : null;
  const selectedGhostTimeline = selectedGhostSession?.ghostTimeline ?? null;
  useEffect(() => {
    if (startedAt === null) {
      selectedGhostTimelineRef.current = selectedGhostTimeline;
    }
  }, [selectedGhostTimeline, startedAt]);
  useEffect(() => {
    if (startedAtRef.current === null) setShowGhostGap(settings.showGhostGap);
  }, [settings.showGhostGap]);
  const targetCharacters = useMemo(() => Array.from(targetText), [targetText]);
  const typedCharacters = useMemo(() => Array.from(typed), [typed]);
  const theoreticalCodeLength = useMemo(
    () =>
      minimumCodeIndex
        ? calculateTheoreticalMinimumCodeLength(targetText, minimumCodeIndex)
        : null,
    [minimumCodeIndex, targetText],
  );
  const codeLengthAnalysis = useMemo(
    () =>
      codeLengthCoachIndex
        ? analyzeCodeLengthCoach(targetText, codeLengthCoachIndex, {
            maxRecommendations: 5,
          })
        : null,
    [codeLengthCoachIndex, targetText],
  );
  const displayCharacters = useMemo(() => {
    let targetIndex = 0;
    return Array.from(visibleText).map((character, visibleIndex) => {
      const isParagraphBreak = character === "\r" || character === "\n";
      const entry = {
        character,
        visibleIndex,
        targetIndex: isParagraphBreak ? null : targetIndex,
      };
      if (!isParagraphBreak) targetIndex += 1;
      return entry;
    });
  }, [visibleText]);

  const seconds = completed ? elapsed : elapsed || 0;
  const {
    correctChars,
    speed,
    kps,
    codeLength,
    accuracy,
  } = calculateTypingMetrics({
    typed,
    target: targetText,
    durationSeconds: seconds,
    keyCount,
    letterKeys,
    attemptCount,
    correctAttemptCount,
  });
  const keyAccuracy = calculateKeyAccuracy({
    keyCount,
    backspaceCount,
    correctionCount,
    codeLength,
  });
  const phraseRate = calculatePhraseRate(phraseChars, correctChars);
  const pauseSeconds = pausedDurationMs / 1000;
  const theoreticalGap =
    theoreticalCodeLength !== null && codeLength > 0
      ? Math.max(0, codeLength - theoreticalCodeLength)
      : null;
  const recommendedPhrases =
    codeLengthAnalysis?.highestValueOpportunities ?? [];
  const startRecommendedPhrasePractice = () => {
    if (!recommendedPhrases.length) return;
    if (pendingPracticeSave.current) {
      window.alert("本次成绩尚未保存，请先重试保存。");
      return;
    }
    router.push("/training?tab=phrase");
  };
  const retryPracticeSave = () => {
    const pending = pendingPracticeSave.current;
    if (!pending) return;
    const saved = savePracticeOutcome(
      pending.session,
      pending.observations,
      pending.phraseOpportunities,
    );
    if (!saved) {
      window.alert("仍未能保存，请清理部分本机数据后再试。");
      return;
    }
    pendingPracticeSave.current = null;
    setSessionSaveFailed(false);
    setProgress(getProgress());
    setGhostRevision((value) => value + 1);
  };
  const progressRatio = Math.min(
    1,
    typedCharacters.length / Math.max(1, targetCharacters.length),
  );
  const progressPercent = Math.round(progressRatio * 100);
  const activeGhostTimeline =
    startedAt !== null
      ? activeGhostTimelineState
      : selectedGhostTimeline;
  const displayGhostMode = startedAt !== null ? activeGhostMode : ghostMode;
  const ghostPosition = activeGhostTimeline
    ? getGhostPositionAtElapsed(activeGhostTimeline, seconds * 1000)
    : 0;
  const ghostProgressPercent = activeGhostTimeline
    ? Math.min(100, (ghostPosition / Math.max(1, targetCharacters.length)) * 100)
    : 0;
  const ghostCharacterGap = activeGhostTimeline
    ? typedCharacters.length - ghostPosition
    : 0;
  const ghostTimeGapMs = activeGhostTimeline
    ? seconds * 1000 -
      getGhostElapsedAtProgress(activeGhostTimeline, typedCharacters.length)
    : 0;
  const ghostGapLabel = activeGhostTimeline
    ? `${ghostCharacterGap >= 0 ? "领先" : "落后"} ${Math.abs(
        ghostCharacterGap,
      ).toFixed(1)} 字 · ${ghostTimeGapMs <= 0 ? "快" : "慢"} ${Math.abs(
        ghostTimeGapMs / 1000,
      ).toFixed(1)} 秒`
    : "普通练习";
  const ghostSegmentComparison = useMemo(
    () =>
      completedGhostTimeline && activeGhostTimelineState
        ? compareGhostSegments(
            completedGhostTimeline,
            activeGhostTimelineState,
            paragraphBoundaries,
          )
        : [],
    [activeGhostTimelineState, completedGhostTimeline, paragraphBoundaries],
  );

  useEffect(() => {
    const viewport = articleTextRef.current;
    const currentCharacter = currentCharacterRef.current;
    if (!viewport || !currentCharacter) return;

    const viewportRect = viewport.getBoundingClientRect();
    const characterRect = currentCharacter.getBoundingClientRect();
    const readingLine = viewportRect.top + viewport.clientHeight * 0.68;

    if (characterRect.bottom <= readingLine && characterRect.top >= viewportRect.top) {
      return;
    }

    const nextTop = Math.max(
      0,
      viewport.scrollTop +
        characterRect.top -
        viewportRect.top -
        viewport.clientHeight * 0.28,
    );
    viewport.scrollTo({ top: nextTop, behavior: "smooth" });
  }, [article?.id, typedCharacters.length]);

  useEffect(() => {
    if (!article || !typed) return;
    let changed = false;
    for (let index = 0; index < typedCharacters.length; index += 1) {
      if (
        typedCharacters[index] !== targetCharacters[index] &&
        !errorPositions.current.has(index)
      ) {
        errorPositions.current.add(index);
        changed = true;
      }
    }
    if (changed) setErrorCount(errorPositions.current.size);
  }, [article, targetCharacters, typed, typedCharacters]);

  useEffect(() => {
    if (!article || completed || !canCompleteTyping(typed, targetText)) return;
    const finalSeconds = calculateActiveDurationSeconds({
      startedAt,
      now: Date.now(),
      pausedDurationMs,
      pausedAt,
      inactiveDurationMs: inactiveDurationMsRef.current,
      inactiveAt: inactiveAtRef.current,
    });
    completionElapsedRef.current = finalSeconds;
    setElapsed(finalSeconds);
    setCompleted(true);
  }, [
    article,
    completed,
    pausedAt,
    pausedDurationMs,
    startedAt,
    targetText,
    typed,
  ]);

  useEffect(() => {
    if (
      !article ||
      !completed ||
      recorded.current
    ) {
      return;
    }
    const finalSeconds = completionElapsedRef.current ?? elapsed;
    recorded.current = true;
    const errorChars = Array.from(errorPositions.current)
      .map((index) => targetCharacters[index])
      .filter(Boolean);
    const completedAt = new Date().toISOString();
    const heatmap = buildTypingHeatmap(visibleText, typingDelaysRef.current);
    const rhythmSummary = buildRhythmSummary({
      text: visibleText,
      delays: typingDelaysRef.current,
      physicalSamples: physicalRhythmSamplesRef.current,
    });
    const observations: WeakObservation[] = [];
    const addObservation = (
      character: string | undefined,
      kind: WeakObservation["kind"],
      severity?: 1 | 2 | 3,
    ) => {
      if (!character || !/\p{Script=Han}/u.test(character)) return;
      observations.push({
        text: character,
        code: wubiCodesRef.current.get(character),
        kind,
        severity,
        occurredAt: completedAt,
      });
    };
    for (const index of errorPositions.current) {
      addObservation(targetCharacters[index], "coding-error");
    }
    for (const [index, count] of correctionPositionsRef.current) {
      for (let occurrence = 0; occurrence < Math.min(count, 3); occurrence += 1) {
        addObservation(targetCharacters[index], "correction");
      }
    }
    for (const segment of heatmap.segments) {
      const severity = getHesitationLevel(segment.delayMs, heatmap.thresholdMs);
      if (severity === 0) continue;
      for (let offset = 0; offset < segment.length; offset += 1) {
        addObservation(
          targetCharacters[segment.start + offset],
          "hesitation",
          severity,
        );
      }
    }
    for (const character of new Set(targetCharacters)) {
      addObservation(character, "correct");
    }
    const finalMetrics = calculateTypingMetrics({
      typed,
      target: targetText,
      durationSeconds: finalSeconds,
      keyCount,
      letterKeys,
      attemptCount,
      correctAttemptCount,
    });
    const articleId =
      article.kind === "custom" ||
      article.kind === "common" ||
      article.id.startsWith("custom-")
        ? undefined
        : article.id;
    const trainingTaskId = readTrainingPlan()?.tasks.find(
      (task) =>
        task.type === "article" &&
        task.status === "in-progress" &&
        task.articleId === articleId,
    )?.id;
    let ghostTimeline: GhostTimeline | undefined;
    if (ghostIdentity) {
      const finalPoint = {
        characterCount: targetCharacters.length,
        elapsedMs: finalSeconds * 1000,
      };
      ghostProgressPointsRef.current.push(finalPoint);
      ghostTimeline =
        buildGhostTimeline(ghostIdentity, ghostProgressPointsRef.current) ??
        undefined;
      setCompletedGhostTimeline(ghostTimeline ?? null);
    }
    const session: SessionResult = {
      id: createLocalId(),
      type: "article",
      articleId,
      title: article.title,
      date: completedAt,
      durationSeconds: finalSeconds,
      ...finalMetrics,
      theoreticalCodeLength,
      keyAccuracy: calculateKeyAccuracy({
        keyCount,
        backspaceCount,
        correctionCount,
        codeLength: finalMetrics.codeLength,
      }),
      errors: errorPositions.current.size,
      errorChars,
      keyCount,
      backspaceCount,
      correctionCount,
      enterCount,
      selectionCount,
      phraseRate: calculatePhraseRate(phraseChars, finalMetrics.correctChars),
      leftHandKeys,
      rightHandKeys,
      pauseCount,
      pauseSeconds,
      retryCount,
      heatmap,
      rhythmSummary,
      ghostTimeline,
      trainingTaskId,
    };
    const phraseOpportunities =
      codeLengthAnalysis?.highestValueOpportunities
        .filter((opportunity) => opportunity.savedKeys > 0)
        .map((opportunity) => ({
          text: opportunity.text,
          code: opportunity.code,
          characterCount: opportunity.length,
          savedKeys: opportunity.savedKeys,
        })) ?? [];
    const saved = savePracticeOutcome(
      session,
      observations,
      phraseOpportunities,
    );
    if (!saved) {
      pendingPracticeSave.current = {
        session,
        observations,
        phraseOpportunities,
      };
      setSessionSaveFailed(true);
      window.alert("本次成绩未能保存，请检查浏览器存储空间后再试。");
    } else {
      pendingPracticeSave.current = null;
      setSessionSaveFailed(false);
      setGhostRevision((value) => value + 1);
    }
    setLastSession(session);
  }, [
    article,
    attemptCount,
    backspaceCount,
    codeLengthAnalysis,
    completed,
    correctionCount,
    correctAttemptCount,
    elapsed,
    enterCount,
    ghostIdentity,
    keyCount,
    leftHandKeys,
    letterKeys,
    pauseCount,
    pauseSeconds,
    pausedAt,
    pausedDurationMs,
    phraseChars,
    retryCount,
    rightHandKeys,
    selectionCount,
    startedAt,
    targetText,
    targetCharacters,
    theoreticalCodeLength,
    typed,
    typedCharacters,
    visibleText,
  ]);

  const commitTypedValue = (nextValue: string) => {
    const committed = Array.from(nextValue.replace(/[\r\n]/g, ""))
      .slice(0, targetCharacters.length)
      .join("");
    const previous = committedValue.current;
    if (committed === previous) {
      setInputValue(committed);
      return;
    }
    if (committed) startTimer();
    const now = Date.now();
    const previousCharacterCount = Array.from(previous).length;
    const committedCharacterCount = Array.from(committed).length;
    if (ghostIdentity && committedCharacterCount > previousCharacterCount) {
      const characterCount = committedCharacterCount;
      const previousPoint = ghostProgressPointsRef.current.at(-1);
      const step = getGhostSampleStep(ghostIdentity.characterCount);
      if (
        characterCount === ghostIdentity.characterCount ||
        characterCount >= (previousPoint?.characterCount ?? 0) + step
      ) {
        ghostProgressPointsRef.current.push({
          characterCount,
          elapsedMs:
            calculateActiveDurationSeconds({
              startedAt: startedAtRef.current,
              now,
              pausedDurationMs,
              pausedAt,
              inactiveDurationMs: inactiveDurationMsRef.current,
              inactiveAt: inactiveAtRef.current,
            }) * 1000,
        });
      }
    }
    const transitionMs = calculateTypingTransitionMs({
      lastActiveAt: lastTimingAtRef.current,
      now,
      pendingMs: pendingTimingMsRef.current,
    });
    typingDelaysRef.current = applyTypingDelaySample({
      previous,
      next: committed,
      target: targetText,
      delayMs: transitionMs,
      delays: typingDelaysRef.current,
    });
    pendingTimingMsRef.current = 0;
    lastTimingAtRef.current = now;
    committedValue.current = committed;
    const edit = countCommittedEdit(previous, committed);
    if (edit.removed > 0) {
      setCorrectionCount((value) => value + edit.removed);
      const range = getCommittedEditRange(previous, committed);
      for (let offset = 0; offset < range.removed; offset += 1) {
        const index = range.start + offset;
        correctionPositionsRef.current.set(
          index,
          (correctionPositionsRef.current.get(index) ?? 0) + 1,
        );
      }
    }
    if (edit.phraseChars > 0) {
      setPhraseChars((value) => value + edit.phraseChars);
    }
    const attempt = countCommittedAttempts(previous, committed, targetText);
    if (attempt.attempts > 0) {
      setAttemptCount((value) => value + attempt.attempts);
      setCorrectAttemptCount((value) => value + attempt.correct);
    }
    setInputValue(committed);
    setTyped(committed);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (completed) return;
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "v") {
      event.preventDefault();
    }
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (
      event.key.length === 1 ||
      event.key === "Process" ||
      event.key === "Unidentified" ||
      event.nativeEvent.isComposing
    ) {
      startTimer();
    }
    if (!["Shift", "Control", "Alt", "Meta", "CapsLock"].includes(event.key)) {
      setKeyCount((value) => value + 1);
      recordKeyUsage(event.code);
      playKeySound();
    }
    if (event.key === "Backspace") {
      setBackspaceCount((value) => value + 1);
    }
    if (event.key === "Enter") {
      setEnterCount((value) => value + 1);
    }
    if (
      (composing.current || event.nativeEvent.isComposing) &&
      isImeSelectionKey(event.key)
    ) {
      setSelectionCount((value) => value + 1);
    }
    if (isWubiLetterKey(event.key, event.code)) {
      setLetterKeys((value) => value + 1);
      const hand = classifyWubiHand(event.key, event.code);
      if (
        hand &&
        physicalRhythmSamplesRef.current.length < MAX_PHYSICAL_RHYTHM_SAMPLES
      ) {
        physicalRhythmSamplesRef.current.push({
          elapsedMs: calculateActiveDurationSeconds({
            startedAt: startedAtRef.current,
            now: Date.now(),
            pausedDurationMs,
            pausedAt,
            inactiveDurationMs: inactiveDurationMsRef.current,
            inactiveAt: inactiveAtRef.current,
          }) * 1000,
          hand,
        });
      }
      if (hand === "left") setLeftHandKeys((value) => value + 1);
      if (hand === "right") setRightHandKeys((value) => value + 1);
    }
  };

  const togglePause = () => {
    if (startedAtRef.current === null || completed) return;
    const now = Date.now();
    if (pausedAt !== null) {
      setPausedDurationMs((value) => value + Math.max(0, now - pausedAt));
      setPausedAt(null);
      lastTimingAtRef.current = now;
      window.setTimeout(() => inputRef.current?.focus(), 0);
      return;
    }
    pendingTimingMsRef.current = calculateTypingTransitionMs({
      lastActiveAt: lastTimingAtRef.current,
      now,
      pendingMs: pendingTimingMsRef.current,
    });
    lastTimingAtRef.current = null;
    setPausedAt(now);
    setPauseCount((value) => value + 1);
  };

  const toggleGhostGap = () => {
    const next = !showGhostGap;
    setShowGhostGap(next);
    onShowGhostGapChange(next);
  };

  const useCustomText = () => {
    if (customSaveLock.current) return;
    customSaveLock.current = true;
    const custom = buildCustomArticle(
      `custom-${createLocalId()}`,
      customTitle,
      customText,
    );
    if (!custom) {
      setCustomError(`正文长度需要在 10–${MAX_CUSTOM_TEXT_LENGTH} 个字符之间。`);
      customSaveLock.current = false;
      return;
    }
    const saved = getCustomArticles();
    const merged = addCustomArticlesWithinLimit(saved, [custom]);
    if (!merged.added.length) {
      setCustomError("自定义文章已满 20 篇，请先到设置页删除一篇。");
      customSaveLock.current = false;
      return;
    }
    const nextCustomTexts = merged.articles;
    if (!writeLocal(STORAGE.customTexts, nextCustomTexts)) {
      setCustomError("自定义文章未能保存，请检查浏览器存储空间。");
      customSaveLock.current = false;
      return;
    }
    if (!chooseArticle(custom)) {
      if (!writeLocal(STORAGE.customTexts, saved)) {
        setCustomTexts(getCustomArticles());
        setCustomError("文章选择失败，且自定义文章列表未能回滚，请到设置页检查。");
      } else {
        setCustomTexts(saved);
        setCustomError("文章选择失败，自定义文章未保存，请检查存储空间后重试。");
      }
      customSaveLock.current = false;
      return;
    }
    setCustomError("");
    setCustomTexts(nextCustomTexts);
    setCustomOpen(false);
  };

  const pickMostDifficult = () => {
    const articleIds = new Set(articles.map((item) => item.id));
    const target = [...getProgress()]
      .filter((item) => articleIds.has(item.articleId))
      .sort((a, b) => b.errors - a.errors)
      .find((item) => item.errors > 0);
    const found = articles.find((item) => item.id === target?.articleId);
    if (found) chooseArticle(found);
    else randomArticle();
  };

  if (articleSaveError && !article) {
    return (
      <ErrorState
        title="文章选择没有保存成功"
        message={articleSaveError}
        onRetry={() => setLoadAttempt((value) => value + 1)}
      />
    );
  }

  if (
    articlesLoading ||
    (!article && (!settingsReady || availableArticles.length > 0))
  ) {
    return (
      <div className="loading-card" role="status" aria-busy="true">
        正在整理 300 篇练习文章…
      </div>
    );
  }

  if (articlesError) {
    return (
      <ErrorState
        title="练习文章没有加载成功"
        message={articlesError}
        onRetry={() => setLoadAttempt((value) => value + 1)}
      />
    );
  }

  if (!article) {
    return (
      <ErrorState
        title="暂时没有可练习的文章"
        message="请重新加载文章库后再试。"
        onRetry={() => setLoadAttempt((value) => value + 1)}
      />
    );
  }

  return (
    <>
      {articleSaveError && (
        <p className="management-message" role="alert">
          {articleSaveError}
        </p>
      )}
      <section className="hero-row">
        <div>
          <span className="eyebrow">今天也写几行</span>
          <h1>让手指先于思考，<em>落下正确的字。</em></h1>
          <p>切到五笔输入法就可以开始。速度、击键和错字都安静地记在这台电脑里。</p>
        </div>
        <div className="hero-actions">
          <button
            className="button secondary common-entry"
            disabled={practiceInProgress}
            onClick={openCommonPractice}
          >
            常用字练习
          </button>
          <button
            className="button secondary"
            disabled={practiceInProgress}
            onClick={() => {
              customSaveLock.current = false;
              setCustomError("");
              setCustomOpen(true);
            }}
          >
            粘贴自己的文字
          </button>
          <button
            className="button primary"
            disabled={practiceInProgress}
            onClick={randomArticle}
          >
            换一篇练练
          </button>
        </div>
      </section>

      <section className="metric-strip" aria-label="实时成绩">
        <Metric
          label="速度"
          value={speed.toString()}
          unit="字/分"
          primary
          active={startedAt !== null && !completed}
        />
        <Metric label="击键" value={kps.toFixed(2)} unit="次/秒" />
        <CodeLengthMetric
          value={codeLength.toFixed(2)}
          theoreticalValue={theoreticalCodeLength}
          error={minimumCodeError}
        />
        <Metric label="字准" value={accuracy.toFixed(1)} unit="%" />
        <Metric label="错字" value={errorCount.toString()} unit="处" />
        <Metric label="用时" value={formatDuration(seconds)} unit="" />
      </section>

      <section className="typing-diagnostics" aria-label="输入诊断">
        <DiagnosticMetric label="总键数" value={keyCount.toString()} unit="键" />
        <DiagnosticMetric label="键准" value={keyAccuracy.toFixed(1)} unit="%" />
        <DiagnosticMetric
          label="码长差"
          value={theoreticalGap === null ? "—" : `+${theoreticalGap.toFixed(2)}`}
          unit=""
        />
        <DiagnosticMetric label="回改" value={correctionCount.toString()} unit="字" />
        <DiagnosticMetric label="退格" value={backspaceCount.toString()} unit="次" />
        <DiagnosticMetric label="选重" value={selectionCount.toString()} unit="次" />
        <DiagnosticMetric label="打词" value={phraseRate.toFixed(1)} unit="%" />
        <DiagnosticMetric
          label="左右手"
          value={`${leftHandKeys} / ${rightHandKeys}`}
          unit=""
        />
        <DiagnosticMetric label="暂停" value={pauseCount.toString()} unit="次" />
        <DiagnosticMetric label="重打" value={retryCount.toString()} unit="次" />
      </section>

      {activeGhostTimeline && (
        <section className="ghost-live-card" aria-label="幽灵赛实时状态">
          <span>
            {displayGhostMode === "best"
              ? "挑战个人最佳"
              : "挑战最近一次"}
          </span>
          {showGhostGap ? (
            <strong>
              {ghostGapLabel}
            </strong>
          ) : (
            <strong>实时差距已关闭</strong>
          )}
          <small>幽灵位置仍会显示在五区进度条上</small>
        </section>
      )}

      <section className="workspace-grid">
        <article className="typing-card">
          <div className="practice-commandbar" aria-label="练习控制">
            <div className="practice-mode">
              <span className="practice-mode-mark">五</span>
              <span>86 版</span>
              <span>全文跟打</span>
              <span>{lengthLabels[article.length]}</span>
              {settings.showCodeHints && <span>编码提示开启</span>}
            </div>
            <fieldset
              className="ghost-mode-picker"
              disabled={startedAt !== null}
              aria-describedby="ghost-mode-note"
            >
              <legend>幽灵赛</legend>
              <label>
                <input
                  type="radio"
                  name="ghost-mode"
                  checked={ghostMode === "off"}
                  onChange={() => setGhostMode("off")}
                />
                普通
              </label>
              <label>
                <input
                  type="radio"
                  name="ghost-mode"
                  checked={ghostMode === "best"}
                  disabled={!ghostSessions.best}
                  onChange={() => setGhostMode("best")}
                />
                个人最佳
              </label>
              <label>
                <input
                  type="radio"
                  name="ghost-mode"
                  checked={ghostMode === "recent"}
                  disabled={!ghostSessions.recent}
                  onChange={() => setGhostMode("recent")}
                />
                最近一次
              </label>
            </fieldset>
            <span id="ghost-mode-note" className="sr-only">
              {ghostSessions.best
                ? "输入第一个字符后将锁定本轮挑战对象"
                : "完成一次可比较的文章练习后即可挑战"}
            </span>
            <div className="practice-actions">
              <button
                disabled={practiceInProgress}
                onClick={() => setPickerOpen(true)}
              >
                选文章
              </button>
              <button disabled={practiceInProgress} onClick={randomArticle}>
                随机
              </button>
              <button
                disabled={startedAt === null || completed}
                className={pausedAt !== null ? "active" : ""}
                onClick={togglePause}
                aria-pressed={pausedAt !== null}
              >
                {pausedAt !== null ? "继续" : "暂停"}
              </button>
              <button
                disabled={startedAt === null && !inputValue}
                onClick={() =>
                  chooseArticle(
                    article,
                    true,
                    retryCount + 1,
                    startedAt !== null ? activeGhostMode : ghostMode,
                  )
                }
              >
                重来
              </button>
              <button
                className={showGhostGap ? "active" : ""}
                disabled={!activeGhostTimeline}
                onClick={toggleGhostGap}
                aria-pressed={showGhostGap}
              >
                {showGhostGap ? "隐藏差距" : "显示差距"}
              </button>
              <button
                className={focusMode ? "active" : ""}
                onClick={() => setFocusMode((value) => !value)}
                aria-pressed={focusMode}
              >
                {focusMode ? "退出专注" : "专注模式"}
              </button>
            </div>
          </div>
          <div className="typing-toolbar">
            <div className="article-heading">
              <div className="article-kicker">
                <span>{lengthLabels[article.length]}</span>
                <span>{article.topic}</span>
                <span>{article.wordCount} 字</span>
              </div>
              <h2>{article.title}</h2>
            </div>
            <div className="article-toolbar-actions">
              {settings.showCodeHints && (
                <div
                  className={`code-hint-card${codeHintsError ? " has-error" : ""}`}
                  aria-live="polite"
                  aria-label={`当前字 ${targetCharacters[typedCharacters.length] || "无"}，最短编码 ${
                    codeHintsError ||
                    codeHints
                      .get(targetCharacters[typedCharacters.length] || "")
                      ?.toUpperCase() ||
                    "暂无"
                  }`}
                >
                  <strong className="code-hint-character" aria-hidden="true">
                    {targetCharacters[typedCharacters.length] || "完"}
                  </strong>
                  <span className="code-hint-copy">
                    <small>{codeHintsError ? "编码提示" : "当前字 · 编码"}</small>
                    <b>
                      {codeHintsError
                        ? "加载失败"
                        : codeHints
                            .get(targetCharacters[typedCharacters.length] || "")
                            ?.toUpperCase() ||
                          "暂无"}
                    </b>
                  </span>
                </div>
              )}
              <div className="article-restart">
                <div
                  className="toolbar-actions"
                  role="group"
                  aria-label="当前练习操作"
                >
                  {isCommonPracticeArticle(article) ? (
                    <>
                      <button
                        className="common-toolbar-action range-action"
                        aria-label="更换常用字练习范围"
                        title="更换常用字练习范围"
                        onClick={openCommonPractice}
                      >
                        更换范围
                      </button>
                      <button
                        className="common-toolbar-action shuffle-action"
                        disabled={commonLoading}
                        aria-label="打乱当前范围并从头开始"
                        title="打乱当前范围并从头开始"
                        onClick={() => void shuffleCurrentCommonPractice()}
                      >
                        {commonLoading ? "载入中…" : "乱序"}
                      </button>
                    </>
                  ) : (
                    <button onClick={() => setPickerOpen(true)}>选文章</button>
                  )}
                  <button
                    className="restart-action"
                    onClick={() =>
                      chooseArticle(
                        article,
                        true,
                        retryCount + 1,
                        startedAt !== null ? activeGhostMode : ghostMode,
                      )
                    }
                  >
                    重新开始
                  </button>
                </div>
              </div>
            </div>
          </div>
          <div
            className="root-rail"
            role="progressbar"
            aria-label="文章输入进度"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progressPercent}
            aria-valuetext={`已完成 ${progressPercent}%${
              activeGhostTimeline
                ? `，幽灵 ${Math.round(ghostProgressPercent)}%${
                    showGhostGap ? `，${ghostGapLabel}` : ""
                  }`
                : ""
            }，五格依次对应撇、捺、横、竖、折区`}
          >
            {[
              ["QWERT", "撇区"],
              ["YUIOP", "捺区"],
              ["ASDFG", "横区"],
              ["HJKLM", "竖区"],
              ["XCVBN", "折区"],
            ].map(([keys, label], index) => {
              const segmentProgress = Math.min(
                1,
                Math.max(0, progressRatio * 5 - index),
              );
              return (
                <span
                  key={keys}
                  style={{
                    "--segment-progress": `${segmentProgress * 100}%`,
                  } as CSSProperties}
                >
                  <b>{keys}</b>
                  <small>{label}</small>
                </span>
              );
            })}
            {activeGhostTimeline && (
              <i
                className="ghost-progress-marker"
                style={{
                  "--ghost-progress": `${ghostProgressPercent}%`,
                } as CSSProperties}
                aria-hidden="true"
              />
            )}
          </div>
          <div
            key={article.id}
            ref={articleTextRef}
            className={`article-text article-swap ${
              isCommonPracticeArticle(article) ? "common-character-text" : ""
            }`}
            style={{ fontSize: `${settings.fontSize}px` }}
            onClick={() => inputRef.current?.focus()}
            aria-live="off"
          >
            {displayCharacters.map(({ character, visibleIndex, targetIndex }) => {
              if (targetIndex === null) {
                return (
                  <span className="paragraph-break" key={`${visibleIndex}-break`}>
                    {character}
                  </span>
                );
              }
              const state =
                targetIndex >= typedCharacters.length
                  ? targetIndex === typedCharacters.length
                    ? "current"
                    : "pending"
                  : typedCharacters[targetIndex] === character
                    ? "correct"
                    : "wrong";
              return (
                <span
                  ref={state === "current" ? currentCharacterRef : undefined}
                  className={`${state}${
                    isCommonPracticeArticle(article) &&
                    (targetIndex + 1) % 10 === 0
                      ? " common-decade-end"
                      : ""
                  }${
                    isCommonPracticeArticle(article) &&
                    (targetIndex + 1) % 50 === 0
                      ? " common-section-end"
                      : ""
                  }`}
                  key={`${visibleIndex}-${character}`}
                >
                  {character}
                </span>
              );
            })}
          </div>
          <textarea
            ref={inputRef}
            className="typing-input"
            value={inputValue}
            onChange={(event) => {
              const next = event.target.value;
              const nativeEvent = event.nativeEvent as InputEvent;
              if (next) startTimer();
              if (
                shouldDeferInputCommit(
                  composing.current,
                  nativeEvent.isComposing,
                )
              ) {
                // Keep the IME's full pre-edit buffer (for example "qingxi").
                // Truncating it to the few remaining article characters cancels
                // candidate selection near the end of an article in Safari.
                setInputValue(next);
                return;
              }
              commitTypedValue(next);
            }}
            onCompositionStart={() => {
              composing.current = true;
              startTimer();
            }}
            onCompositionEnd={(event) => {
              composing.current = false;
              const endedValue = event.currentTarget.value;
              if (compositionCommitTimer.current !== null) {
                window.clearTimeout(compositionCommitTimer.current);
              }
              // Safari may expose the pre-edit Latin buffer on compositionend
              // and deliver the committed Chinese text in the following input
              // event. Wait one task, then read the textarea's final value.
              compositionCommitTimer.current = window.setTimeout(() => {
                compositionCommitTimer.current = null;
                commitTypedValue(inputRef.current?.value ?? endedValue);
              }, 0);
            }}
            onKeyDown={onKeyDown}
            onPaste={(event) => event.preventDefault()}
            onDrop={(event) => event.preventDefault()}
            onBeforeInput={(event) => {
              const inputType = (event.nativeEvent as InputEvent).inputType;
              if (inputType === "insertFromPaste" || inputType === "insertFromDrop") {
                event.preventDefault();
              }
            }}
            disabled={completed || pausedAt !== null}
            placeholder={
              completed
                ? "本次练习已完成"
                : pausedAt !== null
                  ? "练习已暂停"
                  : "点击这里，切换到五笔输入法后开始输入…"
            }
            aria-label="跟打输入区"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="none"
            spellCheck={false}
          />
          <div className="typing-footer">
            <span className="typing-position">
              第 {Math.min(typedCharacters.length + 1, targetCharacters.length)} /{" "}
              {targetCharacters.length} 字
            </span>
            <span>输入第一个字符后开始计时 · 已禁用粘贴</span>
          </div>
          {completed && (
            <div className="completion-panel">
              <div className="completion-copy">
                <span className="completion-icon">
                  {sessionSaveFailed ? "待" : "成"}
                </span>
                <div>
                  <span>
                    {sessionSaveFailed
                      ? "本次成绩尚未保存"
                      : "本次成绩已存入本机"}
                  </span>
                  <strong>
                    {sessionSaveFailed ? "请重试保存" : "完成本次练习"}
                  </strong>
                </div>
              </div>
              <div className="completion-results" aria-label="本次练习成绩">
                <span><small>速度</small><span className="completion-value"><strong>{speed}</strong><i>字/分</i></span></span>
                <span><small>击键</small><span className="completion-value"><strong>{kps.toFixed(2)}</strong><i>次/秒</i></span></span>
                <span><small>码长</small><span className="completion-value"><strong>{codeLength.toFixed(2)}</strong><i>键/字</i></span></span>
                <span><small>字准</small><span className="completion-value"><strong>{accuracy.toFixed(1)}</strong><i>%</i></span></span>
                <span><small>错字</small><span className="completion-value"><strong>{errorCount}</strong><i>处</i></span></span>
              </div>
              <div className="completion-diagnostics" aria-label="本次输入诊断">
                <DiagnosticMetric label="总键数" value={keyCount.toString()} unit="键" />
                <DiagnosticMetric label="键准" value={keyAccuracy.toFixed(1)} unit="%" />
                <DiagnosticMetric
                  label="理论码长"
                  value={
                    theoreticalCodeLength === null
                      ? "—"
                      : theoreticalCodeLength.toFixed(2)
                  }
                  unit=""
                />
                <DiagnosticMetric label="回改" value={correctionCount.toString()} unit="字" />
                <DiagnosticMetric label="退格" value={backspaceCount.toString()} unit="次" />
                <DiagnosticMetric label="选重" value={selectionCount.toString()} unit="次" />
                <DiagnosticMetric label="打词" value={phraseRate.toFixed(1)} unit="%" />
                <DiagnosticMetric label="左右手" value={`${leftHandKeys} / ${rightHandKeys}`} unit="" />
                <DiagnosticMetric label="暂停" value={`${pauseCount} / ${pauseSeconds.toFixed(1)}`} unit="次/秒" />
                <DiagnosticMetric label="重打" value={retryCount.toString()} unit="次" />
              </div>
              <section className="code-coach" aria-labelledby="code-coach-title">
                <div className="code-coach-summary">
                  <div className="code-coach-heading">
                    <small>CODE LENGTH COACH</small>
                    <h3 id="code-coach-title">码长诊断</h3>
                    <p>
                      {minimumCodeError
                        ? "码表数据暂时不可用，无法生成本次建议。"
                        : theoreticalGap !== null && theoreticalGap > 0
                          ? `实际码长距理论下限还有 ${theoreticalGap.toFixed(2)} 键/字的空间。`
                          : "本次实际码长已接近理论下限。"}
                    </p>
                  </div>
                  <div className="code-coach-metrics" aria-label="码长对比">
                    <CodeCoachMetric
                      label="实际码长"
                      value={codeLength.toFixed(2)}
                      unit="键/字"
                    />
                    <CodeCoachMetric
                      label="理论下限"
                      value={
                        codeLengthAnalysis?.theoreticalAverageCodeLength?.toFixed(
                          2,
                        ) ?? "—"
                      }
                      unit={
                        (codeLengthAnalysis?.theoreticalAverageCodeLength ??
                          null) === null
                          ? ""
                          : "键/字"
                      }
                    />
                    <CodeCoachMetric
                      label="单字输入基准"
                      value={
                        codeLengthAnalysis?.singleCharacterAverageCodeLength?.toFixed(
                          2,
                        ) ?? "—"
                      }
                      unit={
                        (codeLengthAnalysis?.singleCharacterAverageCodeLength ??
                          null) === null
                          ? ""
                          : "键/字"
                      }
                    />
                    <CodeCoachMetric
                      label="已使用词组比例"
                      value={phraseRate.toFixed(1)}
                      unit="%"
                    />
                  </div>
                </div>
                <div className="code-coach-opportunities">
                  <div className="code-coach-list-heading">
                    <strong>值得留意的推荐机会</strong>
                    <span>
                      {codeLengthAnalysis?.potentialSavedKeys
                        ? `相比全部单字输入，理论可少 ${codeLengthAnalysis.potentialSavedKeys} 键`
                        : "仅按码表提示，不判定你的实际分段"}
                    </span>
                  </div>
                  {recommendedPhrases.length ? (
                    <ol className="code-coach-list">
                      {recommendedPhrases.map((opportunity, index) => (
                        <li key={`${opportunity.start}-${opportunity.text}`}>
                          <span className="code-coach-rank">
                            {String(index + 1).padStart(2, "0")}
                          </span>
                          <span className="code-coach-phrase">
                            <strong>{opportunity.text}</strong>
                            <small>
                              第 {opportunity.start + 1} 字起 · {opportunity.code}
                            </small>
                          </span>
                          <span className="code-coach-saving">
                            <small>推荐机会</small>
                            <strong>可少 {opportunity.savedKeys} 键</strong>
                          </span>
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <div className="code-coach-empty">
                      <span>
                        {minimumCodeError
                          ? "码表数据暂时不可用。"
                          : codeLengthAnalysis
                            ? "本篇暂未发现可节省按键的二至四字词组推荐机会。"
                            : "正在准备码长诊断数据…"}
                      </span>
                      {minimumCodeError && (
                        <button
                          className="button secondary"
                          onClick={() =>
                            setCodeLengthLoadAttempt((value) => value + 1)
                          }
                        >
                          重试加载码表
                        </button>
                      )}
                    </div>
                  )}
                  <div className="code-coach-actions">
                    <p>
                      推荐基于当前 86 版码表和文本位置，无法可靠识别你本次实际采用的分段。
                    </p>
                    <button
                      className="button secondary"
                      disabled={!recommendedPhrases.length}
                      onClick={startRecommendedPhrasePractice}
                    >
                      练习这些词组
                    </button>
                  </div>
                </div>
              </section>
              {ghostSegmentComparison.length > 0 && (
                <section
                  className="ghost-review"
                  aria-labelledby="ghost-review-title"
                >
                  <div>
                    <small>PERSONAL GHOST</small>
                    <h3 id="ghost-review-title">幽灵赛复盘</h3>
                    <p>{ghostGapLabel}</p>
                  </div>
                  <ol>
                    {ghostSegmentComparison.map((segment, index) => (
                      <li key={`${segment.start}-${segment.end}`}>
                        <span>第 {index + 1} 段</span>
                        <strong>
                          {segment.result === "recovered"
                            ? "追回"
                            : segment.result === "lost"
                              ? "丢失"
                              : "持平"}{" "}
                          {Math.abs(segment.changeMs / 1000).toFixed(1)} 秒
                        </strong>
                        <small>
                          第 {segment.start + 1}–{segment.end} 字
                        </small>
                      </li>
                    ))}
                  </ol>
                </section>
              )}
              <div className="completion-next">
                <p>练习记录只保存在当前浏览器。</p>
                {sessionSaveFailed && (
                  <button className="button danger" onClick={retryPracticeSave}>
                    重试保存
                  </button>
                )}
                <button
                  className="button secondary"
                  disabled={!lastSession}
                  onClick={() => lastSession && downloadShareCard(lastSession)}
                >
                  下载成绩卡
                </button>
                {settings.autoNext && activeGhostMode !== "off" && (
                  <button
                    className="button secondary"
                    disabled={sessionSaveFailed}
                    onClick={() =>
                      chooseArticle(
                        article,
                        true,
                        retryCount + 1,
                        activeGhostMode,
                      )
                    }
                  >
                    {activeGhostMode === "best"
                      ? "再次挑战个人最佳"
                      : "再次挑战最近一次"}
                  </button>
                )}
                <button
                  className="button primary"
                  disabled={sessionSaveFailed}
                  onClick={
                    settings.autoNext
                      ? randomArticle
                      : () =>
                          chooseArticle(
                            article,
                            true,
                            retryCount + 1,
                            activeGhostMode,
                          )
                  }
                >
                  {settings.autoNext
                    ? "下一篇"
                    : activeGhostMode === "best"
                      ? "再次挑战个人最佳"
                      : activeGhostMode === "recent"
                        ? "再次挑战最近一次"
                        : "再练一次"}
                </button>
              </div>
            </div>
          )}
        </article>

        {completed && (lastSession?.rhythmSummary || lastSession?.heatmap) && (
          <div className="post-practice-review">
            {lastSession.rhythmSummary && (
              <RhythmSummaryView
                summary={lastSession.rhythmSummary}
                onPractice={(segment) => openRhythmSegmentPractice(router, segment)}
              />
            )}
            {lastSession.heatmap && (
              <HesitationHeatmap
                heatmap={lastSession.heatmap}
                source={lastSession}
                onPractice={onPracticeHesitation}
                onAddToQueue={onAddHesitationToQueue}
                queuedFingerprints={queuedFingerprints}
                masteredAtByFingerprint={masteredAtByFingerprint}
              />
            )}
          </div>
        )}

        <aside className="side-panel">
          <div className="side-heading">
            <div>
              <span className="eyebrow">文章库</span>
              <h3>{articles.length || FALLBACK_ARTICLE_COUNT} 篇离线练习</h3>
            </div>
            <span className="count-badge">{articles.length}</span>
          </div>
          <label>
            长度
            <select
              value={filter.length}
              onChange={(event) =>
                setFilter((value) => ({
                  ...value,
                  length: event.target.value as ArticleFilter["length"],
                }))
              }
            >
              {Object.entries(lengthLabels).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>
          <label>
            题材
            <select
              value={filter.topic}
              onChange={(event) =>
                setFilter((value) => ({ ...value, topic: event.target.value }))
              }
            >
              <option value="all">全部题材</option>
              {topics.map((topic) => <option key={topic}>{topic}</option>)}
            </select>
          </label>
          <label>
            练习状态
            <select
              value={filter.status}
              onChange={(event) =>
                setFilter((value) => ({
                  ...value,
                  status: event.target.value as ArticleFilter["status"],
                }))
              }
            >
              <option value="all">全部文章</option>
              <option value="new">未练习</option>
              <option value="practiced">已练习</option>
            </select>
          </label>
          <button
            className="side-action"
            disabled={practiceInProgress || !filtered.length}
            onClick={randomArticle}
          >
            随机抽取一篇 <b>↗</b>
          </button>
          <button
            className="side-action subtle"
            disabled={practiceInProgress}
            onClick={pickMostDifficult}
          >
            重练错字较多文章
          </button>
          <div className="tip-box">
            <span>小提示</span>
            <p>系统五笔候选上屏后才会判定正误，组合输入过程不会被计为错字。</p>
          </div>
        </aside>
      </section>

      {pickerOpen && (
        <Modal title="选择练习文章" onClose={() => setPickerOpen(false)}>
          <div className="article-list">
            <div className="article-list-summary" role="status">
              共 {filtered.length} 篇符合当前筛选条件
            </div>
            {filtered.map((item) => {
              const record = progressMap.get(item.id);
              return (
                <button key={item.id} onClick={() => chooseArticle(item)}>
                  <span className="article-card-copy">
                    <small>{item.topic}</small>
                    <strong>{item.title}</strong>
                    <span>{lengthLabels[item.length]} · {item.wordCount} 字</span>
                  </span>
                  <span className={record ? "article-record practiced" : "article-record"}>
                    <small>{record ? "个人最佳" : "练习状态"}</small>
                    <strong>{record ? `${record.bestSpeed} 字/分` : "未练习"}</strong>
                    <i>{record ? `${record.attempts} 次记录` : "从这篇开始"}</i>
                  </span>
                </button>
              );
            })}
            {!filtered.length && <div className="empty-state">当前筛选条件下没有文章。</div>}
          </div>
        </Modal>
      )}

      {commonOpen && (
        <Modal title="选择常用字范围" onClose={() => setCommonOpen(false)}>
          <div className="common-practice-picker">
            <div className="common-practice-intro">
              <span aria-hidden="true">1500</span>
              <div>
                <strong>按字频分段练习</strong>
                <p>前 500 常用字按字频分成 10 组，每组 50 字。进入后可随时点击“乱序”。</p>
              </div>
            </div>
            {commonError ? (
              <ErrorState
                title="常用字表没有加载成功"
                message={commonError}
                onRetry={() => void fetchCommonCharacterData()}
              />
            ) : (
              <div
                className="common-range-grid"
                aria-busy={commonLoading}
                aria-label="常用字范围"
              >
                {commonCharacterPresets.map((range, index) => (
                  <button
                    key={range.id}
                    data-modal-autofocus={
                      index === 0 && commonData && !commonLoading
                        ? true
                        : undefined
                    }
                    disabled={commonLoading || !commonData}
                    onClick={() => startCommonPractice(range.id)}
                  >
                    <span>{String(index + 1).padStart(2, "0")}</span>
                    <strong>{range.label}</strong>
                    <small>{range.description}</small>
                    <i aria-hidden="true">→</i>
                  </button>
                ))}
              </div>
            )}
            <p className="common-source-note">
              {commonLoading
                ? "正在读取离线字频表…"
                : "字频来源：北京语言大学“现代汉语研究语料库”"}
            </p>
          </div>
        </Modal>
      )}

      {customOpen && (
        <Modal title="粘贴自定义文本" onClose={() => setCustomOpen(false)}>
          <div className="custom-form">
            <label>标题<input data-modal-autofocus value={customTitle} onChange={(event) => setCustomTitle(event.target.value)} /></label>
            <label>正文<textarea value={customText} maxLength={MAX_CUSTOM_TEXT_LENGTH * 2} onChange={(event) => {
              setCustomText(
                Array.from(event.target.value)
                  .slice(0, MAX_CUSTOM_TEXT_LENGTH)
                  .join(""),
              );
              setCustomError("");
            }} placeholder="粘贴 10–5000 字的纯文本…" /></label>
            <div className="modal-actions">
              <span>
                {Array.from(customText.trim()).length} / {MAX_CUSTOM_TEXT_LENGTH} 字
              </span>
              <button
                className="button primary"
                disabled={
                  Array.from(customText.trim()).length < 10 ||
                  Array.from(customText.trim()).length > MAX_CUSTOM_TEXT_LENGTH
                }
                onClick={useCustomText}
              >
                开始练习
              </button>
            </div>
            {customError && <p className="management-message" role="status">{customError}</p>}
          </div>
        </Modal>
      )}
    </>
  );
}

function Metric({
  label,
  value,
  unit,
  primary = false,
  active = false,
  description,
}: {
  label: string;
  value: string;
  unit: string;
  primary?: boolean;
  active?: boolean;
  description?: string;
}) {
  const className = [
    "metric",
    primary ? "primary-metric" : "",
    active ? "is-active" : "",
  ].filter(Boolean).join(" ");

  return (
    <div className={className} title={description}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{unit}</small>
    </div>
  );
}

function CodeCoachMetric({
  label,
  value,
  unit,
}: {
  label: string;
  value: string;
  unit: string;
}) {
  return (
    <span className="code-coach-metric">
      <small>{label}</small>
      <span>
        <strong>{value}</strong>
        {unit && <i>{unit}</i>}
      </span>
    </span>
  );
}

function CodeLengthMetric({
  value,
  theoreticalValue,
  error,
}: {
  value: string;
  theoreticalValue: number | null;
  error: string;
}) {
  const theoreticalDisplay = error
    ? "暂不可用"
    : theoreticalValue === null
      ? "—"
      : theoreticalValue.toFixed(2);
  const description =
    error ||
    "按当前 86 版码表，用单字和词组的最优组合计算，不含标点、数字和拉丁字母。";

  return (
    <div className="metric code-length-metric" role="group" aria-label="码长">
      <span>码长</span>
      <div className="code-length-current">
        <strong>{value}</strong>
        <small>键/字</small>
      </div>
      <div
        className={`code-length-baseline${error ? " is-unavailable" : ""}`}
        title={description}
      >
        <span>理论下限</span>
        <strong>{theoreticalDisplay}</strong>
      </div>
      {error && (
        <span className="sr-only">理论最小码长暂不可用：{error}</span>
      )}
    </div>
  );
}
