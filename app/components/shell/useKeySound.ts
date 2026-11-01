"use client";

import { useCallback, useEffect, useRef } from "react";
import type { KeySoundPlayer } from "../../types";

/**
 * 用 Web Audio 合成一声极短的按键提示音。AudioContext 懒创建并在卸载时关闭；
 * 浏览器在用户手势前会挂起上下文，此时先恢复再发声。
 */
export function useKeySound(enabled: boolean): KeySoundPlayer {
  const audioContextRef = useRef<AudioContext | null>(null);

  useEffect(
    () => () => {
      void audioContextRef.current?.close();
    },
    [],
  );

  return useCallback(
    ({ force = false } = {}) => {
      if (!enabled && !force) return;
      const AudioContextClass =
        window.AudioContext ||
        (
          window as typeof window & {
            webkitAudioContext?: typeof AudioContext;
          }
        ).webkitAudioContext;
      if (!AudioContextClass) return;

      const context =
        audioContextRef.current ??
        (audioContextRef.current = new AudioContextClass());
      const emit = () => {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = "sine";
        oscillator.frequency.value = 620;
        gain.gain.setValueAtTime(0.045, context.currentTime);
        gain.gain.exponentialRampToValueAtTime(
          0.0001,
          context.currentTime + 0.04,
        );
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start();
        oscillator.stop(context.currentTime + 0.04);
      };

      if (context.state === "suspended") {
        void context.resume().then(emit, () => undefined);
      } else {
        emit();
      }
    },
    [enabled],
  );
}
