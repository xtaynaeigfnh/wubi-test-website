"use client";

import { useRef } from "react";
import { LOCAL_MUSIC_ACCEPT } from "../local-music";

export function LocalMusicImport({ active, busy, message, onImport, onClear }: {
  active: boolean;
  busy: boolean;
  message: string;
  onImport: (files: File[]) => Promise<void>;
  onClear: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <div className="music-local-import">
      <div className="music-local-actions">
        <button type="button" disabled={busy} onClick={() => input.current?.click()}>
          {busy ? "正在读取歌曲…" : active ? "更换本地歌单" : "导入本地歌曲"}
        </button>
        {active && <button type="button" disabled={busy} onClick={onClear}>返回内置歌单</button>}
      </div>
      <input
        ref={input}
        type="file"
        accept={LOCAL_MUSIC_ACCEPT}
        multiple
        hidden
        aria-label="选择本地歌曲"
        onChange={(event) => {
          const files = Array.from(event.currentTarget.files ?? []);
          event.currentTarget.value = "";
          if (files.length) void onImport(files);
        }}
      />
      <p>MP3 / M4A / OGG · 最多 20 首，每首 100 MB。仅在本机播放，不上传；刷新后需重新选择。</p>
      <p role="status">{message}</p>
    </div>
  );
}
