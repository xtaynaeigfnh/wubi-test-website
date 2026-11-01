"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { useLayoutEffect, useRef, useState } from "react";
import { defaultCustomTheme, defaultSettings } from "../../practice-schema";
import { saveSettingsChanges } from "../../practice-transactions";
import { readSettings } from "../../settings-store";
import { STORAGE } from "../../storage";
import { buildCustomThemeVariables, getNextQuickTheme } from "../../theme";
import type { UserSettings } from "../../types";
import { useLocalDataSync } from "../hooks/useLocalDataSync";

const settingsSyncKeys = [STORAGE.settings];

export const SETTINGS_SAVE_FAILED_MESSAGE =
  "设置未能保存，原设置保持不变。请检查浏览器存储空间后重试。";

/** 把皮肤、主题与自定义配色变量写到 `<html>`，让所有页面样式随设置切换。 */
export function applySettingsToDocument(settings: UserSettings, root = document.documentElement) {
  root.dataset.skin = settings.skin;
  root.dataset.theme = settings.theme;
  const customTheme = settings.customTheme ?? defaultCustomTheme;
  const customVariables = buildCustomThemeVariables(
    customTheme.accent,
    customTheme.canvas,
  );
  for (const [property, value] of Object.entries(customVariables)) {
    root.style.setProperty(property, value);
  }
}

/**
 * 应用级用户设置：首帧前同步读取本机设置，跟随其它窗口的改动，
 * 并串行化保存请求——保存失败时保留原设置并给出可见提示。
 */
export function useAppSettings() {
  const [settings, setSettings] = useState<UserSettings>(defaultSettings);
  const [settingsReady, setSettingsReady] = useState(false);
  const savingRef = useRef(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  // 皮肤决定整页布局，必须在首次绘制前应用，避免闪烁。
  useLayoutEffect(() => {
    setSettings(readSettings());
    setSettingsReady(true);
  }, []);

  useLocalDataSync(() => setSettings(readSettings()), {
    keys: settingsSyncKeys,
    immediate: false,
  });

  useLayoutEffect(() => {
    if (!settingsReady) return;
    applySettingsToDocument(settings);
  }, [settings, settingsReady]);

  const updateSettings = async (next: UserSettings, previous = settings) => {
    if (savingRef.current) return false;
    savingRef.current = true;
    setSaving(true);
    setSaveError("");
    try {
      const saved = await saveSettingsChanges(previous, next);
      if (!saved) {
        setSaveError(SETTINGS_SAVE_FAILED_MESSAGE);
        return false;
      }
      setSettings(saved);
      return true;
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  // 以存储中的最新值为基准，避免覆盖其它窗口刚保存的设置。
  const cycleTheme = () => {
    const latest = readSettings();
    return updateSettings({ ...latest, theme: getNextQuickTheme(latest.theme) }, latest);
  };

  return { settings, settingsReady, saving, saveError, updateSettings, cycleTheme };
}
