"use client";

import { useEffect } from "react";
import { siteConfig } from "@/config/site";
import {
  applyThemeSettings,
  defaultThemeSettings,
  loadThemeSettings,
  THEME_SETTINGS_EVENT,
  type ThemeSettings,
} from "@/lib/theme-settings";

export function ThemeSettingsSync() {
  useEffect(() => {
    const fallback = defaultThemeSettings(siteConfig.name);
    applyThemeSettings(loadThemeSettings(fallback));

    function onStorageChange() {
      applyThemeSettings(loadThemeSettings(fallback));
    }

    function onSettingsEvent(e: Event) {
      applyThemeSettings((e as CustomEvent<ThemeSettings>).detail);
    }

    window.addEventListener(THEME_SETTINGS_EVENT, onSettingsEvent);
    window.addEventListener("storage", onStorageChange);
    return () => {
      window.removeEventListener(THEME_SETTINGS_EVENT, onSettingsEvent);
      window.removeEventListener("storage", onStorageChange);
    };
  }, []);

  return null;
}
