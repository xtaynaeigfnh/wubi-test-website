import type { ErrorStat, PhraseOpportunityStat, WubiEntry } from "./types";

export interface PhraseTrainingPoolOptions {
  weakItems?: ErrorStat[];
  missedPhrases?: PhraseOpportunityStat[];
  suggestedEntries?: WubiEntry[];
  limit?: number;
}

const hanPhrasePattern = /^\p{Script=Han}{2,4}$/u;

function preferEntry(
  current: WubiEntry | undefined,
  candidate: WubiEntry,
) {
  return (
    !current ||
    candidate[1].length < current[1].length ||
    (candidate[1].length === current[1].length && candidate[2] > current[2]) ||
    (candidate[1].length === current[1].length &&
      candidate[2] === current[2] &&
      candidate[1].localeCompare(current[1]) < 0)
  );
}

/**
 * 稳定生成一轮不重复的词组专项题库。
 *
 * 当结算页能提供明确的错过词组时，可通过 `missedPhrases`
 * 直接提权；旧数据只有错字统计时，则选取包含弱项字的高频词组。
 */
export function buildPhraseTrainingPool(
  entries: WubiEntry[],
  options: PhraseTrainingPoolOptions = {},
): WubiEntry[] {
  const limit = Math.max(0, Math.min(50, Math.round(options.limit ?? 20)));
  if (!limit) return [];

  const preferred = new Map<string, WubiEntry>();
  const missedEntries = (options.missedPhrases ?? []).map(
    (item): WubiEntry => [item.text, item.code, 0],
  );
  for (const entry of [
    ...entries,
    ...missedEntries,
    ...(options.suggestedEntries ?? []),
  ]) {
    const [text, code] = entry;
    if (!hanPhrasePattern.test(text) || !/^[a-y]{1,4}$/i.test(code)) continue;
    if (preferEntry(preferred.get(text), entry)) preferred.set(text, entry);
  }

  const missed = new Map(
    (options.missedPhrases ?? [])
      .filter((item) => hanPhrasePattern.test(item.text))
      .map((item) => [item.text, item]),
  );
  const suggested = new Set(
    (options.suggestedEntries ?? []).map(([text]) => text),
  );
  const weakItems = (options.weakItems ?? []).filter(
    (item) => item.count > 0 && Array.from(item.text).length <= 4,
  );
  const hasSignals = missed.size > 0 || weakItems.length > 0 || suggested.size > 0;

  const ranked = Array.from(preferred.values())
    .map((entry) => {
      const [text, , weight] = entry;
      const exactWeakness = weakItems.find((item) => item.text === text);
      const relatedWeakness = weakItems.reduce((score, item) => {
        if (!text.includes(item.text)) return score;
        return score +
          (item.codingErrors ?? item.count) * 5000 +
          (item.hesitationPoints ?? 0) * 2500 +
          (item.correctionCount ?? 0) * 1500;
      }, 0);
      const signalScore =
        (suggested.has(text) ? 3_000_000_000 : 0) +
        (() => {
          const item = missed.get(text);
          if (!item) return 0;
          const mistakes = Math.max(0, item.practiceCount - item.correctCount);
          const unresolvedOpportunities = Math.max(
            0,
            item.opportunityCount - item.correctCount,
          );
          return (
            (unresolvedOpportunities * item.savedKeys + mistakes * 5) *
            100_000_000
          );
        })() +
        (exactWeakness ? exactWeakness.count * 10_000_000 : 0) +
        relatedWeakness;
      return { entry, signalScore, weight };
    })
    .filter(({ signalScore, weight }) =>
      hasSignals ? signalScore > 0 || weight >= 10_000_000 : weight >= 10_000_000,
    )
    .sort(
      (left, right) =>
        right.signalScore - left.signalScore ||
        right.weight - left.weight ||
        left.entry[0].localeCompare(right.entry[0], "zh-Hans-CN-u-co-unihan"),
    );

  return ranked.slice(0, limit).map(({ entry }) => entry);
}
