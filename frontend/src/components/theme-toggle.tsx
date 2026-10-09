"use client";

import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * The cookie is the source of truth, not localStorage: the root layout reads it on the server and
 * renders `dark` on <html> itself, so a reload paints the right theme with no flash and no blocking
 * script. A localStorage copy would be a second store nothing reads. THEME_CHANGE lets anything
 * that can't express itself in CSS (the toaster) follow along without polling.
 */
export const THEME_CHANGE = "theme-change";

function toggle() {
  const isDark = document.documentElement.classList.toggle("dark");
  document.cookie = `theme=${isDark ? "dark" : "light"}; path=/; max-age=31536000; samesite=lax`;
  window.dispatchEvent(new CustomEvent(THEME_CHANGE));
}

/**
 * Light/dark switch. The icon is the DESTINATION, not the current theme: moon while light, sun
 * while dark. Which theme is on is already obvious from the whole screen, so showing it back is
 * the one thing the icon need not say — a button's icon should depict what pressing it does.
 *
 * The swap is CSS, not React state, so the server and the first client render agree whatever the
 * cookie said — no hydration mismatch, and nothing to suppress.
 */
export function ThemeToggle({ className }: Readonly<{ className?: string }>) {
  return (
    <Button
      variant="ghost"
      size="icon"
      className={cn("cursor-pointer text-muted-foreground hover:text-foreground", className)}
      aria-label="Switch between light and dark theme"
      title="Light / dark theme"
      onClick={toggle}
    >
      <Moon className="dark:hidden" />
      <Sun className="hidden dark:block" />
    </Button>
  );
}
