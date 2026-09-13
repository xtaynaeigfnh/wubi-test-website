"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";

type Position = { x: number; y: number };
// Keep the user's placement when route views remount during this visit.
let lastPosition: Position | null = null;

export function usePetPosition() {
  const ref = useRef<HTMLElement>(null);
  const [position, setPosition] = useState<Position | null>(null);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ id: number; x: number; y: number; start: Position; moved: boolean } | null>(null);
  const suppressClick = useRef(false);

  function move(next: Position, remember = true) {
    const element = ref.current;
    if (!element) return;
    const viewport = window.visualViewport;
    const left = (viewport?.offsetLeft ?? 0) + 12;
    const top = (viewport?.offsetTop ?? 0) + 12;
    const right = left + (viewport?.width ?? window.innerWidth) - element.offsetWidth - 24;
    const bottom = top + (viewport?.height ?? window.innerHeight) - element.offsetHeight - 24;
    const clamped = { x: Math.max(left, Math.min(next.x, right)), y: Math.max(top, Math.min(next.y, bottom)) };
    element.dataset.bubbleSide = clamped.x > left + (right - left) / 2 ? "right" : "left";
    element.dataset.bubbleBelow = String(clamped.y - top < 64);
    if (remember) lastPosition = clamped;
    setPosition(clamped);
  }

  useEffect(() => {
    const sync = () => {
      const rect = ref.current?.getBoundingClientRect();
      if (rect) move(lastPosition ?? { x: rect.left, y: rect.top }, false);
    };
    sync();
    const viewport = window.visualViewport;
    window.addEventListener("resize", sync);
    viewport?.addEventListener("resize", sync);
    viewport?.addEventListener("scroll", sync);
    return () => {
      window.removeEventListener("resize", sync);
      viewport?.removeEventListener("resize", sync);
      viewport?.removeEventListener("scroll", sync);
    };
  }, []);

  function onPointerDown(event: PointerEvent<HTMLButtonElement>) {
    if (!event.isPrimary || event.button !== 0) return;
    const rect = ref.current!.getBoundingClientRect();
    suppressClick.current = false;
    drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, start: { x: rect.left, y: rect.top }, moved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: PointerEvent<HTMLButtonElement>) {
    const current = drag.current;
    if (!current || current.id !== event.pointerId) return;
    const dx = event.clientX - current.x;
    const dy = event.clientY - current.y;
    if (!current.moved && Math.hypot(dx, dy) < 5) return;
    current.moved = true;
    suppressClick.current = true;
    setDragging(true);
    move({ x: current.start.x + dx, y: current.start.y + dy });
  }

  function endDrag(event: PointerEvent<HTMLButtonElement>) {
    if (drag.current?.id !== event.pointerId) return;
    drag.current = null;
    setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    const directions: Record<string, Position> = { ArrowLeft: { x: -1, y: 0 }, ArrowRight: { x: 1, y: 0 }, ArrowUp: { x: 0, y: -1 }, ArrowDown: { x: 0, y: 1 } };
    const direction = directions[event.key];
    if (!direction) return;
    event.preventDefault();
    const rect = ref.current!.getBoundingClientRect();
    const step = event.shiftKey ? 40 : 16;
    move({ x: rect.left + direction.x * step, y: rect.top + direction.y * step });
  }

  return {
    ref, dragging,
    consumeDragClick: () => {
      const suppressed = suppressClick.current;
      suppressClick.current = false;
      return suppressed;
    },
    style: position ? { left: position.x, top: position.y, bottom: "auto" } : undefined,
    handlers: { onPointerDown, onPointerMove, onPointerUp: endDrag, onPointerCancel: endDrag, onLostPointerCapture: endDrag, onKeyDown },
  };
}
