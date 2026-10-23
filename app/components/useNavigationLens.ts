"use client";

import { useLayoutEffect, type RefObject } from "react";

// Route pages remount their shells. Remember only the last committed navigation
// destination in this tab, so cancelled navigation never moves the selection.
let previousDestination: string | null = null;

export function useNavigationLens(
  ref: RefObject<HTMLElement | null>,
  view: string,
  skin: string,
  ready: boolean,
) {
  useLayoutEffect(() => {
    const nav = ref.current;
    const active = nav?.querySelector<HTMLElement>('[aria-current="page"]');
    const lens = nav?.querySelector<HTMLElement>(".nav-lens");
    if (!ready || !nav || !active || !lens) return;

    const destination = active.getAttribute("href");
    const previous = Array.from(nav.querySelectorAll<HTMLElement>(".nav-item"))
      .find((item) => item.getAttribute("href") === previousDestination);
    let animation: Animation | undefined;
    const position = (item: HTMLElement) => `translate(${item.offsetLeft}px, ${item.offsetTop}px)`;
    const update = () => {
      lens.style.width = `${active.offsetWidth}px`;
      lens.style.height = `${active.offsetHeight}px`;
      lens.style.transform = position(active);
      nav.dataset.lensReady = "true";
    };
    update();
    if (previous && previous !== active && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      animation = lens.animate([
        { transform: position(previous), width: `${previous.offsetWidth}px`, height: `${previous.offsetHeight}px` },
        { transform: position(active), width: `${active.offsetWidth}px`, height: `${active.offsetHeight}px` },
      ], { duration: 280, easing: "cubic-bezier(0.22, 1, 0.36, 1)" });
    }
    previousDestination = destination;
    const observer = new ResizeObserver(update);
    observer.observe(nav);
    for (const item of nav.querySelectorAll(".nav-item")) observer.observe(item);
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const stopMotion = () => { if (motion.matches) animation?.cancel(); };
    motion.addEventListener("change", stopMotion);
    return () => {
      animation?.cancel();
      observer.disconnect();
      motion.removeEventListener("change", stopMotion);
      delete nav.dataset.lensReady;
    };
  }, [ref, view, skin, ready]);
}
