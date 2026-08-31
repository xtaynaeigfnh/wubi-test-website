"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";

const PENDING_SAVE_HISTORY_KEY = "__wubiPendingSaveGuard";

export function usePendingSaveGuard(
  blocked: boolean,
  message = "本次成绩尚未保存，请先重试保存。",
) {
  useEffect(() => {
    if (!blocked) return;
    const historyToken = `${Date.now()}-${Math.random()}`;
    const originalHistoryState = window.history.state;
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
      if (!event.target.closest("a[href]")) return;
      event.preventDefault();
      event.stopPropagation();
      window.alert(message);
    };
    const onNavigate = (event: Event) => {
      const navigationEvent = event as Event & { navigationType?: string };
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

export function SummaryCard({
  label,
  value,
  unit,
  note,
  accent,
}: {
  label: string;
  value: string;
  unit?: string;
  note: string;
  accent?: boolean;
}) {
  return (
    <div className={accent ? "summary-card accent" : "summary-card"}>
      <span>{label}</span>
      <strong>{value}<small>{unit}</small></strong>
      <p>{note}</p>
    </div>
  );
}

export function Toggle({
  label,
  note,
  checked,
  onChange,
}: {
  label: string;
  note: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="switch-row">
      <span><strong>{label}</strong><small>{note}</small></span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
    </label>
  );
}

export function ErrorState({
  title,
  message,
  onRetry,
}: {
  title: string;
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="error-card" role="alert">
      <span aria-hidden="true">!</span>
      <div>
        <strong>{title}</strong>
        <p>{message}</p>
      </div>
      <button className="button secondary" onClick={onRetry}>
        重新加载
      </button>
    </div>
  );
}

export function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const titleId = useId();
  const modalRef = useRef<HTMLElement>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const previousFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const modal = modalRef.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const getFocusable = () =>
      Array.from(
        modal?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      );
    const focusTimer = window.setTimeout(() => {
      const preferred =
        modal?.querySelector<HTMLElement>("[data-modal-autofocus]") ??
        getFocusable()[0] ??
        modal;
      preferred?.focus();
    }, 0);

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (event.isComposing || event.keyCode === 229) return;
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = getFocusable();
      if (!focusable.length) {
        event.preventDefault();
        modal?.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, []);

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        ref={modalRef}
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <h2 id={titleId}>{title}</h2>
          <button onClick={onClose} aria-label="关闭">×</button>
        </header>
        {children}
      </section>
    </div>
  );
}
