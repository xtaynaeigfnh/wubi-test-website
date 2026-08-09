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
import {
  addError,
  buildCommonPracticeArticle,
  buildChallengePool,
  buildCustomArticle,
  buildMinimumCodeLengthIndex,
  calculateAccuracy,
  calculateRemainingSeconds,
  calculateTheoreticalMinimumCodeLength,
  calculateTypingMetrics,
  canCompleteTyping,
  clearKeyUsage,
  commonCharacterPresets,
  countCommittedAttempts,
  defaultSettings,
  formatDuration,
  getProgress,
  getSessions,
  isWubiLetterKey,
  lengthLabels,
  loadArticleMetadata,
  loadArticles,
  loadCommonCharacters,
  loadWubi,
  loadWubiChallenge,
  preferShortestWubiCodes,
  readLocal,
  readLocalArray,
  readSettings,
  recordKeyUsage,
  saveSession,
  isCommonPracticeArticle,
  selectInitialArticle,
  shouldDeferInputCommit,
  STORAGE,
  writeLocal,
  type MinimumCodeLengthIndex,
} from "../lib";
import type {
  AppView,
  ArticleFilter,
  ArticleProgress,
  CommonCharacterData,
  CommonCharacterPreset,
  ErrorStat,
  PracticeArticle,
  SessionResult,
  UserSettings,
  WubiEntry,
} from "../types";
import { downloadShareCard } from "../share-card";
import { DataManagement } from "./DataManagement";
import { PwaControl } from "./PwaControl";
import { TrainingCenter } from "./TrainingCenter";
import { TrendPanel } from "./TrendPanel";
import { ErrorState, Modal, SummaryCard, Toggle } from "./Ui";
import { KeySummary } from "./KeySummary";

const navItems: Array<{
  view: AppView;
  href: string;
  label: string;
  coordinate: string;
}> = [
  { view: "typing", href: "/", label: "文章测速", coordinate: "QW" },
  { view: "training", href: "/training", label: "今日训练", coordinate: "ER" },
  { view: "challenge", href: "/challenge", label: "字码挑战", coordinate: "TY" },
  { view: "lookup", href: "/lookup", label: "五笔查码", coordinate: "UI" },
  { view: "history", href: "/history", label: "本地成绩", coordinate: "OP" },
  { view: "settings", href: "/settings", label: "设置", coordinate: "AS" },
];

const FALLBACK_ARTICLE_COUNT = 300;

const isNavItemActive = (view: AppView, itemView: AppView) =>
  view === itemView || (view === "summary" && itemView === "history");

type KeySoundPlayer = (options?: { force?: boolean }) => void;

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
  const mainNavRef = useRef<HTMLElement>(null);
  const playKeySound = useKeySound(settings.sound);

  useEffect(() => {
    setSettings(readSettings());
    setSettingsReady(true);
  }, []);

  useEffect(() => {
    if (!settingsReady) return;
    const root = document.documentElement;
    root.dataset.theme = settings.theme;
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

  const themeLabels: Record<UserSettings["theme"], string> = {
    system: "系统",
    light: "浅色",
    dark: "深色",
  };
  const nextTheme: Record<UserSettings["theme"], UserSettings["theme"]> = {
    system: "light",
    light: "dark",
    dark: "system",
  };
  const cycleTheme = () =>
    setSettings((current) => ({
      ...current,
      theme: nextTheme[current.theme],
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
              aria-label={`当前${themeLabels[settings.theme]}主题，点击切换为${themeLabels[nextTheme[settings.theme]]}主题`}
              title={`主题：${themeLabels[settings.theme]}`}
            >
              <span aria-hidden="true">{
                settings.theme === "dark" ? "◐" : settings.theme === "light" ? "◑" : "◒"
              }</span>
              <b>{themeLabels[settings.theme]}</b>
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
            playKeySound={playKeySound}
          />
        )}
        {view === "training" && (
          <TrainingCenter playKeySound={playKeySound} />
        )}
        {view === "challenge" && (
          <ChallengeView playKeySound={playKeySound} />
        )}
        {view === "lookup" && <LookupView />}
        {view === "history" && <HistoryView />}
        {view === "summary" && <KeySummary />}
        {view === "settings" && (
          <SettingsView
            settings={settings}
            onChange={setSettings}
            playKeySound={playKeySound}
          />
        )}
      </main>

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
  playKeySound,
}: {
  settings: UserSettings;
  settingsReady: boolean;
  playKeySound: KeySoundPlayer;
}) {
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
  const [inputValue, setInputValue] = useState("");
  const [typed, setTyped] = useState("");
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [keyCount, setKeyCount] = useState(0);
  const [letterKeys, setLetterKeys] = useState(0);
  const [attemptCount, setAttemptCount] = useState(0);
  const [correctAttemptCount, setCorrectAttemptCount] = useState(0);
  const [errorCount, setErrorCount] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [lastSession, setLastSession] = useState<SessionResult | null>(null);
  const [progress, setProgress] = useState<ArticleProgress[]>([]);
  const composing = useRef(false);
  const recorded = useRef(false);
  const committedValue = useRef("");
  const startedAtRef = useRef<number | null>(null);
  const compositionCommitTimer = useRef<number | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const articleTextRef = useRef<HTMLDivElement>(null);
  const currentCharacterRef = useRef<HTMLSpanElement>(null);
  const errorPositions = useRef(new Set<number>());
  const [codeHints, setCodeHints] = useState<Map<string, string>>(new Map());
  const [codeHintsError, setCodeHintsError] = useState("");
  const [minimumCodeIndex, setMinimumCodeIndex] =
    useState<MinimumCodeLengthIndex | null>(null);
  const [minimumCodeError, setMinimumCodeError] = useState("");

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
    setCustomTexts(readLocalArray<PracticeArticle>(STORAGE.customTexts));
  }, []);

  useEffect(() => {
    let active = true;
    setMinimumCodeError("");
    loadWubi()
      .then((rows) => {
        if (active) setMinimumCodeIndex(buildMinimumCodeLengthIndex(rows));
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
  }, []);

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
        !commonOpen
      ) {
        setFocusMode(false);
      }
    };
    document.addEventListener("keydown", exitFocusMode);
    return () => {
      document.removeEventListener("keydown", exitFocusMode);
      delete root.dataset.focusMode;
    };
  }, [commonOpen, customOpen, focusMode, pickerOpen]);

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
    setStartedAt(now);
  }, []);

  const chooseArticle = useCallback(
    (next: PracticeArticle, focusInput = true) => {
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
      setAttemptCount(0);
      setCorrectAttemptCount(0);
      setErrorCount(0);
      setCompleted(false);
      setLastSession(null);
      composing.current = false;
      recorded.current = false;
      committedValue.current = "";
      startedAtRef.current = null;
      errorPositions.current = new Set();
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
    const currentId = readLocal<string | null>(STORAGE.current, null);
    const initialArticle = selectInitialArticle(
      availableArticles,
      articles,
      currentId,
      settings.preferredLength,
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
    const timer = window.setInterval(
      () => setElapsed((Date.now() - startedAt) / 1000),
      250,
    );
    return () => window.clearInterval(timer);
  }, [completed, startedAt]);

  const visibleText = article?.text || "";
  // Paragraph breaks are presentation, not typing targets. Keeping them in the
  // comparison made users enter invisible newline characters between paragraphs.
  const targetText = useMemo(
    () => visibleText.replace(/[\r\n]/g, ""),
    [visibleText],
  );
  const targetCharacters = useMemo(() => Array.from(targetText), [targetText]);
  const typedCharacters = useMemo(() => Array.from(typed), [typed]);
  const theoreticalCodeLength = useMemo(
    () =>
      minimumCodeIndex
        ? calculateTheoreticalMinimumCodeLength(targetText, minimumCodeIndex)
        : null,
    [minimumCodeIndex, targetText],
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
  const progressRatio = Math.min(
    1,
    typedCharacters.length / Math.max(1, targetCharacters.length),
  );
  const progressPercent = Math.round(progressRatio * 100);

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
    if (
      !article ||
      completed ||
      !canCompleteTyping(typed, targetText)
    ) {
      return;
    }
    const finalSeconds = startedAt ? (Date.now() - startedAt) / 1000 : 0;
    setElapsed(finalSeconds);
    setCompleted(true);
    if (recorded.current) return;
    recorded.current = true;
    const errorChars = Array.from(errorPositions.current)
      .map((index) => targetCharacters[index])
      .filter(Boolean);
    errorChars.forEach((character) => addError(character));
    const finalMetrics = calculateTypingMetrics({
      typed,
      target: targetText,
      durationSeconds: finalSeconds,
      keyCount,
      letterKeys,
      attemptCount,
      correctAttemptCount,
    });
    const session: SessionResult = {
      id: crypto.randomUUID(),
      type: "article",
      articleId:
        article.kind === "custom" ||
        article.kind === "common" ||
        article.id.startsWith("custom-")
          ? undefined
          : article.id,
      title: article.title,
      date: new Date().toISOString(),
      durationSeconds: finalSeconds,
      ...finalMetrics,
      errors: errorPositions.current.size,
      errorChars,
    };
    saveSession(session);
    setLastSession(session);
  }, [
    article,
    attemptCount,
    completed,
    correctAttemptCount,
    keyCount,
    letterKeys,
    startedAt,
    targetText,
    targetCharacters,
    typed,
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
    committedValue.current = committed;
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
    if (isWubiLetterKey(event.key, event.code)) {
      setLetterKeys((value) => value + 1);
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "v") {
      event.preventDefault();
    }
  };

  const useCustomText = () => {
    const custom = buildCustomArticle(
      `custom-${Date.now()}`,
      customTitle,
      customText,
    );
    if (!custom) return;
    const saved = readLocalArray<PracticeArticle>(STORAGE.customTexts);
    const nextCustomTexts = [
      custom,
      ...saved.filter((item) => item.id !== custom.id),
    ].slice(0, 20);
    writeLocal(STORAGE.customTexts, nextCustomTexts);
    setCustomTexts(nextCustomTexts);
    chooseArticle(custom);
    setCustomOpen(false);
  };

  const pickMostDifficult = () => {
    const target = [...getProgress()]
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
          <button className="button secondary" onClick={() => setCustomOpen(true)}>
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
        <Metric label="准确率" value={accuracy.toFixed(1)} unit="%" />
        <Metric label="回退" value={errorCount.toString()} unit="处" />
        <Metric label="用时" value={formatDuration(seconds)} unit="" />
      </section>

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
            <div className="practice-actions">
              <button onClick={() => setPickerOpen(true)}>选文章</button>
              <button onClick={randomArticle}>随机</button>
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
                    onClick={() => chooseArticle(article)}
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
            aria-valuetext={`已完成 ${progressPercent}%，五格依次对应撇、捺、横、竖、折区`}
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
            disabled={completed}
            placeholder={completed ? "本次练习已完成" : "点击这里，切换到五笔输入法后开始输入…"}
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
                <span className="completion-icon">成</span>
                <div>
                  <span>本次成绩已存入本机</span>
                  <strong>完成本次练习</strong>
                </div>
              </div>
              <div className="completion-results" aria-label="本次练习成绩">
                <span><small>速度</small><span className="completion-value"><strong>{speed}</strong><i>字/分</i></span></span>
                <span><small>击键</small><span className="completion-value"><strong>{kps.toFixed(2)}</strong><i>次/秒</i></span></span>
                <span><small>码长</small><span className="completion-value"><strong>{codeLength.toFixed(2)}</strong><i>键/字</i></span></span>
                <span><small>准确率</small><span className="completion-value"><strong>{accuracy.toFixed(1)}</strong><i>%</i></span></span>
                <span><small>回退</small><span className="completion-value"><strong>{errorCount}</strong><i>处</i></span></span>
              </div>
              <div className="completion-next">
                <p>练习记录只保存在当前浏览器。</p>
                <button
                  className="button secondary"
                  disabled={!lastSession}
                  onClick={() => lastSession && downloadShareCard(lastSession)}
                >
                  下载成绩卡
                </button>
                <button className="button primary" onClick={settings.autoNext ? randomArticle : () => chooseArticle(article)}>
                  {settings.autoNext ? "下一篇" : "再练一次"}
                </button>
              </div>
            </div>
          )}
        </article>

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
            <label>正文<textarea value={customText} onChange={(event) => setCustomText(event.target.value)} placeholder="粘贴 10–5000 字的纯文本…" /></label>
            <div className="modal-actions">
              <span>{customText.trim().length} / 5000 字</span>
              <button className="button primary" disabled={customText.trim().length < 10} onClick={useCustomText}>开始练习</button>
            </div>
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
  const startedAtRef = useRef(0);
  const recordedRef = useRef(false);
  const nextTimerRef = useRef<number | null>(null);
  const deadlineRef = useRef(0);
  const seenQuestionsRef = useRef(new Set<string>());
  const submitLockRef = useRef(false);

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
  }, [pool]);

  const finishChallenge = useCallback(
    (
      answered: number,
      correctAnswers: number,
      reason: "complete" | "timeout",
    ) => {
      if (recordedRef.current) return;
      recordedRef.current = true;
      const elapsedSeconds = Math.max(
        0,
        (Date.now() - startedAtRef.current) / 1000,
      );
      const durationSeconds = timed
        ? Math.min(60, elapsedSeconds)
        : elapsedSeconds;
      if (answered > 0) {
        const session: SessionResult = {
          id: crypto.randomUUID(),
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
        saveSession(session);
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
    if (!pool.length) return;
    if (nextTimerRef.current) window.clearTimeout(nextTimerRef.current);
    recordedRef.current = false;
    seenQuestionsRef.current.clear();
    startedAtRef.current = Date.now();
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

  const advanceQuestion = useCallback(
    (correctAnswers = correct) => {
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
    if (isRight) {
      setCorrect(nextCorrect);
      nextTimerRef.current = window.setTimeout(
        () => advanceQuestion(nextCorrect),
        520,
      );
    } else {
      setMistakes((value) => [...value, { text: question[0], code: question[1], input }]);
      addError(question[0], question[1]);
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
              <button className="button primary" disabled={loading || !pool.length} onClick={start}>
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
                onChange={(event) => setInput(event.target.value.replace(/[^a-y]/gi, "").toLowerCase())}
                onKeyDown={(event) => {
                  if (!["Shift", "Control", "Alt", "Meta", "CapsLock"].includes(event.key)) {
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

function HistoryView() {
  const [sessions, setSessions] = useState<SessionResult[]>([]);
  const [progress, setProgress] = useState<ArticleProgress[]>([]);
  const [errors, setErrors] = useState<ErrorStat[]>([]);
  const [articleTotal, setArticleTotal] = useState(FALLBACK_ARTICLE_COUNT);
  const [type, setType] = useState<
    "all" | "article" | "challenge" | "training"
  >("all");

  const refresh = () => {
    setSessions(getSessions());
    setProgress(getProgress());
    setErrors(readLocalArray<ErrorStat>(STORAGE.errors));
  };
  useEffect(refresh, []);
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
        (session.type === "review" || session.type === "roots")),
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

  const clearResults = () => {
    if (!window.confirm("确定清除全部本地成绩和错题记录吗？此操作无法撤销。")) return;
    writeLocal(STORAGE.sessions, []);
    writeLocal(STORAGE.progress, []);
    writeLocal(STORAGE.errors, []);
    clearKeyUsage();
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
          <Link className="button secondary" href="/summary">查看按键画像</Link>
          <button className="button danger" onClick={clearResults}>
            清除成绩与错题
          </button>
        </div>
      </div>
      <div className="summary-grid">
        <SummaryCard label="练习次数" value={sessions.length.toString()} note="文章、字码与专项训练" />
        <SummaryCard label="最高速度" value={`${bestSpeed}`} unit="字/分" note="文章测速个人最佳" accent />
        <SummaryCard label="累计字数" value={totalChars.toLocaleString("zh-CN")} note="正确完成字符" />
        <SummaryCard label="平均准确率" value={averageAccuracy.toFixed(1)} unit="%" note="仅统计文章测速" />
      </div>
      <TrendPanel sessions={sessions} />
      <div className="history-grid">
        <div className="history-panel">
          <div className="panel-title">
            <h2>最近练习</h2>
            <div className="segmented small history-filter" aria-label="练习类型筛选">
              {(["all", "article", "challenge", "training"] as const).map((value) => (
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
                        : "专项"}
                </button>
              ))}
            </div>
          </div>
          <div className="session-table">
            <div className="table-head">
              <span>练习</span>
              <span>速度</span>
              <span>码长</span>
              <span>准确率</span>
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
                  <small>{session.type === "article" ? "字/分" : "题/分"}</small>
                </span>
                <span className="session-code-length">
                  {Number.isFinite(session.codeLength) && session.codeLength > 0 ? (
                    <>
                      {session.codeLength.toFixed(2)}
                      <small>键/字</small>
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
                <button
                  className="session-share"
                  aria-label={`下载“${session.title}”成绩卡`}
                  onClick={() => downloadShareCard(session)}
                >
                  <span aria-hidden="true">↓</span>
                  成绩卡
                </button>
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

  return (
    <section className="subpage settings-page">
      <div className="subpage-heading">
        <span className="eyebrow">按你的习惯调整</span>
        <h1>练习设置</h1>
        <p>设置会立即生效，并保存在当前浏览器中。</p>
      </div>
      <div className="settings-grid">
        <div className="settings-card">
          <div className="settings-card-title"><span>文</span><div><h2>文字与界面</h2><p>调整跟打区的可读性</p></div></div>
          <label className="range-row">
            <span><strong>正文字号</strong><small>{settings.fontSize}px</small></span>
            <input type="range" min={22} max={42} value={settings.fontSize} onChange={(event) => update("fontSize", Number(event.target.value))} />
          </label>
          <label>
            默认主题
            <select value={settings.theme} onChange={(event) => update("theme", event.target.value as UserSettings["theme"])}>
              <option value="system">跟随系统</option>
              <option value="light">浅色</option>
              <option value="dark">深色</option>
            </select>
          </label>
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
