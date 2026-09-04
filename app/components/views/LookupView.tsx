"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { loadWubi } from "../../content-loader";
import type { WubiEntry } from "../../types";
import { ErrorState } from "../Ui";
import { LookupSearch } from "../lookup/LookupSearch";
import { LookupDetail, LookupResults } from "../lookup/LookupResults";
import { LookupGuide } from "../lookup/LookupGuide";
import styles from "../lookup/LookupWorkspace.module.css";

export function LookupView() {
  const [rows, setRows] = useState<WubiEntry[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [selection, setSelection] = useState<WubiEntry | null>(null);
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

  const example = searchIndexes.byText.get("五")?.find((entry) => entry[1] === "gg");
  const selected = normalizedQuery ? selection ?? results[0] ?? null : example ?? null;
  const ready = !loading && !loadError && !isSearchPending;
  const changeQuery = (value: string) => {
    setQuery(value);
    setSelection(null);
  };

  return (
    <section className={`subpage ${styles.page}`}>
      <header className={styles.heading}>
        <div>
          <span className={styles.kicker}>WUBI / 字与键之间</span>
          <h1>五笔查码<span>86 版</span></h1>
          <p>查到编码，也记住它在键盘上的位置。</p>
        </div>
      </header>
      <LookupSearch query={query} onChange={changeQuery} loading={loading} />
      <div className={styles.workbench}>
        <section className={styles.results} aria-labelledby="lookup-results-title" aria-busy={loading || isSearchPending}>
          <div className={styles.panelHeading}>
            <h2 id="lookup-results-title">{normalizedQuery ? "查询结果" : "查一个字，从这里开始"}</h2>
            <span className={styles.resultCount} role="status" aria-live="polite">
              {loading ? "正在载入码表" : loadError ? "码表未就绪" : isSearchPending ? "正在查询…" : normalizedQuery ? `${results.length} 条编码` : "示例 / 五"}
            </span>
          </div>
          {loadError && <ErrorState title="五笔码表没有加载成功" message={loadError} onRetry={() => setLoadAttempt((value) => value + 1)} />}
          {!loadError && (loading || isSearchPending) && (
            <div className={styles.loadingState}><div aria-hidden="true" /><p>{loading ? "正在准备本地码表，载入后即可查询。" : "正在匹配字词与编码…"}</p></div>
          )}
          {ready && selected && <LookupDetail key={`${selected[0]}:${selected[1]}`} entry={selected} example={!normalizedQuery} />}
          {!normalizedQuery && ready && (
            <div className={styles.idleNote}><span>字 → 码</span><p>想知道怎么打，输入中文。<br />想知道打出什么，输入编码。</p><span>码 → 字</span></div>
          )}
          {normalizedQuery && !isSearchPending && !loading && !loadError && (
            results.length ? <>
              <LookupResults groups={groupedResults} selected={selected} onSelect={setSelection} />
              <p className={styles.resultsNote}>按码表词频排序，最多展示 60 条编码。</p>
            </> : <div className={styles.emptyState}><span aria-hidden="true">?</span><h3>暂时没有找到</h3><p>检查汉字或编码是否正确。编码需为 1–4 位 A–Y 字母。</p><button type="button" onClick={() => changeQuery("五笔")}>试查“五笔”</button></div>
          )}
        </section>
        <LookupGuide code={ready ? selected?.[1] ?? "" : ""} />
      </div>
    </section>
  );
}
