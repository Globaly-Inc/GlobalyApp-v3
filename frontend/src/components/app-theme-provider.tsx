"use client";

import { ThemeProvider } from "next-themes";
import { useSelectedLayoutSegments } from "next/navigation";

/** The embed widget renders inside institutions' own sites, so it never follows the
    visitor's GlobalyAI theme. Every other route — portals and public pages alike, which
    carry the ThemeToggle in their headers — honours it. */
const LIGHT_ONLY_SEGMENTS = new Set(["embed"]);

export function AppThemeProvider({ children }: Readonly<{ children: React.ReactNode }>) {
  const [first] = useSelectedLayoutSegments();
  const lightOnly = first !== undefined && LIGHT_ONLY_SEGMENTS.has(first);
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="light"
      enableSystem={false}
      disableTransitionOnChange
      forcedTheme={lightOnly ? "light" : undefined}
    >
      {children}
    </ThemeProvider>
  );
}
