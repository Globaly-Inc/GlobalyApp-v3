"use client";

import { ThemeProvider } from "next-themes";
import { useSelectedLayoutSegments } from "next/navigation";

/** Top-level route segments that render a logged-in portal. Everything else — the (web)
    marketing pages, auth, invite, join, embed — is light-only by design. */
const PORTAL_SEGMENTS = new Set(["personal", "business", "admin", "ai", "theme-setup"]);

export function AppThemeProvider({ children }: Readonly<{ children: React.ReactNode }>) {
  const [first] = useSelectedLayoutSegments();
  const isPortal = first !== undefined && PORTAL_SEGMENTS.has(first);
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="light"
      enableSystem={false}
      disableTransitionOnChange
      forcedTheme={isPortal ? undefined : "light"}
    >
      {children}
    </ThemeProvider>
  );
}
