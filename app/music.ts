import type {
  AudioMimeType,
  AudioSource,
  MusicCatalog,
  MusicPreferences,
  MusicTrack,
} from "./types";

const SUPPORTED_AUDIO_TYPES = new Set<AudioMimeType>([
  "audio/mpeg",
  "audio/ogg",
  "audio/mp4",
]);

export const DEFAULT_MUSIC_PREFERENCES: MusicPreferences = {
  trackId: null,
  volume: 0.35,
  muted: false,
};

export interface MusicCatalogResult {
  catalog: MusicCatalog;
  invalidTrackCount: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isSafeAudioPath(value: unknown): value is string {
  if (!isNonEmptyString(value)) return false;
  if (
    !value.startsWith("/audio/tracks/") ||
    value.startsWith("//") ||
    value.includes("\\") ||
    value.includes("?") ||
    value.includes("#")
  ) {
    return false;
  }
  try {
    return !decodeURIComponent(value)
      .split("/")
      .some((segment) => segment === ".." || segment === ".");
  } catch {
    return false;
  }
}

function isSourceUrl(value: unknown): value is string {
  if (!isNonEmptyString(value)) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function parseAudioSources(value: unknown): AudioSource[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const sources: AudioSource[] = [];
  for (const source of value) {
    if (
      !isRecord(source) ||
      !isSafeAudioPath(source.src) ||
      !SUPPORTED_AUDIO_TYPES.has(source.type as AudioMimeType)
    ) {
      return null;
    }
    sources.push({
      src: source.src.trim(),
      type: source.type as AudioMimeType,
    });
  }
  return sources;
}

function parseTrack(value: unknown): MusicTrack | null {
  if (!isRecord(value)) return null;
  const sources = parseAudioSources(value.sources);
  if (
    !isNonEmptyString(value.id) ||
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value.id) ||
    !isNonEmptyString(value.title) ||
    !isNonEmptyString(value.artist) ||
    !sources ||
    typeof value.durationSeconds !== "number" ||
    !Number.isFinite(value.durationSeconds) ||
    value.durationSeconds <= 0 ||
    !isNonEmptyString(value.license) ||
    !isSourceUrl(value.sourceUrl)
  ) {
    return null;
  }
  return {
    id: value.id,
    title: value.title.trim(),
    artist: value.artist.trim(),
    sources,
    durationSeconds: value.durationSeconds,
    license: value.license.trim(),
    sourceUrl: value.sourceUrl.trim(),
  };
}

export function parseMusicCatalog(value: unknown): MusicCatalogResult {
  if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.tracks)) {
    throw new Error("音乐目录格式或版本不受支持");
  }

  const tracks: MusicTrack[] = [];
  const seenIds = new Set<string>();
  let invalidTrackCount = 0;
  for (const candidate of value.tracks) {
    const track = parseTrack(candidate);
    if (!track || seenIds.has(track.id)) {
      invalidTrackCount += 1;
      continue;
    }
    seenIds.add(track.id);
    tracks.push(track);
  }

  if (tracks.length === 0) {
    throw new Error("音乐目录没有可播放的曲目");
  }
  return {
    catalog: { version: 1, tracks },
    invalidTrackCount,
  };
}

export function parseMusicPreferences(
  value: unknown,
  tracks: readonly MusicTrack[],
): MusicPreferences {
  const firstTrackId = tracks[0]?.id ?? null;
  if (!isRecord(value)) {
    return { ...DEFAULT_MUSIC_PREFERENCES, trackId: firstTrackId };
  }
  const trackId =
    typeof value.trackId === "string" &&
    tracks.some((track) => track.id === value.trackId)
      ? value.trackId
      : firstTrackId;
  const volume =
    typeof value.volume === "number" && Number.isFinite(value.volume)
      ? Math.min(1, Math.max(0, value.volume))
      : DEFAULT_MUSIC_PREFERENCES.volume;
  return {
    trackId,
    volume,
    muted:
      typeof value.muted === "boolean"
        ? value.muted
        : DEFAULT_MUSIC_PREFERENCES.muted,
  };
}

export function getAdjacentTrackIndex(
  trackCount: number,
  currentIndex: number,
  direction: -1 | 1,
): number {
  if (trackCount <= 0) return -1;
  const safeIndex =
    currentIndex >= 0 && currentIndex < trackCount ? currentIndex : 0;
  return (safeIndex + direction + trackCount) % trackCount;
}

export function withBasePath(
  path: string,
  basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "",
): string {
  return `${basePath}${path}`;
}

export function formatAudioTime(seconds: number): string {
  const safeSeconds =
    Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0;
  const minutes = Math.floor(safeSeconds / 60);
  return `${minutes}:${String(safeSeconds % 60).padStart(2, "0")}`;
}

export async function loadMusicCatalog(): Promise<MusicCatalogResult> {
  const response = await fetch(withBasePath("/data/music-catalog.json"));
  if (!response.ok) {
    throw new Error(`音乐目录加载失败（HTTP ${response.status}）`);
  }
  let data: unknown;
  try {
    data = await response.json();
  } catch {
    throw new Error("音乐目录内容损坏，无法解析");
  }
  return parseMusicCatalog(data);
}
