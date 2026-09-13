"use client";

import { useEffect, useRef, useState } from "react";
import { PRACTICE_SAVED_EVENT } from "../pet-events";
import type { PetSpecies } from "../types";
import { PetArt, petLabels } from "./PetArt";
import { usePetPosition } from "./usePetPosition";

type Mood = "idle" | "reply" | "celebrate";

export function PetCompanion({ species }: { species: PetSpecies }) {
  const [mood, setMood] = useState<Mood>("idle");
  const respond = useRef<() => void>(() => {});
  const { ref, style, dragging, consumeDragClick, handlers } = usePetPosition();

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let lastSessionId = "";
    const play = (next: Mood) => {
      clearTimeout(timer);
      setMood(next);
      timer = setTimeout(() => setMood("idle"), next === "celebrate" ? 3000 : 2000);
    };
    const saved = (event: Event) => {
      const id = (event as CustomEvent<{ sessionId?: string }>).detail?.sessionId;
      if (!id || id === lastSessionId) return;
      lastSessionId = id;
      play("celebrate");
    };
    respond.current = () => play("reply");
    window.addEventListener(PRACTICE_SAVED_EVENT, saved);
    return () => {
      clearTimeout(timer);
      window.removeEventListener(PRACTICE_SAVED_EVENT, saved);
      respond.current = () => {};
    };
  }, []);

  return (
    <aside ref={ref} style={style} className={`pet-companion pet-${mood}${dragging ? " is-dragging" : ""}`} aria-label="宠物陪伴">
      {mood !== "idle" && !dragging && <span className="pet-bubble" role="status">{mood === "celebrate" ? "又完成一轮啦！" : "陪你慢慢练。"}</span>}
      <button
        type="button"
        className="pet-touch"
        {...handlers}
        onClick={(event) => {
          if (consumeDragClick() && event.detail !== 0) {
            return;
          }
          respond.current();
        }}
        aria-label={`摸摸${petLabels[species]}，可拖动或用方向键移动`}
      >
        <PetArt species={species} />
      </button>
    </aside>
  );
}
