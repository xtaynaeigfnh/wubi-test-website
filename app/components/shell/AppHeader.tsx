"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { getNextQuickTheme, themeLabels } from "../../theme";
import type { AppView, SkinId, ThemeId } from "../../types";
import { useNavigationLens } from "../useNavigationLens";

const navItems: Array<{
  view: AppView;
  href: string;
  label: string;
}> = [
  { view: "typing", href: "/", label: "文章测速" },
  { view: "training", href: "/training", label: "今日训练" },
  { view: "advanced", href: "/advanced", label: "进阶训练" },
  { view: "lookup", href: "/lookup", label: "五笔查码" },
  { view: "history", href: "/history", label: "成绩统计" },
  { view: "settings", href: "/settings", label: "设置" },
];

// 旧入口 /challenge 与 /summary 分别并入进阶训练与成绩统计，导航上高亮其归属项。
const isNavItemActive = (view: AppView, itemView: AppView) =>
  (view === "challenge" ? "advanced" : view === "summary" ? "history" : view) === itemView;

const brandNames: Record<SkinId, string> = {
  letterpress: "五笔测试网站",
  focus: "五笔练习",
  neon: "五笔夜行场",
  roots: "拆字版",
};

const themeGlyphs: Record<"light" | "dark" | "other", string> = {
  dark: "◐",
  light: "◑",
  other: "◒",
};

function MainNav({ view, skin, ready }: { view: AppView; skin: SkinId; ready: boolean }) {
  const mainNavRef = useRef<HTMLElement>(null);

  // 窄屏下导航可横向滚动；切换路由后把当前项滚到可视区中间。
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

  useNavigationLens(mainNavRef, view, skin, ready);

  return (
    <nav
      ref={mainNavRef}
      className="main-nav"
      aria-label="主导航"
    >
      <span className="nav-lens" aria-hidden="true" />
      {navItems.map((item) => (
        <Link
          key={item.view}
          href={item.href}
          className={isNavItemActive(view, item.view) ? "nav-item active" : "nav-item"}
          aria-current={isNavItemActive(view, item.view) ? "page" : undefined}
        >
          <strong>{item.label}</strong>
        </Link>
      ))}
    </nav>
  );
}

export function AppHeader({
  view,
  skin,
  theme,
  settingsReady,
  themeSwitchDisabled,
  onCycleTheme,
}: {
  view: AppView;
  skin: SkinId;
  theme: ThemeId;
  settingsReady: boolean;
  themeSwitchDisabled: boolean;
  onCycleTheme: () => void;
}) {
  const currentThemeName = themeLabels[theme];
  const quickTheme = getNextQuickTheme(theme);
  const themeGlyph = themeGlyphs[theme === "dark" || theme === "light" ? theme : "other"];

  return (
    <header className="site-header">
      <div className="header-inner">
        <Link href="/" className="brand" aria-label="五笔测试网站首页">
          <span className="brand-mark" aria-hidden="true">
            <i>五</i>
          </span>
          <span>
            <strong>{brandNames[skin]}</strong>
            <small>86 版五笔</small>
          </span>
        </Link>
        <MainNav view={view} skin={skin} ready={settingsReady} />
        <div className="header-utilities">
          {/* 根级音乐播放器在桌面宽度下把收起按钮传送到这里。 */}
          <div id="music-header-slot" />
          <button
            className="theme-switch"
            type="button"
            onClick={onCycleTheme}
            disabled={themeSwitchDisabled}
            aria-label={`当前${currentThemeName}主题，点击切换为${themeLabels[quickTheme]}主题`}
            title={`主题：${currentThemeName}`}
          >
            <span aria-hidden="true">{themeGlyph}</span>
            <b>{currentThemeName}</b>
          </button>
          <div className="local-badge">
            <span>数据只存本机</span>
          </div>
        </div>
      </div>
    </header>
  );
}
