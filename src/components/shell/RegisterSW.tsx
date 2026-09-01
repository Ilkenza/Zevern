"use client";

import { useEffect } from "react";

/**
 * Turns the app on the home screen into an app that opens instantly.
 *
 * Registered after load rather than during it: the worker's job is the *next* visit, and
 * fetching and installing it while the first paint is still happening takes bandwidth
 * from the thing the person is waiting for.
 *
 * Development is left alone. A worker caching `/_next/static/` in front of a dev server
 * that rebuilds those files on every keystroke is a morning lost to "why is my change not
 * showing".
 */
export function RegisterSW() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* An install that fails costs nothing — the app works exactly as before. */
      });
    };

    if (document.readyState === "complete") {
      register();
      return;
    }
    window.addEventListener("load", register, { once: true });
    return () => window.removeEventListener("load", register);
  }, []);

  return null;
}
