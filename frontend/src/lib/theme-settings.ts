export const THEME_SETTINGS_KEY = "theme-settings";
export const THEME_SETTINGS_EVENT = "theme-settings-change";

export const DEFAULT_PRIMARY = "#7F1D1D";

/** The un-themed body font. Exported so the layout can tell an untouched
    install from a tenant that has actually picked a font, which is what decides
    whether the Fraunces heading default holds. */
export const DEFAULT_FONT = `ui-sans-serif, system-ui, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", Segoe UI Symbol, "Noto Color Emoji"`;

/**
 * The heading face for a given body font, or null to leave the Fraunces default
 * in place.
 *
 * globals.css pins h1-h6 to --font-heading, and a font-family on the element
 * beats the one inherited from <html>, so the theme font only reaches headings if
 * something reassigns this variable. Both callers — the server layout and
 * applyThemeSettings below — go through here, because when they disagreed the
 * headings went stale on every client-side font change.
 */
export function headingFontOverride(font: string): string | null {
  return font === DEFAULT_FONT ? null : font;
}

const COOKIE_BYTE_BUDGET = 3800;

export type ThemeSettings = {
  primaryColor: string;
  font: string;
  companyName: string;
  logoUrl: string | null;
  faviconUrl: string | null;
};

export function defaultThemeSettings(companyName: string): ThemeSettings {
  return {
    primaryColor: DEFAULT_PRIMARY,
    font: DEFAULT_FONT,
    companyName,
    logoUrl: null,
    faviconUrl: null,
  };
}

export function loadThemeSettings(fallback: ThemeSettings): ThemeSettings {
  try {
    const raw = localStorage.getItem(THEME_SETTINGS_KEY);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch {
    return fallback;
  }
}

export function parseThemeSettingsCookie(
  raw: string | undefined,
  companyName: string
): ThemeSettings {
  const fallback = defaultThemeSettings(companyName);
  if (!raw) return fallback;
  try {
    return { ...fallback, ...JSON.parse(raw) };
  } catch {
    return fallback;
  }
}

export function saveThemeSettings(settings: ThemeSettings) {
  const serialized = JSON.stringify(settings);
  localStorage.setItem(THEME_SETTINGS_KEY, serialized);

  const cookieSettings =
    serialized.length <= COOKIE_BYTE_BUDGET
      ? settings
      : { ...settings, logoUrl: null, faviconUrl: null };
  document.cookie = `${THEME_SETTINGS_KEY}=${encodeURIComponent(
    JSON.stringify(cookieSettings)
  )}; path=/; max-age=31536000; samesite=lax`;

  window.dispatchEvent(new CustomEvent(THEME_SETTINGS_EVENT, { detail: settings }));
}

export function applyThemeSettings(settings: ThemeSettings) {
  const root = document.documentElement;
  root.style.setProperty("--primary", settings.primaryColor);
  root.style.fontFamily = settings.font;

  // removeProperty, not just a skipped set: going back to the default font has to
  // drop a previous override, or the headings keep the font the user just left.
  const heading = headingFontOverride(settings.font);
  if (heading) root.style.setProperty("--font-heading", heading);
  else root.style.removeProperty("--font-heading");
  document.title = settings.companyName;

  const icon = settings.faviconUrl || settings.logoUrl;
  if (icon) {
    let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (!link) {
      link = document.createElement("link");
      link.rel = "icon";
      document.head.appendChild(link);
    }
    link.href = icon;
  }
}
