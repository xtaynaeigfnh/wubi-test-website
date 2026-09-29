"use client";

export interface MusicDockSnapshot {
  rect: DOMRect;
  content: HTMLElement;
}

export interface MusicDockMotion {
  surface: HTMLElement;
  cancel: () => void;
}

export function captureMusicDock(dock: HTMLElement): MusicDockSnapshot {
  const content = dock.cloneNode(true) as HTMLElement;
  content.classList.remove("is-collapsed");
  content.removeAttribute("data-morphing");
  content.removeAttribute("aria-hidden");
  content.removeAttribute("id");
  content.querySelectorAll("[id]").forEach((node) => node.removeAttribute("id"));
  // Freeze an in-flight playlist reveal at its visible height before React closes it.
  const library = dock.querySelector<HTMLElement>(".music-library-reveal");
  const copy = content.querySelector<HTMLElement>(".music-library-reveal");
  if (library && copy) {
    copy.style.maxHeight = `${library.getBoundingClientRect().height}px`;
    copy.style.opacity = getComputedStyle(library).opacity;
  }
  return { rect: dock.getBoundingClientRect(), content };
}

export function animateMusicDock({
  dock,
  peek,
  opening,
  snapshot,
  interruptedRect,
  onFinish,
}: {
  dock: HTMLElement;
  peek: HTMLButtonElement;
  opening: boolean;
  snapshot: MusicDockSnapshot | null;
  interruptedRect?: DOMRect;
  onFinish: () => void;
}): MusicDockMotion | null {
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  if (reducedMotion.matches) return null;

  const { rect: dockRect, content } = snapshot ?? captureMusicDock(dock);
  const peekRect = peek.getBoundingClientRect();
  const from = interruptedRect ?? (opening ? peekRect : dockRect);
  const to = opening ? dockRect : peekRect;
  const dockStyle = getComputedStyle(dock);
  const peekStyle = getComputedStyle(peek);
  const surface = document.createElement("div");
  surface.className = "music-dock-morph";
  surface.setAttribute("aria-hidden", "true");
  surface.inert = true;

  const controls = document.createElement("div");
  controls.className = "music-morph-controls";
  controls.style.width = `${dockRect.width}px`;
  controls.append(content);
  const icon = document.createElement("div");
  icon.className = "music-morph-icon";
  icon.append(...Array.from(peek.children, (child) => child.cloneNode(true)));
  surface.append(controls, icon);
  document.body.append(surface);
  dock.dataset.morphing = "true";
  peek.dataset.morphing = "true";

  const duration = opening ? 560 : 480;
  const animations: Animation[] = [];
  const frame = (rect: DOMRect, compact: boolean) => ({
    transform: `translate3d(${rect.left}px, ${rect.top}px, 0)`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
    borderRadius: compact ? "22px" : "0px",
    background: compact ? peekStyle.backgroundColor : dockStyle.backgroundColor,
    boxShadow: compact ? peekStyle.boxShadow : dockStyle.boxShadow,
    borderTopWidth: compact ? "1px" : "3px",
    borderColor: compact ? peekStyle.borderColor : dockStyle.borderTopColor,
  });
  animations.push(surface.animate(
    [frame(from, opening), frame(to, !opening)],
    {
      duration,
      easing: opening ? "cubic-bezier(0.22, 1, 0.36, 1)" : "cubic-bezier(0.4, 0, 0.2, 1)",
      fill: "both",
    },
  ));
  animations.push(controls.animate(
    opening
      ? [
          { opacity: 0, transform: "translateY(10px) scale(0.98)" },
          { opacity: 0, transform: "translateY(10px) scale(0.98)", offset: 0.24 },
          { opacity: 1, transform: "none", offset: 0.86 },
          { opacity: 1, transform: "none" },
        ]
      : [
          { opacity: 1, transform: "none" },
          { opacity: 0, transform: "translateY(6px) scale(0.98)", offset: 0.34 },
          { opacity: 0, transform: "translateY(6px) scale(0.98)" },
        ],
    { duration, easing: "ease-out", fill: "both" },
  ));
  animations.push(icon.animate(
    opening
      ? [{ opacity: 1, scale: "1" }, { opacity: 0, scale: "0.8", offset: 0.2 }, { opacity: 0, scale: "0.8" }]
      : [{ opacity: 0, scale: "0.8" }, { opacity: 0, scale: "0.8", offset: 0.64 }, { opacity: 1, scale: "1" }],
    { duration, fill: "both" },
  ));

  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    animations.forEach((animation) => animation.cancel());
    surface.remove();
    delete dock.dataset.morphing;
    delete peek.dataset.morphing;
    window.removeEventListener("resize", finish);
    reducedMotion.removeEventListener("change", finish);
    onFinish();
  };
  animations[0].addEventListener("finish", finish, { once: true });
  window.addEventListener("resize", finish, { once: true });
  reducedMotion.addEventListener("change", finish, { once: true });
  return { surface, cancel: finish };
}
