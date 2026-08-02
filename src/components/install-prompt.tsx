"use client";

import { useEffect, useState } from "react";
import { Button, Card } from "@/components/ui";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function detectIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !("MSStream" in window);
}

function detectStandalone(): boolean {
  if (typeof window === "undefined") return true;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/**
 * `beforeinstallprompt` only fires on Chromium — there is no equivalent on
 * iOS Safari, so that half is a plain instruction instead (PRD 14's
 * "installable to the home screen" is the same outcome, two different
 * mechanisms). Lives in Settings rather than anywhere on the fast path.
 */
export function InstallPrompt() {
  const [isIOS] = useState(detectIOS);
  const [isStandalone, setIsStandalone] = useState(detectStandalone);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    function onBeforeInstallPrompt(e: Event) {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    }

    function onInstalled() {
      setIsStandalone(true);
      setDeferredPrompt(null);
    }

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  async function install() {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
  }

  if (isStandalone) return null;
  if (!deferredPrompt && !isIOS) return null;

  return (
    <Card className="space-y-2 p-4">
      <p className="text-sm font-medium">Install whatsfordinner</p>
      {deferredPrompt ? (
        <>
          <p className="text-sm text-muted">
            Add it to your home screen for one-tap access, same as any other app.
          </p>
          <Button type="button" onClick={() => void install()}>
            Add to home screen
          </Button>
        </>
      ) : (
        <p className="text-sm text-muted">
          Tap the share button <span aria-hidden>⎋</span> in Safari, then
          &ldquo;Add to Home Screen&rdquo;.
        </p>
      )}
    </Card>
  );
}
