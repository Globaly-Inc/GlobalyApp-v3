import type { Metadata, Viewport } from "next";
import { Geist_Mono, Inter, Fraunces } from "next/font/google";
import { cookies } from "next/headers";
import { siteConfig } from "@/config/site";
import { ThemeSettingsSync } from "@/components/theme-settings-sync";
import { cn } from "@/lib/utils";
import { parseThemeSettingsCookie, THEME_SETTINGS_KEY } from "@/lib/theme-settings";
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

  return (
    <html
      lang="en"
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
          fontFamily: settings.font,
        } as React.CSSProperties
      }
    >
      <body className="min-h-full flex flex-col">
        <ThemeSettingsSync />
        <StoreProvider>{children}</StoreProvider>
      </body>
    </html>
  );
}
