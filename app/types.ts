export type ArticleLength = "short" | "medium" | "long" | "water";
export type AppView = "typing" | "challenge" | "lookup" | "history" | "settings";

export interface PracticeArticle {
  id: string;
  title: string;
  length: ArticleLength;
  topic: string;
  wordCount: number;
  version: number;
  text: string;
}

export type ArticleMetadata = Omit<PracticeArticle, "text">;

export interface ArticleFilter {
  length: ArticleLength | "all";
  topic: string;
  status: "all" | "new" | "practiced";
}

export type WubiEntry = [text: string, code: string, weight: number];

export interface SessionResult {
  id: string;
  type: "article" | "challenge";
  articleId?: string;
  title: string;
  date: string;
  durationSeconds: number;
  correctChars: number;
  attemptedChars: number;
  speed: number;
  kps: number;
  codeLength: number;
  accuracy: number;
  errors: number;
  errorChars?: string[];
}

export interface ErrorStat {
  text: string;
  code?: string;
  count: number;
  lastSeen: string;
}

export interface ArticleProgress {
  articleId: string;
  attempts: number;
  bestSpeed: number;
  completed: boolean;
  lastPracticed: string;
  errors: number;
}

export interface UserSettings {
  fontSize: number;
  preferredLength: ArticleLength | "all";
  showCodeHints: boolean;
  sound: boolean;
  theme: "light" | "dark" | "system";
  autoNext: boolean;
}
