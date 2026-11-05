"use client";

import { useEffect, useRef } from "react";

// 两个守卫都把一枚令牌写进当前 history 条目：popstate 回到带令牌的条目说明用户又回来了，
// 否则就把历史前进回去，并用 beforeunload 与链接捕获兜住其它离开方式。
const PENDING_SAVE_HISTORY_KEY = "__wubiPendingSaveGuard";
const IN_PROGRESS_HISTORY_KEY = "__wubiInProgressLeaveGuard";

function isSamePageUrl(href: string, currentHref: string) {
  try {
    const target = new URL(href, currentHref);
    const current = new URL(currentHref);
    return target.origin === current.origin &&
      target.pathname === current.pathname && target.search === current.search;
  } catch {
    return false;
  }
}

function isSamePageAnchor(anchor: Element, currentHref: string) {
  const href = anchor.getAttribute("href");
  return href !== null && href.includes("#") && isSamePageUrl(href, currentHref);
}

function isCurrentPageNavigationClick(event: MouseEvent, anchor: Element) {
  const target = anchor.getAttribute("target");
  return !event.defaultPrevented && event.button === 0 &&
    !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey &&
    !anchor.hasAttribute("download") && (!target || target.toLowerCase() === "_self");
}

/** 成绩尚未保存时阻止离开当前页面，并提示先重试保存。 */
export function usePendingSaveGuard(
  blocked: boolean,
  message = "本次成绩尚未保存，请先重试保存。",
) {
  useEffect(() => {
    if (!blocked) return;
    const historyToken = `${Date.now()}-${Math.random()}`;
    const originalHistoryState = window.history.state;
    const guardedHref = window.location.href;
    let restoreTimer: number | null = null;
    let alertTimer: number | null = null;
    let restoringHistory = false;
    try {
      const nextState =
        originalHistoryState && typeof originalHistoryState === "object"
          ? { ...originalHistoryState, [PENDING_SAVE_HISTORY_KEY]: historyToken }
          : { [PENDING_SAVE_HISTORY_KEY]: historyToken };
      window.history.replaceState(nextState, "", window.location.href);
    } catch {
      // beforeunload and link capture still protect restricted browser contexts.
    }
    const showMessage = () => {
      if (alertTimer !== null) return;
      alertTimer = window.setTimeout(() => {
        alertTimer = null;
        window.alert(message);
      }, 0);
    };
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = message;
    };
    const onDocumentClick = (event: MouseEvent) => {
      if (!(event.target instanceof Element)) return;
      const anchor = event.target.closest("a[href]");
      if (!anchor || isSamePageAnchor(anchor, window.location.href)) return;
      if (!isCurrentPageNavigationClick(event, anchor)) return;
      event.preventDefault();
      event.stopPropagation();
      window.alert(message);
    };
    const onNavigate = (event: Event) => {
      const navigationEvent = event as Event & {
        navigationType?: string;
        destination?: { url: string };
      };
      if (navigationEvent.destination &&
        isSamePageUrl(navigationEvent.destination.url, guardedHref)) return;
      if (navigationEvent.navigationType !== "traverse" || !event.cancelable) {
        return;
      }
      event.preventDefault();
      showMessage();
    };
    const onPopState = (event: PopStateEvent) => {
      if (
        event.state &&
        typeof event.state === "object" &&
        event.state[PENDING_SAVE_HISTORY_KEY] === historyToken
      ) {
        restoringHistory = false;
        if (restoreTimer !== null) window.clearTimeout(restoreTimer);
        restoreTimer = null;
        return;
      }
      // Hash history entries may have no state, but still keep this practice open.
      if (isSamePageUrl(window.location.href, guardedHref)) return;
      if (restoringHistory) return;
      restoringHistory = true;
      window.history.forward();
      restoreTimer = window.setTimeout(() => {
        restoringHistory = false;
        restoreTimer = null;
      }, 1000);
      showMessage();
    };
    const navigation = (
      window as Window & { navigation?: EventTarget }
    ).navigation;
    window.addEventListener("beforeunload", onBeforeUnload);
    window.addEventListener("popstate", onPopState);
    document.addEventListener("click", onDocumentClick, true);
    navigation?.addEventListener("navigate", onNavigate);
    return () => {
      if (restoreTimer !== null) window.clearTimeout(restoreTimer);
      if (alertTimer !== null) window.clearTimeout(alertTimer);
      window.removeEventListener("beforeunload", onBeforeUnload);
      window.removeEventListener("popstate", onPopState);
      document.removeEventListener("click", onDocumentClick, true);
      navigation?.removeEventListener("navigate", onNavigate);
      try {
        const currentState = window.history.state;
        if (
          currentState &&
          typeof currentState === "object" &&
          currentState[PENDING_SAVE_HISTORY_KEY] === historyToken
        ) {
          const nextState = { ...currentState };
          delete nextState[PENDING_SAVE_HISTORY_KEY];
          window.history.replaceState(
            Object.keys(nextState).length ? nextState : originalHistoryState,
            "",
            window.location.href,
          );
        }
      } catch {
        // The guard is already inactive; restricted history access needs no retry.
      }
    };
  }, [blocked, message]);
}

/** 练习进行中离开时只询问一次；确认放弃后调用 `onDiscard` 并放行本次导航。 */
export function useInProgressLeaveGuard(
  blocked: boolean,
  onDiscard: () => void,
  message = "本轮练习尚未完成，确定放弃并离开吗？",
) {
  const onDiscardRef = useRef(onDiscard);

  useEffect(() => {
    onDiscardRef.current = onDiscard;
  }, [onDiscard]);

  useEffect(() => {
    if (!blocked) return;
    const historyToken = `${Date.now()}-${Math.random()}`;
    const originalHistoryState = window.history.state;
    const guardedHref = window.location.href;
    let restoreTimer: number | null = null;
    let restoringHistory = false;
    let decisionMade = false;
    try {
      const nextState =
        originalHistoryState && typeof originalHistoryState === "object"
          ? { ...originalHistoryState, [IN_PROGRESS_HISTORY_KEY]: historyToken }
          : { [IN_PROGRESS_HISTORY_KEY]: historyToken };
      window.history.replaceState(nextState, "", window.location.href);
    } catch {
      // beforeunload and link capture still protect restricted browser contexts.
    }
    const confirmDiscard = () => {
      if (decisionMade) return true;
      if (!window.confirm(message)) return false;
      decisionMade = true;
      onDiscardRef.current();
      return true;
    };
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = message;
    };
    const onDocumentClick = (event: MouseEvent) => {
      if (!(event.target instanceof Element)) return;
      const anchor = event.target.closest("a[href]");
      if (!anchor || isSamePageAnchor(anchor, window.location.href)) return;
      if (!isCurrentPageNavigationClick(event, anchor)) return;
      if (confirmDiscard()) return;
      event.preventDefault();
      event.stopPropagation();
    };
    const onNavigate = (event: Event) => {
      const navigationEvent = event as Event & {
        navigationType?: string;
        destination?: { url: string };
      };
      if (navigationEvent.destination &&
        isSamePageUrl(navigationEvent.destination.url, guardedHref)) return;
      if (navigationEvent.navigationType !== "traverse" || !event.cancelable) {
        return;
      }
      if (!confirmDiscard()) event.preventDefault();
    };
    const onPopState = (event: PopStateEvent) => {
      if (
        event.state &&
        typeof event.state === "object" &&
        event.state[IN_PROGRESS_HISTORY_KEY] === historyToken
      ) {
        restoringHistory = false;
        if (restoreTimer !== null) window.clearTimeout(restoreTimer);
        restoreTimer = null;
        return;
      }
      // Hash history entries may have no state, but still keep this practice open.
      if (isSamePageUrl(window.location.href, guardedHref)) return;
      if (decisionMade || restoringHistory || confirmDiscard()) return;
      restoringHistory = true;
      window.history.forward();
      restoreTimer = window.setTimeout(() => {
        restoringHistory = false;
        restoreTimer = null;
      }, 1000);
    };
    const navigation = (
      window as Window & { navigation?: EventTarget }
    ).navigation;
    window.addEventListener("beforeunload", onBeforeUnload);
    window.addEventListener("popstate", onPopState);
    document.addEventListener("click", onDocumentClick, true);
    navigation?.addEventListener("navigate", onNavigate);
    return () => {
      if (restoreTimer !== null) window.clearTimeout(restoreTimer);
      window.removeEventListener("beforeunload", onBeforeUnload);
      window.removeEventListener("popstate", onPopState);
      document.removeEventListener("click", onDocumentClick, true);
      navigation?.removeEventListener("navigate", onNavigate);
      try {
        const currentState = window.history.state;
        if (
          currentState &&
          typeof currentState === "object" &&
          currentState[IN_PROGRESS_HISTORY_KEY] === historyToken
        ) {
          const nextState = { ...currentState };
          delete nextState[IN_PROGRESS_HISTORY_KEY];
          window.history.replaceState(
            Object.keys(nextState).length ? nextState : originalHistoryState,
            "",
            window.location.href,
          );
        }
      } catch {
        // The guard is already inactive; restricted history access needs no retry.
      }
    };
  }, [blocked, message]);
}
