"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { loadWubi } from "../../../content-loader";
import {
  buildMinimumCodeLengthIndex,
  calculateTheoreticalMinimumCodeLength,
  preferShortestWubiCodes,
  type MinimumCodeLengthIndex,
} from "../../../typing-metrics";
import {
  analyzeCodeLengthCoach,
  buildCodeLengthCoachIndex,
  type CodeLengthCoachIndex,
} from "../../../code-length-coach";

export function useTypingDiagnostics(
  targetText: string,
  showCodeHints: boolean,
) {
  const [codeHints, setCodeHints] = useState<Map<string, string>>(new Map());
  const [codeHintsError, setCodeHintsError] = useState("");
  const [minimumCodeIndex, setMinimumCodeIndex] =
    useState<MinimumCodeLengthIndex | null>(null);
  const [codeLengthCoachIndex, setCodeLengthCoachIndex] =
    useState<CodeLengthCoachIndex | null>(null);
  const [minimumCodeError, setMinimumCodeError] = useState("");
  const [codeLengthLoadAttempt, setCodeLengthLoadAttempt] = useState(0);
  const wubiCodesRef = useRef(new Map<string, string>());

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
    if (!showCodeHints) {
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
  }, [showCodeHints]);

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
  const retryCodeLengthLoad = useCallback(() => {
    setCodeLengthLoadAttempt((value) => value + 1);
  }, []);

  return {
    codeHints,
    codeHintsError,
    minimumCodeError,
    theoreticalCodeLength,
    codeLengthAnalysis,
    wubiCodesRef,
    retryCodeLengthLoad,
  };
}
