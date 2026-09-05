"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import {
  addHesitationQueueItem,
  defaultCustomTheme,
  defaultSettings,
  getSessions,
  readHesitationQueue,
  readSettings,
  saveHesitationPracticeOutcome,
  startHesitationQueueItem,
  STORAGE,
  writeLocal,
} from "../lib";
import type {
  AppView,
  HesitationPracticeAttempt,
  HesitationPracticeQueue,
  HesitationPracticeTarget,
  ThemeId,
  UserSettings,
} from "../types";
import {
  buildHesitationObservations,
  buildHesitationPracticeResult,
  buildHesitationSession,
} from "../hesitation-practice";
import { TrainingCenter } from "./TrainingCenter";
import { AdvancedCenter } from "./AdvancedCenter";
import { KeySummary } from "./KeySummary";
import { HesitationPracticeModal } from "./HesitationPracticeModal";
import { LookupView } from "./views/LookupView";
import { SettingsView } from "./views/SettingsView";
import { ChallengeView } from "./views/ChallengeView";
import { HistoryView } from "./views/HistoryView";
import { buildCustomThemeVariables, themeLabels } from "../theme";
import { TypingView, type KeySoundPlayer } from "./views/TypingView";

const basicThemeCycle: Record<"system" | "light" | "dark", ThemeId> = {
  system: "light",
  light: "dark",
  dark: "system",
};

function getNextQuickTheme(theme: ThemeId): ThemeId {
  return theme === "system" || theme === "light" || theme === "dark"
    ? basicThemeCycle[theme]
    : "system";
}

const navItems: Array<{
  view: AppView;
  href: string;
  label: string;
  coordinate: string;
}> = [
  { view: "typing", href: "/", label: "文章测速", coordinate: "QW" },
  { view: "training", href: "/training", label: "今日训练", coordinate: "ER" },
  { view: "advanced", href: "/advanced", label: "进阶", coordinate: "DF" },
  { view: "challenge", href: "/challenge", label: "字码挑战", coordinate: "TY" },
  { view: "lookup", href: "/lookup", label: "五笔查码", coordinate: "UI" },
  { view: "history", href: "/history", label: "本地成绩", coordinate: "OP" },
  { view: "summary", href: "/summary", label: "统计", coordinate: "JK" },
  { view: "settings", href: "/settings", label: "设置", coordinate: "AS" },
];

const isNavItemActive = (view: AppView, itemView: AppView) => view === itemView;

type HesitationAttemptTuple = [
  HesitationPracticeAttempt,
  HesitationPracticeAttempt,
  HesitationPracticeAttempt,
];

interface ActiveHesitationPractice {
  target: HesitationPracticeTarget;
  queueItemId?: string;
}

function useKeySound(enabled: boolean): KeySoundPlayer {
  const audioContextRef = useRef<AudioContext | null>(null);

  useEffect(
    () => () => {
      void audioContextRef.current?.close();
    },
    [],
  );

  return useCallback(
    ({ force = false } = {}) => {
      if (!enabled && !force) return;
      const AudioContextClass =
        window.AudioContext ||
        (
          window as typeof window & {
            webkitAudioContext?: typeof AudioContext;
          }
        ).webkitAudioContext;
      if (!AudioContextClass) return;

      const context =
        audioContextRef.current ??
        (audioContextRef.current = new AudioContextClass());
      const emit = () => {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = "sine";
        oscillator.frequency.value = 620;
        gain.gain.setValueAtTime(0.045, context.currentTime);
        gain.gain.exponentialRampToValueAtTime(
          0.0001,
          context.currentTime + 0.04,
        );
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start();
        oscillator.stop(context.currentTime + 0.04);
      };

      if (context.state === "suspended") {
        void context.resume().then(emit, () => undefined);
      } else {
        emit();
      }
    },
    [enabled],
  );
}

export function WubiApp({ view }: { view: AppView }) {
  const [settings, setSettings] = useState<UserSettings>(defaultSettings);
  const [settingsReady, setSettingsReady] = useState(false);
  const [settingsSaveError, setSettingsSaveError] = useState("");
  const [hesitationQueue, setHesitationQueue] =
    useState<HesitationPracticeQueue | null>(null);
  const [masteredAtByFingerprint, setMasteredAtByFingerprint] = useState(
    new Map<string, string>(),
  );
  const [activeHesitationPractice, setActiveHesitationPractice] =
    useState<ActiveHesitationPractice | null>(null);
  const [hesitationSaveRevision, setHesitationSaveRevision] = useState(0);
  const mainNavRef = useRef<HTMLElement>(null);
  const playKeySound = useKeySound(settings.sound);

  const refreshHesitationState = useCallback(() => {
    setHesitationQueue(readHesitationQueue());
    const mastered = new Map<string, string>();
    for (const session of getSessions()) {
      const practice = session.hesitationPractice;
      if (!practice || practice.outcome !== "mastered") continue;
      const previous = mastered.get(practice.target.fingerprint);
      if (!previous || previous < practice.completedAt) {
        mastered.set(practice.target.fingerprint, practice.completedAt);
      }
    }
    setMasteredAtByFingerprint(mastered);
  }, []);

  useEffect(refreshHesitationState, [refreshHesitationState]);

  const addHesitationToQueue = useCallback(
    (target: HesitationPracticeTarget) => {
      const result = addHesitationQueueItem(target);
      setHesitationQueue(result.queue);
      if (result.result === "duplicate") {
        window.alert("这一段已在今日加练中。");
      } else if (result.result === "full") {
        window.alert("今日最多加入 5 个卡顿片段，请先完成已有加练。");
      } else if (result.result === "invalid") {
        window.alert("这个卡顿片段已经损坏，无法加入今日加练。");
      } else if (result.result === "storage-error") {
        window.alert("今日加练未能保存，请检查浏览器存储空间。");
      }
    },
    [],
  );

  const startQueuedHesitationPractice = useCallback(
    (itemId: string, target: HesitationPracticeTarget) => {
      if (!itemId) {
        setActiveHesitationPractice({ target });
        return;
      }
      const queue = startHesitationQueueItem(itemId);
      if (!queue) {
        window.alert("加练状态未能保存，请检查浏览器存储空间后再试。");
        return;
      }
      setHesitationQueue(queue);
      setActiveHesitationPractice({ target, queueItemId: itemId });
    },
    [],
  );

  const saveHesitationAttempts = useCallback(
    (attempts: HesitationAttemptTuple) => {
      if (!activeHesitationPractice) {
        return { ok: false, message: "练习目标已经失效，请关闭后重新进入。" };
      }
      const result = buildHesitationPracticeResult(
        activeHesitationPractice.target,
        attempts,
        attempts[2].completedAt,
      );
      const session = buildHesitationSession(result);
      const saved = saveHesitationPracticeOutcome(
        session,
        buildHesitationObservations(result),
        activeHesitationPractice.queueItemId,
      );
      if (!saved) {
        return {
          ok: false,
          message: "本次结果未能保存，请检查浏览器存储空间后重试。",
        };
      }
      refreshHesitationState();
      setHesitationSaveRevision((value) => value + 1);
      return { ok: true };
    },
    [activeHesitationPractice, refreshHesitationState],
  );

  const queuedFingerprints = useMemo(
    () =>
      new Set(
        hesitationQueue?.items.map((item) => item.target.fingerprint) ?? [],
      ),
    [hesitationQueue],
  );

  useEffect(() => {
    setSettings(readSettings());
    setSettingsReady(true);
  }, []);

  useEffect(() => {
    if (!settingsReady) return;
    const root = document.documentElement;
    root.dataset.theme = settings.theme;
    const customTheme = settings.customTheme ?? defaultCustomTheme;
    const customVariables = buildCustomThemeVariables(
      customTheme.accent,
      customTheme.canvas,
    );
    for (const [property, value] of Object.entries(customVariables)) {
      root.style.setProperty(property, value);
    }
  }, [settings, settingsReady]);

  useEffect(() => {
    const navigation = mainNavRef.current;
    const activeItem = navigation?.querySelector<HTMLElement>(
      '[aria-current="page"]',
    );
    if (
      !navigation ||
      !activeItem ||
      navigation.scrollWidth <= navigation.clientWidth
    ) {
      return;
    }
    navigation.scrollLeft = Math.max(
      0,
      activeItem.offsetLeft -
        (navigation.clientWidth - activeItem.offsetWidth) / 2,
    );
  }, [view]);

  const currentThemeName = themeLabels[settings.theme];
  const quickTheme = getNextQuickTheme(settings.theme);
  const updateSettings = (next: UserSettings) => {
    if (!writeLocal(STORAGE.settings, next)) {
      setSettingsSaveError("设置未能保存，原设置保持不变。请检查浏览器存储空间后重试。");
      return false;
    }
    setSettings(next);
    setSettingsSaveError("");
    return true;
  };
  const cycleTheme = () =>
    updateSettings({
      ...settings,
      theme: getNextQuickTheme(settings.theme),
    });

  return (
    <div className="app-shell" data-view={view}>
      <a className="skip-link" href="#main-content">
        跳到主要内容
      </a>
      <header className="site-header">
        <div className="header-inner">
          <Link href="/" className="brand" aria-label="五笔测试网站首页">
            <span className="brand-mark" aria-hidden="true">
              <i>五</i>
              <b>86</b>
            </span>
            <span>
              <strong>五笔测试网站</strong>
              <small>WUBI 86 / LOCAL PRACTICE</small>
            </span>
          </Link>
          <nav ref={mainNavRef} className="main-nav" aria-label="主导航">
            {navItems.map((item) => (
              <Link
                key={item.view}
                href={item.href}
                className={isNavItemActive(view, item.view) ? "nav-item active" : "nav-item"}
                aria-current={isNavItemActive(view, item.view) ? "page" : undefined}
              >
                <span aria-hidden="true">{item.coordinate}</span>
                <strong>{item.label}</strong>
              </Link>
            ))}
          </nav>
          <div className="header-utilities">
            <button
              className="theme-switch"
              type="button"
              onClick={cycleTheme}
              aria-label={`当前${currentThemeName}主题，点击切换为${themeLabels[quickTheme]}主题`}
              title={`主题：${currentThemeName}`}
            >
              <span aria-hidden="true">{
                settings.theme === "dark" ? "◐" : settings.theme === "light" ? "◑" : "◒"
              }</span>
              <b>{currentThemeName}</b>
            </button>
            <div className="local-badge">
              <i />
              <span><b>LOCAL</b> 数据只存本机</span>
            </div>
          </div>
        </div>
      </header>

      <main className="page-wrap" id="main-content">
        {settingsSaveError && (
          <p className="plan-message" role="alert">{settingsSaveError}</p>
        )}
        {view === "typing" && (
          <TypingView
            settings={settings}
            settingsReady={settingsReady}
            onShowGhostGapChange={(value) =>
              updateSettings({
                ...settings,
                showGhostGap: value,
              })
            }
            playKeySound={playKeySound}
            onPracticeHesitation={(target) =>
              setActiveHesitationPractice({ target })
            }
            onAddHesitationToQueue={addHesitationToQueue}
            queuedFingerprints={queuedFingerprints}
            masteredAtByFingerprint={masteredAtByFingerprint}
            hesitationPracticeOpen={Boolean(activeHesitationPractice)}
          />
        )}
        {view === "training" && (
          <TrainingCenter
            playKeySound={playKeySound}
            hesitationQueue={hesitationQueue}
            hesitationSaveRevision={hesitationSaveRevision}
            onPracticeHesitation={startQueuedHesitationPractice}
          />
        )}
        {view === "advanced" && <AdvancedCenter />}
        {view === "challenge" && (
          <ChallengeView playKeySound={playKeySound} />
        )}
        {view === "lookup" && <LookupView />}
        {view === "history" && (
          <HistoryView
            onPracticeHesitation={(target) =>
              setActiveHesitationPractice({ target })
            }
            onAddHesitationToQueue={addHesitationToQueue}
            queuedFingerprints={queuedFingerprints}
            masteredAtByFingerprint={masteredAtByFingerprint}
            hesitationSaveRevision={hesitationSaveRevision}
          />
        )}
        {view === "summary" && <KeySummary />}
        {view === "settings" && (
          <SettingsView
            settings={settings}
            onChange={updateSettings}
            playKeySound={playKeySound}
          />
        )}
      </main>

      {activeHesitationPractice && (
        <HesitationPracticeModal
          target={activeHesitationPractice.target}
          onClose={() => setActiveHesitationPractice(null)}
          onSave={saveHesitationAttempts}
        />
      )}

      <footer className="site-footer">
        <span><b>86 / OFFLINE</b> 慢慢练，手会记住。</span>
        <span>
          86 版码表来自 Rime 五笔方案（LGPL-3.0） · 记录不会离开当前浏览器
        </span>
      </footer>
    </div>
  );
}
