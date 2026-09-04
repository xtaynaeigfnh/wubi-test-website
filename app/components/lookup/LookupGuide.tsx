"use client";

import styles from "./LookupWorkspace.module.css";

export function LookupGuide({ code }: { code: string }) {
  const letters = Array.from(code.toUpperCase());
  return (
    <aside className={styles.guide} aria-labelledby="lookup-keyboard-title">
      <div className={styles.panelHeading}>
        <h2 id="lookup-keyboard-title">键位对照</h2>
        <span className={styles.kicker}>KEY MAP</span>
      </div>
      <div className={styles.guideBody}>
        <div className={styles.sequence} aria-label={code ? `按键顺序 ${letters.join("、")}` : "等待选择编码"}>
          <span>按键顺序</span>
          {letters.length ? letters.map((letter, index) => (
            <div key={index}><small>{index + 1}</small><strong>{letter}</strong></div>
          )) : <p>查询后选择一组编码</p>}
        </div>
        <div className={styles.keyboard} aria-label="二十六字母键盘">
          {["QWERTYUIOP", "ASDFGHJKL", "ZXCVBNM"].map((row) => (
            <div className={styles.keyboardRow} key={row}>
              {Array.from(row).map((letter) => (
                <span key={letter} data-active={letters.includes(letter)} aria-label={`${letter}${letters.includes(letter) ? "，当前编码包含此键" : ""}`}>{letter}</span>
              ))}
            </div>
          ))}
        </div>
        <p className={styles.keyboardNote}>高亮对应编码中的字母；上方数字表示按键顺序。</p>
        <div className={styles.guideNotes}>
          <h3>两种查法，一个入口</h3>
          <dl>
            <div><dt><span>字</span> 中文查码</dt><dd>输入汉字或词组，查看收录的编码；同一字词可能有多种码长。</dd></div>
            <div><dt><span>A</span> 编码反查</dt><dd>输入 1–4 位 A–Y 字母，精确查找对应字词，不区分大小写。</dd></div>
          </dl>
        </div>
        <p className={styles.sourceNote}>86 版五笔 · Rime 码表<br />查询在本机完成，输入内容不会上传。</p>
      </div>
    </aside>
  );
}
