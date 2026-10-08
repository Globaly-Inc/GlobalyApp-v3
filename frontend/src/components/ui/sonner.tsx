"use client"

import { useEffect, useState } from "react"
import { Toaster as Sonner, type ToasterProps } from "sonner"
import { CircleCheckIcon, InfoIcon, TriangleAlertIcon, OctagonXIcon, Loader2Icon } from "lucide-react"
import { THEME_CHANGE } from "@/components/theme-toggle"

/**
 * The theme comes from the class the root layout put on <html>, not from next-themes' useTheme():
 * nothing mounts a ThemeProvider, so that hook silently returned "system" and the toaster followed
 * the OS while the rest of the app followed the toggle. Starts "light" so the server render and the
 * first client render agree, then corrects on mount.
 */
function useDocumentTheme(): "light" | "dark" {
  const [theme, setTheme] = useState<"light" | "dark">("light")
  useEffect(() => {
    const read = () => setTheme(document.documentElement.classList.contains("dark") ? "dark" : "light")
    read()
    window.addEventListener(THEME_CHANGE, read)
    return () => window.removeEventListener(THEME_CHANGE, read)
  }, [])
  return theme
}

const Toaster = ({ ...props }: ToasterProps) => {
  const theme = useDocumentTheme()

  return (
    <Sonner
      theme={theme}
      richColors
      className="toaster group"
      icons={{
        success: (
          <CircleCheckIcon className="size-4" />
        ),
        info: (
          <InfoIcon className="size-4" />
        ),
        warning: (
          <TriangleAlertIcon className="size-4" />
        ),
        error: (
          <OctagonXIcon className="size-4" />
        ),
        loading: (
          <Loader2Icon className="size-4 animate-spin" />
        ),
      }}
      style={
        {
          "--normal-bg": "#18181b",
          "--normal-text": "#fafafa",
          "--normal-border": "#27272a",
          "--success-bg": "#14532d",
          "--success-text": "#f0fdf4",
          "--success-border": "#166534",
          "--error-bg": "#7f1d1d",
          "--error-text": "#fef2f2",
          "--error-border": "#991b1b",
          "--warning-bg": "#78350f",
          "--warning-text": "#fffbeb",
          "--warning-border": "#a16207",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "cn-toast",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
