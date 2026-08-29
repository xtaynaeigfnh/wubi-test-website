"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import {
  useCallback,
  useDeferredValue,
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
  applyTypingDelaySample,
  buildCommonPracticeArticle,
  buildChallengePool,
  buildCustomArticle,
  buildMinimumCodeLengthIndex,
  buildTypingHeatmap,
  calculateActiveDurationSeconds,
  calculateAccuracy,
  calculateKeyAccuracy,
  calculatePhraseRate,
  calculateRemainingSeconds,
  calculateTheoreticalMinimumCodeLength,
  calculateTypingTransitionMs,
  calculateTypingMetrics,
  canCompleteTyping,
  clearPracticeHistory,
  classifyWubiHand,
  commonCharacterPresets,
  countCommittedEdit,
  countCommittedAttempts,
  createLocalId,
  defaultCustomTheme,
  defaultSettings,
  formatDuration,
  getCustomArticles,
  getErrors,
  getCommittedEditRange,
  getHesitationLevel,
  getPhraseOpportunities,
  getProgress,
  getSessions,
  isWubiLetterKey,
  lengthLabels,
  loadArticleMetadata,
  loadArticles,
  loadCommonCharacters,
  loadWubi,
  loadWubiChallenge,
  MAX_CUSTOM_TEXT_LENGTH,
  preferShortestWubiCodes,
  readLocal,
  readLocalArray,
  readHesitationQueue,
  readSettings,
  readTrainingPlan,
  recordKeyUsage,
  saveHesitationPracticeOutcome,
  savePracticeOutcome,
  isCommonPracticeArticle,
  isImeSelectionKey,
  localDateKey,
  selectInitialArticle,
  shouldDeferInputCommit,
  startHesitationQueueItem,
  STORAGE,
  writeSessionValue,
  writeLocal,
  type MinimumCodeLengthIndex,
  type PhraseOpportunityInput,
} from "../lib";
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
  ErrorStat,
  GhostTimeline,
  HesitationPracticeAttempt,
  HesitationPracticeQueue,
  HesitationPracticeTarget,
  PracticeArticle,
  PhraseOpportunityStat,
  RhythmWeakSegment,
  SessionResult,
  ThemeId,
  UserSettings,
  WeakObservation,
  WubiEntry,
} from "../types";
import {
  buildHesitationObservations,
  buildHesitationPracticeResult,
  buildHesitationSession,
} from "../hesitation-practice";
import { downloadShareCard } from "../share-card";
import { DataManagement } from "./DataManagement";
import { PwaControl } from "./PwaControl";
import { TrainingCenter } from "./TrainingCenter";
import { AdvancedCenter, RhythmSummaryView } from "./AdvancedCenter";
import { TrendPanel } from "./TrendPanel";
import { WeeklyReportPanel } from "./WeeklyReportPanel";
import {
  ErrorState,
  Modal,
  SummaryCard,
  Toggle,
  usePendingSaveGuard,
} from "./Ui";
import { KeySummary } from "./KeySummary";
import { HesitationHeatmap } from "./HesitationHeatmap";
import { HesitationPracticeModal } from "./HesitationPracticeModal";
import { buildWeeklyReport } from "../weekly-report";
import {
  buildRhythmSummary,
  MAX_PHYSICAL_RHYTHM_SAMPLES,
  type PhysicalRhythmSample,
} from "../rhythm-lab";

const themeLabels: Record<ThemeId, string> = {
  system: "系统",
  light: "浅色",
  dark: "深色",
  bamboo: "竹纸",
  qingdai: "青黛",
  custom: "自定义",
};

const PENDING_RHYTHM_SEGMENT_KEY = "wubi-test:pending-rhythm-segment:v1";

function openRhythmSegmentPractice(
  router: ReturnType<typeof useRouter>,
  segment: RhythmWeakSegment,
) {
  if (!writeSessionValue(PENDING_RHYTHM_SEGMENT_KEY, JSON.stringify(segment))) {
    window.alert("浏览器不允许临时保存该片段，请关闭隐私限制后再试。");
    return;
  }
  router.push("/advanced");
}

type GhostMode = "off" | "best" | "recent";

const themeOptions: Array<{
  id: ThemeId;
  description: string;
  canvas: string;
  accent: string;
}> = [
  {
    id: "system",
    description: "随设备外观",
    canvas: "#E7EDF0",
    accent: "#086B66",
  },
  {
    id: "light",
    description: "清爽蓝白",
    canvas: "#E7EDF0",
    accent: "#086B66",
  },
  {
    id: "dark",
    description: "低亮深色",
    canvas: "#09171A",
    accent: "#71D0C7",
  },
  {
    id: "bamboo",
    description: "米纸竹青",
    canvas: "#F2EBDD",
    accent: "#B3432B",
  },
  {
    id: "qingdai",
    description: "静谧蓝灰",
    canvas: "#DCE5E8",
    accent: "#315C72",
  },
  {
    id: "custom",
    description: "自行配色",
    canvas: "#F2EBDD",
    accent: "#B3432B",
  },
];

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

function hexToRgb(hex: string): [number, number, number] {
  return [
    Number.parseInt(hex.slice(1, 3), 16),
    Number.parseInt(hex.slice(3, 5), 16),
    Number.parseInt(hex.slice(5, 7), 16),
  ];
}

function rgbToHex(red: number, green: number, blue: number): string {
  return `#${[red, green, blue]
    .map((channel) => Math.round(channel).toString(16).padStart(2, "0"))
    .join("")}`.toUpperCase();
}

function mixHex(from: string, to: string, amount: number): string {
  const start = hexToRgb(from);
  const end = hexToRgb(to);
  return rgbToHex(
    start[0] + (end[0] - start[0]) * amount,
    start[1] + (end[1] - start[1]) * amount,
    start[2] + (end[2] - start[2]) * amount,
  );
}

function getRelativeLuminance(hex: string): number {
  const channels = hexToRgb(hex).map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.04045
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

function getContrastRatio(first: string, second: string): number {
  const lighter = Math.max(
    getRelativeLuminance(first),
    getRelativeLuminance(second),
  );
  const darker = Math.min(
    getRelativeLuminance(first),
    getRelativeLuminance(second),
  );
  return (lighter + 0.05) / (darker + 0.05);
}

function chooseContrastText(background: string): "#000000" | "#FFFFFF" {
  return getContrastRatio(background, "#000000") >=
    getContrastRatio(background, "#FFFFFF")
    ? "#000000"
    : "#FFFFFF";
}

function buildSecondaryText(canvas: string, text: string): string {
  let low = 0;
  let high = 1;
  for (let index = 0; index < 12; index += 1) {
    const middle = (low + high) / 2;
    if (getContrastRatio(canvas, mixHex(canvas, text, middle)) >= 4.5) {
      high = middle;
    } else {
      low = middle;
    }
  }
  return mixHex(canvas, text, Math.min(1, high + 0.04));
}

function buildCustomThemeVariables(accent: string, canvas: string) {
  const text = chooseContrastText(canvas);
  const darkCanvas = getRelativeLuminance(canvas) < 0.3;
  const surfaceTarget = text === "#FFFFFF" ? "#000000" : "#FFFFFF";
  const paper = mixHex(canvas, surfaceTarget, darkCanvas ? 0.06 : 0.58);
  const raised = mixHex(canvas, surfaceTarget, darkCanvas ? 0.1 : 0.055);
  const key = mixHex(canvas, surfaceTarget, darkCanvas ? 0.16 : 0.1);
  return {
    "--custom-accent": accent,
    "--custom-canvas": canvas,
    "--custom-text": text,
    "--custom-text-secondary": buildSecondaryText(canvas, text),
    "--custom-paper": paper,
    "--custom-raised": raised,
    "--custom-key": key,
    "--custom-border": mixHex(canvas, text, darkCanvas ? 0.25 : 0.2),
    "--custom-border-strong": mixHex(canvas, text, darkCanvas ? 0.42 : 0.34),
    "--custom-accent-text": chooseContrastText(accent),
    "--custom-color-scheme": darkCanvas ? "dark" : "light",
  } as const;
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

const FALLBACK_ARTICLE_COUNT = 300;

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
    writeLocal(STORAGE.settings, settings);
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
  const cycleTheme = () =>
    setSettings((current) => ({
      ...current,
      theme: getNextQuickTheme(current.theme),
    }));

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
        {view === "typing" && (
          <TypingView
            settings={settings}
            settingsReady={settingsReady}
            onShowGhostGapChange={(value) =>
              setSettings((current) => ({
                ...current,
                showGhostGap: value,
              }))
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
            onChange={setSettings}
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
  usePendingSaveGuard(sessionSaveFailed);
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
      if (compositionCommitTimer.current !== null) {
        window.clearTimeout(compositionCommitTimer.current);
        compositionCommitTimer.current = null;
      }
      setArticle(next);
      writeLocal(STORAGE.current, next.id);
      if (next.kind === "common") {
        writeLocal(STORAGE.currentGenerated, next);
      } else {
        writeLocal(STORAGE.currentGenerated, null);
        const recent = readLocalArray<string>(STORAGE.recent);
        writeLocal(
          STORAGE.recent,
          [next.id, ...recent.filter((id) => id !== next.id)].slice(0, 10),
        );
      }
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
    chooseArticle(buildCommonPracticeArticle(commonData, preset, shuffled));
    setCommonOpen(false);
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
    setCustomError("");
    setCustomTexts(nextCustomTexts);
    chooseArticle(custom);
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
      <section className="hero-row">
        <div>
          <span className="eyebrow">今天也写几行</span>
          <h1>让手指先于思考，<em>落下正确的字。</em></h1>
          <p>切到五笔输入法就可以开始。速度、击键和错字都安静地记在这台电脑里。</p>
        </div>
        <div className="hero-actions">
          <button className="button secondary common-entry" onClick={openCommonPractice}>
            常用字练习
          </button>
          <button
            className="button secondary"
            onClick={() => {
              customSaveLock.current = false;
              setCustomError("");
              setCustomOpen(true);
            }}
          >
            粘贴自己的文字
          </button>
          <button className="button primary" onClick={randomArticle}>
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
              <button onClick={() => setPickerOpen(true)}>选文章</button>
              <button onClick={randomArticle}>随机</button>
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

        {completed && lastSession?.rhythmSummary && (
          <div className="post-practice-review">
            <RhythmSummaryView
              summary={lastSession.rhythmSummary}
              onPractice={(segment) => openRhythmSegmentPractice(router, segment)}
            />
          </div>
        )}

        {completed && lastSession?.heatmap && (
          <div className="post-practice-review">
            <HesitationHeatmap
              heatmap={lastSession.heatmap}
              source={lastSession}
              onPractice={onPracticeHesitation}
              onAddToQueue={onAddHesitationToQueue}
              queuedFingerprints={queuedFingerprints}
              masteredAtByFingerprint={masteredAtByFingerprint}
            />
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
          <button className="side-action" disabled={!filtered.length} onClick={randomArticle}>随机抽取一篇 <b>↗</b></button>
          <button className="side-action subtle" onClick={pickMostDifficult}>重练错字较多文章</button>
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

function DiagnosticMetric({
  label,
  value,
  unit,
}: {
  label: string;
  value: string;
  unit: string;
}) {
  return (
    <span className="diagnostic-metric">
      <small>{label}</small>
      <strong>{value}</strong>
      {unit && <i>{unit}</i>}
    </span>
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

function ChallengeView({
  playKeySound,
}: {
  playKeySound: KeySoundPlayer;
}) {
  const [rows, setRows] = useState<WubiEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [mode, setMode] = useState<"char" | "phrase">("char");
  const [limit, setLimit] = useState<20 | 50>(20);
  const [timed, setTimed] = useState(false);
  const [started, setStarted] = useState(false);
  const [question, setQuestion] = useState<WubiEntry | null>(null);
  const [input, setInput] = useState("");
  const [index, setIndex] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [feedback, setFeedback] = useState<"idle" | "right" | "wrong">("idle");
  const [remaining, setRemaining] = useState(60);
  const [mistakes, setMistakes] = useState<Array<{ text: string; code: string; input: string }>>([]);
  const [finishedReason, setFinishedReason] = useState<"complete" | "timeout" | "">("");
  const [lastSession, setLastSession] = useState<SessionResult | null>(null);
  const [challengeSaveFailed, setChallengeSaveFailed] = useState(false);
  usePendingSaveGuard(challengeSaveFailed);
  const startedAtRef = useRef(0);
  const challengeHiddenAtRef = useRef<number | null>(null);
  const challengeInactiveMsRef = useRef(0);
  const recordedRef = useRef(false);
  const nextTimerRef = useRef<number | null>(null);
  const deadlineRef = useRef(0);
  const seenQuestionsRef = useRef(new Set<string>());
  const submitLockRef = useRef(false);
  const advanceLockRef = useRef(false);
  const challengeObservationsRef = useRef<WeakObservation[]>([]);
  const pendingChallengeSaveRef = useRef<{
    session: SessionResult;
    observations: WeakObservation[];
  } | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError("");
    loadWubiChallenge()
      .then((nextRows) => {
        if (active) setRows(nextRows);
      })
      .catch((error: unknown) => {
        if (active) {
          setLoadError(
            error instanceof Error ? error.message : "五笔码表加载失败",
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [loadAttempt]);

  const pool = useMemo(() => {
    return buildChallengePool(rows, mode);
  }, [mode, rows]);

  const nextQuestion = useCallback(() => {
    if (!pool.length) return;
    let candidates = pool.filter(
      ([text]) => !seenQuestionsRef.current.has(text),
    );
    if (!candidates.length) {
      seenQuestionsRef.current.clear();
      candidates = pool;
    }
    const next = candidates[Math.floor(Math.random() * candidates.length)];
    seenQuestionsRef.current.add(next[0]);
    setQuestion(next);
    setInput("");
    setFeedback("idle");
    submitLockRef.current = false;
    advanceLockRef.current = false;
  }, [pool]);

  const finishChallenge = useCallback(
    (
      answered: number,
      correctAnswers: number,
      reason: "complete" | "timeout",
    ) => {
      if (recordedRef.current) return;
      recordedRef.current = true;
      const now = Date.now();
      const elapsedSeconds = Math.max(
        0,
        (now -
          startedAtRef.current -
          (timed ? 0 : challengeInactiveMsRef.current) -
          (timed || challengeHiddenAtRef.current === null
            ? 0
            : now - challengeHiddenAtRef.current)) /
          1000,
      );
      const durationSeconds = timed
        ? Math.min(60, elapsedSeconds)
        : elapsedSeconds;
      if (answered > 0) {
        const session: SessionResult = {
          id: createLocalId(),
          type: "challenge",
          title: `${mode === "char" ? "单字" : "词组"}挑战${timed ? " · 60 秒" : ""}`,
          date: new Date().toISOString(),
          durationSeconds,
          correctChars: correctAnswers,
          attemptedChars: answered,
          speed:
            durationSeconds > 0
              ? Math.round(correctAnswers / (durationSeconds / 60))
              : 0,
          kps: 0,
          codeLength: 0,
          accuracy: calculateAccuracy(correctAnswers, answered),
          errors: answered - correctAnswers,
        };
        const pending = {
          session,
          observations: [...challengeObservationsRef.current],
        };
        pendingChallengeSaveRef.current = pending;
        if (!savePracticeOutcome(session, pending.observations)) {
          setChallengeSaveFailed(true);
          window.alert("本次成绩未能保存，请检查浏览器存储空间后再试。");
        } else {
          pendingChallengeSaveRef.current = null;
          setChallengeSaveFailed(false);
        }
        setLastSession(session);
      }
      if (nextTimerRef.current) {
        window.clearTimeout(nextTimerRef.current);
        nextTimerRef.current = null;
      }
      setFinishedReason(reason);
      setStarted(false);
    },
    [mode, timed],
  );

  useEffect(() => {
    if (!started || !timed) return;
    const updateRemaining = () => {
      setRemaining(calculateRemainingSeconds(deadlineRef.current));
    };
    updateRemaining();
    const timer = window.setInterval(updateRemaining, 250);
    return () => window.clearInterval(timer);
  }, [started, timed]);

  useEffect(() => {
    if (!started || timed) return;
    const onVisibilityChange = () => {
      const now = Date.now();
      if (document.visibilityState === "hidden") {
        if (challengeHiddenAtRef.current === null) {
          challengeHiddenAtRef.current = now;
        }
      } else if (challengeHiddenAtRef.current !== null) {
        challengeInactiveMsRef.current += now - challengeHiddenAtRef.current;
        challengeHiddenAtRef.current = null;
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [started, timed]);

  useEffect(() => {
    if (started && timed && remaining <= 0) {
      const answered = index + (feedback === "idle" ? 0 : 1);
      finishChallenge(answered, correct, "timeout");
    }
  }, [correct, feedback, finishChallenge, index, remaining, started, timed]);

  useEffect(
    () => () => {
      if (nextTimerRef.current) window.clearTimeout(nextTimerRef.current);
    },
    [],
  );

  const start = () => {
    if (!pool.length || challengeSaveFailed) return;
    if (nextTimerRef.current) window.clearTimeout(nextTimerRef.current);
    recordedRef.current = false;
    advanceLockRef.current = false;
    challengeObservationsRef.current = [];
    seenQuestionsRef.current.clear();
    startedAtRef.current = Date.now();
    challengeHiddenAtRef.current = null;
    challengeInactiveMsRef.current = 0;
    deadlineRef.current = startedAtRef.current + 60_000;
    setStarted(true);
    setIndex(0);
    setCorrect(0);
    setRemaining(60);
    setMistakes([]);
    setFinishedReason("");
    setLastSession(null);
    nextQuestion();
  };

  const retryChallengeSave = () => {
    const pending = pendingChallengeSaveRef.current;
    if (!pending) return;
    if (!savePracticeOutcome(pending.session, pending.observations)) {
      window.alert("仍未能保存，请清理部分本机数据后再试。");
      return;
    }
    pendingChallengeSaveRef.current = null;
    setChallengeSaveFailed(false);
  };

  const advanceQuestion = useCallback(
    (correctAnswers = correct) => {
      if (advanceLockRef.current || recordedRef.current) return;
      advanceLockRef.current = true;
      const nextIndex = index + 1;
      setIndex(nextIndex);
      if (nextIndex >= limit) {
        finishChallenge(nextIndex, correctAnswers, "complete");
        return;
      }
      nextQuestion();
    },
    [correct, finishChallenge, index, limit, nextQuestion],
  );

  const submit = () => {
    if (!question || !input || feedback !== "idle" || submitLockRef.current) return;
    submitLockRef.current = true;
    const isRight = input.toLowerCase() === question[1];
    setFeedback(isRight ? "right" : "wrong");
    const nextCorrect = correct + (isRight ? 1 : 0);
    challengeObservationsRef.current.push({
      text: question[0],
      code: question[1],
      kind: isRight ? "correct" : "coding-error",
    });
    if (isRight) {
      setCorrect(nextCorrect);
      nextTimerRef.current = window.setTimeout(
        () => advanceQuestion(nextCorrect),
        520,
      );
    } else {
      setMistakes((value) => [...value, { text: question[0], code: question[1], input }]);
    }
  };

  return (
    <section className="subpage">
      <div className="subpage-heading">
        <span className="eyebrow">A–Y 原码输入</span>
        <h1>字码挑战</h1>
        <p>绕过系统输入法，直接检验你对 86 版五笔编码的熟练度。</p>
      </div>
      {loadError ? (
        <ErrorState
          title="字码挑战暂时不可用"
          message={loadError}
          onRetry={() => setLoadAttempt((value) => value + 1)}
        />
      ) : (
      <div className="challenge-layout">
        <div className={`challenge-card${started && feedback === "wrong" ? " has-error" : ""}`}>
          {!started ? (
            <div className="challenge-start">
              <h2>
                {index
                  ? finishedReason === "timeout"
                    ? "时间到，本轮结束"
                    : "本轮挑战完成"
                  : "准备好了吗？"}
              </h2>
              {index > 0 && (
                <div className="result-score">
                  <strong>{correct}</strong><span>/ {index} 正确</span>
                </div>
              )}
              <p>看到汉字后输入最短可用五笔编码，按回车提交。答错后会停留显示正确编码。</p>
              {lastSession && (
                <button
                  className="button secondary"
                  onClick={() => downloadShareCard(lastSession)}
                >
                  下载本轮成绩卡
                </button>
              )}
              {challengeSaveFailed && (
                <p role="alert">本轮成绩尚未保存，请先重试保存。</p>
              )}
              {challengeSaveFailed && (
                <button className="button danger" onClick={retryChallengeSave}>
                  重试保存
                </button>
              )}
              <button
                className="button primary"
                disabled={loading || !pool.length || challengeSaveFailed}
                onClick={start}
              >
                {loading ? "正在加载离线码表…" : index ? "再来一轮" : "开始挑战"}
              </button>
            </div>
          ) : (
            <div className={`challenge-running${feedback === "wrong" ? " is-wrong" : ""}`}>
              <div className="challenge-status">
                <span>第 {index + 1} / {limit} 题</span>
                <span>正确 {correct}</span>
                {timed && <span>剩余 {remaining}s</span>}
              </div>
              <div
                key={question?.[0]}
                className="question-character question-swap"
                role="status"
                aria-live="polite"
                aria-atomic="true"
              >
                {question?.[0]}
              </div>
              <div className="code-slots" aria-hidden="true">
                {Array.from({ length: question?.[1].length ?? 0 }, (_, slot) => (
                  <span key={slot} className={input[slot] ? "filled" : ""}>
                    {input[slot]?.toUpperCase() || "·"}
                  </span>
                ))}
              </div>
              <input
                autoFocus
                className={`code-input ${feedback}`}
                value={input}
                maxLength={question?.[1].length ?? 4}
                onChange={(event) =>
                  setInput(
                    event.target.value.replace(/[^a-y]/gi, "").toLowerCase(),
                  )
                }
                onKeyDown={(event) => {
                  if (event.nativeEvent.isComposing || event.keyCode === 229) {
                    return;
                  }
                  if (
                    !["Shift", "Control", "Alt", "Meta", "CapsLock"].includes(
                      event.key,
                    )
                  ) {
                    recordKeyUsage(event.code);
                    playKeySound();
                  }
                  if (event.key === "Enter" && feedback === "idle") submit();
                  if (event.key === "Enter" && feedback === "wrong") advanceQuestion();
                }}
                placeholder="输入编码后回车"
                aria-label={`请输入“${question?.[0] ?? "当前题目"}”的五码编码`}
                aria-invalid={feedback === "wrong"}
                readOnly={feedback !== "idle"}
              />
              <div className="feedback-region" aria-live="assertive">
                {feedback === "right" && <p className="feedback right">编码正确，继续下一题</p>}
                {feedback === "wrong" && (
                  <div className="wrong-answer" role="alert">
                    <span>本题答错</span>
                    <p>
                      你的输入 <del>{input.toUpperCase()}</del>
                      <i aria-hidden="true">→</i>
                      正确编码 <strong>{question?.[1].toUpperCase()}</strong>
                    </p>
                    <button className="button danger" onClick={() => advanceQuestion()}>
                      {index + 1 >= limit ? "查看本轮结果" : "下一题（回车）"}
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
        <aside className="side-panel settings-mini">
          <h3>挑战设置</h3>
          <div className="segmented">
            <button disabled={started} aria-pressed={mode === "char"} className={mode === "char" ? "active" : ""} onClick={() => setMode("char")}>单字</button>
            <button disabled={started} aria-pressed={mode === "phrase"} className={mode === "phrase" ? "active" : ""} onClick={() => setMode("phrase")}>词组</button>
          </div>
          <label>题量
            <select disabled={started} value={limit} onChange={(event) => setLimit(Number(event.target.value) as 20 | 50)}>
              <option value={20}>20 题</option>
              <option value={50}>50 题</option>
            </select>
          </label>
          <label className="switch-row">
            <span><strong>60 秒限时</strong><small>时间结束自动停止</small></span>
            <input type="checkbox" disabled={started} checked={timed} onChange={(event) => setTimed(event.target.checked)} />
          </label>
          <div className="mistake-summary">
            <span>本轮错题</span>
            <strong>{mistakes.length}</strong>
          </div>
          {mistakes.slice(-4).map((item) => (
            <div className="mistake-row" key={`${item.text}-${item.input}`}>
              <b>{item.text}</b><span>{item.input || "空"} → {item.code}</span>
            </div>
          ))}
        </aside>
      </div>
      )}
    </section>
  );
}

function LookupView() {
  const [rows, setRows] = useState<WubiEntry[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [loadAttempt, setLoadAttempt] = useState(0);
  const deferredQuery = useDeferredValue(query.trim());

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError("");
    loadWubi()
      .then((nextRows) => {
        if (active) setRows(nextRows);
      })
      .catch((error: unknown) => {
        if (active) {
          setLoadError(
            error instanceof Error ? error.message : "五笔码表加载失败",
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [loadAttempt]);

  const searchIndexes = useMemo(() => {
    const byCode = new Map<string, WubiEntry[]>();
    const byText = new Map<string, WubiEntry[]>();
    rows.forEach((entry) => {
      const codeEntries = byCode.get(entry[1]) || [];
      codeEntries.push(entry);
      byCode.set(entry[1], codeEntries);
      const textEntries = byText.get(entry[0]) || [];
      textEntries.push(entry);
      byText.set(entry[0], textEntries);
    });
    return { byCode, byText };
  }, [rows]);

  const results = useMemo(() => {
    const value = deferredQuery.toLowerCase();
    if (!value) return [];
    const isCode = /^[a-y]{1,4}$/.test(value);
    const matches = isCode
      ? searchIndexes.byCode.get(value) ?? []
      : searchIndexes.byText.get(deferredQuery) ??
        rows.filter(([text]) => text.includes(deferredQuery));
    return [...matches].sort((a, b) => b[2] - a[2]).slice(0, 60);
  }, [deferredQuery, rows, searchIndexes]);

  const groupedResults = useMemo(() => {
    const map = new Map<string, WubiEntry[]>();
    results.forEach((entry) => {
      const list = map.get(entry[0]) || [];
      list.push(entry);
      map.set(entry[0], list);
    });
    return Array.from(map.entries());
  }, [results]);

  return (
    <section className="subpage lookup-page">
      <div className="subpage-heading lookup-heading">
        <span className="eyebrow">离线收录 13 万余条编码</span>
        <h1>86 版五笔查码</h1>
        <p>输入汉字、词组或 1–4 位编码，结果完全来自本地码表。</p>
      </div>
      <div className="lookup-search">
        <span aria-hidden="true">查</span>
        <input
          aria-label="查询汉字、词组或五笔编码"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={loading ? "正在加载离线码表…" : "例如：五笔、测试、ggtt"}
        />
        {query && <button onClick={() => setQuery("")}>清除</button>}
      </div>
      {loadError && (
        <ErrorState
          title="五笔码表没有加载成功"
          message={loadError}
          onRetry={() => setLoadAttempt((value) => value + 1)}
        />
      )}
      {!query && (
        <div className="lookup-empty">
          <div className="keyboard-visual">
            {"QWERTYUIOPASDFGHJKLXCVBNM".split("").map((key) => (
              <span key={key}>{key}</span>
            ))}
          </div>
          <h2>查一个字，也可以反查一组编码</h2>
          <p>输入中文会匹配汉字与词组；输入英文字母会精确反查编码。</p>
          <div className="quick-searches">
            {["五笔", "测试", "输入法", "ggtt"].map((item) => (
              <button key={item} onClick={() => setQuery(item)}>{item}</button>
            ))}
          </div>
        </div>
      )}
      {query && !loading && !loadError && (
        <div className="lookup-results">
          <div className="result-heading" role="status" aria-live="polite">
            <span>查询结果</span><strong>{results.length} 条</strong>
          </div>
          {groupedResults.map(([text, entries]) => (
            <div className="lookup-row" key={text}>
              <strong>{text}</strong>
              <div>
                {entries.map((entry) => <code key={entry[1]}>{entry[1].toUpperCase()}</code>)}
              </div>
              <small>{Array.from(text).length === 1 ? "单字" : `${Array.from(text).length} 字词组`}</small>
            </div>
          ))}
          {!results.length && <div className="empty-state">没有找到对应编码，请检查输入内容。</div>}
        </div>
      )}
    </section>
  );
}

function HistoryView({
  onPracticeHesitation,
  onAddHesitationToQueue,
  queuedFingerprints,
  masteredAtByFingerprint,
  hesitationSaveRevision,
}: {
  onPracticeHesitation: (target: HesitationPracticeTarget) => void;
  onAddHesitationToQueue: (target: HesitationPracticeTarget) => void;
  queuedFingerprints: ReadonlySet<string>;
  masteredAtByFingerprint: ReadonlyMap<string, string>;
  hesitationSaveRevision: number;
}) {
  const router = useRouter();
  const [sessions, setSessions] = useState<SessionResult[]>([]);
  const [progress, setProgress] = useState<ArticleProgress[]>([]);
  const [errors, setErrors] = useState<ErrorStat[]>([]);
  const [phraseOpportunities, setPhraseOpportunities] = useState<PhraseOpportunityStat[]>([]);
  const [reportNow, setReportNow] = useState<Date | null>(null);
  const [articleTotal, setArticleTotal] = useState(FALLBACK_ARTICLE_COUNT);
  const [type, setType] = useState<
    "all" | "article" | "challenge" | "training" | "advanced"
  >("all");
  const [expandedHeatmapId, setExpandedHeatmapId] = useState<string | null>(null);

  const refresh = useCallback(() => {
    setSessions(getSessions());
    setProgress(getProgress());
    setErrors(getErrors());
    setPhraseOpportunities(getPhraseOpportunities());
  }, []);
  useEffect(refresh, [hesitationSaveRevision, refresh]);
  useEffect(() => {
    let timer = 0;
    const refreshReportClock = () => {
      const now = new Date();
      setReportNow(now);
      const nextDay = new Date(now);
      nextDay.setDate(nextDay.getDate() + 1);
      nextDay.setHours(0, 0, 0, 50);
      timer = window.setTimeout(
        refreshReportClock,
        Math.max(1000, nextDay.getTime() - now.getTime()),
      );
    };
    refreshReportClock();
    return () => window.clearTimeout(timer);
  }, []);
  useEffect(() => {
    let active = true;
    loadArticleMetadata()
      .then((rows) => {
        if (active) setArticleTotal(rows.length);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  const filtered = sessions.filter(
    (session) =>
      type === "all" ||
      session.type === type ||
      (type === "training" &&
        (session.type === "review" ||
          session.type === "roots" ||
          session.type === "hesitation")) ||
      (type === "advanced" &&
        (session.type === "rhythm" || session.type === "scenario")),
  );
  const articleSessions = sessions.filter((session) => session.type === "article");
  const totalChars = articleSessions.reduce((sum, session) => sum + session.correctChars, 0);
  const bestSpeed = articleSessions.reduce((best, session) => Math.max(best, session.speed), 0);
  const averageAccuracy = articleSessions.length
    ? articleSessions.reduce((sum, session) => sum + session.accuracy, 0) / articleSessions.length
    : 0;
  const completedArticleCount = progress.filter(
    (item) => item.completed,
  ).length;
  const weeklyReport = useMemo(
    () => reportNow
      ? buildWeeklyReport({ sessions, errors, phraseOpportunities, now: reportNow })
      : null,
    [errors, phraseOpportunities, reportNow, sessions],
  );

  const clearResults = () => {
    if (!window.confirm("确定清除全部本地成绩、错题、今日训练与十四日计划吗？此操作无法撤销。")) return;
    if (!clearPracticeHistory()) {
      window.alert("清除未完成，本机数据已恢复到操作前的状态，请稍后重试。");
      return;
    }
    setExpandedHeatmapId(null);
    refresh();
  };

  return (
    <section className="subpage">
      <div className="subpage-heading with-action">
        <div>
          <span className="eyebrow">只属于当前浏览器</span>
          <h1>本地成绩</h1>
          <p>查看训练趋势、文章完成情况和需要继续巩固的错字。</p>
        </div>
        <div className="heading-actions">
          <button className="button danger" onClick={clearResults}>
            清除练习数据与计划
          </button>
        </div>
      </div>
      <div className="summary-grid">
        <SummaryCard label="练习次数" value={sessions.length.toString()} note="文章、字码与专项训练" />
        <SummaryCard label="最高速度" value={`${bestSpeed}`} unit="字/分" note="文章测速个人最佳" accent />
        <SummaryCard label="累计字数" value={totalChars.toLocaleString("zh-CN")} note="正确完成字符" />
        <SummaryCard label="平均字准" value={averageAccuracy.toFixed(1)} unit="%" note="仅统计文章测速" />
      </div>
      {weeklyReport ? (
        <WeeklyReportPanel report={weeklyReport} />
      ) : (
        <section className="trend-panel" aria-label="能力周报加载中">
          <span className="eyebrow">能力周报 · V0.6</span>
          <p className="trend-empty">正在读取本机数据并生成本周周报…</p>
        </section>
      )}
      <TrendPanel sessions={sessions} />
      <div className="history-grid">
        <div className="history-panel">
          <div className="panel-title">
            <h2>最近练习</h2>
            <div className="segmented small history-filter" aria-label="练习类型筛选">
              {(["all", "article", "challenge", "training", "advanced"] as const).map((value) => (
                <button
                  key={value}
                  className={type === value ? "active" : ""}
                  aria-pressed={type === value}
                  onClick={() => setType(value)}
                >
                  {value === "all"
                    ? "全部"
                    : value === "article"
                      ? "文章"
                      : value === "challenge"
                        ? "字码"
                        : value === "training"
                          ? "专项"
                          : "进阶"}
                </button>
              ))}
            </div>
          </div>
          <div className="session-table">
            <div className="table-head">
              <span>练习</span>
              <span>速度</span>
              <span>击键</span>
              <span>码长</span>
              <span>字准</span>
              <span>时间</span>
              <span>操作</span>
            </div>
            {filtered.slice(0, 12).map((session) => (
              <div className="table-row" key={session.id}>
                <span className="session-practice">
                  <strong>{session.title}</strong>
                  <small>{new Date(session.date).toLocaleString("zh-CN")}</small>
                </span>
                <span className="session-speed">
                  {session.speed || "—"}
                  <small>
                    {session.type === "article" || session.type === "hesitation" || session.type === "rhythm" || session.type === "scenario"
                      ? "字/分"
                      : "题/分"}
                  </small>
                </span>
                <span className="session-kps">
                  {["article", "rhythm", "scenario"].includes(session.type) ? session.kps.toFixed(2) : "—"}
                  <small>次/秒</small>
                </span>
                <span className="session-code-length">
                  {Number.isFinite(session.codeLength) && session.codeLength > 0 ? (
                    <>
                      {session.codeLength.toFixed(2)}
                      <small>键/字</small>
                      {session.theoreticalCodeLength !== undefined &&
                        session.theoreticalCodeLength !== null && (
                          <small className="session-theoretical">
                            理论 {session.theoreticalCodeLength.toFixed(2)}
                          </small>
                        )}
                    </>
                  ) : (
                    "—"
                  )}
                </span>
                <span className="session-accuracy">
                  {session.accuracy.toFixed(1)}<small>%</small>
                </span>
                <span className="session-duration">
                  {formatDuration(session.durationSeconds)}
                </span>
                <div className="session-actions">
                  {session.heatmap && (
                    <button
                      className="session-heatmap-trigger"
                      aria-expanded={expandedHeatmapId === session.id}
                      aria-controls={`session-heatmap-${session.id}`}
                      onClick={() =>
                        setExpandedHeatmapId((current) =>
                          current === session.id ? null : session.id,
                        )
                      }
                    >
                      卡顿图
                    </button>
                  )}
                  {session.rhythmSummary && (
                    <button
                      className="session-heatmap-trigger"
                      aria-expanded={expandedHeatmapId === session.id}
                      aria-controls={`session-heatmap-${session.id}`}
                      onClick={() =>
                        setExpandedHeatmapId((current) =>
                          current === session.id ? null : session.id,
                        )
                      }
                    >
                      节奏
                    </button>
                  )}
                  <button
                    className="session-share"
                    aria-label={`下载“${session.title}”成绩卡`}
                    onClick={() => downloadShareCard(session)}
                  >
                    <span aria-hidden="true">↓</span>
                    成绩卡
                  </button>
                </div>
                {session.type === "article" && session.keyCount !== undefined && (
                  <div className="session-diagnostics" aria-label={`${session.title}输入诊断`}>
                    <DiagnosticMetric
                      label="总键"
                      value={session.keyCount?.toString() ?? "—"}
                      unit=""
                    />
                    <DiagnosticMetric
                      label="键准"
                      value={
                        session.keyAccuracy === undefined
                          ? "—"
                          : session.keyAccuracy.toFixed(1)
                      }
                      unit={session.keyAccuracy === undefined ? "" : "%"}
                    />
                    <DiagnosticMetric label="回改" value={session.correctionCount?.toString() ?? "—"} unit="" />
                    <DiagnosticMetric label="退格" value={session.backspaceCount?.toString() ?? "—"} unit="" />
                    <DiagnosticMetric label="选重" value={session.selectionCount?.toString() ?? "—"} unit="" />
                    <DiagnosticMetric
                      label="打词"
                      value={session.phraseRate === undefined ? "—" : session.phraseRate.toFixed(1)}
                      unit={session.phraseRate === undefined ? "" : "%"}
                    />
                    <DiagnosticMetric
                      label="左右手"
                      value={
                        session.leftHandKeys === undefined || session.rightHandKeys === undefined
                          ? "—"
                          : `${session.leftHandKeys} / ${session.rightHandKeys}`
                      }
                      unit=""
                    />
                    <DiagnosticMetric
                      label="暂停"
                      value={
                        session.pauseCount === undefined
                          ? "—"
                          : `${session.pauseCount} / ${(session.pauseSeconds ?? 0).toFixed(1)}`
                      }
                      unit={session.pauseCount === undefined ? "" : "次/秒"}
                    />
                    <DiagnosticMetric label="重打" value={session.retryCount?.toString() ?? "—"} unit="" />
                  </div>
                )}
                {(session.heatmap || session.rhythmSummary) && expandedHeatmapId === session.id && (
                  <div
                    className="session-heatmap-detail"
                    id={`session-heatmap-${session.id}`}
                  >
                    {session.rhythmSummary && (
                      <RhythmSummaryView
                        summary={session.rhythmSummary}
                        onPractice={(segment) => openRhythmSegmentPractice(router, segment)}
                      />
                    )}
                    {session.heatmap && (
                      <HesitationHeatmap
                        heatmap={session.heatmap}
                        compact
                        source={session}
                        onPractice={onPracticeHesitation}
                        onAddToQueue={onAddHesitationToQueue}
                        queuedFingerprints={queuedFingerprints}
                        masteredAtByFingerprint={masteredAtByFingerprint}
                      />
                    )}
                  </div>
                )}
              </div>
            ))}
            {!filtered.length && <div className="empty-state">完成一次练习后，成绩会出现在这里。</div>}
          </div>
        </div>
        <aside className="history-panel">
          <div className="panel-title"><h2>高频错字</h2><span>{errors.length} 个</span></div>
          <div className="error-cloud">
            {errors.slice(0, 18).map((error) => (
              <div key={`${error.text}-${error.code}`}>
                <strong>{error.text}</strong>
                <span>{error.code?.toUpperCase() || "文章错字"}</span>
                <b>{error.count}</b>
              </div>
            ))}
            {!errors.length && <div className="empty-state">暂时没有错字记录。</div>}
          </div>
          <div className="completion-stat">
            <span>文章完成度</span>
            <strong>{completedArticleCount} / {articleTotal}</strong>
            <i
              role="progressbar"
              aria-label="文章完成度"
              aria-valuemin={0}
              aria-valuemax={articleTotal}
              aria-valuenow={completedArticleCount}
            >
              <b
                style={{
                  width: `${Math.min(100, (completedArticleCount / articleTotal) * 100)}%`,
                }}
              />
            </i>
          </div>
        </aside>
      </div>
    </section>
  );
}

function SettingsView({
  settings,
  onChange,
  playKeySound,
}: {
  settings: UserSettings;
  onChange: (settings: UserSettings) => void;
  playKeySound: KeySoundPlayer;
}) {
  const update = <K extends keyof UserSettings>(key: K, value: UserSettings[K]) =>
    onChange({ ...settings, [key]: value });
  const customTheme = settings.customTheme ?? defaultCustomTheme;
  const customVariables = buildCustomThemeVariables(
    customTheme.accent,
    customTheme.canvas,
  );
  const canvasTextRatio = getContrastRatio(
    customTheme.canvas,
    customVariables["--custom-text"],
  );
  const accentTextRatio = getContrastRatio(
    customTheme.accent,
    customVariables["--custom-accent-text"],
  );
  const accentCanvasRatio = getContrastRatio(
    customTheme.accent,
    customTheme.canvas,
  );
  const hasLowAccentSeparation = accentCanvasRatio < 3;
  const updateCustomTheme = (key: "accent" | "canvas", value: string) =>
    onChange({
      ...settings,
      customTheme: { ...customTheme, [key]: value.toUpperCase() },
    });

  return (
    <section className="subpage settings-page">
      <div className="subpage-heading">
        <span className="eyebrow">按你的习惯调整</span>
        <h1>练习设置</h1>
        <p>设置会立即生效，并保存在当前浏览器中。</p>
      </div>
      <div className="settings-grid">
        <div className="settings-card theme-settings-card">
          <div className="settings-card-title"><span>文</span><div><h2>文字与界面</h2><p>调整跟打区的可读性</p></div></div>
          <div className="theme-settings">
            <div className="theme-settings-controls">
              <label className="range-row">
                <span><strong>正文字号</strong><small>{settings.fontSize}px</small></span>
                <input type="range" min={22} max={42} value={settings.fontSize} onChange={(event) => update("fontSize", Number(event.target.value))} />
              </label>
              <fieldset className="theme-preset-fieldset">
                <legend>主题预设</legend>
                <div className="theme-preset-grid">
                  {themeOptions.map((option) => {
                    const selected = settings.theme === option.id;
                    const swatchCanvas = option.id === "custom"
                      ? customTheme.canvas
                      : option.canvas;
                    const swatchAccent = option.id === "custom"
                      ? customTheme.accent
                      : option.accent;
                    const swatchText = chooseContrastText(swatchCanvas);
                    return (
                      <label
                        key={option.id}
                        className={`theme-preset-option${selected ? " is-selected" : ""}`}
                        data-theme-option={option.id}
                        style={{
                          "--preset-canvas": swatchCanvas,
                          "--preset-paper": mixHex(swatchCanvas, swatchText === "#FFFFFF" ? "#000000" : "#FFFFFF", 0.12),
                          "--preset-text": swatchText,
                          "--preset-accent": swatchAccent,
                        } as CSSProperties}
                      >
                        <input
                          type="radio"
                          name="theme"
                          value={option.id}
                          checked={selected}
                          onChange={() => update("theme", option.id)}
                        />
                        <span className="theme-preset-swatch" aria-hidden="true"><i /></span>
                        <span><strong>{themeLabels[option.id]}</strong><small>{option.description}</small></span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>

              {settings.theme === "custom" && (
                <div className="custom-theme-controls">
                  <div className="custom-theme-heading">
                    <div><strong>自定义配色</strong><small>语义状态色保持固定，不随这里改变。</small></div>
                    <button
                      className="theme-reset-button"
                      type="button"
                      onClick={() => update("customTheme", { ...defaultCustomTheme })}
                    >
                      恢复当前主题默认配色
                    </button>
                  </div>
                  <div className="color-control-grid">
                    <label className="color-control" htmlFor="custom-theme-accent">
                      <span><strong>强调色</strong><small>{customTheme.accent}</small></span>
                      <input
                        id="custom-theme-accent"
                        type="color"
                        value={customTheme.accent}
                        aria-describedby="theme-contrast-note"
                        onChange={(event) => updateCustomTheme("accent", event.target.value)}
                      />
                    </label>
                    <label className="color-control" htmlFor="custom-theme-canvas">
                      <span><strong>页面背景色</strong><small>{customTheme.canvas}</small></span>
                      <input
                        id="custom-theme-canvas"
                        type="color"
                        value={customTheme.canvas}
                        aria-describedby="theme-contrast-note"
                        onChange={(event) => updateCustomTheme("canvas", event.target.value)}
                      />
                    </label>
                  </div>
                  <p
                    id="theme-contrast-note"
                    className={`theme-contrast-note${hasLowAccentSeparation ? " is-warning" : ""}`}
                    role="status"
                  >
                    {hasLowAccentSeparation
                      ? `颜色对比度不足：强调色与页面背景较接近（${accentCanvasRatio.toFixed(1)}:1），按钮已自动使用高对比度文字。`
                      : `文字对比度已自动校准：正文 ${canvasTextRatio.toFixed(1)}:1，按钮 ${accentTextRatio.toFixed(1)}:1，达到 WCAG AA。`}
                  </p>
                </div>
              )}
            </div>

            <div
              className="theme-preview"
              data-preview-theme={settings.theme}
              aria-label={`主题即时预览：${themeLabels[settings.theme]}`}
            >
              <div className="theme-preview-toolbar"><span>即时预览</span><b>{themeLabels[settings.theme]}</b></div>
              <div className="theme-preview-card">
                <div><strong>普通文字与卡片</strong><p>保持安静、清晰，适合长时间练习。</p></div>
                <span className="theme-preview-button">开始练习</span>
              </div>
              <div className="theme-preview-practice"><span>练习区域</span><strong>稳中求快，准确优先。</strong></div>
            </div>
          </div>
        </div>
        <div className="settings-card">
          <div className="settings-card-title"><span>键</span><div><h2>练习偏好</h2><p>控制默认训练方式</p></div></div>
          <label>
            默认文章长度
            <select value={settings.preferredLength} onChange={(event) => update("preferredLength", event.target.value as UserSettings["preferredLength"])}>
              {Object.entries(lengthLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <Toggle label="完成后自动下一篇" note="结算后按钮直接抽取新文章" checked={settings.autoNext} onChange={(value) => update("autoNext", value)} />
        </div>
        <div className="settings-card">
          <div className="settings-card-title"><span>辅</span><div><h2>辅助反馈</h2><p>保持专注或获得更多提示</p></div></div>
          <Toggle label="显示编码提示" note="跟打区底部显示当前汉字的最短编码" checked={settings.showCodeHints} onChange={(value) => update("showCodeHints", value)} />
          <Toggle
            label="按键声音"
            note="文章测速和字码挑战输入时播放轻提示音"
            checked={settings.sound}
            onChange={(value) => {
              update("sound", value);
              if (value) playKeySound({ force: true });
            }}
          />
        </div>
        <div className="settings-card license-card">
          <div className="settings-card-title"><span>i</span><div><h2>离线与版权</h2><p>数据来源清楚可核对</p></div></div>
          <p>练习文章为本项目原创生成内容。86 版码表来自 Rime 五笔方案，按 LGPL-3.0 保留原始许可证、作者信息和完整源数据。</p>
          <a href="https://github.com/rime/rime-wubi" target="_blank" rel="noreferrer">查看 Rime 五笔方案 ↗</a>
        </div>
      </div>
      <DataManagement />
      <PwaControl />
    </section>
  );
}
