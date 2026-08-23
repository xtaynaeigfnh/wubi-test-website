import type { WubiEntry } from "./types";

export type CodeLengthSegmentKind =
  | "character"
  | "phrase"
  | "ignored"
  | "unknown";

export interface CodeLengthCandidate {
  text: string;
  characters: string[];
  code: string;
  codeLength: number;
  weight: number;
}

export interface CodeLengthCoachIndex {
  byFirstCharacter: Map<string, CodeLengthCandidate[]>;
  singleCharacters: Map<string, CodeLengthCandidate>;
}

export interface CodeLengthSegment {
  text: string;
  start: number;
  length: number;
  code: string | null;
  codeLength: number;
  kind: CodeLengthSegmentKind;
}

export interface PhraseOpportunity {
  text: string;
  start: number;
  length: 2 | 3 | 4;
  code: string;
  phraseCodeLength: number;
  singleCharacterKeys: number;
  savedKeys: number;
}

export interface CodeLengthCoachAnalysis {
  hanCharacterCount: number;
  coveredHanCharacterCount: number;
  complete: boolean;
  theoreticalMinimumKeys: number | null;
  theoreticalAverageCodeLength: number | null;
  singleCharacterBaselineKeys: number | null;
  singleCharacterAverageCodeLength: number | null;
  potentialSavedKeys: number | null;
  optimalSegments: CodeLengthSegment[];
  recommendedOpportunities: PhraseOpportunity[];
  highestValueOpportunities: PhraseOpportunity[];
}

interface SegmentationState {
  unknownHanCharacters: number;
  keys: number;
  encodedHanCharacters: number;
  segments: CodeLengthSegment[];
}

const hanCharacterPattern = /^\p{Script=Han}$/u;

function isBetterState(
  candidate: SegmentationState,
  current: SegmentationState | undefined,
) {
  if (!current) return true;
  if (candidate.unknownHanCharacters !== current.unknownHanCharacters) {
    return candidate.unknownHanCharacters < current.unknownHanCharacters;
  }
  if (candidate.keys !== current.keys) return candidate.keys < current.keys;
  return candidate.segments.length < current.segments.length;
}

function setState(
  states: Array<SegmentationState | undefined>,
  position: number,
  candidate: SegmentationState,
) {
  if (isBetterState(candidate, states[position])) states[position] = candidate;
}

export function buildCodeLengthCoachIndex(
  entries: WubiEntry[],
): CodeLengthCoachIndex {
  const preferred = new Map<string, CodeLengthCandidate>();

  for (const [text, code, weight] of entries) {
    const characters = Array.from(text);
    if (
      characters.length === 0 ||
      code.length === 0 ||
      characters.some((character) => !hanCharacterPattern.test(character))
    ) {
      continue;
    }

    const candidate = {
      text,
      characters,
      code,
      codeLength: code.length,
      weight,
    };
    const current = preferred.get(text);
    if (
      !current ||
      candidate.codeLength < current.codeLength ||
      (candidate.codeLength === current.codeLength && weight > current.weight) ||
      (candidate.codeLength === current.codeLength &&
        weight === current.weight &&
        candidate.code.localeCompare(current.code) < 0)
    ) {
      preferred.set(text, candidate);
    }
  }

  const byFirstCharacter = new Map<string, CodeLengthCandidate[]>();
  const singleCharacters = new Map<string, CodeLengthCandidate>();
  for (const candidate of preferred.values()) {
    const first = candidate.characters[0];
    const candidates = byFirstCharacter.get(first) ?? [];
    candidates.push(candidate);
    byFirstCharacter.set(first, candidates);
    if (candidate.characters.length === 1) {
      singleCharacters.set(first, candidate);
    }
  }

  for (const candidates of byFirstCharacter.values()) {
    candidates.sort(
      (left, right) =>
        right.characters.length - left.characters.length ||
        left.codeLength - right.codeLength ||
        right.weight - left.weight,
    );
  }

  return { byFirstCharacter, singleCharacters };
}

function buildOptimalSegmentation(
  characters: string[],
  index: CodeLengthCoachIndex,
): SegmentationState {
  const states: Array<SegmentationState | undefined> = Array(
    characters.length + 1,
  ).fill(undefined);
  states[0] = {
    unknownHanCharacters: 0,
    keys: 0,
    encodedHanCharacters: 0,
    segments: [],
  };

  for (let position = 0; position < characters.length; position += 1) {
    const state = states[position];
    if (!state) continue;
    const character = characters[position];

    if (!hanCharacterPattern.test(character)) {
      setState(states, position + 1, {
        ...state,
        segments: [
          ...state.segments,
          {
            text: character,
            start: position,
            length: 1,
            code: null,
            codeLength: 0,
            kind: "ignored",
          },
        ],
      });
      continue;
    }

    const matchingCandidates = (index.byFirstCharacter.get(character) ?? []).filter(
      (candidate) =>
        candidate.characters.every(
          (candidateCharacter, offset) =>
            characters[position + offset] === candidateCharacter,
        ),
    );

    for (const candidate of matchingCandidates) {
      const length = candidate.characters.length;
      setState(states, position + length, {
        unknownHanCharacters: state.unknownHanCharacters,
        keys: state.keys + candidate.codeLength,
        encodedHanCharacters: state.encodedHanCharacters + length,
        segments: [
          ...state.segments,
          {
            text: candidate.text,
            start: position,
            length,
            code: candidate.code,
            codeLength: candidate.codeLength,
            kind: length === 1 ? "character" : "phrase",
          },
        ],
      });
    }

    setState(states, position + 1, {
      unknownHanCharacters: state.unknownHanCharacters + 1,
      keys: state.keys,
      encodedHanCharacters: state.encodedHanCharacters,
      segments: [
        ...state.segments,
        {
          text: character,
          start: position,
          length: 1,
          code: null,
          codeLength: 0,
          kind: "unknown",
        },
      ],
    });
  }

  return states[characters.length] ?? {
    unknownHanCharacters: 0,
    keys: 0,
    encodedHanCharacters: 0,
    segments: [],
  };
}

function findPhraseOpportunities(
  characters: string[],
  index: CodeLengthCoachIndex,
) {
  const opportunities: PhraseOpportunity[] = [];

  for (let position = 0; position < characters.length; position += 1) {
    const first = characters[position];
    for (const candidate of index.byFirstCharacter.get(first) ?? []) {
      const length = candidate.characters.length;
      if (length < 2 || length > 4) continue;
      if (
        !candidate.characters.every(
          (character, offset) => characters[position + offset] === character,
        )
      ) {
        continue;
      }

      const singleCharacterKeys = candidate.characters.reduce(
        (total, character) => {
          const single = index.singleCharacters.get(character);
          return single ? total + single.codeLength : Number.NaN;
        },
        0,
      );
      if (!Number.isFinite(singleCharacterKeys)) continue;
      const savedKeys = singleCharacterKeys - candidate.codeLength;
      if (savedKeys <= 0) continue;

      opportunities.push({
        text: candidate.text,
        start: position,
        length: length as 2 | 3 | 4,
        code: candidate.code,
        phraseCodeLength: candidate.codeLength,
        singleCharacterKeys,
        savedKeys,
      });
    }
  }

  return opportunities.sort(
    (left, right) =>
      right.savedKeys - left.savedKeys ||
      right.length - left.length ||
      left.start - right.start ||
      left.phraseCodeLength - right.phraseCodeLength,
  );
}

function selectHighestValueOpportunities(
  opportunities: PhraseOpportunity[],
  limit: number,
) {
  const selected: PhraseOpportunity[] = [];
  const selectedTexts = new Set<string>();
  for (const opportunity of opportunities) {
    if (selectedTexts.has(opportunity.text)) continue;
    const overlaps = selected.some(
      (current) =>
        opportunity.start < current.start + current.length &&
        current.start < opportunity.start + opportunity.length,
    );
    if (overlaps) continue;
    selected.push(opportunity);
    selectedTexts.add(opportunity.text);
    if (selected.length === limit) break;
  }
  return selected;
}

export function analyzeCodeLengthCoach(
  text: string,
  index: CodeLengthCoachIndex,
  options: { maxRecommendations?: number } = {},
): CodeLengthCoachAnalysis {
  const characters = Array.from(text);
  const hanCharacterCount = characters.filter((character) =>
    hanCharacterPattern.test(character),
  ).length;
  const optimal = buildOptimalSegmentation(characters, index);
  const complete =
    hanCharacterCount > 0 && optimal.unknownHanCharacters === 0;
  const theoreticalMinimumKeys = complete ? optimal.keys : null;

  let singleCharacterBaselineKeys = 0;
  for (const character of characters) {
    if (!hanCharacterPattern.test(character)) continue;
    const candidate = index.singleCharacters.get(character);
    if (!candidate) {
      singleCharacterBaselineKeys = Number.NaN;
      break;
    }
    singleCharacterBaselineKeys += candidate.codeLength;
  }
  const completeSingleCharacterBaseline =
    hanCharacterCount > 0 && Number.isFinite(singleCharacterBaselineKeys)
      ? singleCharacterBaselineKeys
      : null;

  const recommendedOpportunities = findPhraseOpportunities(characters, index);
  const requestedLimit = Math.trunc(options.maxRecommendations ?? 5);
  const maxRecommendations = Math.min(5, Math.max(3, requestedLimit || 5));

  return {
    hanCharacterCount,
    coveredHanCharacterCount: optimal.encodedHanCharacters,
    complete,
    theoreticalMinimumKeys,
    theoreticalAverageCodeLength:
      theoreticalMinimumKeys === null
        ? null
        : theoreticalMinimumKeys / hanCharacterCount,
    singleCharacterBaselineKeys: completeSingleCharacterBaseline,
    singleCharacterAverageCodeLength:
      completeSingleCharacterBaseline === null
        ? null
        : completeSingleCharacterBaseline / hanCharacterCount,
    potentialSavedKeys:
      completeSingleCharacterBaseline === null ||
      theoreticalMinimumKeys === null
        ? null
        : completeSingleCharacterBaseline - theoreticalMinimumKeys,
    optimalSegments: optimal.segments,
    recommendedOpportunities,
    highestValueOpportunities: selectHighestValueOpportunities(
      recommendedOpportunities,
      maxRecommendations,
    ),
  };
}
