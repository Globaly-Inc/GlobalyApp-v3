import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Space_Grotesk } from "next/font/google";
import { cookies } from "next/headers";
import Script from "next/script";
import { siteConfig } from "@/config/site";
import { AppThemeProvider } from "@/components/app-theme-provider";
import { ThemeSettingsSync } from "@/components/theme-settings-sync";
import { Toaster } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";
import {
  DEFAULT_FONT,
  headingFontOverride,
  parseThemeSettingsCookie,
  tenantPrimaryOverride,
  THEME_SETTINGS_KEY,
} from "@/lib/theme-settings";
import StoreProvider from "./StoreProvider";
import "./globals.css";

const geist = Geist({
  variable: "--font-geist",
  subsets: ["latin"],
});

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  weight: ["500", "600"],
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
    metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? siteConfig.url),
    title: settings.companyName,
    description: siteConfig.description,
    ...(icon ? { icons: icon } : {}),
  };
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fcfcfc" },
    { media: "(prefers-color-scheme: dark)", color: "#101217" },
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
  // Headings are pinned to --heading-font (Space Grotesk) in globals.css, and a rule on
  // the element beats the font inherited from <html>, so the theme font reaches them
  // only if this variable is reassigned. applyThemeSettings does the same thing on
  // the client via the same helper, so a live font change and a fresh render agree.
  const headingFont = headingFontOverride(settings.font);
  // --tenant-primary, not --primary: an inline --primary would beat the .dark tokens.
  const tenantPrimary = tenantPrimaryOverride(settings.primaryColor);
  const supportToken = process.env.NEXT_PUBLIC_GLOBALYOS_SUPPORT_TOKEN;

  return (
    <html
      lang="en"
      data-scroll-behavior="smooth"
      suppressHydrationWarning
      className={cn(
        geist.variable,
        spaceGrotesk.variable,
        geistMono.variable,
        "h-full antialiased"
      )}
      style={
        {
          ...(tenantPrimary ? { "--tenant-primary": tenantPrimary } : {}),
          ...(headingFont ? { "--heading-font": headingFont } : {}),
          ...(settings.font === DEFAULT_FONT ? {} : { fontFamily: settings.font }),
        } as React.CSSProperties
      }
    >
      <body className="min-h-full flex flex-col">
        <ThemeSettingsSync />
        <AppThemeProvider>
          <StoreProvider>{children}</StoreProvider>
          <Toaster />
        </AppThemeProvider>
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
