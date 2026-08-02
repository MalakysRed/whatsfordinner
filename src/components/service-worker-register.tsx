"use client";

import { useEffect } from "react";

/** Registers public/sw.js once the app has mounted. Renders nothing. */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Offline caching is a bonus, not a requirement — a failed
      // registration should never block the app from working online.
    });
  }, []);

  return null;
}
