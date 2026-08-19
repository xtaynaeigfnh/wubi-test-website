export type ArticleLength = "short" | "medium" | "long" | "water";
export type AppView =
  | "typing"
  | "training"
  | "challenge"
  | "lookup"
  | "history"
  | "summary"
  | "settings";
export type CommonCharacterPreset =
  | "first-050"
  | "051-100"
  | "101-150"
  | "151-200"
  | "201-250"
  | "251-300"
  | "301-350"
  | "351-400"
  | "401-450"
  | "451-500"
  | "middle-500"
  | "last-500"
  | "first-1500";

export interface PracticeArticle {
  id: string;
  title: string;
  length: ArticleLength;
  topic: string;
  wordCount: number;
  version: number;
  text: string;
  favorite?: boolean;
  kind?: "custom" | "common";
}

export type ArticleMetadata = Omit<PracticeArticle, "text">;

export interface CommonCharacterData {
  version: 1;
  source: {
    name: string;
    url: string;
    retrievedAt: string;
  };
  characters: string;
}

export interface CommonPracticeArticle extends PracticeArticle {
  kind: "common";
  preset: CommonCharacterPreset;
  shuffled: boolean;
}

export interface ArticleFilter {
  length: ArticleLength | "all";
  topic: string;
  status: "all" | "new" | "practiced";
}

export type WubiEntry = [text: string, code: string, weight: number];

export interface HesitationSegment {
  start: number;
  length: number;
  delayMs: number;
}

export interface TypingHeatmap {
  version: 1;
  text: string;
  baselineMs: number;
  thresholdMs: number;
  segments: HesitationSegment[];
}

export interface SessionResult {
  id: string;
  type: "article" | "challenge" | "review" | "roots";
  articleId?: string;
  title: string;
  date: string;
  durationSeconds: number;
  correctChars: number;
  attemptedChars: number;
  speed: number;
  kps: number;
  codeLength: number;
  theoreticalCodeLength?: number | null;
  accuracy: number;
  keyAccuracy?: number;
  errors: number;
  errorChars?: string[];
  keyCount?: number;
  backspaceCount?: number;
  correctionCount?: number;
  enterCount?: number;
  selectionCount?: number;
  phraseRate?: number;
  leftHandKeys?: number;
  rightHandKeys?: number;
  pauseCount?: number;
  pauseSeconds?: number;
  retryCount?: number;
  heatmap?: TypingHeatmap;
}

export interface ErrorStat {
  text: string;
  code?: string;
  count: number;
  lastSeen: string;
  mastery?: number;
  lastCorrect?: string;
}

export interface ArticleProgress {
  articleId: string;
  attempts: number;
  bestSpeed: number;
  completed: boolean;
  lastPracticed: string;
  errors: number;
}

export type ThemeId =
  | "system"
  | "light"
  | "dark"
  | "bamboo"
  | "qingdai"
  | "custom";

export interface CustomTheme {
  accent: string;
  canvas: string;
}

export interface UserSettings {
  fontSize: number;
  preferredLength: ArticleLength | "all";
  showCodeHints: boolean;
  sound: boolean;
  theme: ThemeId;
  customTheme?: CustomTheme;
  autoNext: boolean;
}

export interface DailyGoal {
  targetChars: number;
  targetMinutes: number;
  targetRounds: number;
}

export interface DailyProgress {
  date: string;
  chars: number;
  minutes: number;
  rounds: number;
  articleSessions: number;
  trainingSessions: number;
}

export interface TrendPoint {
  date: string;
  label: string;
  sessions: number;
  chars: number;
  minutes: number;
  speed: number;
  accuracy: number;
}

export interface BackupPayload {
  format: "wubi-test-backup";
  version: 2;
  exportedAt: string;
  data: Record<string, unknown>;
}

export type AudioMimeType = "audio/mpeg" | "audio/ogg" | "audio/mp4";

export interface AudioSource {
  src: string;
  type: AudioMimeType;
}

export interface MusicTrack {
  id: string;
  title: string;
  artist: string;
  sources: AudioSource[];
  durationSeconds: number;
  license: string;
  sourceUrl: string;
}

export interface MusicCatalog {
  version: 1;
  tracks: MusicTrack[];
}

export interface MusicPreferences {
  trackId: string | null;
  volume: number;
  muted: boolean;
}
