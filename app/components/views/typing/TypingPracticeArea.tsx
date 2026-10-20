"use client";

import {
  useEffect,
  useMemo,
  useRef,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from "react";
import { isCommonPracticeArticle, lengthLabels } from "../../../article-practice";
import type { PracticeArticle, UserSettings } from "../../../types";
import { TypingInput } from "./TypingInput";
import type { useArticleLibrary } from "./useArticleLibrary";
import type { useGhostRace } from "./useGhostRace";
import type { useTypingDiagnostics } from "./useTypingDiagnostics";
import type { useTypingSession } from "./useTypingSession";

type TypingPracticeAreaProps = {
  article: PracticeArticle;
  settings: UserSettings;
  session: ReturnType<typeof useTypingSession>;
  library: Pick<ReturnType<typeof useArticleLibrary>, "openCommonPractice" | "commonLoading" | "shuffleCurrentCommonPractice" | "setPickerOpen" | "randomArticle">;
  diagnostics: Pick<ReturnType<typeof useTypingDiagnostics>, "codeHints" | "codeHintsError">;
  ghost: Pick<ReturnType<typeof useGhostRace>, "activeGhostTimeline" | "ghostProgressPercent" | "showGhostGap" | "ghostGapLabel">;
  articleTextRef: RefObject<HTMLDivElement | null>;
  inputRef: RefObject<HTMLTextAreaElement | null>;
  setInputHeight: (height: number) => void;
  commandBar: ReactNode;
  result: ReactNode;
};

export function TypingPracticeArea({ article, settings, session, library, diagnostics,
  ghost, articleTextRef, inputRef, setInputHeight, commandBar, result,
}: TypingPracticeAreaProps) {
  const { typedCharacters, targetCharacters, startedAt, completed } = session;
  const { openCommonPractice, commonLoading, shuffleCurrentCommonPractice, setPickerOpen, randomArticle } = library;
  const { codeHints, codeHintsError } = diagnostics;
  const { activeGhostTimeline, ghostProgressPercent, showGhostGap, ghostGapLabel } = ghost;
  const currentCharacterRef = useRef<HTMLSpanElement>(null);
  const visibleText = article.text;
  const isFocusSkin = settings.skin === "focus";
  const practiceInProgress = startedAt !== null && !completed;
  const progressRatio = Math.min(1, typedCharacters.length / Math.max(1, targetCharacters.length));
  const progressPercent = Math.round(progressRatio * 100);
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

  const renderedCharacters = useMemo(
    () => {
      const commonArticle = isCommonPracticeArticle(article);
      return displayCharacters.map(({ character, visibleIndex, targetIndex }) => {
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
            className={`${state}${commonArticle &&
                (targetIndex + 1) % 10 === 0
                ? " common-decade-end"
                : ""
              }${commonArticle &&
                (targetIndex + 1) % 50 === 0
                ? " common-section-end"
                : ""
              }`}
            key={`${visibleIndex}-${character}`}
          >
            {character}
          </span>
        );
      });
    },
    [article, displayCharacters, typedCharacters],
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
  }, [article.id, typedCharacters.length, articleTextRef]);

  return (
    <article className="typing-card">
      {!isFocusSkin && commandBar}
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
              aria-label={`当前字 ${targetCharacters[typedCharacters.length] || "无"}，最短编码 ${codeHintsError ||
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
                <>
                  <button disabled={practiceInProgress} onClick={() => setPickerOpen(true)}>选文章</button>
                  <button disabled={practiceInProgress} onClick={randomArticle}>随机一篇</button>
                </>
              )}
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
        aria-valuetext={`已完成 ${progressPercent}%${activeGhostTimeline
            ? `，幽灵 ${Math.round(ghostProgressPercent)}%${showGhostGap ? `，${ghostGapLabel}` : ""
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
        className={`article-text article-swap ${isCommonPracticeArticle(article) ? "common-character-text" : ""
          }`}
        style={{ "--practice-font-size": `${settings.fontSize}px` } as CSSProperties}
        onClick={() => inputRef.current?.focus()}
        aria-live="off"
      >
        {renderedCharacters}
      </div>
      {completed ? result : (
        <>
          <TypingInput session={session} inputRef={inputRef} onHeightChange={setInputHeight} />
          <div className="typing-footer">
            <span className="typing-position">
              第 {Math.min(typedCharacters.length + 1, targetCharacters.length)} /{" "}
              {targetCharacters.length} 字
            </span>
            <span>输入第一个字符后开始计时 · 已禁用粘贴</span>
          </div>
        </>
      )}
      {isFocusSkin && commandBar}
    </article>
  );
}
