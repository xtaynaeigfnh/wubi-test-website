"use client";

import { useState } from "react";
import type { WubiEntry } from "../../types";
import styles from "./LookupWorkspace.module.css";

export function LookupDetail({ entry, example = false }: { entry: WubiEntry; example?: boolean }) {
  const [copyMessage, setCopyMessage] = useState("");
  const [copying, setCopying] = useState(false);
  const [text, code] = entry;
  const copyCode = async () => {
    setCopying(true);
    try {
      await navigator.clipboard.writeText(code);
      setCopyMessage(`已复制 ${code.toUpperCase()}`);
    } catch {
      setCopyMessage("复制未成功，可以选中下方编码手动复制。");
    } finally {
      setCopying(false);
    }
  };

  return (
    <div className={styles.detail}>
      <div className={styles.character} data-phrase={Array.from(text).length > 1}>
        <span>{text}</span>
      </div>
      <div className={styles.detailBody}>
        <span className={styles.kicker}>{example ? "查码示例" : "当前选中"} / {Array.from(text).length === 1 ? "单字" : "词组"}</span>
        <h3>{example ? "从一个字，找到它的编码" : `${text} · ${code.length} 位编码`}</h3>
        <div className={styles.codeKeys} aria-label={`编码 ${code.toUpperCase()}`}>
          {Array.from(code.toUpperCase()).map((letter, index) => (
            <kbd key={index}>{letter}</kbd>
          ))}
        </div>
        <div className={styles.copyRow}>
          <code>{code.toUpperCase()}</code>
          <button type="button" disabled={copying} onClick={() => void copyCode()}>
            {copying ? "正在复制…" : "复制编码"}
          </button>
        </div>
        <p className={styles.detailHint}>{example ? "在上方输入内容开始查询，或点选示例。" : "键盘同步标出位置，下方可切换其他编码。"}</p>
        <p className={styles.copyStatus} role="status">{copyMessage}</p>
      </div>
    </div>
  );
}

export function LookupResults({ groups, selected, onSelect }: {
  groups: Array<[string, WubiEntry[]]>;
  selected: WubiEntry | null;
  onSelect: (entry: WubiEntry) => void;
}) {
  return (
    <div className={styles.resultList}>
      <div className={styles.listHeading}><span>汉字 / 词组</span><span>编码 · 点选查看键位</span></div>
      <ul>
        {groups.map(([text, entries]) => (
          <li className={styles.resultRow} key={text}>
            <div className={styles.resultText}>
              <strong>{text}</strong>
              <small>{Array.from(text).length === 1 ? "单字" : `${Array.from(text).length} 字词组`}</small>
            </div>
            <div className={styles.resultCodes}>
              {entries.map((entry) => (
                <button
                  key={entry[1]}
                  type="button"
                  aria-label={`查看 ${text} 的编码 ${entry[1].toUpperCase()} 键位`}
                  aria-pressed={selected?.[0] === text && selected[1] === entry[1]}
                  onClick={() => onSelect(entry)}
                >
                  <code>{entry[1].toUpperCase()}</code><span>{entry[1].length} 位</span>
                </button>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
