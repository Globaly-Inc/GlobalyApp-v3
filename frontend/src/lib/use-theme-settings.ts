"use client";

import { useCallback, useRef, useSyncExternalStore } from "react";
import {
  loadThemeSettings,
  THEME_SETTINGS_EVENT,
  THEME_SETTINGS_KEY,
  type ThemeSettings,
} from "@/lib/theme-settings";

function subscribeToThemeSettings(callback: () => void) {
  window.addEventListener(THEME_SETTINGS_EVENT, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(THEME_SETTINGS_EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}

export function useThemeSettings(initialSettings: ThemeSettings): ThemeSettings {
  const cache = useRef<{ raw: string | null; snapshot: ThemeSettings }>({
    raw: null,
    snapshot: initialSettings,
  });

  const getSnapshot = useCallback(() => {
    const raw = localStorage.getItem(THEME_SETTINGS_KEY);
    if (raw !== cache.current.raw) {
      cache.current = { raw, snapshot: loadThemeSettings(initialSettings) };
    }
    return cache.current.snapshot;
  }, [initialSettings]);

  const getServerSnapshot = useCallback(() => initialSettings, [initialSettings]);

  return useSyncExternalStore(subscribeToThemeSettings, getSnapshot, getServerSnapshot);
}
