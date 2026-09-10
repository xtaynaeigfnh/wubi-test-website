"use client";

import { useRef } from "react";
import styles from "./LookupWorkspace.module.css";

export function LookupSearch({ query, onChange, loading }: {
  query: string;
  onChange: (value: string) => void;
  loading: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const composingRef = useRef(false);
  const updateQuery = (value: string) => {
    const trimmed = value.trim();
    onChange(/^[a-z]+$/i.test(trimmed) ? trimmed.slice(0, 4) : value);
  };
  const chooseQuery = (value: string) => {
    onChange(value);
    inputRef.current?.focus();
  };

  return (
    <div className={styles.searchPanel}>
      <label className={styles.searchLabel} htmlFor="lookup-query">想查什么？</label>
      <div className={styles.searchField}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="10.5" cy="10.5" r="6.5" stroke="currentColor" strokeWidth="1.7" />
          <path d="m15.5 15.5 5 5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        </svg>
        <input
          ref={inputRef}
          id="lookup-query"
          type="text"
          aria-label="查询汉字、词组或五笔编码"
          aria-describedby="lookup-search-help"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          value={query}
          onCompositionStart={() => { composingRef.current = true; }}
          onCompositionEnd={(event) => {
            composingRef.current = false;
            updateQuery(event.currentTarget.value);
          }}
          onChange={(event) => {
            if (composingRef.current) onChange(event.target.value);
            else updateQuery(event.target.value);
          }}
          placeholder={loading ? "正在加载离线码表…" : "输入汉字、词组或编码"}
        />
        {query && <button type="button" onClick={() => chooseQuery("")}>清除</button>}
      </div>
      <div className={styles.searchFooter}>
        <p id="lookup-search-help">输入即查 · 中文查编码，字母查汉字</p>
        <div className={styles.examples} aria-label="示例查询">
          <span>试查</span>
          {["五笔", "测试", "输入法", "ggtt"].map((item) => (
            <button key={item} type="button" onClick={() => chooseQuery(item)}>{item}</button>
          ))}
        </div>
      </div>
    </div>
  );
}
