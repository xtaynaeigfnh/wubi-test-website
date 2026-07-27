"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import Link from "next/link";
import {
  addError,
  defaultSettings,
  formatDuration,
  getProgress,
  getSessions,
  lengthLabels,
  loadArticles,
  loadWubi,
  readLocal,
  saveSession,
  STORAGE,
  writeLocal,
} from "../lib";
import type {
  AppView,
  ArticleFilter,
  ArticleProgress,
  ErrorStat,
  PracticeArticle,
  SessionResult,
  UserSettings,
  WubiEntry,
} from "../types";

const navItems: Array<{ view: AppView; href: string; label: string; shortcut: string }> = [
  { view: "typing", href: "/", label: "文章测速", shortcut: "01" },
  { view: "challenge", href: "/challenge", label: "字码挑战", shortcut: "02" },
  { view: "lookup", href: "/lookup", label: "五笔查码", shortcut: "03" },
  { view: "history", href: "/history", label: "本地成绩", shortcut: "04" },
  { view: "settings", href: "/settings", label: "设置", shortcut: "05" },
];

export function WubiApp({ view }: { view: AppView }) {
  const [articles, setArticles] = useState<PracticeArticle[]>([]);
  const [articlesLoading, setArticlesLoading] = useState(true);
  const [settings, setSettings] = useState<UserSettings>(defaultSettings);

  useEffect(() => {
    setSettings({ ...defaultSettings, ...readLocal(STORAGE.settings, defaultSettings) });
    loadArticles()
      .then(setArticles)
      .finally(() => setArticlesLoading(false));
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = settings.theme;
    writeLocal(STORAGE.settings, settings);
  }, [settings]);

  return (
    <div className="app-shell">
      <header className="site-header">
        <div className="header-inner">
          <Link href="/" className="brand" aria-label="五笔测试网站首页">
            <span className="brand-mark">五</span>
            <span>
              <strong>五笔测试网站</strong>
              <small>WUBI 86 / LOCAL LAB</small>
            </span>
          </Link>
          <nav className="main-nav" aria-label="主导航">
            {navItems.map((item) => (
              <Link
                key={item.view}
                href={item.href}
                className={view === item.view ? "nav-item active" : "nav-item"}
              >
                <span aria-hidden="true">{item.shortcut}</span>
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="local-badge"><i /> 数据仅存本机</div>
        </div>
      </header>

      <main className="page-wrap">
        {view === "typing" && (
          <TypingView
            articles={articles}
            loading={articlesLoading}
            settings={settings}
          />
        )}
        {view === "challenge" && <ChallengeView />}
        {view === "lookup" && <LookupView />}
        {view === "history" && <HistoryView articles={articles} />}
        {view === "settings" && (
          <SettingsView settings={settings} onChange={setSettings} />
        )}
      </main>

      <footer className="site-footer">
        <span>五笔测试网站 · 专注 86 版五笔训练</span>
        <span>
          码表来源：Rime 五笔方案（LGPL-3.0） · 所有练习记录只保存在当前浏览器
        </span>
      </footer>
    </div>
  );
}

function TypingView({
  articles,
  loading,
  settings,
}: {
  articles: PracticeArticle[];
  loading: boolean;
  settings: UserSettings;
}) {
  const [article, setArticle] = useState<PracticeArticle | null>(null);
  const [filter, setFilter] = useState<ArticleFilter>({
    length: settings.preferredLength,
    topic: "all",
    status: "all",
  });
  const [pickerOpen, setPickerOpen] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const [customTitle, setCustomTitle] = useState("我的自定义练习");
  const [customText, setCustomText] = useState("");
  const [inputValue, setInputValue] = useState("");
  const [typed, setTyped] = useState("");
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [keyCount, setKeyCount] = useState(0);
  const [letterKeys, setLetterKeys] = useState(0);
  const [errorCount, setErrorCount] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [progress, setProgress] = useState<ArticleProgress[]>([]);
  const composing = useRef(false);
  const recorded = useRef(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const articleTextRef = useRef<HTMLDivElement>(null);
  const currentCharacterRef = useRef<HTMLSpanElement>(null);
  const errorPositions = useRef(new Set<number>());

  useEffect(() => {
    setProgress(getProgress());
  }, [completed]);
  const progressMap = useMemo(
    () => new Map(progress.map((row) => [row.articleId, row])),
    [progress],
  );
  const topics = useMemo(
    () => Array.from(new Set(articles.map((item) => item.topic))).sort(),
    [articles],
  );
  const filtered = useMemo(
    () =>
      articles.filter((item) => {
        const record = progressMap.get(item.id);
        if (filter.length !== "all" && item.length !== filter.length) return false;
        if (filter.topic !== "all" && item.topic !== filter.topic) return false;
        if (filter.status === "new" && record) return false;
        if (filter.status === "practiced" && !record) return false;
        return true;
      }),
    [articles, filter, progressMap],
  );

  const chooseArticle = useCallback(
    (next: PracticeArticle, focusInput = true) => {
      setArticle(next);
      writeLocal(STORAGE.current, next.id);
      const recent = readLocal<string[]>(STORAGE.recent, []);
      writeLocal(STORAGE.recent, [next.id, ...recent.filter((id) => id !== next.id)].slice(0, 10));
      setInputValue("");
      setTyped("");
      setStartedAt(null);
      setElapsed(0);
      setKeyCount(0);
      setLetterKeys(0);
      setErrorCount(0);
      setCompleted(false);
      composing.current = false;
      recorded.current = false;
      errorPositions.current = new Set();
      setPickerOpen(false);
      window.setTimeout(() => {
        articleTextRef.current?.scrollTo({ top: 0, behavior: "auto" });
        if (focusInput) inputRef.current?.focus();
      }, 50);
    },
    [],
  );

  const randomArticle = useCallback(() => {
    const pool = filtered.length ? filtered : articles;
    if (!pool.length) return;
    const recent = new Set(readLocal<string[]>(STORAGE.recent, []));
    const fresh = pool.filter((item) => !recent.has(item.id));
    const candidates = fresh.length ? fresh : pool;
    chooseArticle(candidates[Math.floor(Math.random() * candidates.length)]);
  }, [articles, chooseArticle, filtered]);

  useEffect(() => {
    if (!articles.length || article) return;
    const currentId = readLocal<string | null>(STORAGE.current, null);
    chooseArticle(
      articles.find((item) => item.id === currentId) ||
        articles.find((item) => item.length === "short") ||
        articles[0],
      false,
    );
  }, [article, articles, chooseArticle]);

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

  const correctChars = useMemo(() => {
    if (!article) return 0;
    let count = 0;
    for (let index = 0; index < typed.length; index += 1) {
      if (typed[index] === targetText[index]) count += 1;
    }
    return count;
  }, [article, targetText, typed]);
  const seconds = completed ? elapsed : elapsed || 0;
  const speed = seconds > 0 ? Math.round(correctChars / (seconds / 60)) : 0;
  const kps = seconds > 0 ? keyCount / seconds : 0;
  const codeLength = correctChars > 0 ? letterKeys / correctChars : 0;
  const accuracy = typed.length > 0 ? (correctChars / typed.length) * 100 : 100;

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
  }, [article?.id, typed.length]);

  useEffect(() => {
    if (!article || !typed) return;
    let changed = false;
    for (let index = 0; index < typed.length; index += 1) {
      if (typed[index] !== targetText[index] && !errorPositions.current.has(index)) {
        errorPositions.current.add(index);
        changed = true;
      }
    }
    if (changed) setErrorCount(errorPositions.current.size);
  }, [article, targetText, typed]);

  useEffect(() => {
    if (
      !article ||
      completed ||
      typed.length < targetText.length ||
      typed !== targetText
    ) {
      return;
    }
    const finalSeconds = startedAt ? (Date.now() - startedAt) / 1000 : 0;
    setElapsed(finalSeconds);
    setCompleted(true);
    if (recorded.current) return;
    recorded.current = true;
    const errorChars = Array.from(errorPositions.current)
      .map((index) => targetText[index])
      .filter(Boolean);
    errorChars.forEach((character) => addError(character));
    saveSession({
      id: crypto.randomUUID(),
      type: "article",
      articleId: article.id.startsWith("custom-") ? undefined : article.id,
      title: article.title,
      date: new Date().toISOString(),
      durationSeconds: finalSeconds,
      correctChars: targetText.length,
      attemptedChars: Math.max(targetText.length, typed.length),
      speed: finalSeconds > 0 ? Math.round(targetText.length / (finalSeconds / 60)) : 0,
      kps: finalSeconds > 0 ? keyCount / finalSeconds : 0,
      codeLength: targetText.length ? letterKeys / targetText.length : 0,
      accuracy: typed.length ? (correctChars / typed.length) * 100 : 100,
      errors: errorPositions.current.size,
      errorChars,
    });
  }, [
    article,
    completed,
    correctChars,
    keyCount,
    letterKeys,
    startedAt,
    targetText,
    typed,
  ]);

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (completed) return;
    if (!startedAt && event.key.length === 1) setStartedAt(Date.now());
    if (!["Shift", "Control", "Alt", "Meta", "CapsLock"].includes(event.key)) {
      setKeyCount((value) => value + 1);
    }
    if (/^[a-y]$/i.test(event.key)) setLetterKeys((value) => value + 1);
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "v") {
      event.preventDefault();
    }
  };

  const useCustomText = () => {
    const clean = customText
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
      .trim()
      .slice(0, 5000);
    if (clean.length < 10) return;
    const custom: PracticeArticle = {
      id: `custom-${Date.now()}`,
      title: customTitle.trim() || "我的自定义练习",
      length: clean.length < 200 ? "short" : clean.length < 700 ? "medium" : "long",
      topic: "自定义",
      wordCount: clean.replace(/\s/g, "").length,
      version: 1,
      text: clean,
    };
    const saved = readLocal<PracticeArticle[]>(STORAGE.customTexts, []);
    writeLocal(STORAGE.customTexts, [custom, ...saved].slice(0, 20));
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

  if (loading || !article) {
    return <div className="loading-card">正在整理 200 篇练习文章…</div>;
  }

  return (
    <>
      <section className="hero-row">
        <div>
          <span className="eyebrow">WUBI 86 / 文章测速</span>
          <h1>一字一键，<em>练到手比眼快。</em></h1>
          <p>切换到系统五笔后直接输入。计时、速度、击键和错字都在本机完成。</p>
        </div>
        <div className="hero-actions">
          <button className="button secondary" onClick={() => setCustomOpen(true)}>
            ＋ 粘贴自定义文本
          </button>
          <button className="button primary" onClick={randomArticle}>
            随机换一篇 ↗
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
        <Metric label="码长" value={codeLength.toFixed(2)} unit="键/字" />
        <Metric label="准确率" value={accuracy.toFixed(1)} unit="%" />
        <Metric label="错字" value={errorCount.toString()} unit="处" />
        <Metric label="用时" value={formatDuration(seconds)} unit="" />
      </section>

      <section className="workspace-grid">
        <article className="typing-card">
          <div className="typing-toolbar">
            <div>
              <div className="article-kicker">
                <span>{lengthLabels[article.length]}</span>
                <span>{article.topic}</span>
                <span>{article.wordCount} 字</span>
              </div>
              <h2>{article.title}</h2>
            </div>
            <div className="toolbar-actions">
              <button onClick={() => setPickerOpen(true)}>选文章</button>
              <button onClick={() => chooseArticle(article)}>重新开始</button>
            </div>
          </div>
          <div className="progress-track">
            <i
              style={{
                width: `${Math.min(100, (typed.length / Math.max(1, visibleText.length)) * 100)}%`,
              }}
            />
          </div>
          <div className="root-rail" aria-label="五笔字根分区与文章五段进度">
            {[
              ["QWERT", "撇区"],
              ["YUIOP", "捺区"],
              ["ASDFG", "横区"],
              ["HJKLM", "竖区"],
              ["XCVBN", "折区"],
            ].map(([keys, label], index) => {
              const progressRatio = typed.length / Math.max(1, targetText.length);
              const isActive = Math.min(4, Math.floor(progressRatio * 5)) === index;
              return (
                <span className={isActive ? "active" : ""} key={keys}>
                  <b>{keys}</b>
                  <small>{label}</small>
                </span>
              );
            })}
          </div>
          <div
            ref={articleTextRef}
            className="article-text"
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
                targetIndex >= typed.length
                  ? targetIndex === typed.length
                    ? "current"
                    : "pending"
                  : typed[targetIndex] === character
                    ? "correct"
                    : "wrong";
              return (
                <span
                  ref={state === "current" ? currentCharacterRef : undefined}
                  className={state}
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
              if (composing.current) {
                // Keep the IME's full pre-edit buffer (for example "qingxi").
                // Truncating it to the few remaining article characters cancels
                // candidate selection near the end of an article in Safari.
                setInputValue(next);
                return;
              }
              const committed = next.replace(/[\r\n]/g, "").slice(0, targetText.length);
              setInputValue(committed);
              setTyped(committed);
            }}
            onCompositionStart={() => {
              composing.current = true;
            }}
            onCompositionEnd={(event) => {
              composing.current = false;
              const committed = event.currentTarget.value
                .replace(/[\r\n]/g, "")
                .slice(0, targetText.length);
              setInputValue(committed);
              setTyped(committed);
            }}
            onKeyDown={onKeyDown}
            onPaste={(event) => event.preventDefault()}
            disabled={completed}
            placeholder={completed ? "本次练习已完成" : "点击这里，切换到五笔输入法后开始输入…"}
            aria-label="跟打输入区"
            spellCheck={false}
          />
          <div className="typing-footer">
            <span>第 {Math.min(typed.length + 1, targetText.length)} / {targetText.length} 字</span>
            <span>输入第一个字符后开始计时 · 已禁用粘贴</span>
          </div>
          {completed && (
            <div className="completion-panel">
              <span className="completion-icon">成</span>
              <div>
                <strong>完成本次练习</strong>
                <p>速度 {speed} 字/分，准确率 {accuracy.toFixed(1)}%，成绩已保存在本机。</p>
              </div>
              <button className="button primary" onClick={settings.autoNext ? randomArticle : () => chooseArticle(article)}>
                {settings.autoNext ? "下一篇" : "再练一次"}
              </button>
            </div>
          )}
        </article>

        <aside className="side-panel">
          <div className="side-heading">
            <div>
              <span className="eyebrow">文章库</span>
              <h3>200 篇离线练习</h3>
            </div>
            <span className="count-badge">200</span>
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
          <div className="filter-result">
            <strong>{filtered.length}</strong>
            <span>篇符合条件</span>
          </div>
          <button className="side-action" onClick={randomArticle}>随机抽取一篇 <b>↗</b></button>
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
            {filtered.slice(0, 60).map((item) => {
              const record = progressMap.get(item.id);
              return (
                <button key={item.id} onClick={() => chooseArticle(item)}>
                  <span>
                    <strong>{item.title}</strong>
                    <small>{lengthLabels[item.length]} · {item.topic} · {item.wordCount} 字</small>
                  </span>
                  <span className="article-record">
                    {record ? `最佳 ${record.bestSpeed} 字/分 · ${record.attempts} 次` : "未练习"}
                  </span>
                </button>
              );
            })}
            {!filtered.length && <div className="empty-state">当前筛选条件下没有文章。</div>}
          </div>
        </Modal>
      )}

      {customOpen && (
        <Modal title="粘贴自定义文本" onClose={() => setCustomOpen(false)}>
          <div className="custom-form">
            <label>标题<input value={customTitle} onChange={(event) => setCustomTitle(event.target.value)} /></label>
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
}: {
  label: string;
  value: string;
  unit: string;
  primary?: boolean;
  active?: boolean;
}) {
  const className = [
    "metric",
    primary ? "primary-metric" : "",
    active ? "is-active" : "",
  ].filter(Boolean).join(" ");

  return (
    <div className={className}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{unit}</small>
    </div>
  );
}

function ChallengeView() {
  const [rows, setRows] = useState<WubiEntry[]>([]);
  const [loading, setLoading] = useState(true);
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
  const advanceTimerRef = useRef<number | null>(null);
  const submitLockRef = useRef(false);

  useEffect(() => {
    loadWubi()
      .then(setRows)
      .finally(() => setLoading(false));
  }, []);

  const pool = useMemo(() => {
    const filtered = rows.filter(([text, code, weight]) => {
      if (code.length > 4 || weight < 100000) return false;
      const size = Array.from(text).length;
      return mode === "char" ? size === 1 : size >= 2 && size <= 4;
    });
    return filtered.sort((a, b) => b[2] - a[2]).slice(0, 5000);
  }, [mode, rows]);

  const nextQuestion = useCallback(() => {
    if (!pool.length) return;
    setQuestion(pool[Math.floor(Math.random() * pool.length)]);
    setInput("");
    setFeedback("idle");
    submitLockRef.current = false;
  }, [pool]);

  useEffect(() => () => {
    if (advanceTimerRef.current !== null) window.clearTimeout(advanceTimerRef.current);
  }, []);

  useEffect(() => {
    if (!started || !timed || remaining <= 0) return;
    const timer = window.setInterval(() => setRemaining((value) => value - 1), 1000);
    return () => window.clearInterval(timer);
  }, [remaining, started, timed]);

  useEffect(() => {
    if (started && timed && remaining <= 0) setStarted(false);
  }, [remaining, started, timed]);

  const start = () => {
    if (advanceTimerRef.current !== null) window.clearTimeout(advanceTimerRef.current);
    setStarted(true);
    setIndex(0);
    setCorrect(0);
    setRemaining(60);
    setMistakes([]);
    nextQuestion();
  };

  const advanceQuestion = useCallback(() => {
    const nextIndex = index + 1;
    setIndex(nextIndex);
    if (nextIndex >= limit) {
      setStarted(false);
      return;
    }
    nextQuestion();
  }, [index, limit, nextQuestion]);

  const submit = () => {
    if (!question || !input || feedback !== "idle" || submitLockRef.current) return;
    submitLockRef.current = true;
    const isRight = input.toLowerCase() === question[1];
    setFeedback(isRight ? "right" : "wrong");
    if (isRight) {
      setCorrect((value) => value + 1);
      advanceTimerRef.current = window.setTimeout(advanceQuestion, 520);
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
      <div className="challenge-layout">
        <div className={`challenge-card${started && feedback === "wrong" ? " has-error" : ""}`}>
          {!started ? (
            <div className="challenge-start">
              <span className="giant-code">86</span>
              <h2>{index ? "本轮挑战完成" : "准备好了吗？"}</h2>
              {index > 0 && (
                <div className="result-score">
                  <strong>{correct}</strong><span>/ {index} 正确</span>
                </div>
              )}
              <p>看到汉字后输入规范五笔编码，按回车提交。答错后会停留显示正确编码。</p>
              <button className="button primary" disabled={loading} onClick={start}>
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
              <div className="question-character">{question?.[0]}</div>
              <div className="code-slots">
                {[0, 1, 2, 3].map((slot) => (
                  <span key={slot} className={input[slot] ? "filled" : ""}>
                    {input[slot]?.toUpperCase() || "·"}
                  </span>
                ))}
              </div>
              <input
                autoFocus
                className={`code-input ${feedback}`}
                value={input}
                maxLength={4}
                onChange={(event) => setInput(event.target.value.replace(/[^a-y]/gi, "").toLowerCase())}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && feedback === "idle") submit();
                  if (event.key === "Enter" && feedback === "wrong") advanceQuestion();
                }}
                placeholder="输入编码后回车"
                aria-label="五笔编码"
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
                    <button className="button danger" onClick={advanceQuestion}>
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
            <button className={mode === "char" ? "active" : ""} onClick={() => setMode("char")}>单字</button>
            <button className={mode === "phrase" ? "active" : ""} onClick={() => setMode("phrase")}>词组</button>
          </div>
          <label>题量
            <select value={limit} onChange={(event) => setLimit(Number(event.target.value) as 20 | 50)}>
              <option value={20}>20 题</option>
              <option value={50}>50 题</option>
            </select>
          </label>
          <label className="switch-row">
            <span><strong>60 秒限时</strong><small>时间结束自动停止</small></span>
            <input type="checkbox" checked={timed} onChange={(event) => setTimed(event.target.checked)} />
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
    </section>
  );
}

function LookupView() {
  const [rows, setRows] = useState<WubiEntry[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadWubi()
      .then(setRows)
      .finally(() => setLoading(false));
  }, []);

  const results = useMemo(() => {
    const value = query.trim().toLowerCase();
    if (!value) return [];
    const isCode = /^[a-y]{1,4}$/.test(value);
    const matches = rows.filter(([text, code]) =>
      isCode ? code === value : text === query.trim() || text.includes(query.trim()),
    );
    return matches.sort((a, b) => b[2] - a[2]).slice(0, 60);
  }, [query, rows]);

  const exact = useMemo(() => {
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
      <div className="subpage-heading centered">
        <span className="eyebrow">离线收录 13 万余条编码</span>
        <h1>86 版五笔查码</h1>
        <p>输入汉字、词组或 1–4 位编码，结果完全来自本地码表。</p>
      </div>
      <div className="lookup-search">
        <span aria-hidden="true">查</span>
        <input
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={loading ? "正在加载离线码表…" : "例如：五笔、测试、ggtt"}
        />
        {query && <button onClick={() => setQuery("")}>清除</button>}
      </div>
      {!query && (
        <div className="lookup-empty">
          <div className="keyboard-visual">
            {"QWERTYUIOPASDFGHJKL".split("").map((key) => <span key={key}>{key}</span>)}
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
      {query && !loading && (
        <div className="lookup-results">
          <div className="result-heading">
            <span>查询结果</span><strong>{results.length} 条</strong>
          </div>
          {exact.map(([text, entries]) => (
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

function HistoryView({ articles }: { articles: PracticeArticle[] }) {
  const [sessions, setSessions] = useState<SessionResult[]>([]);
  const [progress, setProgress] = useState<ArticleProgress[]>([]);
  const [errors, setErrors] = useState<ErrorStat[]>([]);
  const [type, setType] = useState<"all" | "article" | "challenge">("all");

  const refresh = () => {
    setSessions(getSessions());
    setProgress(getProgress());
    setErrors(readLocal(STORAGE.errors, []));
  };
  useEffect(refresh, []);

  const filtered = sessions.filter((session) => type === "all" || session.type === type);
  const articleSessions = sessions.filter((session) => session.type === "article");
  const totalChars = articleSessions.reduce((sum, session) => sum + session.correctChars, 0);
  const bestSpeed = articleSessions.reduce((best, session) => Math.max(best, session.speed), 0);
  const averageAccuracy = articleSessions.length
    ? articleSessions.reduce((sum, session) => sum + session.accuracy, 0) / articleSessions.length
    : 0;
  const articleMap = new Map(articles.map((article) => [article.id, article]));

  const clearAll = () => {
    if (!window.confirm("确定清除全部本地成绩和错题记录吗？此操作无法撤销。")) return;
    writeLocal(STORAGE.sessions, []);
    writeLocal(STORAGE.progress, []);
    writeLocal(STORAGE.errors, []);
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
        <button className="button danger" onClick={clearAll}>清除全部记录</button>
      </div>
      <div className="summary-grid">
        <SummaryCard label="练习次数" value={sessions.length.toString()} note="文章与字码挑战" />
        <SummaryCard label="最高速度" value={`${bestSpeed}`} unit="字/分" note="文章测速个人最佳" accent />
        <SummaryCard label="累计字数" value={totalChars.toLocaleString("zh-CN")} note="正确完成字符" />
        <SummaryCard label="平均准确率" value={averageAccuracy.toFixed(1)} unit="%" note="仅统计文章测速" />
      </div>
      <div className="history-grid">
        <div className="history-panel">
          <div className="panel-title">
            <h2>最近练习</h2>
            <div className="segmented small history-filter" aria-label="练习类型筛选">
              {(["all", "article", "challenge"] as const).map((value) => (
                <button
                  key={value}
                  className={type === value ? "active" : ""}
                  aria-pressed={type === value}
                  onClick={() => setType(value)}
                >
                  {value === "all" ? "全部" : value === "article" ? "文章" : "字码"}
                </button>
              ))}
            </div>
          </div>
          <div className="session-table">
            <div className="table-head"><span>练习</span><span>速度</span><span>准确率</span><span>时间</span></div>
            {filtered.slice(0, 12).map((session) => (
              <div className="table-row" key={session.id}>
                <span><strong>{session.title}</strong><small>{new Date(session.date).toLocaleString("zh-CN")}</small></span>
                <span>{session.speed || "—"}<small>字/分</small></span>
                <span>{session.accuracy.toFixed(1)}<small>%</small></span>
                <span>{formatDuration(session.durationSeconds)}</span>
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
                <span>{error.code?.toUpperCase() || articleMap.get(error.text)?.title || "文章错字"}</span>
                <b>{error.count}</b>
              </div>
            ))}
            {!errors.length && <div className="empty-state">暂时没有错字记录。</div>}
          </div>
          <div className="completion-stat">
            <span>文章完成度</span>
            <strong>{progress.filter((item) => item.completed).length} / 200</strong>
            <i><b style={{ width: `${Math.min(100, progress.length / 2)}%` }} /></i>
          </div>
        </aside>
      </div>
    </section>
  );
}

function SummaryCard({
  label,
  value,
  unit,
  note,
  accent,
}: {
  label: string;
  value: string;
  unit?: string;
  note: string;
  accent?: boolean;
}) {
  return (
    <div className={accent ? "summary-card accent" : "summary-card"}>
      <span>{label}</span>
      <strong>{value}<small>{unit}</small></strong>
      <p>{note}</p>
    </div>
  );
}

function SettingsView({
  settings,
  onChange,
}: {
  settings: UserSettings;
  onChange: (settings: UserSettings) => void;
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
          <Toggle label="显示编码提示" note="为后续拆字提示预留的本地设置" checked={settings.showCodeHints} onChange={(value) => update("showCodeHints", value)} />
          <Toggle label="按键声音" note="默认关闭，避免长时间练习疲劳" checked={settings.sound} onChange={(value) => update("sound", value)} />
        </div>
        <div className="settings-card license-card">
          <div className="settings-card-title"><span>i</span><div><h2>离线与版权</h2><p>数据来源清楚可核对</p></div></div>
          <p>练习文章为本项目原创生成内容。86 版码表来自 Rime 五笔方案，按 LGPL-3.0 保留原始许可证、作者信息和完整源数据。</p>
          <a href="https://github.com/rime/rime-wubi" target="_blank" rel="noreferrer">查看 Rime 五笔方案 ↗</a>
        </div>
      </div>
    </section>
  );
}

function Toggle({
  label,
  note,
  checked,
  onChange,
}: {
  label: string;
  note: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="switch-row">
      <span><strong>{label}</strong><small>{note}</small></span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
    </label>
  );
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="modal" role="dialog" aria-modal="true" aria-label={title} onMouseDown={(event) => event.stopPropagation()}>
        <header><h2>{title}</h2><button onClick={onClose} aria-label="关闭">×</button></header>
        {children}
      </section>
    </div>
  );
}
