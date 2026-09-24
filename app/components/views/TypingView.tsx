"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { useRouter } from "next/navigation";
import {
  formatDuration,
  isCommonPracticeArticle,
  lengthLabels,
} from "../../lib";
import { FALLBACK_ARTICLE_COUNT } from "../../content-loader";
import {
  calculateKeyAccuracy,
  calculatePhraseRate,
  calculateTypingMetrics,
  shouldDeferInputCommit,
} from "../../typing-metrics";
import type {
  ArticleFilter,
  UserSettings,
} from "../../types";
import { selectInputReviewOpportunities } from "../../input-review";
import {
  DiagnosticMetric,
  ErrorState,
  usePendingSaveGuard,
} from "../Ui";
import {
  useArticleLibrary,
  type PracticeControls,
} from "./typing/useArticleLibrary";
import { useTypingDiagnostics } from "./typing/useTypingDiagnostics";
import {
  useTypingSession,
  type KeySoundPlayer,
} from "./typing/useTypingSession";
import {
  useGhostRace,
  type GhostMode,
  type GhostRaceApi,
} from "./typing/useGhostRace";
import { ArticlePicker } from "./typing/ArticlePicker";
import { CommonCharacterPicker } from "./typing/CommonCharacterPicker";
import { InputReview } from "./typing/InputReview";
import { CustomTextModal } from "./typing/CustomTextModal";

export type { KeySoundPlayer };

export function TypingView({
  settings,
  settingsReady,
  onShowGhostGapChange,
  playKeySound,
  hesitationPracticeOpen,
}: {
  settings: UserSettings;
  settingsReady: boolean;
  onShowGhostGapChange: (value: boolean) => void;
  playKeySound: KeySoundPlayer;
  hesitationPracticeOpen: boolean;
}) {
  const router = useRouter();
  const [focusMode, setFocusMode] = useState(false);
  const reviewRef = useRef<HTMLDivElement>(null);
  const [inputHeight, setInputHeight] = useState(96);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const articleTextRef = useRef<HTMLDivElement>(null);
  const currentCharacterRef = useRef<HTMLSpanElement>(null);
  const [, setClockRevision] = useState(0);
  const ghostApiRef = useRef<GhostRaceApi | null>(null);
  const practiceControlsRef = useRef<PracticeControls | null>(null);
  const {
    article,
    articles,
    articlesLoading,
    articlesError,
    articleSaveError,
    retryLoad,
    filter,
    setFilter,
    refreshProgress,
    progressMap,
    availableArticles,
    topics,
    filtered,
    chooseArticle,
    randomArticle,
    pickMostDifficult,
    useCustomText,
    openCustomPractice,
    customTitle,
    setCustomTitle,
    customText,
    setCustomText,
    customError,
    setCustomError,
    pickerOpen,
    setPickerOpen,
    customOpen,
    setCustomOpen,
    commonOpen,
    setCommonOpen,
    commonData,
    commonLoading,
    commonError,
    fetchCommonCharacterData,
    openCommonPractice,
    startCommonPractice,
    shuffleCurrentCommonPractice,
  } = useArticleLibrary(settings, {
    settingsReady,
    articleTextRef,
    inputRef,
    practiceControls: practiceControlsRef,
  });
  const visibleText = article?.text || "";
  // Paragraph breaks are presentation, not typing targets. Keeping them in the
  // comparison made users enter invisible newline characters between paragraphs.
  const targetText = useMemo(
    () => visibleText.replace(/[\r\n]/g, ""),
    [visibleText],
  );
  const {
    codeHints,
    codeHintsError,
    minimumCodeError,
    theoreticalCodeLength,
    codeLengthAnalysis,
    wubiCodesRef,
    retryCodeLengthLoad,
  } = useTypingDiagnostics(targetText, settings.showCodeHints);
  const session = useTypingSession({
    article,
    visibleText,
    targetText,
    playKeySound,
    setClockRevision,
    ghostApiRef,
    inputRef,
    wubiCodesRef,
    theoreticalCodeLength,
    codeLengthAnalysis,
  });
  const {
    inputValue,
    setInputValue,
    typed,
    typedCharacters,
    targetCharacters,
    startedAt,
    startedAtRef,
    elapsed,
    keyCount,
    letterKeys,
    backspaceCount,
    correctionCount,
    selectionCount,
    phraseChars,
    leftHandKeys,
    rightHandKeys,
    pauseCount,
    pausedAt,
    retryCount,
    attemptCount,
    correctAttemptCount,
    errorCount,
    completed,
    sessionSaveFailed,
    startTimer,
    commitTypedValue,
    onKeyDown,
    togglePause,
    retrySave,
    pendingPracticeSave,
    resetForArticle,
    composing: composingRef,
    compositionCommitTimer: compositionCommitTimerRef,
  } = session;
  useEffect(() => {
    if (completed) {
      reviewRef.current?.focus({ preventScroll: true });
      return;
    }
    const input = inputRef.current;
    if (!input) return;
    const observer = new ResizeObserver(() => {
      setInputHeight(input.getBoundingClientRect().height);
    });
    observer.observe(input);
    return () => observer.disconnect();
  }, [completed, article?.id, articlesLoading, articlesError, settingsReady]);

  const practiceInProgress = startedAt !== null && !completed;
  usePendingSaveGuard(
    sessionSaveFailed || practiceInProgress,
    sessionSaveFailed
      ? "本次成绩尚未保存，请先重试保存。"
      : "本次练习尚未完成，请先完成或重来后再离开。",
  );

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
    refreshProgress();
  }, [completed, refreshProgress]);

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
  const ghost = useGhostRace({
    article,
    startedAt,
    startedAtRef,
    seconds,
    targetCharacterCount: targetCharacters.length,
    typedCharacterCount: typedCharacters.length,
    showGhostGapSetting: settings.showGhostGap,
    onShowGhostGapChange,
  });
  const {
    ghostMode,
    setGhostMode,
    ghostSessions,
    showGhostGap,
    toggleGhostGap,
    activeGhostTimeline,
    displayGhostMode,
    activeGhostMode,
    ghostProgressPercent,
    ghostGapLabel,
    refreshSessions,
  } = ghost;
  useEffect(() => {
    ghostApiRef.current = ghost;
  });
  useEffect(() => {
    practiceControlsRef.current = {
      hasPendingSave: () => pendingPracticeSave.current !== null,
      resetForArticle: (nextRetryCount: number, nextGhostMode: GhostMode) => {
        resetForArticle(nextRetryCount);
        ghostApiRef.current?.resetForArticle(nextGhostMode);
        setClockRevision((value) => value + 1);
      },
    };
  });
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
  const theoreticalGap =
    theoreticalCodeLength !== null && codeLength > 0
      ? Math.max(0, codeLength - theoreticalCodeLength)
      : null;
  const recommendedPhrases = useMemo(
    () => selectInputReviewOpportunities(
      typed,
      codeLengthAnalysis?.recommendedOpportunities ?? [],
    ),
    [typed, codeLengthAnalysis],
  );
  const startRecommendedPhrasePractice = () => {
    if (!recommendedPhrases.length) return;
    if (pendingPracticeSave.current) {
      window.alert("本次成绩尚未保存，请先重试保存。");
      return;
    }
    router.push("/training?tab=phrase");
  };
  const retryPracticeSave = () => {
    if (!retrySave()) return;
    refreshProgress();
    refreshSessions();
  };
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

  if (articleSaveError && !article) {
    return (
      <ErrorState
        title="文章选择没有保存成功"
        message={articleSaveError}
        onRetry={retryLoad}
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
        onRetry={retryLoad}
      />
    );
  }

  if (!article) {
    return (
      <ErrorState
        title="暂时没有可练习的文章"
        message="请重新加载文章库后再试。"
        onRetry={retryLoad}
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
            onClick={openCustomPractice}
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
                        disabled={practiceInProgress}
                        aria-label="更换常用字练习范围"
                        title="更换常用字练习范围"
                        onClick={openCommonPractice}
                      >
                        更换范围
                      </button>
                      <button
                        className="common-toolbar-action shuffle-action"
                        disabled={commonLoading || practiceInProgress}
                        aria-label="打乱当前范围并从头开始"
                        title="打乱当前范围并从头开始"
                        onClick={() => void shuffleCurrentCommonPractice()}
                      >
                        {commonLoading ? "载入中…" : "乱序"}
                      </button>
                    </>
                  ) : (
                    <button
                      disabled={practiceInProgress}
                      onClick={() => setPickerOpen(true)}
                    >
                      选文章
                    </button>
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
            tabIndex={0}
            role="region"
            aria-label="练习文章，可使用方向键滚动"
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
          {completed ? (
            <InputReview
              ref={reviewRef}
              text={typed}
              opportunities={recommendedPhrases}
              height={inputHeight}
              loading={!codeLengthAnalysis && !minimumCodeError}
              error={minimumCodeError}
              onRetry={retryCodeLengthLoad}
            />
          ) : (
            <textarea
              ref={inputRef}
              className="typing-input"
              value={inputValue}
              onChange={(event) => {
                setInputHeight(event.currentTarget.getBoundingClientRect().height);
                const next = event.target.value;
                const nativeEvent = event.nativeEvent as InputEvent;
                if (next) startTimer();
                if (
                  shouldDeferInputCommit(
                    composingRef.current,
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
                composingRef.current = true;
                startTimer();
              }}
              onCompositionEnd={(event) => {
                composingRef.current = false;
                setInputHeight(event.currentTarget.getBoundingClientRect().height);
                const endedValue = event.currentTarget.value;
                if (compositionCommitTimerRef.current !== null) {
                  window.clearTimeout(compositionCommitTimerRef.current);
                }
                // Safari may expose the pre-edit Latin buffer on compositionend
                // and deliver the committed Chinese text in the following input
                // event. Wait one task, then read the textarea's final value.
                compositionCommitTimerRef.current = window.setTimeout(() => {
                  compositionCommitTimerRef.current = null;
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
              disabled={pausedAt !== null}
              placeholder={
                pausedAt !== null
                  ? "练习已暂停"
                  : "点击这里，切换到五笔输入法后开始输入…"
              }
              aria-label="跟打输入区"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
            />
          )}
          {completed ? (
            <div className="typing-review-actions">
              <span className="typing-review-save" role="status">
                {sessionSaveFailed ? "本次成绩尚未保存" : "本次成绩已存入本机 · 可在本地成绩查看"}
              </span>
              <div className="typing-review-buttons">
                {sessionSaveFailed && (
                  <button className="button danger" onClick={retryPracticeSave}>
                    重试保存
                  </button>
                )}
                {recommendedPhrases.length > 0 && (
                  <button className="button secondary" disabled={sessionSaveFailed} onClick={startRecommendedPhrasePractice}>
                    练习这些词组
                  </button>
                )}
                {settings.autoNext && activeGhostMode !== "off" && (
                  <button className="button secondary" disabled={sessionSaveFailed} onClick={() => chooseArticle(article, true, retryCount + 1, activeGhostMode)}>
                    {activeGhostMode === "best" ? "再次挑战个人最佳" : "再次挑战最近一次"}
                  </button>
                )}
                <button
                  className="button primary"
                  disabled={sessionSaveFailed}
                  onClick={settings.autoNext ? randomArticle : () => chooseArticle(article, true, retryCount + 1, activeGhostMode)}
                >
                  {settings.autoNext ? "下一篇" : activeGhostMode === "best" ? "再次挑战个人最佳" : activeGhostMode === "recent" ? "再次挑战最近一次" : "再练一次"}
                </button>
              </div>
            </div>
          ) : (
            <div className="typing-footer">
              <span className="typing-position">
                第 {Math.min(typedCharacters.length + 1, targetCharacters.length)} /{" "}
                {targetCharacters.length} 字
              </span>
              <span>输入第一个字符后开始计时 · 已禁用粘贴</span>
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
        <ArticlePicker
          filtered={filtered}
          progressMap={progressMap}
          onClose={() => setPickerOpen(false)}
          onChoose={chooseArticle}
        />
      )}

      {commonOpen && (
        <CommonCharacterPicker
          commonData={commonData}
          commonLoading={commonLoading}
          commonError={commonError}
          onClose={() => setCommonOpen(false)}
          onRetry={() => void fetchCommonCharacterData()}
          onStart={startCommonPractice}
        />
      )}

      {customOpen && (
        <CustomTextModal
          title={customTitle}
          text={customText}
          error={customError}
          onClose={() => setCustomOpen(false)}
          onTitleChange={setCustomTitle}
          onTextChange={setCustomText}
          onErrorChange={setCustomError}
          onUse={useCustomText}
        />
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
