export type ArticleLength = "short" | "medium" | "long" | "water";
export type AppView =
  | "typing"
  | "training"
  | "advanced"
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

export type ScenarioCategory = "daily" | "office" | "literature";

export interface RhythmCurvePoint {
  characterCount: number;
  intervalMs: number;
}

export interface RhythmWeakSegment {
  start: number;
  text: string;
  delayMs: number;
}

export interface RhythmSummary {
  version: 1;
  characterCount: number;
  startupMs: number | null;
  medianIntervalMs: number | null;
  p90IntervalMs: number | null;
  fastestTenCpm: number | null;
  variationPercent: number | null;
  recoveryMs: number | null;
  firstHalfMedianMs: number | null;
  secondHalfMedianMs: number | null;
  sameHandMedianMs: number | null;
  crossHandMedianMs: number | null;
  curve: RhythmCurvePoint[];
  weakSegments: RhythmWeakSegment[];
}

export interface AdvancedScenario {
  id: string;
  version: 1;
  category: ScenarioCategory;
  title: string;
  text: string;
  suggestedMinutes: number;
}

export type AdvancedGoalMetric =
  | "speed"
  | "characterAccuracy"
  | "keyAccuracy"
  | "codeLength"
  | "phrase"
  | "stability";

export interface AdvancedGoalTarget {
  version: 1;
  metric: AdvancedGoalMetric;
  baselineValue?: number;
  targetMin?: number;
  targetMax?: number;
}

export interface AdvancedAssessmentConditions {
  version: 1;
  textNormalization: "nfc-without-whitespace";
  timingPolicy: "active-foreground-time";
  completionPolicy: "full-text";
}

export interface AdvancedAssessmentIdentity {
  scenarioId: string;
  scenarioVersion: number;
  contentFingerprint: string;
  characterCount: number;
  conditions?: AdvancedAssessmentConditions;
}

export interface AdvancedAssessmentMetrics {
  speed: number;
  characterAccuracy: number;
  keyAccuracy: number | null;
  codeLength: number | null;
  phraseRate: number | null;
  stability: number | null;
}

export interface AdvancedAssessmentSnapshot {
  version: 1;
  day: number;
  sessionId: string;
  recordedAt: string;
  identity: AdvancedAssessmentIdentity;
  metrics: AdvancedAssessmentMetrics;
}

export interface AdvancedSeasonAssessment {
  version: 1;
  snapshots: AdvancedAssessmentSnapshot[];
  invalidatedAt?: string;
  invalidationReason?: string;
}

export type AdvancedSeasonStatus =
  | "active"
  | "paused"
  | "completed"
  | "cancelled"
  | "expired"
  | "invalidated";

export interface AdvancedSeasonDay {
  day: number;
  focus: "baseline" | "startup" | "stability" | "switching" | "recovery" | "retest" | ScenarioCategory | "adaptive" | "restore" | "integrated" | "prepare" | "final";
  title: string;
  completedAt?: string;
  sessionId?: string;
}

export interface AdvancedSeasonBaseline {
  speed: number;
  accuracy: number;
  variationPercent: number | null;
  startupMs: number | null;
  recoveryMs: number | null;
}

export interface AdvancedSeason {
  version: 1;
  id: string;
  status: AdvancedSeasonStatus;
  startedAt: string;
  expiresAt: string;
  currentDay: number;
  days: AdvancedSeasonDay[];
  durationDays?: 7 | 14;
  calendarDayPolicy?: "one-per-local-day";
  goal?: AdvancedGoalTarget;
  assessment?: AdvancedSeasonAssessment;
  pausedAt?: string;
  pausedDurationMs?: number;
  baseline?: AdvancedSeasonBaseline;
  completedAt?: string;
}

export interface AdvancedSeasonArchive {
  version: 1;
  active: AdvancedSeason | null;
  history: AdvancedSeason[];
}

export interface GhostTimeline {
  version: 1;
  articleKey: string;
  articleVersion: number;
  contentFingerprint: string;
  characterCount: number;
  step: number;
  samples: Array<[characterCount: number, elapsedMs: number]>;
}

export interface HesitationPracticeTarget {
  version: 1;
  id: string;
  fingerprint: string;
  sourceSessionId: string;
  articleId?: string;
  sourceTitle: string;
  sourceDate: string;
  text: string;
  sourceStart: number;
  focusOffset: number;
  focusLength: number;
  sourceDelayMs: number;
  baselineMs: number;
  thresholdMs: number;
}

export interface HesitationPracticeAttempt {
  round: 1 | 2 | 3;
  durationMs: number;
  errorIndexes: number[];
  delaysMs: number[];
  completedAt: string;
}

export interface HesitationPracticeResult {
  version: 1;
  target: HesitationPracticeTarget;
  attempts: [
    HesitationPracticeAttempt,
    HesitationPracticeAttempt,
    HesitationPracticeAttempt,
  ];
  outcome: "mastered" | "needs-review";
  completedAt: string;
}

export interface SessionResult {
  id: string;
  type: "article" | "challenge" | "review" | "roots" | "hesitation" | "rhythm" | "scenario";
  articleId?: string;
  title: string;
  date: string;
  durationSeconds: number;
  correctChars: number;
  correctHanChars?: number;
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
  ghostTimeline?: GhostTimeline;
  trainingTaskId?: string;
  hesitationPractice?: HesitationPracticeResult;
  rhythmSummary?: RhythmSummary;
  scenarioId?: string;
  assessmentIdentity?: AdvancedAssessmentIdentity;
  seasonId?: string;
  seasonDay?: number;
}

export interface ErrorStat {
  text: string;
  code?: string;
  count: number;
  firstSeen?: string;
  lastSeen: string;
  mastery?: number;
  lastCorrect?: string;
  codingErrors?: number;
  hesitationPoints?: number;
  correctionCount?: number;
  seenCount?: number;
  correctStreak?: number;
}

export interface PhraseOpportunityStat {
  text: string;
  code: string;
  characterCount: 2 | 3 | 4;
  savedKeys: number;
  opportunityCount: number;
  practiceCount: number;
  correctCount: number;
  lastSeen: string;
}

export type WeakObservationKind =
  | "coding-error"
  | "hesitation"
  | "correction"
  | "correct";

export interface WeakObservation {
  text: string;
  code?: string;
  kind: WeakObservationKind;
  severity?: 1 | 2 | 3;
  occurredAt?: string;
}

export type TrainingTaskStatus = "pending" | "in-progress" | "completed";
export type TrainingTaskType = "article" | "review" | "roots";

export interface TrainingTask {
  id: string;
  type: TrainingTaskType;
  status: TrainingTaskStatus;
  title: string;
  reason: string;
  estimatedMinutes: number;
  items: WubiEntry[];
  articleId?: string;
  articleTitle?: string;
  articleWordCount?: number;
  zoneId?: string;
  zoneKeys?: string;
  startedAt?: string;
  completedAt?: string;
  sessionId?: string;
}

export interface DailyTrainingPlan {
  version: 1;
  date: string;
  revision: number;
  generatedAt: string;
  estimatedMinutes: number;
  tasks: TrainingTask[];
  weakSnapshot: Record<string, number>;
}

export type HesitationQueueStatus = "pending" | "in-progress" | "completed";

export interface HesitationQueueItem {
  id: string;
  target: HesitationPracticeTarget;
  status: HesitationQueueStatus;
  estimatedMinutes: number;
  addedAt: string;
  startedAt?: string;
  completedAt?: string;
  sessionId?: string;
  outcome?: "mastered" | "needs-review";
}

export interface HesitationPracticeQueue {
  version: 1;
  date: string;
  items: HesitationQueueItem[];
}

export interface TrainingSummary {
  durationSeconds: number;
  rounds: number;
  resolved: string[];
  remaining: Array<{
    text: string;
    score: number;
    reason: string;
  }>;
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
  showGhostGap: boolean;
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

export type AbilityDimensionId =
  | "speed"
  | "characterAccuracy"
  | "keyAccuracy"
  | "codeLength"
  | "phrase"
  | "stability";

export interface AbilityDimension {
  id: AbilityDimensionId;
  label: string;
  score: number | null;
  rawLabel: string;
  normalization: string;
}

export type WeeklyRecommendationTarget =
  | "typing"
  | "review"
  | "phrase"
  | "roots"
  | "rhythm";

export interface WeeklyRecommendation {
  text: string;
  target: WeeklyRecommendationTarget;
}

export interface WeeklyReport {
  version: 1;
  weekStart: string;
  weekEnd: string;
  sessions: number;
  characters: number;
  minutes: number;
  activeDays: number;
  streakDays: number;
  masteredWeaknesses: string[];
  newWeaknesses: string[];
  weakestKey: string | null;
  weakestZone: string | null;
  weakestPhraseType: string | null;
  abilities: AbilityDimension[];
  comparison: {
    sessions: number;
    characters: number;
    minutes: number;
    abilities: Partial<Record<AbilityDimensionId, number>>;
  };
  recommendations: WeeklyRecommendation[];
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
