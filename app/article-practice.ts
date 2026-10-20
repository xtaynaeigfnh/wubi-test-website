import { MAX_CUSTOM_ARTICLES } from "./practice-constraints.ts";
import type {
  ArticleLength,
  CommonCharacterData,
  CommonCharacterPreset,
  CommonPracticeArticle,
  PracticeArticle,
} from "./types";

export function addCustomArticlesWithinLimit(
  existing: PracticeArticle[],
  incoming: PracticeArticle[],
): {
  articles: PracticeArticle[];
  added: PracticeArticle[];
  rejected: PracticeArticle[];
} {
  const available = Math.max(0, MAX_CUSTOM_ARTICLES - existing.length);
  const knownIds = new Set(existing.map((article) => article.id));
  const added: PracticeArticle[] = [];
  const rejected: PracticeArticle[] = [];
  for (const article of incoming) {
    if (knownIds.has(article.id) || added.length >= available) {
      rejected.push(article);
      continue;
    }
    knownIds.add(article.id);
    added.push(article);
  }
  return {
    articles: [...added, ...existing],
    added,
    rejected,
  };
}

export function selectInitialArticle(
  availableArticles: PracticeArticle[],
  builtInArticles: PracticeArticle[],
  currentId: string | null,
  preferredLength: ArticleLength | "all",
  prioritizeCurrent = false,
): PracticeArticle | null {
  const matchesPreference = (article: PracticeArticle) =>
    preferredLength === "all" || article.length === preferredLength;
  const current = availableArticles.find(
    (article) =>
      article.id === currentId &&
      (prioritizeCurrent || matchesPreference(article)),
  );
  if (current) return current;

  const fallbackLength =
    preferredLength === "all" ? "short" : preferredLength;
  return (
    builtInArticles.find((article) => article.length === fallbackLength) ||
    availableArticles.find(matchesPreference) ||
    availableArticles[0] ||
    null
  );
}

export const commonCharacterPresets: ReadonlyArray<{
  id: CommonCharacterPreset;
  label: string;
  description: string;
  start: number;
  end: number;
}> = [
    {
      id: "first-050",
      label: "01–050",
      description: "第 1–50 字",
      start: 0,
      end: 50,
    },
    {
      id: "051-100",
      label: "051–100",
      description: "第 51–100 字",
      start: 50,
      end: 100,
    },
    {
      id: "101-150",
      label: "101–150",
      description: "第 101–150 字",
      start: 100,
      end: 150,
    },
    {
      id: "151-200",
      label: "151–200",
      description: "第 151–200 字",
      start: 150,
      end: 200,
    },
    {
      id: "201-250",
      label: "201–250",
      description: "第 201–250 字",
      start: 200,
      end: 250,
    },
    {
      id: "251-300",
      label: "251–300",
      description: "第 251–300 字",
      start: 250,
      end: 300,
    },
    {
      id: "301-350",
      label: "301–350",
      description: "第 301–350 字",
      start: 300,
      end: 350,
    },
    {
      id: "351-400",
      label: "351–400",
      description: "第 351–400 字",
      start: 350,
      end: 400,
    },
    {
      id: "401-450",
      label: "401–450",
      description: "第 401–450 字",
      start: 400,
      end: 450,
    },
    {
      id: "451-500",
      label: "451–500",
      description: "第 451–500 字",
      start: 450,
      end: 500,
    },
    {
      id: "middle-500",
      label: "中500",
      description: "第 501–1000 字",
      start: 500,
      end: 1000,
    },
    {
      id: "last-500",
      label: "后500",
      description: "第 1001–1500 字",
      start: 1000,
      end: 1500,
    },
    {
      id: "first-1500",
      label: "前1500",
      description: "第 1–1500 字",
      start: 0,
      end: 1500,
    },
  ];

export function getCommonCharacterSlice(
  data: CommonCharacterData,
  preset: CommonCharacterPreset,
): string[] {
  const range = commonCharacterPresets.find((item) => item.id === preset);
  if (!range) return [];
  return Array.from(data.characters).slice(range.start, range.end);
}

export function shuffleCharacters(
  characters: readonly string[],
  random: () => number = Math.random,
): string[] {
  const shuffled = [...characters];
  for (let index = shuffled.length - 1;index > 0;index -= 1) {
    const sample = random();
    const boundedSample = Number.isFinite(sample)
      ? Math.min(1 - Number.EPSILON, Math.max(0, sample))
      : 0;
    const swapIndex = Math.floor(boundedSample * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [
      shuffled[swapIndex],
      shuffled[index],
    ];
  }
  return shuffled;
}

export function formatCommonCharacterText(characters: readonly string[]): string {
  const lines: string[] = [];
  for (let index = 0;index < characters.length;index += 10) {
    lines.push(characters.slice(index, index + 10).join(""));
  }
  return lines
    .map((line, index) => (index > 0 && index % 5 === 0 ? `\n${line}` : line))
    .join("\n");
}

export function buildCommonPracticeArticle(
  data: CommonCharacterData,
  preset: CommonCharacterPreset,
  shuffled = false,
  random: () => number = Math.random,
): CommonPracticeArticle {
  const range = commonCharacterPresets.find((item) => item.id === preset);
  if (!range) throw new Error(`未知的常用字范围：${preset}`);
  const orderedCharacters = getCommonCharacterSlice(data, preset);
  const characters = shuffled
    ? shuffleCharacters(orderedCharacters, random)
    : orderedCharacters;
  const count = characters.length;
  return {
    id: `common-${preset}`,
    title: `常用单字${range.label}${shuffled ? " · 乱序" : ""}`,
    length: count <= 180 ? "short" : count <= 600 ? "medium" : "long",
    topic: "常用字",
    wordCount: count,
    version: data.version,
    text: formatCommonCharacterText(characters),
    kind: "common",
    preset,
    shuffled,
  };
}

export function isCommonPracticeArticle(
  value: unknown,
): value is CommonPracticeArticle {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const article = value as Partial<CommonPracticeArticle>;
  const presets = new Set(commonCharacterPresets.map((item) => item.id));
  return (
    article.kind === "common" &&
    typeof article.id === "string" &&
    article.id === `common-${article.preset}` &&
    typeof article.preset === "string" &&
    presets.has(article.preset as CommonCharacterPreset) &&
    typeof article.title === "string" &&
    typeof article.text === "string" &&
    typeof article.wordCount === "number" &&
    article.wordCount > 0 &&
    article.wordCount <= 1500 &&
    article.text.replace(/\s/g, "").length === article.wordCount &&
    typeof article.shuffled === "boolean"
  );
}

export const lengthLabels = {
  all: "全部长度",
  short: "短文",
  medium: "中篇",
  long: "长文",
  water: "水文",
} as const;
