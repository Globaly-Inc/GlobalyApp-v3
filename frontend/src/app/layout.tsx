import type { Metadata, Viewport } from "next";
import { Geist_Mono, Inter, Fraunces } from "next/font/google";
import { cookies } from "next/headers";
import Script from "next/script";
import { siteConfig } from "@/config/site";
import { ThemeSettingsSync } from "@/components/theme-settings-sync";
import { Toaster } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";
import { DEFAULT_FONT, parseThemeSettingsCookie, THEME_SETTINGS_KEY } from "@/lib/theme-settings";
import StoreProvider from "./StoreProvider";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  weight: ["600", "700"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  const cookieStore = await cookies();
  const settings = parseThemeSettingsCookie(
    cookieStore.get(THEME_SETTINGS_KEY)?.value,
    siteConfig.name
  );
  const icon = settings.faviconUrl || settings.logoUrl;
  return {
    title: settings.companyName,
    description: siteConfig.description,
    ...(icon ? { icons: icon } : {}),
  };
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "hsl(0 0% 100%)" },
    { media: "(prefers-color-scheme: dark)", color: "hsl(222 47% 8%)" },
  ],
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const settings = parseThemeSettingsCookie(
    cookieStore.get(THEME_SETTINGS_KEY)?.value,
    siteConfig.name
  );
  const isDark = cookieStore.get("theme")?.value === "dark";
  // Headings are pinned to --font-heading (Fraunces) in globals.css, and a rule on
  // the element beats the font inherited from <html> — so the theme font reached
  // body copy only. A tenant who has chosen a font gets it on headings as well;
  // an untouched install keeps the intended Inter/Fraunces pairing.
  const themedFont = settings.font !== DEFAULT_FONT;
  const supportToken = process.env.NEXT_PUBLIC_GLOBALYOS_SUPPORT_TOKEN;

  return (
    <html
      lang="en"
      data-scroll-behavior="smooth"
      suppressHydrationWarning
      className={cn(
        inter.variable,
        fraunces.variable,
        geistMono.variable,
        "h-full antialiased",
        isDark && "dark"
      )}
      style={
        {
          "--primary": settings.primaryColor,
          ...(themedFont ? { "--font-heading": settings.font } : {}),
          fontFamily: settings.font,
        } as React.CSSProperties
      }
    >
      <body className="min-h-full flex flex-col">
        <ThemeSettingsSync />
        <StoreProvider>{children}</StoreProvider>
        <Toaster />
        {/* GlobalyOS support widget. afterInteractive is next/script's `defer` — the widget must
            never block hydration. Unset token means the script is skipped entirely rather than
            loaded with an empty data-token, which the SDK would reject anyway. */}
        {supportToken && (
          <Script
            src="https://globalyos.com/sdk-v1.js"
            data-token={supportToken}
            strategy="afterInteractive"
          />
        )}
      </body>
    </html>
  );
}
