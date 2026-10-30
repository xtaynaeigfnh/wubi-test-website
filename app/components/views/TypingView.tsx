"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { lengthLabels } from "../../article-practice";
import { formatDuration } from "../../format";
import { selectInputReviewOpportunities } from "../../input-review";
import type { ArticleFilter, UserSettings } from "../../types";
import {
  calculateKeyAccuracy,
  calculatePhraseRate,
  calculateTypingMetrics,
} from "../../typing-metrics";
import { DiagnosticMetric, ErrorState, usePendingSaveGuard } from "../Ui";
import { ArticlePicker } from "./typing/ArticlePicker";
import { CommonCharacterPicker } from "./typing/CommonCharacterPicker";
import { CustomTextModal } from "./typing/CustomTextModal";
import { CodeLengthMetric, Metric } from "./typing/TypingMetrics";
import { TypingPracticeArea } from "./typing/TypingPracticeArea";
import { TypingResult } from "./typing/TypingResult";
import { useArticleLibrary, type PracticeControls } from "./typing/useArticleLibrary";
import { useGhostRace, type GhostMode, type GhostRaceApi } from "./typing/useGhostRace";
import { useTypingDiagnostics } from "./typing/useTypingDiagnostics";
import { useTypingSession, type KeySoundPlayer } from "./typing/useTypingSession";

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
  const [inputHeight, setInputHeight] = useState(96);
  const articleTextRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const ghostApiRef = useRef<GhostRaceApi | null>(null);
  const practiceControlsRef = useRef<PracticeControls | null>(null);
  const {
    article,
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
    query,
    setQuery,
    favoritesOnly,
    setFavoritesOnly,
    articleSort,
    setArticleSort,
    favoriteSet,
    favoriteError,
    favoriteSaving,
    toggleFavorite,
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
    ghostApiRef,
    inputRef,
    wubiCodesRef,
    theoreticalCodeLength,
    codeLengthAnalysis,
  });
  const {
    inputValue,
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
    sessionSaved,
    togglePause,
    retrySave,
    hasPendingSave,
    resetForArticle,
  } = session;
  useEffect(() => {
    if (completed) {
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
    (completed && !sessionSaved) || practiceInProgress,
    completed && !sessionSaved
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
  }, [completed, sessionSaved, refreshProgress]);

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
    ghostGapLabel,
  } = ghost;
  useEffect(() => {
    ghostApiRef.current = ghost;
  });
  useEffect(() => {
    practiceControlsRef.current = {
      hasPendingSave,
      resetForArticle: (nextRetryCount: number, nextGhostMode: GhostMode) => {
        resetForArticle(nextRetryCount);
        ghostApiRef.current?.resetForArticle(nextGhostMode);
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
    if (hasPendingSave()) {
      window.alert("本次成绩尚未保存，请先重试保存。");
      return;
    }
    router.push("/training?tab=phrase");
  };

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

  const isFocusSkin = settings.skin === "focus";
  const commandBar = (
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
  );
  const diagnostics = (
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
  );
  const articleFilters = (
    <div className={isFocusSkin ? "article-picker-filters" : "article-side-filters"}>
      <label>
        长度
        <select
          aria-label="长度"
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
          aria-label="题材"
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
          aria-label="练习状态"
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
    </div>
  );

  return (
    <>
      {articleSaveError && (
        <p className="management-message" role="alert">
          {articleSaveError}
        </p>
      )}
      {isFocusSkin ? (
        <section className="practice-heading">
          <div className="practice-heading-copy">
            <span className="eyebrow">WUBI · 86</span>
            <h1>文章测速</h1>
          </div>
          <section className="metric-strip" aria-label="实时成绩">
            <Metric label="速度" value={String(speed)} unit="字/分" active={startedAt !== null && !completed} />
            <Metric label="准确率" value={accuracy.toFixed(1)} unit="%" />
            <Metric label="用时" value={formatDuration(elapsed)} unit="" />
          </section>
        </section>
      ) : (
        <>
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
            <Metric label="用时" value={formatDuration(elapsed)} unit="" />
          </section>
        </>
      )}
      {!isFocusSkin && diagnostics}

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
        <TypingPracticeArea
          article={article}
          settings={settings}
          session={session}
          library={{ openCommonPractice, commonLoading, shuffleCurrentCommonPractice, setPickerOpen, randomArticle }}
          diagnostics={{ codeHints, codeHintsError }}
          ghost={ghost}
          inputRef={inputRef}
          articleTextRef={articleTextRef}
          setInputHeight={setInputHeight}
          commandBar={commandBar}
          result={<TypingResult
            session={session}
            diagnostics={{ codeLengthAnalysis, minimumCodeError, retryCodeLengthLoad }}
            settings={settings}
            recommendedPhrases={recommendedPhrases}
            inputHeight={inputHeight}
            activeGhostMode={activeGhostMode}
            retryPracticeSave={retrySave}
            startRecommendedPhrasePractice={startRecommendedPhrasePractice}
            repeatArticle={() => chooseArticle(article, true, retryCount + 1, activeGhostMode)}
            randomArticle={randomArticle}
          />}
        />
        {!isFocusSkin && (
          <aside className="side-panel">
            <div className="side-heading"><div><span className="eyebrow">文章库</span><h3>{availableArticles.length} 篇离线练习</h3></div><span className="count-badge">{availableArticles.length}</span></div>
            {articleFilters}
            <div className="tip-box"><span>小提示</span><p>系统五笔候选上屏后才会判定正误，组合输入过程不会被计为错字。</p></div>
          </aside>
        )}
      </section>

      {isFocusSkin && <details className="practice-diagnostics">
        <summary>输入诊断 <span>击键、码长与输入习惯</span></summary>
        <div className="secondary-metrics">
          <Metric label="击键" value={kps.toFixed(2)} unit="键/秒" />
          <CodeLengthMetric value={codeLength.toFixed(2)} theoreticalValue={theoreticalCodeLength} error={minimumCodeError} />
          <Metric label="错字" value={errorCount.toString()} unit="字" />
        </div>
        {diagnostics}
      </details>}

      {isFocusSkin && <div className="practice-sources" aria-label="更多练习内容">
        <span>换一种练习</span>
        <button disabled={practiceInProgress} onClick={openCommonPractice}>常用字练习</button>
        <button disabled={practiceInProgress} onClick={openCustomPractice}>自定义文章</button>
      </div>}

      {pickerOpen && (
        <ArticlePicker
          filtered={filtered}
          progressMap={progressMap}
          query={query}
          onQueryChange={setQuery}
          favoritesOnly={favoritesOnly}
          onFavoritesOnlyChange={setFavoritesOnly}
          sort={articleSort}
          onSortChange={setArticleSort}
          favoriteIds={favoriteSet}
          onToggleFavorite={toggleFavorite}
          favoriteError={favoriteError}
          favoriteSaving={favoriteSaving}
          onClose={() => setPickerOpen(false)}
          onChoose={chooseArticle}
          filters={
            isFocusSkin ? articleFilters : null
          }
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
