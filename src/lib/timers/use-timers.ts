"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface Timer {
  id: string;
  label: string;
  /** Epoch ms. Timestamp based, not interval based (FR7.2) — an interval
   * countdown drifts or pauses when the tab is backgrounded or the phone
   * locks, which is exactly when a kitchen timer is most likely to be left
   * unattended. */
  endsAt: number;
}

const STORAGE_KEY = "whatsfordinner:timers";

function loadStored(): Timer[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return (JSON.parse(raw) as Timer[]).filter((t) => typeof t.endsAt === "number");
  } catch {
    return [];
  }
}

/** Three short beeps via Web Audio — no audio asset needed. */
function playAlarm() {
  try {
    const AudioContextClass =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;

    const ctx = new AudioContextClass();
    const now = ctx.currentTime;

    [0, 0.4, 0.8].forEach((offset) => {
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.frequency.value = 880;
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      gain.gain.setValueAtTime(0.001, now + offset);
      gain.gain.exponentialRampToValueAtTime(0.2, now + offset + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.35);
      oscillator.start(now + offset);
      oscillator.stop(now + offset + 0.4);
    });
  } catch {
    // Web Audio unavailable — vibration and notifications below still fire.
  }

  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    navigator.vibrate([200, 100, 200, 100, 200]);
  }
}

function notify(label: string) {
  if (typeof Notification === "undefined") return;
  if (Notification.permission === "granted" && document.hidden) {
    new Notification(`${label} — done`, { body: "Timer finished", tag: "whatsfordinner-timer" });
  }
}

/**
 * Multiple concurrent named timers (FR7.1), with an audible alarm, vibration
 * and a Notification API alert when one finishes (FR7.3). Persisted to
 * localStorage so a reload doesn't lose a timer someone started five minutes
 * ago.
 */
export function useTimers() {
  const [timers, setTimers] = useState<Timer[]>(() => loadStored());
  const [now, setNow] = useState(() => Date.now());
  const fired = useRef<Set<string>>(new Set());

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(timers));
  }, [timers]);

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    for (const timer of timers) {
      if (timer.endsAt <= now && !fired.current.has(timer.id)) {
        fired.current.add(timer.id);
        playAlarm();
        notify(timer.label);
      }
    }
  }, [now, timers]);

  const startTimer = useCallback((label: string, durationMs: number): string => {
    const id = crypto.randomUUID();

    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      void Notification.requestPermission();
    }

    setTimers((current) => [...current, { id, label, endsAt: Date.now() + durationMs }]);
    return id;
  }, []);

  const dismissTimer = useCallback((id: string) => {
    setTimers((current) => current.filter((t) => t.id !== id));
    fired.current.delete(id);
  }, []);

  return { timers, now, startTimer, dismissTimer };
}
