"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { readLocal, STORAGE, writeLocal } from "../lib";
import {
  DEFAULT_MUSIC_PREFERENCES,
  formatAudioTime,
  getAdjacentTrackIndex,
  loadMusicCatalog,
  parseMusicPreferences,
  withBasePath,
} from "../music";
import type {
  MusicCatalog,
  MusicPreferences,
  MusicTrack,
} from "../types";

export interface MusicPlayerContextValue {
  catalog: MusicCatalog | null;
  currentTrack: MusicTrack | null;
  currentTrackIndex: number;
  isPlaying: boolean;
  isLoading: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  muted: boolean;
  notice: string;
  error: string;
  play: () => Promise<void>;
  pause: () => void;
  toggle: () => void;
  next: () => void;
  previous: () => void;
  seek: (seconds: number) => void;
  selectTrack: (trackId: string) => void;
  setVolume: (volume: number) => void;
  setMuted: (muted: boolean) => void;
}

const MusicPlayerContext = createContext<MusicPlayerContextValue | null>(null);
const MUSIC_DOCK_COLLAPSE_DELAY = 5500;

export function useMusicPlayer(): MusicPlayerContextValue {
  const value = useContext(MusicPlayerContext);
  if (!value) {
    throw new Error("useMusicPlayer 必须在 MusicProvider 内使用");
  }
  return value;
}

export function MusicProvider({ children }: { children: ReactNode }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const resumeAfterTrackChange = useRef(false);
  const [catalog, setCatalog] = useState<MusicCatalog | null>(null);
  const [currentTrackId, setCurrentTrackId] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolumeState] = useState(
    DEFAULT_MUSIC_PREFERENCES.volume,
  );
  const [muted, setMutedState] = useState(DEFAULT_MUSIC_PREFERENCES.muted);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [preferencesReady, setPreferencesReady] = useState(false);

  const tracks = useMemo(() => catalog?.tracks ?? [], [catalog]);
  const currentTrackIndex = tracks.findIndex(
    (track) => track.id === currentTrackId,
  );
  const currentTrack =
    currentTrackIndex >= 0 ? tracks[currentTrackIndex] : tracks[0] ?? null;

  useEffect(() => {
    let active = true;
    loadMusicCatalog()
      .then(({ catalog: nextCatalog, invalidTrackCount }) => {
        if (!active) return;
        const saved = readLocal<unknown>(STORAGE.music, null);
        const preferences = parseMusicPreferences(saved, nextCatalog.tracks);
        setCatalog(nextCatalog);
        setCurrentTrackId(preferences.trackId);
        setVolumeState(preferences.volume);
        setMutedState(preferences.muted);
        setDuration(
          nextCatalog.tracks.find(
            (track) => track.id === preferences.trackId,
          )?.durationSeconds ?? nextCatalog.tracks[0].durationSeconds,
        );
        setNotice(
          invalidTrackCount > 0
            ? `已跳过 ${invalidTrackCount} 首目录信息不完整的曲目`
            : "",
        );
        setPreferencesReady(true);
        setError("");
      })
      .catch((reason: unknown) => {
        if (!active) return;
        setError(
          reason instanceof Error ? reason.message : "音乐目录不可用",
        );
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!preferencesReady) return;
    const preferences: MusicPreferences = {
      trackId: currentTrack?.id ?? null,
      volume,
      muted,
    };
    writeLocal(STORAGE.music, preferences);
  }, [currentTrack?.id, muted, preferencesReady, volume]);

  useEffect(() => {
    if (!audioRef.current) return;
    audioRef.current.volume = volume;
    audioRef.current.muted = muted;
  }, [currentTrack?.id, muted, volume]);

  const play = useCallback(async () => {
    if (!audioRef.current || !currentTrack) return;
    try {
      setError("");
      await audioRef.current.play();
    } catch {
      setIsPlaying(false);
      setError("浏览器阻止了播放，请再次点播放");
    }
  }, [currentTrack]);

  const pause = useCallback(() => {
    audioRef.current?.pause();
  }, []);

  const selectTrackWithResume = useCallback(
    (trackId: string, resume: boolean) => {
      const track = tracks.find((candidate) => candidate.id === trackId);
      if (!track || track.id === currentTrack?.id) return;
      resumeAfterTrackChange.current = resume;
      setIsPlaying(false);
      setCurrentTime(0);
      setDuration(track.durationSeconds);
      setCurrentTrackId(track.id);
      setError("");
    },
    [currentTrack?.id, tracks],
  );

  const move = useCallback(
    (direction: -1 | 1, resume = isPlaying) => {
      const nextIndex = getAdjacentTrackIndex(
        tracks.length,
        currentTrackIndex,
        direction,
      );
      const track = tracks[nextIndex];
      if (track) selectTrackWithResume(track.id, resume);
    },
    [currentTrackIndex, isPlaying, selectTrackWithResume, tracks],
  );

  const next = useCallback(() => move(1), [move]);
  const previous = useCallback(() => move(-1), [move]);

  const toggle = useCallback(() => {
    if (isPlaying) pause();
    else void play();
  }, [isPlaying, pause, play]);

  const seek = useCallback(
    (seconds: number) => {
      if (!audioRef.current) return;
      const maximum =
        Number.isFinite(audioRef.current.duration) &&
        audioRef.current.duration > 0
          ? audioRef.current.duration
          : duration;
      const nextTime = Math.min(maximum, Math.max(0, seconds));
      audioRef.current.currentTime = nextTime;
      setCurrentTime(nextTime);
    },
    [duration],
  );

  const selectTrack = useCallback(
    (trackId: string) => selectTrackWithResume(trackId, isPlaying),
    [isPlaying, selectTrackWithResume],
  );

  const setVolume = useCallback((nextVolume: number) => {
    setVolumeState(Math.min(1, Math.max(0, nextVolume)));
  }, []);

  const setMuted = useCallback((nextMuted: boolean) => {
    setMutedState(nextMuted);
  }, []);

  const value = useMemo<MusicPlayerContextValue>(
    () => ({
      catalog,
      currentTrack,
      currentTrackIndex: currentTrack ? Math.max(0, currentTrackIndex) : -1,
      isPlaying,
      isLoading,
      currentTime,
      duration,
      volume,
      muted,
      notice,
      error,
      play,
      pause,
      toggle,
      next,
      previous,
      seek,
      selectTrack,
      setVolume,
      setMuted,
    }),
    [
      catalog,
      currentTime,
      currentTrack,
      currentTrackIndex,
      duration,
      error,
      isLoading,
      isPlaying,
      muted,
      next,
      notice,
      pause,
      play,
      previous,
      seek,
      selectTrack,
      setMuted,
      setVolume,
      toggle,
      volume,
    ],
  );

  return (
    <MusicPlayerContext.Provider value={value}>
      <div className="music-content">{children}</div>
      {currentTrack && (
        <audio
          key={currentTrack.id}
          ref={audioRef}
          preload="metadata"
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onTimeUpdate={(event) =>
            setCurrentTime(event.currentTarget.currentTime)
          }
          onLoadedMetadata={(event) => {
            const measuredDuration = event.currentTarget.duration;
            if (Number.isFinite(measuredDuration) && measuredDuration > 0) {
              setDuration(measuredDuration);
            }
            event.currentTarget.volume = volume;
            event.currentTarget.muted = muted;
            if (resumeAfterTrackChange.current) {
              resumeAfterTrackChange.current = false;
              void event.currentTarget.play().catch(() => {
                setError("曲目已切换，请点播放继续");
              });
            }
          }}
          onEnded={() => move(1, true)}
          onError={() => {
            setIsPlaying(false);
            setError("曲目加载失败，请切换其他曲目");
          }}
        >
          {currentTrack.sources.map((source) => (
            <source
              key={`${source.type}:${source.src}`}
              src={withBasePath(source.src)}
              type={source.type}
            />
          ))}
        </audio>
      )}
      <MusicDock />
    </MusicPlayerContext.Provider>
  );
}

function MusicDock() {
  const {
    catalog,
    currentTrack,
    currentTrackIndex,
    isPlaying,
    isLoading,
    currentTime,
    duration,
    volume,
    muted,
    notice,
    error,
    toggle,
    next,
    previous,
    seek,
    selectTrack,
    setVolume,
    setMuted,
  } = useMusicPlayer();
  const [expanded, setExpanded] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [activityTick, setActivityTick] = useState(0);
  const tracks = catalog?.tracks ?? [];
  const unavailable = isLoading || !currentTrack;
  const statusText = isLoading
    ? "正在整理离线曲库…"
    : error || notice || `${tracks.length} 首离线 Lo-fi，数据仍只存本机`;

  useEffect(() => {
    if (muted) setMuted(false);
  }, [muted, setMuted]);

  const keepDockOpen = useCallback(() => {
    setActivityTick((value) => value + 1);
  }, []);

  const revealDock = useCallback(() => {
    setCollapsed(false);
    keepDockOpen();
  }, [keepDockOpen]);

  const collapseDock = useCallback(() => {
    setExpanded(false);
    setCollapsed(true);
  }, []);

  useEffect(() => {
    if (expanded || collapsed) return;
    const timer = window.setTimeout(
      () => setCollapsed(true),
      MUSIC_DOCK_COLLAPSE_DELAY,
    );
    return () => window.clearTimeout(timer);
  }, [activityTick, collapsed, expanded]);

  return (
    <aside
      className={[
        "music-dock",
        expanded ? "is-expanded" : "",
        collapsed ? "is-collapsed" : "",
        isPlaying ? "is-playing" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      aria-label="背景音乐播放器"
      onClickCapture={collapsed ? undefined : keepDockOpen}
      onFocusCapture={collapsed ? undefined : keepDockOpen}
      onPointerEnter={collapsed ? undefined : keepDockOpen}
    >
      {collapsed && (
        <button
          type="button"
          className="music-dock-peek"
          aria-label="展开专注电台控制栏"
          title="展开专注电台"
          onClick={revealDock}
        >
          <span className={isPlaying ? "station-pulse active" : "station-pulse"}>
            <i />
            <i />
            <i />
          </span>
          <span>
            <strong>专注电台</strong>
            <small>{currentTrack?.title ?? "离线曲库"}</small>
          </span>
          <b aria-hidden="true">⌃</b>
        </button>
      )}
      {expanded && !collapsed && (
        <div className="music-library" id="music-library">
          <div className="music-library-heading">
            <div>
              <span>OFFLINE RADIO / 曲目目录</span>
              <strong>专注歌单</strong>
            </div>
            <small>{tracks.length} 首 · 播完自动循环</small>
          </div>

          <div className="music-mobile-controls">
            <label>
              <span>播放进度</span>
              <input
                type="range"
                min={0}
                max={Math.max(duration, 1)}
                step={1}
                value={Math.min(currentTime, Math.max(duration, 1))}
                onChange={(event) => seek(Number(event.target.value))}
              />
            </label>
            <label>
              <span>音量 {Math.round(volume * 100)}%</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={volume}
                onChange={(event) => setVolume(Number(event.target.value))}
              />
            </label>
          </div>

          <div className="music-track-list">
            {tracks.map((track, index) => (
              <button
                key={track.id}
                type="button"
                className={
                  track.id === currentTrack?.id
                    ? "music-track-row active"
                    : "music-track-row"
                }
                aria-pressed={track.id === currentTrack?.id}
                onClick={() => selectTrack(track.id)}
              >
                <span>{String(index + 1).padStart(2, "0")}</span>
                <strong>{track.title}</strong>
                <small>{track.artist}</small>
                <time>{formatAudioTime(track.durationSeconds)}</time>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="music-dock-bar" hidden={collapsed}>
        <div className="music-station">
          <span className={isPlaying ? "station-pulse active" : "station-pulse"}>
            <i />
            <i />
            <i />
          </span>
          <span>
            <strong>专注电台</strong>
            <small aria-live="polite">{statusText}</small>
          </span>
        </div>

        <div className="music-transport">
          <button
            type="button"
            aria-label="上一首"
            title="上一首"
            disabled={unavailable}
            onClick={previous}
          >
            ‹
          </button>
          <button
            type="button"
            className={
              isPlaying
                ? "music-play-button is-playing"
                : "music-play-button"
            }
            aria-label={isPlaying ? "暂停背景音乐" : "播放背景音乐"}
            title={isPlaying ? "暂停" : "播放"}
            disabled={unavailable}
            onClick={toggle}
          >
            {isPlaying ? "Ⅱ" : "▶"}
          </button>
          <button
            type="button"
            aria-label="下一首"
            title="下一首"
            disabled={unavailable}
            onClick={next}
          >
            ›
          </button>
        </div>

        <div className="music-now-playing">
          <span>
            {currentTrack
              ? `${String(currentTrackIndex + 1).padStart(2, "0")} / ${String(
                  tracks.length,
                ).padStart(2, "0")}`
              : "-- / --"}
          </span>
          <div
            key={currentTrack?.id ?? "unavailable"}
            className="music-track-copy"
          >
            <strong>{currentTrack?.title ?? "音乐目录不可用"}</strong>
            <small>{currentTrack?.artist ?? "请检查目录文件"}</small>
          </div>
          <button
            type="button"
            className="music-library-toggle"
            aria-label={expanded ? "收起曲目列表" : "展开曲目列表"}
            aria-expanded={expanded}
            aria-controls="music-library"
            onClick={() => {
              setCollapsed(false);
              setExpanded((value) => !value);
            }}
          >
            {expanded ? "收起" : "曲目"}
            <span aria-hidden="true">{expanded ? "⌄" : "⌃"}</span>
          </button>
        </div>

        <div className="music-ruler" aria-label="曲目刻度">
          {tracks.map((track, index) => (
            <button
              key={track.id}
              type="button"
              className={
                track.id === currentTrack?.id ? "active" : undefined
              }
              aria-label={`播放第 ${index + 1} 首：${track.title}`}
              aria-pressed={track.id === currentTrack?.id}
              onClick={() => selectTrack(track.id)}
            />
          ))}
        </div>

        <label className="music-progress">
          <span>
            {formatAudioTime(currentTime)} / {formatAudioTime(duration)}
          </span>
          <input
            type="range"
            aria-label="播放进度"
            min={0}
            max={Math.max(duration, 1)}
            step={1}
            value={Math.min(currentTime, Math.max(duration, 1))}
            disabled={unavailable}
            onChange={(event) => seek(Number(event.target.value))}
          />
        </label>

        <div className="music-volume">
          <label>
            <span className="sr-only">背景音乐音量</span>
            <input
              type="range"
              aria-label="背景音乐音量"
              min={0}
              max={1}
              step={0.01}
              value={volume}
              disabled={unavailable}
              onChange={(event) => setVolume(Number(event.target.value))}
            />
          </label>
        </div>

        <button
          type="button"
          className="music-collapse"
          aria-label="收起专注电台控制栏"
          title="收起播放器"
          onClick={collapseDock}
        >
          ⌄
        </button>
      </div>
    </aside>
  );
}
