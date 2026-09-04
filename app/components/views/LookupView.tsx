"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { loadWubi } from "../../content-loader";
import type { WubiEntry } from "../../types";
import { ErrorState } from "../Ui";

export function LookupView() {
  const [rows, setRows] = useState<WubiEntry[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [loadAttempt, setLoadAttempt] = useState(0);
  const normalizedQuery = query.trim();
  const deferredQuery = useDeferredValue(normalizedQuery);
  const isSearchPending = normalizedQuery !== deferredQuery;

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError("");
    loadWubi()
      .then((nextRows) => {
        if (active) setRows(nextRows);
      })
      .catch((error: unknown) => {
        if (active) {
          setLoadError(
            error instanceof Error ? error.message : "五笔码表加载失败",
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [loadAttempt]);

  const searchIndexes = useMemo(() => {
    const byCode = new Map<string, WubiEntry[]>();
    const byText = new Map<string, WubiEntry[]>();
    rows.forEach((entry) => {
      const codeEntries = byCode.get(entry[1]) || [];
      codeEntries.push(entry);
      byCode.set(entry[1], codeEntries);
      const textEntries = byText.get(entry[0]) || [];
      textEntries.push(entry);
      byText.set(entry[0], textEntries);
    });
    return { byCode, byText };
  }, [rows]);

  const results = useMemo(() => {
    const value = deferredQuery.toLowerCase();
    if (!value) return [];
    const isCode = /^[a-y]{1,4}$/.test(value);
    const matches = isCode
      ? searchIndexes.byCode.get(value) ?? []
      : searchIndexes.byText.get(deferredQuery) ??
        rows.filter(([text]) => text.includes(deferredQuery));
    return [...matches].sort((a, b) => b[2] - a[2]).slice(0, 60);
  }, [deferredQuery, rows, searchIndexes]);

  const groupedResults = useMemo(() => {
    const map = new Map<string, WubiEntry[]>();
    results.forEach((entry) => {
      const list = map.get(entry[0]) || [];
      list.push(entry);
      map.set(entry[0], list);
    });
    return Array.from(map.entries());
  }, [results]);

  return (
    <section className="subpage lookup-page">
      <div className="subpage-heading lookup-heading">
        <span className="eyebrow">离线收录 13 万余条编码</span>
        <h1>86 版五笔查码</h1>
        <p>输入汉字、词组或 1–4 位编码，结果完全来自本地码表。</p>
      </div>
      <div className="lookup-search">
        <span aria-hidden="true">查</span>
        <input
          aria-label="查询汉字、词组或五笔编码"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={loading ? "正在加载离线码表…" : "例如：五笔、测试、ggtt"}
        />
        {query && <button onClick={() => setQuery("")}>清除</button>}
      </div>
      {loadError && (
        <ErrorState
          title="五笔码表没有加载成功"
          message={loadError}
          onRetry={() => setLoadAttempt((value) => value + 1)}
        />
      )}
      {!normalizedQuery && (
        <div className="lookup-empty">
          <div className="keyboard-visual">
            {"QWERTYUIOPASDFGHJKLXCVBNM".split("").map((key) => (
              <span key={key}>{key}</span>
            ))}
          </div>
          <h2>查一个字，也可以反查一组编码</h2>
          <p>输入中文会匹配汉字与词组；输入英文字母会精确反查编码。</p>
          <div className="quick-searches">
            {["五笔", "测试", "输入法", "ggtt"].map((item) => (
              <button key={item} onClick={() => setQuery(item)}>{item}</button>
            ))}
          </div>
        </div>
      )}
      {normalizedQuery && !isSearchPending && !loading && !loadError && (
        <div className="lookup-results">
          <div className="result-heading" role="status" aria-live="polite">
            <span>查询结果</span><strong>{results.length} 条</strong>
          </div>
          {groupedResults.map(([text, entries]) => (
            <div className="lookup-row" key={text}>
              <strong>{text}</strong>
              <div>
                {entries.map((entry) => <code key={entry[1]}>{entry[1].toUpperCase()}</code>)}
              </div>
              <small>{Array.from(text).length === 1 ? "单字" : `${Array.from(text).length} 字词组`}</small>
            </div>
          ))}
          {!results.length && <div className="empty-state">没有找到对应编码，请检查输入内容。</div>}
        </div>
      )}
    </section>
  );
}
