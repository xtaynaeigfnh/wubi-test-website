"use client";

export type ExitGuard = { kind: "pending" | "practice"; message: string; onDiscard?: () => void };
const guards = new Map<symbol, ExitGuard>();

export function registerExitGuard(guard: ExitGuard): () => void {
  const token = Symbol();
  guards.set(token, guard);
  return () => { guards.delete(token); };
}

export async function allowDesktopExit(dialog: {
  alert: (message: string) => Promise<void>;
  confirm: (message: string) => Promise<boolean>;
}): Promise<boolean> {
  const pending = [...guards.values()].find((guard) => guard.kind === "pending");
  if (pending) {
    await dialog.alert(pending.message);
    return false;
  }
  const practice = [...guards.values()].find((guard) => guard.kind === "practice");
  if (practice && !await dialog.confirm(practice.message)) return false;
  // Saving can begin while the asynchronous native dialog is open.
  const saving = [...guards.values()].find((guard) => guard.kind === "pending");
  if (saving) { await dialog.alert(saving.message); return false; }
  for (const guard of guards.values()) guard.onDiscard?.();
  return true;
}
