"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { useEffect, useState, type ReactNode } from "react";

export function HydrationBoundary({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setReady(true);
  }, []);

  return (
    <div className="hydration-boundary" aria-busy={!ready}>
      <div
        className="hydration-content"
        aria-hidden={!ready}
        inert={ready ? undefined : true}
      >
        {children}
      </div>
      {!ready && (
        <div className="hydration-status" role="status" aria-live="polite">
          <div>
            <span aria-hidden="true">五<small>86</small></span>
            <strong>正在准备练习界面…</strong>
            <p>交互就绪后即可开始。</p>
          </div>
        </div>
      )}
    </div>
  );
}
