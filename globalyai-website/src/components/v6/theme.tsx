"use client";

import { useCallback, useLayoutEffect, useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Variation 6's light and dark modes.
 *
 * The theme lives in one place: a data-theme attribute on the page's root
 * element. CSS reads it, this hook writes it, and nothing else in the tree
 * needs to know which mode it is in.
 *
 * Order of authority: a choice the visitor has made before, then the OS
 * setting, then light. The choice is applied by the inline script in
 * page.tsx before first paint, so a visitor who prefers dark never sees a
 * white page flash; this hook only picks up where that script left off.
 */

export const V6_ROOT_ID = "v6-root";
export const V6_THEME_KEY = "globalyai-v6-theme";

export type V6Theme = "light" | "dark";

/**
 * Runs before paint, inlined into the document by page.tsx. Kept as a string
 * on purpose: it has to execute before React hydrates, which means it cannot
 * be a component.
 */
export const THEME_SCRIPT = `
(function () {
  try {
    var stored = localStorage.getItem(${JSON.stringify(V6_THEME_KEY)});
    var theme = stored === "light" || stored === "dark"
      ? stored
      : (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    document.getElementById(${JSON.stringify(V6_ROOT_ID)}).dataset.theme = theme;
  } catch (error) {
    /* A blocked localStorage or a missing root leaves the page in light mode,
       which is the default the markup already renders. */
  }
})();
`;

/**
 * Renders THEME_SCRIPT. From the server it is a real script, which the browser
 * runs while parsing, before hydration. When React creates it on the client
 * instead (a client-side navigation to the page), a script would never execute
 * and React warns about it, so there it is an inert data block and the layout
 * effect applies the theme before paint in its place.
 */
export function ThemeScript() {
  useLayoutEffect(() => {
    const root = document.getElementById(V6_ROOT_ID);
    if (!root || root.dataset.theme) return;
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(V6_THEME_KEY);
    } catch {
      /* Blocked storage falls through to the OS setting. */
    }
    root.dataset.theme =
      stored === "light" || stored === "dark"
        ? stored
        : window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light";
  }, []);

  return (
    <script
      type={typeof window === "undefined" ? undefined : "text/plain"}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }}
    />
  );
}

export function useV6Theme() {
  const theme = useThemeValue();

  const toggle = useCallback(() => {
    const root = document.getElementById(V6_ROOT_ID);
    if (!root) return;
    const next: V6Theme = root.dataset.theme === "dark" ? "light" : "dark";
    root.dataset.theme = next;
    try {
      localStorage.setItem(V6_THEME_KEY, next);
    } catch {
      /* Private browsing. The theme still applies for this visit. */
    }
  }, []);

  return { theme, toggle };
}

/**
 * The switch. Both icons are always mounted and cross-faded, so the control
 * never resizes and the swap reads as one object turning over rather than two
 * buttons replacing each other.
 *
 * The visible icon is the mode you are being offered, not the one you are in:
 * dark shows the sun, light shows the moon. That is what aria-label has always
 * said, and the icons used to say the opposite.
 */
export function ThemeToggle({ className }: Readonly<{ className?: string }>) {
  const { theme, toggle } = useV6Theme();
  const dark = theme === "dark";

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={dark}
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      className={cn(
        "relative grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-full",
        "border border-[var(--border-strong)] bg-[var(--surface)] text-[var(--foreground)]",
        "transition-colors duration-300 hover:border-[var(--primary-bright)] active:scale-95",
        className,
      )}
    >
      <Sun
        className={cn(
          "absolute h-[18px] w-[18px] transition-all duration-500 motion-reduce:transition-none",
          dark ? "rotate-0 scale-100 opacity-100" : "rotate-90 scale-50 opacity-0",
        )}
        aria-hidden="true"
        strokeWidth={1.75}
      />
      <Moon
        className={cn(
          "absolute h-[18px] w-[18px] transition-all duration-500 motion-reduce:transition-none",
          dark ? "-rotate-90 scale-50 opacity-0" : "rotate-0 scale-100 opacity-100",
        )}
        aria-hidden="true"
        strokeWidth={1.75}
      />
    </button>
  );
}

/**
 * Tells a component which mode it is in, for the three places CSS cannot
 * reach on its own: the aurora footage, the logo knockout, and the toggle's
 * own pressed state.
 *
 * The attribute on the root element is the store, and this subscribes to it
 * with useSyncExternalStore rather than mirroring it into React state. That
 * is not pedantry: the pre-paint script writes the attribute before React
 * exists, so any state copy would start out wrong and correct itself in an
 * effect, which is a flash.
 */
function subscribeToTheme(onChange: () => void) {
  const root = document.getElementById(V6_ROOT_ID);
  if (!root) return () => {};
  const observer = new MutationObserver(onChange);
  observer.observe(root, { attributes: true, attributeFilter: ["data-theme"] });
  return () => observer.disconnect();
}

function readTheme(): V6Theme {
  return document.getElementById(V6_ROOT_ID)?.dataset.theme === "dark" ? "dark" : "light";
}

export function useThemeValue(): V6Theme {
  // The server renders without the attribute, which is the light palette the
  // markup already describes, so "light" is the honest server snapshot.
  return useSyncExternalStore(subscribeToTheme, readTheme, () => "light");
}
