"use client";

import type { CSSProperties } from "react";
import { defaultCustomTheme, lengthLabels } from "../../lib";
import {
  buildCustomThemeVariables,
  chooseContrastText,
  getContrastRatio,
  mixHex,
  themeLabels,
} from "../../theme";
import type { ThemeId, UserSettings } from "../../types";
import { DataManagement } from "../DataManagement";
import { PwaControl } from "../PwaControl";
import { Toggle } from "../Ui";

type KeySoundPlayer = (options?: { force?: boolean }) => void;

const themeOptions: Array<{
  id: ThemeId;
  description: string;
  canvas: string;
  accent: string;
}> = [
  {
    id: "system",
    description: "随设备外观",
    canvas: "#E7EDF0",
    accent: "#086B66",
  },
  {
    id: "light",
    description: "清爽蓝白",
    canvas: "#E7EDF0",
    accent: "#086B66",
  },
  {
    id: "dark",
    description: "低亮深色",
    canvas: "#09171A",
    accent: "#71D0C7",
  },
  {
    id: "bamboo",
    description: "米纸竹青",
    canvas: "#F2EBDD",
    accent: "#B3432B",
  },
  {
    id: "qingdai",
    description: "静谧蓝灰",
    canvas: "#DCE5E8",
    accent: "#315C72",
  },
  {
    id: "custom",
    description: "自行配色",
    canvas: "#F2EBDD",
    accent: "#B3432B",
  },
];

const settingsSections = [
  { key: "A", href: "#settings-appearance", label: "外观" },
  { key: "S", href: "#settings-practice", label: "练习" },
  { key: "D", href: "#settings-feedback", label: "反馈" },
  { key: "F", href: "#settings-data", label: "数据" },
  { key: "G", href: "#settings-device", label: "设备" },
  { key: "H", href: "#settings-license", label: "版权" },
] as const;

export function SettingsView({
  settings,
  onChange,
  playKeySound,
}: {
  settings: UserSettings;
  onChange: (settings: UserSettings) => boolean;
  playKeySound: KeySoundPlayer;
}) {
  const update = <K extends keyof UserSettings>(key: K, value: UserSettings[K]) =>
    onChange({ ...settings, [key]: value });
  const customTheme = settings.customTheme ?? defaultCustomTheme;
  const customVariables = buildCustomThemeVariables(
    customTheme.accent,
    customTheme.canvas,
  );
  const canvasTextRatio = getContrastRatio(
    customTheme.canvas,
    customVariables["--custom-text"],
  );
  const accentTextRatio = getContrastRatio(
    customTheme.accent,
    customVariables["--custom-accent-text"],
  );
  const accentCanvasRatio = getContrastRatio(
    customTheme.accent,
    customTheme.canvas,
  );
  const hasLowAccentSeparation = accentCanvasRatio < 3;
  const enabledFeedbackCount = [settings.showCodeHints, settings.sound].filter(Boolean).length;
  const feedbackSummary = enabledFeedbackCount === 0
    ? "全部关闭"
    : enabledFeedbackCount === 2
      ? "已全部开启"
      : "已开启 1 项";
  const updateCustomTheme = (key: "accent" | "canvas", value: string) =>
    onChange({
      ...settings,
      customTheme: { ...customTheme, [key]: value.toUpperCase() },
    });

  return (
    <section className="subpage settings-page">
      <div className="subpage-heading settings-heading">
        <div>
          <span className="eyebrow">按你的习惯调整</span>
          <h1>练习设置</h1>
          <p>把界面和训练节奏调到顺手。每项改动都会立即生效，并保存在当前浏览器中。</p>
        </div>
        <dl className="settings-heading-summary" aria-label="当前设置摘要">
          <div><dt>主题</dt><dd>{themeLabels[settings.theme]}</dd></div>
          <div><dt>字号</dt><dd>{settings.fontSize}px</dd></div>
          <div><dt>默认篇幅</dt><dd>{lengthLabels[settings.preferredLength]}</dd></div>
        </dl>
      </div>
      <div className="settings-workbench">
        <aside className="settings-index" aria-label="设置分区">
          <div className="settings-index-heading">
            <span className="eyebrow">左手主键区</span>
            <strong>设置索引</strong>
          </div>
          <nav>
            {settingsSections.map((section) => (
              <a key={section.href} href={section.href}>
                <kbd>{section.key}</kbd>
                <span>{section.label}</span>
              </a>
            ))}
          </nav>
          <div className="settings-index-status">
            <span>辅助反馈</span>
            <strong>{feedbackSummary}</strong>
            <ul aria-label="辅助反馈状态">
              <li>
                <span>编码提示</span>
                <b className={settings.showCodeHints ? "is-on" : ""}>
                  {settings.showCodeHints ? "已开启" : "已关闭"}
                </b>
              </li>
              <li>
                <span>按键声音</span>
                <b className={settings.sound ? "is-on" : ""}>
                  {settings.sound ? "已开启" : "已关闭"}
                </b>
              </li>
            </ul>
          </div>
        </aside>

        <div className="settings-content">
          <div className="settings-grid">
            <section className="settings-card theme-settings-card" id="settings-appearance">
              <div className="settings-card-title"><span>A</span><div><h2>文字与界面</h2><p>调整跟打区的可读性</p></div></div>
              <div className="theme-settings">
                <div className="theme-settings-controls">
                  <label className="range-row">
                    <span><strong>正文字号</strong><small>{settings.fontSize}px</small></span>
                    <input type="range" min={22} max={42} value={settings.fontSize} onChange={(event) => update("fontSize", Number(event.target.value))} />
                  </label>
                  <fieldset className="theme-preset-fieldset">
                    <legend>主题预设</legend>
                    <div className="theme-preset-grid">
                      {themeOptions.map((option) => {
                        const selected = settings.theme === option.id;
                        const swatchCanvas = option.id === "custom"
                          ? customTheme.canvas
                          : option.canvas;
                        const swatchAccent = option.id === "custom"
                          ? customTheme.accent
                          : option.accent;
                        const swatchText = chooseContrastText(swatchCanvas);
                        return (
                          <label
                            key={option.id}
                            className={`theme-preset-option${selected ? " is-selected" : ""}`}
                            data-theme-option={option.id}
                            style={{
                              "--preset-canvas": swatchCanvas,
                              "--preset-paper": mixHex(swatchCanvas, swatchText === "#FFFFFF" ? "#000000" : "#FFFFFF", 0.12),
                              "--preset-text": swatchText,
                              "--preset-accent": swatchAccent,
                            } as CSSProperties}
                          >
                            <input
                              type="radio"
                              name="theme"
                              value={option.id}
                              checked={selected}
                              onChange={() => update("theme", option.id)}
                            />
                            <span className="theme-preset-swatch" aria-hidden="true"><i /></span>
                            <span><strong>{themeLabels[option.id]}</strong><small>{option.description}</small></span>
                          </label>
                        );
                      })}
                    </div>
                  </fieldset>

                  {settings.theme === "custom" && (
                    <div className="custom-theme-controls">
                      <div className="custom-theme-heading">
                        <div><strong>自定义配色</strong><small>语义状态色保持固定，不随这里改变。</small></div>
                        <button
                          className="theme-reset-button"
                          type="button"
                          onClick={() => update("customTheme", { ...defaultCustomTheme })}
                        >
                          恢复当前主题默认配色
                        </button>
                      </div>
                      <div className="color-control-grid">
                        <label className="color-control" htmlFor="custom-theme-accent">
                          <span><strong>强调色</strong><small>{customTheme.accent}</small></span>
                          <input
                            id="custom-theme-accent"
                            type="color"
                            value={customTheme.accent}
                            aria-describedby="theme-contrast-note"
                            onChange={(event) => updateCustomTheme("accent", event.target.value)}
                          />
                        </label>
                        <label className="color-control" htmlFor="custom-theme-canvas">
                          <span><strong>页面背景色</strong><small>{customTheme.canvas}</small></span>
                          <input
                            id="custom-theme-canvas"
                            type="color"
                            value={customTheme.canvas}
                            aria-describedby="theme-contrast-note"
                            onChange={(event) => updateCustomTheme("canvas", event.target.value)}
                          />
                        </label>
                      </div>
                      <p
                        id="theme-contrast-note"
                        className={`theme-contrast-note${hasLowAccentSeparation ? " is-warning" : ""}`}
                        role="status"
                      >
                        {hasLowAccentSeparation
                          ? `颜色对比度不足：强调色与页面背景较接近（${accentCanvasRatio.toFixed(1)}:1），按钮已自动使用高对比度文字。`
                          : `文字对比度已自动校准：正文 ${canvasTextRatio.toFixed(1)}:1，按钮 ${accentTextRatio.toFixed(1)}:1，达到 WCAG AA。`}
                      </p>
                    </div>
                  )}
                </div>

                <div
                  className="theme-preview"
                  data-preview-theme={settings.theme}
                  aria-label={`主题即时预览：${themeLabels[settings.theme]}`}
                >
                  <div className="theme-preview-toolbar"><span>即时预览</span><b>{themeLabels[settings.theme]}</b></div>
                  <div className="theme-preview-card">
                    <div><strong>普通文字与卡片</strong><p>保持安静、清晰，适合长时间练习。</p></div>
                    <span className="theme-preview-button">开始练习</span>
                  </div>
                  <div className="theme-preview-practice"><span>练习区域</span><strong>稳中求快，准确优先。</strong></div>
                </div>
              </div>
            </section>

            <div className="settings-quick-grid">
              <section className="settings-card" id="settings-practice">
                <div className="settings-card-title"><span>S</span><div><h2>练习偏好</h2><p>控制默认训练方式</p></div></div>
                <label>
                  默认文章长度
                  <select value={settings.preferredLength} onChange={(event) => update("preferredLength", event.target.value as UserSettings["preferredLength"])}>
                    {Object.entries(lengthLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </label>
                <Toggle label="完成后自动下一篇" note="结算后按钮直接抽取新文章" checked={settings.autoNext} onChange={(value) => update("autoNext", value)} />
              </section>
              <section className="settings-card" id="settings-feedback">
                <div className="settings-card-title"><span>D</span><div><h2>辅助反馈</h2><p>保持专注或获得更多提示</p></div></div>
                <Toggle label="显示编码提示" note="跟打区底部显示当前汉字的最短编码" checked={settings.showCodeHints} onChange={(value) => update("showCodeHints", value)} />
                <Toggle
                  label="按键声音"
                  note="文章测速和字码挑战输入时播放轻提示音"
                  checked={settings.sound}
                  onChange={(value) => {
                    if (update("sound", value) && value) playKeySound({ force: true });
                  }}
                />
              </section>
            </div>
          </div>
          <DataManagement />
          <PwaControl />
          <section className="settings-card license-card" id="settings-license">
            <div className="settings-card-title"><span>H</span><div><h2>内容与版权</h2><p>数据来源清楚可核对</p></div></div>
            <p>练习文章为本项目原创生成内容。86 版码表来自 Rime 五笔方案，按 LGPL-3.0 保留原始许可证、作者信息和完整源数据。</p>
            <a href="https://github.com/rime/rime-wubi" target="_blank" rel="noreferrer">查看 Rime 五笔方案 ↗</a>
          </section>
        </div>
      </div>
    </section>
  );
}
