"use client";

import type { RefObject } from "react";
import { shouldDeferInputCommit } from "../../../typing-metrics";
import type { useTypingSession } from "./useTypingSession";

export function TypingInput({
  session,
  inputRef,
  onHeightChange,
}: {
  session: ReturnType<typeof useTypingSession>;
  inputRef: RefObject<HTMLTextAreaElement | null>;
  onHeightChange: (height: number) => void;
}) {
  const {
    inputValue,
    setInputValue,
    startTimer,
    commitTypedValue,
    onKeyDown,
    pausedAt,
    composing: composingRef,
    compositionCommitTimer: compositionCommitTimerRef,
  } = session;
  return (
    <textarea
      ref={inputRef}
      className="typing-input"
      value={inputValue}
      onChange={(event) => {
        onHeightChange(event.currentTarget.getBoundingClientRect().height);
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
        onHeightChange(event.currentTarget.getBoundingClientRect().height);
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
  );
}
