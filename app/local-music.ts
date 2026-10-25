"use client";

import type { AudioMimeType, MusicTrack } from "./types";

export const LOCAL_MUSIC_ACCEPT = ".mp3,.m4a,.ogg";

// Only browser-created object URLs reach the player; these never enter the
// downloaded catalog or persisted preferences.
export async function readLocalMusic(file: File, signal: AbortSignal): Promise<MusicTrack> {
  const extension = file.name.split(".").pop()?.toLowerCase();
  const types: Record<string, AudioMimeType> = {
    mp3: "audio/mpeg", m4a: "audio/mp4", ogg: "audio/ogg",
  };
  const type = types[extension ?? ""];
  if (!type || !file.size || file.size > 100 * 1024 * 1024) {
    throw new Error("请选择非空 MP3、M4A 或 OGG 文件，每首不超过 100 MB");
  }
  signal.throwIfAborted();
  const audio = document.createElement("audio");
  if (!audio.canPlayType(type)) throw new Error("当前浏览器不支持这种音频格式");
  const src = URL.createObjectURL(file);
  try {
    const durationSeconds = await new Promise<number>((resolve, reject) => {
      const finish = (error?: Error) => {
        clearTimeout(timer);
        signal.removeEventListener("abort", abort);
        audio.onloadedmetadata = null;
        audio.onerror = null;
        if (error) reject(error);
        else resolve(audio.duration);
      };
      const abort = () => finish(new Error("已取消导入"));
      const timer = setTimeout(() => finish(new Error("音频读取超时")), 10000);
      signal.addEventListener("abort", abort, { once: true });
      audio.onloadedmetadata = () => finish(
        Number.isFinite(audio.duration) && audio.duration > 0
          ? undefined : new Error("无法读取音频时长"),
      );
      audio.onerror = () => finish(new Error("音频损坏或受保护，无法播放"));
      audio.preload = "metadata";
      audio.src = src;
    });
    return {
      id: `local-${crypto.randomUUID()}`,
      title: file.name.replace(/\.[^.]+$/, ""),
      artist: "本地歌曲",
      sources: [{ src, type }],
      durationSeconds,
      license: "用户本地文件",
      sourceUrl: "",
    };
  } catch (error) {
    URL.revokeObjectURL(src);
    throw error;
  } finally {
    audio.removeAttribute("src");
    audio.load();
  }
}

export function releaseLocalMusic(tracks: readonly MusicTrack[]) {
  for (const track of tracks) URL.revokeObjectURL(track.sources[0].src);
}
