"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  BACKUP_REMINDER_KEY,
  deferBackupReminder,
  readBackupReminderStatus,
  type BackupReminderStatus,
} from "../backup-reminder";
import { STORAGE } from "../storage";

export function BackupReminderNotice() {
  const [reminder, setReminder] = useState<BackupReminderStatus | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const refresh = () => {
      try { setReminder(readBackupReminderStatus()); }
      catch { setReminder(null); }
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === STORAGE.sessions || event.key === BACKUP_REMINDER_KEY) refresh();
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    refresh();
    window.addEventListener("storage", onStorage);
    window.addEventListener("focus", refresh);
    window.addEventListener("wubi:practice-saved", refresh);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("wubi:practice-saved", refresh);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  if (!reminder?.shouldRemind) return null;
  return (
    <aside className="backup-reminder-notice" aria-label="备份提醒">
      <p>有 {reminder.newSessionCount} 条当前保留的成绩尚未纳入本设备最近导出的备份。</p>
      <Link className="button secondary" href="/settings#settings-backup">导出备份</Link>
      <button className="button secondary" onClick={() => {
        try {
          if (!deferBackupReminder()) {
            setError("暂缓提醒未能保存，请检查浏览器存储空间。");
            return;
          }
          setReminder(readBackupReminderStatus());
        } catch {
          setError("暂缓提醒未能保存，请稍后重试。");
        }
      }}>暂缓 7 天</button>
      {error && <p role="alert">{error}</p>}
    </aside>
  );
}
