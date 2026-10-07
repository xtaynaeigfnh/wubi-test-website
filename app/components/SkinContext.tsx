"use client";

import { createContext, useContext } from "react";
import type { SkinId } from "../types";

export const SkinContext = createContext<SkinId>("letterpress");

export function useSkin(): SkinId {
  return useContext(SkinContext);
}
