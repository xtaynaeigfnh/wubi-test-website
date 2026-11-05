"use client";

import Link from "next/link";
import { useState } from "react";
import {
  BACKUP_REMINDER_KEY,
  deferBackupReminder,
  readBackupReminderStatus,
  type BackupReminderStatus,
} from "../backup-reminder";
import { PRACTICE_SAVED_EVENT } from "../pet-events";
import { STORAGE } from "../storage";
import { useLocalDataSync } from "./hooks/useLocalDataSync";

const reminderSyncKeys = [STORAGE.sessions, BACKUP_REMINDER_KEY];
const reminderSyncEvents = [PRACTICE_SAVED_EVENT];

export function BackupReminderNotice() {
  const [reminder, setReminder] = useState<BackupReminderStatus | null>(null);
  const [error, setError] = useState("");
  useLocalDataSync(() => {
    try { setReminder(readBackupReminderStatus()); }
    catch { setReminder(null); }
  }, { keys: reminderSyncKeys, events: reminderSyncEvents });

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
