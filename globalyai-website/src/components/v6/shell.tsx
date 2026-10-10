import type { ReactNode } from "react";
import { Navbar } from "./hero";
import { Footer } from "./footer";
import { CookieConsent } from "./cookie-consent";
import { ThemeScript, V6_ROOT_ID } from "./theme";

/**
 * Everything every page on the site wears: the themed root, the pre-paint
 * theme script, the bar, the footer and the cookie banner. The homepage and
 * the three legal pages all render through it, so a legal page can never be
 * the one that forgets the banner or flashes white in dark mode.
 */
export function SiteShell({ children }: Readonly<{ children: ReactNode }>) {
  return (
    // ThemeScript sets data-theme before hydration, so the server markup is
    // meant to differ on this one attribute.
    <div id={V6_ROOT_ID} className="v6 min-h-dvh" suppressHydrationWarning>
      {/* Runs before hydration. Without it the first paint is light and a
          dark-mode visitor watches the page change under them. */}
      <ThemeScript />
      <Navbar />
      <main id="main">{children}</main>
      <Footer />
      <CookieConsent />
    </div>
  );
}
