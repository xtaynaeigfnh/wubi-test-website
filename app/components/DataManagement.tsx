"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { useEffect, useRef, useState } from "react";
import {
  addCustomArticlesWithinLimit,
  buildLightweightStatisticsSummary,
  buildCustomArticle,
  clearMaintenanceTarget,
  createLocalId,
  createBackupPayload,
  getPhraseOpportunities,
  getSessions,
  getCustomArticles,
  inspectCleanup,
  MAX_BACKUP_BYTES,
  MAX_CUSTOM_TEXT_LENGTH,
  localDateKey,
  parseBackupPayload,
  readMaintenanceLog,
  readLocalForBackup,
  readSpacedReviewState,
  restoreBackupPayload,
  STORAGE,
  STORAGE_KEYS,
  truncateUnicode,
  writeLocal,
} from "../lib";
import {
  buildStorageUsageReport,
  type CleanupTarget,
  type MaintenanceEvent,
  type StorageUsageReport,
} from "../data-maintenance";
import type { BackupPayload, PracticeArticle } from "../types";

const MAX_CUSTOM_TEXT_FILE_BYTES = MAX_CUSTOM_TEXT_LENGTH * 4 + 1024;

export function DataManagement() {
  const [revision, setRevision] = useState(0);
  return (
    <div className="data-management">
      <StorageManager revision={revision} onChanged={() => setRevision((value) => value + 1)} />
      <BackupManager />
      <CustomTextManager />
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MiB`;
}

function StorageManager({
  revision,
  onChanged,
}: {
  revision: number;
  onChanged: () => void;
}) {
  const [report, setReport] = useState<StorageUsageReport | null>(null);
  const [message, setMessage] = useState("");
  const [events, setEvents] = useState<MaintenanceEvent[]>([]);

  useEffect(() => {
    try {
      const sessions = getSessions();
      const phraseOpportunities = getPhraseOpportunities();
      const reviewState = readSpacedReviewState();
      setReport(buildStorageUsageReport({
        sessions,
        phraseOpportunities,
        reviewState,
        allValues: STORAGE_KEYS.map((key) => readLocalForBackup(key)),
      }));
      setEvents(readMaintenanceLog().events);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "无法读取本机数据用量");
    }
  }, [revision]);

  const cleanup = (target: CleanupTarget) => {
    try {
      const preview = inspectCleanup(target);
      if (!preview.count) {
        setMessage(`没有可清理的${preview.label}。`);
        return;
      }
      const confirmed = window.confirm(
        `将清理 ${preview.count} 项${preview.label}，预计释放 ${formatBytes(preview.bytes)}。\n\n${preview.consequence}\n\n确定继续吗？`,
      );
      if (!confirmed) {
        setMessage("已取消清理，本机数据未改变。");
        return;
      }
      if (!clearMaintenanceTarget(target)) {
        setMessage("清理未能保存，本机数据已保持原样。请检查浏览器存储空间。");
        return;
      }
      setMessage(`已清理 ${preview.count} 项${preview.label}；成绩摘要与趋势所需字段已保留。`);
      onChanged();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "清理失败，本机数据未改变");
    }
  };

  const exportSummary = () => {
    try {
      const summary = buildLightweightStatisticsSummary();
      const blob = new Blob([JSON.stringify(summary, null, 2)], {
        type: "application/json",
      });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `五笔练习轻量摘要-${localDateKey(new Date())}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(link.href), 1000);
      setMessage("轻量统计摘要已导出，不含练习正文、热力图、时间线或逐键事件。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "轻量摘要导出失败");
    }
  };

  return (
    <section className="management-card storage-manager" aria-labelledby="storage-title">
      <div className="management-heading">
        <div>
          <span className="eyebrow">本机存储 · V0.9</span>
          <h2 id="storage-title">数据用量与清理</h2>
          <p>所有估算、清理和导出都只在当前浏览器中完成。</p>
        </div>
        <button className="button secondary" onClick={exportSummary}>
          导出轻量统计摘要
        </button>
      </div>
      {report && (
        <>
          <div className="storage-total">
            <strong>{formatBytes(report.totalBytes)}</strong>
            <span>本站已管理数据的估算总量</span>
          </div>
          {report.warning && <p className="storage-warning" role="status">{report.warning}</p>}
          <div className="storage-usage-list" role="list" aria-label="分项数据用量">
            {report.items.map((item) => {
              const countRatio = item.countLimit ? item.count / item.countLimit : 0;
              const byteRatio = item.byteLimit ? item.bytes / item.byteLimit : 0;
              const ratio = Math.min(1, Math.max(countRatio, byteRatio));
              return (
                <article key={item.id} role="listitem">
                  <div className="storage-usage-heading">
                    <div>
                      <strong>{item.label}</strong>
                      <span>{item.count} 项 · {formatBytes(item.bytes)}</span>
                    </div>
                    {item.cleanupTarget && (
                      <button
                        className="button small secondary"
                        disabled={!item.count}
                        onClick={() => cleanup(item.cleanupTarget as CleanupTarget)}
                      >
                        预览清理
                      </button>
                    )}
                  </div>
                  <div
                    className="storage-meter"
                    role="meter"
                    aria-label={`${item.label}保留额度`}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round(ratio * 100)}
                  >
                    <i style={{ width: `${ratio * 100}%` }} />
                  </div>
                  <small>{item.retention}</small>
                </article>
              );
            })}
          </div>
        </>
      )}
      <details className="maintenance-log">
        <summary>迁移与淘汰记录（{events.length}）</summary>
        {events.length ? (
          <ol>
            {events.slice(0, 12).map((event) => (
              <li key={event.id}>
                <time dateTime={event.date}>{new Date(event.date).toLocaleString("zh-CN")}</time>
                <span>{event.summary}</span>
              </li>
            ))}
          </ol>
        ) : (
          <p>暂无自动迁移、淘汰或手动清理记录。</p>
        )}
      </details>
      {message && <p className="management-message" role="status">{message}</p>}
    </section>
  );
}

function BackupManager() {
  const fileRef = useRef<HTMLInputElement>(null);
  const inspectRequestRef = useRef(0);
  const [pending, setPending] = useState<BackupPayload | null>(null);
  const [inspecting, setInspecting] = useState(false);
  const [message, setMessage] = useState("");

  const exportBackup = () => {
    try {
      const data = Object.fromEntries(
        STORAGE_KEYS.map((key) => [key, readLocalForBackup(key)]),
      );
      const payload = parseBackupPayload(createBackupPayload(data));
      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: "application/json",
      });
      if (blob.size > MAX_BACKUP_BYTES) {
        setMessage("本机数据已超过单个备份文件的安全大小，请先清理部分历史记录。");
        return;
      }
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `五笔测试网站备份-${localDateKey(new Date())}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(link.href), 1000);
      setMessage("备份文件已导出并通过恢复校验。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "备份导出失败");
    }
  };

  const inspectFile = async (file: File | undefined) => {
    if (!file) return;
    const requestId = inspectRequestRef.current + 1;
    inspectRequestRef.current = requestId;
    setPending(null);
    setInspecting(true);
    setMessage("正在检查备份文件…");
    try {
      if (file.size > MAX_BACKUP_BYTES) {
        throw new Error("备份文件过大，无法安全读取");
      }
      const payload = parseBackupPayload(JSON.parse(await file.text()));
      if (requestId !== inspectRequestRef.current) return;
      setPending(payload);
      setMessage("");
    } catch (error) {
      if (requestId !== inspectRequestRef.current) return;
      setPending(null);
      setMessage(error instanceof Error ? error.message : "无法读取备份文件");
    } finally {
      if (requestId === inspectRequestRef.current) {
        setInspecting(false);
        if (fileRef.current) fileRef.current.value = "";
      }
    }
  };

  const restore = () => {
    if (!pending || inspecting) return;
    try {
      restoreBackupPayload(pending);
      setMessage("恢复完成，正在重新载入页面。");
      window.setTimeout(() => window.location.reload(), 250);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "恢复失败，本机数据未改变");
    }
  };

  const arrayLength = (value: unknown) => (Array.isArray(value) ? value.length : 0);
  const sessions = arrayLength(pending?.data[STORAGE.sessions]);
  const errors = arrayLength(pending?.data[STORAGE.errors]);
  const customTexts = arrayLength(pending?.data[STORAGE.customTexts]);
  const currentSessions = pending
    ? arrayLength(readLocalForBackup(STORAGE.sessions))
    : 0;
  const currentErrors = pending
    ? arrayLength(readLocalForBackup(STORAGE.errors))
    : 0;
  const signedChange = (next: number, current: number) => {
    const delta = next - current;
    return delta === 0 ? "不变" : `${delta > 0 ? "+" : ""}${delta}`;
  };

  return (
    <section className="management-card" aria-labelledby="backup-title">
      <div>
        <span className="eyebrow">数据安全</span>
        <h2 id="backup-title">备份与恢复</h2>
        <p>把成绩、错题、设置和自定义文章保存成一个 JSON 文件。</p>
      </div>
      <div className="management-actions">
        <button className="button primary" onClick={exportBackup}>
          导出完整备份
        </button>
        <button
          className="button secondary"
          onClick={() => fileRef.current?.click()}
        >
          选择备份文件
        </button>
        <input
          ref={fileRef}
          className="visually-hidden"
          type="file"
          accept="application/json,.json"
          onChange={(event) => void inspectFile(event.target.files?.[0])}
        />
      </div>
      {pending && (
        <div className="restore-preview" role="status">
          <div>
            <strong>恢复前预览</strong>
            <span>
              {sessions} 条练习 · {errors} 个错字 · {customTexts} 篇自定义文章
            </span>
            <small>
              导出时间：{new Date(pending.exportedAt).toLocaleString("zh-CN")}
            </small>
            <small>
              格式版本：v{pending.version}（兼容） · 不兼容项：0
            </small>
            <small>
              覆盖后的预计变化：练习 {signedChange(sessions, currentSessions)} · 错字 {signedChange(errors, currentErrors)}
            </small>
          </div>
          <button className="button danger" onClick={restore}>
            确认覆盖本机数据
          </button>
        </div>
      )}
      {inspecting && <p className="management-message" role="status">正在检查备份文件…</p>}
      {!inspecting && message && <p className="management-message" role="status">{message}</p>}
    </section>
  );
}

function CustomTextManager() {
  const fileRef = useRef<HTMLInputElement>(null);
  const importingRef = useRef(false);
  const [items, setItems] = useState<PracticeArticle[]>([]);
  const [editingId, setEditingId] = useState("");
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    setItems(getCustomArticles());
  }, []);

  const persist = (next: PracticeArticle[]) => {
    if (!writeLocal(STORAGE.customTexts, next)) {
      setMessage("自定义文章未能保存，请检查浏览器存储空间。");
      return false;
    }
    setItems(next);
    return true;
  };

  const startEdit = (item: PracticeArticle) => {
    setEditingId(item.id);
    setTitle(item.title);
    setText(item.text);
    setMessage("");
  };

  const saveEdit = () => {
    const current = items.find((item) => item.id === editingId);
    const updated = current
      ? buildCustomArticle(current.id, title, text, current.version + 1)
      : null;
    if (!current || !updated) {
      setMessage(`正文长度需要在 10–${MAX_CUSTOM_TEXT_LENGTH} 个字符之间。`);
      return;
    }
    const saved = persist(
      items.map((item) =>
        item.id === editingId
          ? {
              ...updated,
              favorite: item.favorite,
            }
          : item,
      ),
    );
    if (!saved) return;
    setEditingId("");
    setMessage("自定义文章已保存。");
  };

  const importTextFiles = async (files: FileList | null) => {
    const selected = Array.from(files ?? []).slice(0, 20);
    if (!selected.length) return;
    if (importingRef.current) {
      setMessage("正在导入上一批文件，请稍候再试。");
      return;
    }
    importingRef.current = true;
    try {
      const imported = (
        await Promise.all(
          selected.map(async (file): Promise<PracticeArticle | null> => {
            if (file.size > MAX_CUSTOM_TEXT_FILE_BYTES) return null;
            return buildCustomArticle(
              `custom-${createLocalId()}`,
              file.name.replace(/\.txt$/i, "") || "导入的文章",
              await file.text(),
            );
          }),
        )
      ).filter((item): item is PracticeArticle => Boolean(item));
      if (!imported.length) {
        setMessage(
          `所选 TXT 文件的正文长度都不在 10–${MAX_CUSTOM_TEXT_LENGTH} 个字符之间。`,
        );
      } else {
        const currentItems = getCustomArticles();
        const merged = addCustomArticlesWithinLimit(currentItems, imported);
        if (!merged.added.length) {
          setMessage("自定义文章已满 20 篇，请先删除一篇再导入。");
        } else if (persist(merged.articles)) {
          setMessage(
            merged.rejected.length
              ? `已导入 ${merged.added.length} 篇；另有 ${merged.rejected.length} 篇因容量已满未导入。`
              : `已导入 ${merged.added.length} 篇自定义文章。`,
          );
        }
      }
    } catch {
      setMessage("TXT 文件读取失败，请重新选择后再试。");
    } finally {
      importingRef.current = false;
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <section className="management-card custom-manager" aria-labelledby="custom-title">
      <div className="management-heading">
        <div>
          <span className="eyebrow">我的内容</span>
          <h2 id="custom-title">自定义文章管理</h2>
          <p>编辑、删除或从 TXT 文件导入，最多保留 20 篇。</p>
        </div>
        <button
          className="button secondary"
          onClick={() => fileRef.current?.click()}
        >
          导入 TXT
        </button>
        <input
          ref={fileRef}
          className="visually-hidden"
          type="file"
          accept="text/plain,.txt"
          multiple
          onChange={(event) => void importTextFiles(event.target.files)}
        />
      </div>
      <div className="custom-manager-list">
        {items.map((item) =>
          item.id === editingId ? (
            <div className="custom-edit" key={item.id}>
              <label>
                标题
                <input value={title} onChange={(event) => setTitle(event.target.value)} />
              </label>
              <label>
                正文
                <textarea
                  value={text}
                  maxLength={MAX_CUSTOM_TEXT_LENGTH * 2}
                  onChange={(event) =>
                    setText(
                      Array.from(event.target.value)
                        .slice(0, MAX_CUSTOM_TEXT_LENGTH)
                        .join(""),
                    )
                  }
                />
              </label>
              <div>
                <span>
                  {Array.from(text.trim()).length} / {MAX_CUSTOM_TEXT_LENGTH} 字
                </span>
                <button className="button secondary" onClick={() => setEditingId("")}>
                  取消
                </button>
                <button
                  className="button primary"
                  disabled={
                    Array.from(text.trim()).length < 10 ||
                    Array.from(text.trim()).length > MAX_CUSTOM_TEXT_LENGTH
                  }
                  onClick={saveEdit}
                >
                  保存修改
                </button>
              </div>
            </div>
          ) : (
            <article key={item.id}>
              <div>
                <strong>{item.title}</strong>
                <span>{item.wordCount} 字 · 修改 {item.version} 次</span>
              </div>
              <p>{truncateUnicode(item.text.replace(/\s+/g, " "), 72)}…</p>
              <div>
                <button
                  aria-pressed={Boolean(item.favorite)}
                  onClick={() =>
                    persist(
                      items
                        .map((row) =>
                          row.id === item.id
                            ? { ...row, favorite: !row.favorite }
                            : row,
                        )
                        .sort(
                          (a, b) => Number(Boolean(b.favorite)) - Number(Boolean(a.favorite)),
                        ),
                    )
                  }
                >
                  {item.favorite ? "取消收藏" : "收藏"}
                </button>
                <button onClick={() => startEdit(item)}>编辑</button>
                <button
                  className="danger-text"
                  onClick={() => {
                    if (!window.confirm(`确定删除《${item.title}》吗？`)) return;
                    if (persist(items.filter((row) => row.id !== item.id))) {
                      setMessage("自定义文章已删除。");
                    }
                  }}
                >
                  删除
                </button>
              </div>
            </article>
          ),
        )}
        {!items.length && (
          <div className="training-empty">
            还没有自定义文章。可以在文章测速页粘贴文字，或在这里导入 TXT。
          </div>
        )}
      </div>
      {message && <p className="management-message" role="status">{message}</p>}
    </section>
  );
}
