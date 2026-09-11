"use client";

import { useEffect, useRef, useState } from "react";
import { PRACTICE_SAVED_EVENT } from "../pet-events";
import type { PetSpecies } from "../types";
import { PetArt, petLabels } from "./PetArt";

type Mood = "idle" | "reply" | "celebrate";

export function PetCompanion({ species }: { species: PetSpecies }) {
  const [hidden, setHidden] = useState(true);
  const [mood, setMood] = useState<Mood>("idle");
  const respond = useRef<() => void>(() => {});

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let blocked = true;
    let disposed = false;
    let pending = false;
    let lastSessionId = "";
    const stop = () => {
      clearTimeout(timer);
      setMood("idle");
    };
    const play = (next: Mood) => {
      stop();
      setMood(next);
      timer = setTimeout(() => setMood("idle"), next === "celebrate" ? 3000 : 2000);
    };
    const sync = () => {
      if (disposed) return;
      const active = document.activeElement;
      const editing = active instanceof HTMLElement && (active.matches("input, textarea") || active.isContentEditable);
      const overlay = [...document.querySelectorAll('dialog[open], [aria-modal="true"], .music-dock:not(.is-collapsed)')]
        .some((element) => element.getClientRects().length > 0 && getComputedStyle(element).visibility !== "hidden");
      const next = editing || overlay || document.hidden;
      if (next !== blocked) {
        blocked = next;
        setHidden(next);
        if (next) stop();
        else if (pending) {
          pending = false;
          play("celebrate");
        }
      }
    };
    const afterFocus = () => queueMicrotask(sync);
    const saved = (event: Event) => {
      const id = (event as CustomEvent<{ sessionId?: string }>).detail?.sessionId;
      if (!id || id === lastSessionId) return;
      lastSessionId = id;
      sync();
      if (blocked) pending = true;
      else play("celebrate");
    };
    respond.current = () => { if (!blocked) play("reply"); };
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["class", "open", "aria-modal", "hidden", "style"] });
    document.addEventListener("focusin", sync);
    document.addEventListener("focusout", afterFocus);
    document.addEventListener("visibilitychange", sync);
    window.addEventListener(PRACTICE_SAVED_EVENT, saved);
    sync();
    return () => {
      disposed = true;
      clearTimeout(timer);
      observer.disconnect();
      document.removeEventListener("focusin", sync);
      document.removeEventListener("focusout", afterFocus);
      document.removeEventListener("visibilitychange", sync);
      window.removeEventListener(PRACTICE_SAVED_EVENT, saved);
      respond.current = () => {};
    };
  }, []);

  return (
    <aside className={`pet-companion pet-${mood}`} hidden={hidden} aria-label="宠物陪伴">
      {mood !== "idle" && <span className="pet-bubble" role="status">{mood === "celebrate" ? "又完成一轮啦！" : "陪你慢慢练。"}</span>}
      <button type="button" className="pet-touch" onClick={() => respond.current()} aria-label={`摸摸${petLabels[species]}`}>
        <PetArt species={species} />
      </button>
    </aside>
  );
}
