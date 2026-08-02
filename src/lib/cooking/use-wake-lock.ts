"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Screen Wake Lock (FR6.1), released on unmount and manual exit, reacquired
 * when the tab becomes visible again — the browser silently drops the lock
 * whenever the tab is backgrounded, so returning to it needs to ask again.
 *
 * `supported` is honest rather than optimistic (FR6.2): feature-detected up
 * front, then flipped false if the request itself ever fails, so the caller
 * can say plainly that the screen might sleep instead of silently doing
 * nothing.
 */
export function useWakeLock(active: boolean): { supported: boolean } {
  const [supported, setSupported] = useState(
    () => typeof navigator !== "undefined" && "wakeLock" in navigator,
  );
  const lockRef = useRef<WakeLockSentinel | null>(null);

  useEffect(() => {
    if (!supported) return;

    let cancelled = false;

    async function acquire() {
      try {
        const lock = await navigator.wakeLock.request("screen");
        if (cancelled) {
          void lock.release();
          return;
        }
        lockRef.current = lock;
      } catch {
        setSupported(false);
      }
    }

    async function release() {
      try {
        await lockRef.current?.release();
      } catch {
        // Already released — nothing to do.
      }
      lockRef.current = null;
    }

    function onVisibilityChange() {
      if (document.visibilityState === "visible" && active && !lockRef.current) {
        void acquire();
      }
    }

    if (active) void acquire();
    else void release();

    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      void release();
    };
  }, [active, supported]);

  return { supported };
}
