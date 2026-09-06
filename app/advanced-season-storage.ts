"use client";

import { STORAGE, writeLocal } from "./storage.ts";
import { savePracticeOutcome, saveAdvancedPracticeOutcome } from "./lib.ts";
import { archiveFinishedSeason, completeAdvancedSeasonDay, isAdvancedSeasonArchive } from "./advanced-training.ts";
import type { AdvancedSeasonArchive, SessionResult } from "./types.ts";

export function readAdvancedSeasonArchive(): AdvancedSeasonArchive | null {
  try {
    const raw = window.localStorage.getItem(STORAGE.advancedSeason);
    const value: unknown = raw === null ? { version: 1, active: null, history: [] } : JSON.parse(raw);
    return isAdvancedSeasonArchive(value) ? value : null;
  } catch {
    return null;
  }
}

export function writeAdvancedSeasonArchive(
  expected: AdvancedSeasonArchive,
  next: AdvancedSeasonArchive,
): boolean {
  const current = readAdvancedSeasonArchive();
  // A tab may still display an older plan even before its storage event arrives.
  if (!current || JSON.stringify(current) !== JSON.stringify(expected)) return false;
  return isAdvancedSeasonArchive(next) && writeLocal(STORAGE.advancedSeason, next);
}

export function saveCurrentAdvancedPracticeOutcome(session: SessionResult): boolean {
  if (!session.seasonId) return savePracticeOutcome(session);
  const current = readAdvancedSeasonArchive();
  if (!current) return false;
  if (current.active?.id !== session.seasonId) {
    return savePracticeOutcome(session);
  }
  const season = completeAdvancedSeasonDay(current.active, session, new Date(session.date));
  return saveAdvancedPracticeOutcome(session, archiveFinishedSeason(current, season));
}
