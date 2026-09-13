import type { PhraseOpportunity } from "./code-length-coach";

export function selectInputReviewOpportunities(
  text: string,
  opportunities: readonly PhraseOpportunity[],
  limit = 5,
): PhraseOpportunity[] {
  if (!Number.isFinite(limit) || limit < 1) return [];
  const maximum = Math.min(5, Math.floor(limit));
  const characters = Array.from(text);
  const candidates = opportunities.filter((opportunity) =>
    Number.isInteger(opportunity.start) &&
    opportunity.start >= 0 &&
    Number.isInteger(opportunity.length) &&
    opportunity.length >= 2 &&
    opportunity.length <= 4 &&
    opportunity.start + opportunity.length <= characters.length &&
    characters.slice(opportunity.start, opportunity.start + opportunity.length).join("") === opportunity.text,
  ).sort((left, right) =>
    right.savedKeys - left.savedKeys ||
    right.length - left.length ||
    left.start - right.start ||
    left.phraseCodeLength - right.phraseCodeLength,
  );

  const selected: PhraseOpportunity[] = [];
  const selectedTexts = new Set<string>();
  for (const opportunity of candidates) {
    if (selectedTexts.has(opportunity.text)) continue;
    if (selected.some((current) =>
      opportunity.start < current.start + current.length &&
      current.start < opportunity.start + opportunity.length,
    )) continue;
    selected.push(opportunity);
    selectedTexts.add(opportunity.text);
    if (selected.length >= maximum) break;
  }

  return selected.sort((left, right) => left.start - right.start);
}
