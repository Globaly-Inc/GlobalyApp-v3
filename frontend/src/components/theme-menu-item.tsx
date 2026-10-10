"use client";

import { Moon } from "lucide-react";
import { useTheme } from "next-themes";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";

/** "Dark mode" row for a portal account menu. The switch is display-only; the row toggles. */
export function ThemeMenuItem() {
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  return (
    <DropdownMenuItem
      className="cursor-pointer px-1.5 py-1.5 flex items-center gap-2"
      closeOnClick={false}
      onClick={() => setTheme(isDark ? "light" : "dark")}
    >
      <Moon className="h-4 w-4" />
      <span className="flex-1">Dark mode</span>
      <Switch checked={isDark} tabIndex={-1} aria-hidden className="pointer-events-none" />
    </DropdownMenuItem>
  );
}
