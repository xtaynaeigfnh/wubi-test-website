import test from "node:test";
import assert from "node:assert/strict";
import {
  BACKUP_REMINDER_KEY,
  buildBackupReminderStatus,
  createValidatedLocalBackup,
  deferBackupReminder,
  readBackupReminderMetadata,
  readBackupReminderStatus,
  recordBackupDownload,
} from "../app/backup-reminder.ts";
import { createBackupPayload, restoreBackupPayload } from "../app/backup.ts";
import { STORAGE, STORAGE_KEYS } from "../app/storage.ts";
import { session } from "./v02-fixtures.mjs";

const now = new Date("2026-10-11T04:00:00.000Z");

function storageHarness(context, sessions = []) {
  const previousWindow = globalThis.window;
  const values = new Map([[STORAGE.sessions, JSON.stringify(sessions)]]);
  globalThis.window = {
    localStorage: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
      removeItem: (key) => values.delete(key),
    },
  };
  context.after(() => {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  });
  return values;
}

test("无成绩及少量初次练习不触发提醒，积累 20 条后温和提醒", (context) => {
  const values = storageHarness(context);
  assert.equal(readBackupReminderStatus(now).shouldRemind, false);
  for (const count of [1, 19, 20]) {
    values.set(STORAGE.sessions, JSON.stringify(Array.from({ length: count }, (_, index) => session({ id: `session-${index}` }))));
    const status = readBackupReminderStatus(now);
    assert.equal(status.newSessionCount, count);
    assert.equal(status.shouldRemind, count >= 20);
    assert.equal(status.lastDownloadAt, null);
  }
});

test("最近导出按成绩 ID 识别新增，滚动保留 500 条时仍能提醒", (context) => {
  const old = Array.from({ length: 500 }, (_, index) => session({ id: `old-${index}` }));
  const values = storageHarness(context, old);
  const payload = createValidatedLocalBackup(now);
  assert.equal(values.has(BACKUP_REMINDER_KEY), false, "仅生成备份还未发起下载，不应标记");
  assert.equal(recordBackupDownload(payload), true);
  assert.equal(readBackupReminderStatus(now).newSessionCount, 0);
  const current = [...old.slice(20), ...Array.from({ length: 20 }, (_, index) => session({ id: `new-${index}` }))];
  values.set(STORAGE.sessions, JSON.stringify(current));
  const status = readBackupReminderStatus(now);
  assert.equal(status.newSessionCount, 20);
  assert.equal(status.shouldRemind, true);
  assert.equal(status.lastDownloadAt, now.toISOString());
  assert.equal(buildBackupReminderStatus([...current, current[0]], readBackupReminderMetadata(), now).newSessionCount, 20);
});

test("暂缓 7 天持久化但不伪造最近导出，期限到达后恢复提醒", (context) => {
  storageHarness(context, Array.from({ length: 20 }, (_, index) => session({ id: `s-${index}` })));
  assert.equal(deferBackupReminder(now), true);
  const metadata = readBackupReminderMetadata();
  assert.equal(metadata.lastDownloadAt, null);
  assert.deepEqual(metadata.backedUpSessionIds, []);
  assert.equal(readBackupReminderStatus(new Date("2026-10-17T04:00:00Z")).shouldRemind, false);
  assert.equal(readBackupReminderStatus(new Date("2026-10-18T04:00:00Z")).shouldRemind, true);
  assert.equal(recordBackupDownload(createValidatedLocalBackup(now)), true);
  assert.equal(readBackupReminderMetadata().deferredUntil, null);
});

test("提醒元信息只留本设备，不导出或被备份恢复覆盖", (context) => {
  const values = storageHarness(context, [session({ id: "one" })]);
  assert.equal(recordBackupDownload(createValidatedLocalBackup(now)), true);
  const metadata = values.get(BACKUP_REMINDER_KEY);
  assert.equal(STORAGE_KEYS.includes(BACKUP_REMINDER_KEY), false);
  const payload = createValidatedLocalBackup(now);
  assert.equal(Object.hasOwn(payload.data, BACKUP_REMINDER_KEY), false);
  restoreBackupPayload(createBackupPayload({ [STORAGE.sessions]: [session({ id: "imported" })] }, now));
  assert.equal(values.get(BACKUP_REMINDER_KEY), metadata);
  assert.equal(readBackupReminderStatus(now).newSessionCount, 1);
});

test("损坏、超限或无法读取的数据不能更新导出记录", (context) => {
  const values = storageHarness(context, [session({ id: "one" })]);
  recordBackupDownload(createValidatedLocalBackup(now));
  const original = values.get(BACKUP_REMINDER_KEY);
  for (const raw of ["{broken", JSON.stringify(Array.from({ length: 501 }, (_, index) => session({ id: `over-${index}` })))]) {
    values.set(STORAGE.sessions, raw);
    assert.throws(() => createValidatedLocalBackup(now));
    assert.equal(values.get(BACKUP_REMINDER_KEY), original);
    assert.throws(() => readBackupReminderStatus(now));
  }
  window.localStorage.getItem = () => { throw new DOMException("blocked", "SecurityError"); };
  assert.throws(() => createValidatedLocalBackup(now), /拒绝读取/);
  assert.equal(values.get(BACKUP_REMINDER_KEY), original);
});

test("提醒记录写失败保留旧值并返回失败，异常元信息不触发假导出", (context) => {
  const values = storageHarness(context);
  values.set(BACKUP_REMINDER_KEY, JSON.stringify({ version: 1, lastDownloadAt: "bad", backedUpSessionIds: [], deferredUntil: null }));
  assert.equal(readBackupReminderMetadata().lastDownloadAt, null);
  const original = values.get(BACKUP_REMINDER_KEY);
  window.localStorage.setItem = () => { throw new DOMException("full", "QuotaExceededError"); };
  assert.equal(recordBackupDownload(createValidatedLocalBackup(now)), false);
  assert.equal(deferBackupReminder(now), false);
  assert.equal(values.get(BACKUP_REMINDER_KEY), original);
});
