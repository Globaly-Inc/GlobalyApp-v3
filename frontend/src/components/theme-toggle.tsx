"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Light/dark switch. The icon is the DESTINATION, not the current theme: moon while light, sun
 * while dark. Which theme is on is already obvious from the whole screen, so showing it back is
 * the one thing the icon need not say — a button's icon should depict what pressing it does.
 *
 * The theme lives in next-themes (AppThemeProvider in the root layout), which writes the `dark`
 * class before paint, so there's no flash. The icon swap is CSS, so server and client agree.
 */
export function ThemeToggle({ className }: Readonly<{ className?: string }>) {
  const { resolvedTheme, setTheme } = useTheme();

  return (
    <Button
      variant="ghost"
      size="icon"
      className={cn("cursor-pointer text-muted-foreground hover:text-foreground", className)}
      aria-label="Switch between light and dark theme"
      title="Light / dark theme"
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
    >
      <Moon className="dark:hidden" />
      <Sun className="hidden dark:block" />
    </Button>
  );
}
