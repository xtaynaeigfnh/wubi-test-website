"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { useEffect, useRef, useState } from "react";
import {
  buildCustomArticle,
  createBackupPayload,
  MAX_BACKUP_BYTES,
  parseBackupPayload,
  readDailyGoal,
  readKeyUsage,
  readLocal,
  readLocalArray,
  restoreBackupPayload,
  STORAGE,
  STORAGE_KEYS,
  writeLocal,
} from "../lib";
import type { BackupPayload, PracticeArticle } from "../types";

export function DataManagement() {
  return (
    <div className="data-management">
      <BackupManager />
      <CustomTextManager />
    </div>
  );
}

function BackupManager() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<BackupPayload | null>(null);
  const [message, setMessage] = useState("");

  const exportBackup = () => {
    const data = Object.fromEntries(
      STORAGE_KEYS.map((key) => [
        key,
        key === STORAGE.keyUsage
          ? readKeyUsage()
          : key === STORAGE.dailyGoal
            ? readDailyGoal()
          : readLocal<unknown>(key, null),
      ]),
    );
    const payload = createBackupPayload(data);
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    if (blob.size > MAX_BACKUP_BYTES) {
      setMessage("本机数据已超过单个备份文件的安全大小，请先清理部分历史记录。");
      return;
    }
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `五笔测试网站备份-${payload.exportedAt.slice(0, 10)}.json`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    setMessage("备份文件已导出。");
  };

  const inspectFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      if (file.size > MAX_BACKUP_BYTES) {
        throw new Error("备份文件过大，无法安全读取");
      }
      const payload = parseBackupPayload(JSON.parse(await file.text()));
      setPending(payload);
      setMessage("");
    } catch (error) {
      setPending(null);
      setMessage(error instanceof Error ? error.message : "无法读取备份文件");
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const restore = () => {
    if (!pending) return;
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
          </div>
          <button className="button danger" onClick={restore}>
            确认覆盖本机数据
          </button>
        </div>
      )}
      {message && <p className="management-message" role="status">{message}</p>}
    </section>
  );
}

function CustomTextManager() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<PracticeArticle[]>([]);
  const [editingId, setEditingId] = useState("");
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    setItems(readLocalArray<PracticeArticle>(STORAGE.customTexts));
  }, []);

  const persist = (next: PracticeArticle[]) => {
    const limited = next.slice(0, 20);
    if (!writeLocal(STORAGE.customTexts, limited)) {
      setMessage("自定义文章未能保存，请检查浏览器存储空间。");
      return false;
    }
    setItems(limited);
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
      setMessage("正文至少需要 10 个字符。");
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
    const imported = (
      await Promise.all(
        selected.map(async (file, index): Promise<PracticeArticle | null> => {
          return buildCustomArticle(
            `custom-${Date.now()}-${index}`,
            file.name.replace(/\.txt$/i, "") || "导入的文章",
            await file.text(),
          );
        }),
      )
    ).filter((item): item is PracticeArticle => Boolean(item));
    if (!imported.length) {
      setMessage("所选 TXT 文件都不足 10 个字符。");
    } else {
      if (persist([...imported, ...items])) {
        setMessage(`已导入 ${imported.length} 篇自定义文章。`);
      }
    }
    if (fileRef.current) fileRef.current.value = "";
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
                <textarea value={text} onChange={(event) => setText(event.target.value)} />
              </label>
              <div>
                <span>{Array.from(text.trim()).length} / 5000 字</span>
                <button className="button secondary" onClick={() => setEditingId("")}>
                  取消
                </button>
                <button className="button primary" onClick={saveEdit}>
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
              <p>{item.text.replace(/\s+/g, " ").slice(0, 72)}…</p>
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
