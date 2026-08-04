"use client";

import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";

function toggle() {
  const isDark = document.documentElement.classList.toggle("dark");
  const theme = isDark ? "dark" : "light";
  localStorage.setItem("theme", theme);
  document.cookie = `theme=${theme}; path=/; max-age=31536000; samesite=lax`;
}

export function ThemeToggle() {
  return (
    <Button variant="ghost" size="icon" aria-label="Toggle theme" onClick={toggle}>
      <Sun className="dark:hidden" />
      <Moon className="hidden dark:block" />
    </Button>
  );
}
