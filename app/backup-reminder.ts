"use client";

import { createBackupPayload, MAX_BACKUP_BYTES, parseBackupPayload, readLocalForBackup } from "./backup.ts";
import { STORAGE, STORAGE_KEYS, writeLocal } from "./storage.ts";
import { readKeyUsage } from "./practice-store.ts";
import type { BackupPayload, SessionResult } from "./types.ts";

// 设备本地的下载请求记录，不参与练习备份或恢复。
export const BACKUP_REMINDER_KEY = "wubi-test:backup-reminder:v1";
export const BACKUP_REMINDER_THRESHOLD = 20;
export const BACKUP_REMINDER_SNOOZE_DAYS = 7;

export interface BackupReminderMetadata {
  version: 1;
  lastDownloadAt: string | null;
  backedUpSessionIds: string[];
  deferredUntil: string | null;
}

export interface BackupReminderStatus {
  lastDownloadAt: string | null;
  newSessionCount: number;
  deferredUntil: string | null;
  shouldRemind: boolean;
}

function emptyMetadata(): BackupReminderMetadata {
  return { version: 1, lastDownloadAt: null, backedUpSessionIds: [], deferredUntil: null };
}

function validDate(value: unknown): value is string {
  return typeof value === "string" && value.length <= 40 && Number.isFinite(Date.parse(value));
}

export function readBackupReminderMetadata(): BackupReminderMetadata {
  const value = readLocalForBackup(BACKUP_REMINDER_KEY);
  if (!value || typeof value !== "object" || Array.isArray(value)) return emptyMetadata();
  const metadata = value as Partial<BackupReminderMetadata>;
  if (
    metadata.version !== 1 ||
    (metadata.lastDownloadAt !== null && !validDate(metadata.lastDownloadAt)) ||
    (metadata.deferredUntil !== null && !validDate(metadata.deferredUntil)) ||
    !Array.isArray(metadata.backedUpSessionIds) ||
    metadata.backedUpSessionIds.length > 500 ||
    !metadata.backedUpSessionIds.every((id) => typeof id === "string" && id.length > 0 && id.length <= 160)
  ) return emptyMetadata();
  return metadata as BackupReminderMetadata;
}

export function buildBackupReminderStatus(
  sessions: Pick<SessionResult, "id">[],
  metadata: BackupReminderMetadata,
  now = new Date(),
): BackupReminderStatus {
  const backedUp = new Set(metadata.backedUpSessionIds);
  const newSessionCount = new Set(sessions.filter((session) => !backedUp.has(session.id)).map((session) => session.id)).size;
  const deferred = metadata.deferredUntil !== null && Date.parse(metadata.deferredUntil) > now.getTime();
  return {
    lastDownloadAt: metadata.lastDownloadAt,
    newSessionCount,
    deferredUntil: deferred ? metadata.deferredUntil : null,
    shouldRemind: newSessionCount >= BACKUP_REMINDER_THRESHOLD && !deferred,
  };
}

export function readBackupReminderStatus(now = new Date()): BackupReminderStatus {
  // 按恢复契约读取原始成绩，损坏或超过保留上限时不把截断后的数据当成已备份。
  const payload = parseBackupPayload(createBackupPayload({ [STORAGE.sessions]: readLocalForBackup(STORAGE.sessions) }));
  return buildBackupReminderStatus(
    (payload.data[STORAGE.sessions] ?? []) as SessionResult[],
    readBackupReminderMetadata(),
    now,
  );
}

export function createValidatedLocalBackup(now = new Date()): BackupPayload {
  const data = Object.fromEntries(STORAGE_KEYS.map((key) => [key, readLocalForBackup(key)]));
  // Include keystrokes waiting for the debounced write, even when storage is full.
  data[STORAGE.keyUsage] = readKeyUsage();
  const payload = parseBackupPayload(createBackupPayload(data, now));
  if (new TextEncoder().encode(JSON.stringify(payload, null, 2)).byteLength > MAX_BACKUP_BYTES) {
    throw new Error("本机数据已超过单个备份文件的安全大小，请先清理部分历史记录。");
  }
  return payload;
}

export function recordBackupDownload(payload: BackupPayload): boolean {
  const validated = parseBackupPayload(payload);
  return writeLocal(BACKUP_REMINDER_KEY, {
    version: 1,
    lastDownloadAt: validated.exportedAt,
    backedUpSessionIds: ((validated.data[STORAGE.sessions] ?? []) as SessionResult[]).map((session) => session.id),
    deferredUntil: null,
  } satisfies BackupReminderMetadata);
}

export function deferBackupReminder(now = new Date()): boolean {
  return writeLocal(BACKUP_REMINDER_KEY, {
    ...readBackupReminderMetadata(),
    deferredUntil: new Date(now.getTime() + BACKUP_REMINDER_SNOOZE_DAYS * 86400000).toISOString(),
  });
}
