"use client";

import Image from "next/image";
import Link from "next/link";
import { Bell, Coins } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { APP_ICON_ATTR, ICON } from "@/lib/public-assets";
import { PortalAccountMenu, type PortalAccount } from "./portal-account-menu";

/**
 * Full-width bar above the rail (GlobalyOS-V2 `Layout` header): the mark sits over the rail (hence the
 * w-20 box), `context` holds the portal's switcher, and the right side keeps identity only — navigation
 * lives in the rail.
 */
export function PortalHeader({
  context,
  actions,
  account,
  onSignOut,
}: Readonly<{ context: React.ReactNode; actions?: React.ReactNode; account: PortalAccount; onSignOut: () => void }>) {
  return (
    <header className="sticky top-0 z-40 h-16 shrink-0 border-b border-border bg-card/95 backdrop-blur">
      <div className="flex h-16 items-center">
        <div className="flex h-16 shrink-0 items-center px-3 sm:px-4 md:w-20 md:justify-center md:px-0">
          <Link href="/" className="flex shrink-0 items-center" {...{ [APP_ICON_ATTR]: "" }}>
            <Image src={ICON.src} alt="GlobalyAI" width={ICON.width} height={ICON.height} className="size-9 rounded-lg" priority />
          </Link>
        </div>
        {/* ~60% of the bar's height: it marks the rail's edge without reading as a second border. */}
        <span className="hidden h-10 w-px shrink-0 bg-border md:block" aria-hidden />
        <div className="flex min-w-0 items-center pl-3 md:pl-4">{context}</div>

        <div className="ml-auto flex shrink-0 items-center gap-2 pr-3 sm:pr-4 md:pr-6">
          <ThemeToggle />
          {actions}
          <PortalAccountMenu account={account} onSignOut={onSignOut} />
        </div>
      </div>
    </header>
  );
}

/** The desktop-only Notifications and Credits pills (behind SHOW_HEADER_EXTRAS in each portal). */
export function PortalHeaderLinks({ notificationsHref, creditsHref }: Readonly<{ notificationsHref: string; creditsHref: string }>) {
  return (
    <>
      <Link
        href={notificationsHref}
        aria-label="Notifications"
        className="relative hidden items-center justify-center rounded-full p-2 text-muted-foreground hover:bg-muted hover:text-foreground md:inline-flex"
      >
        <Bell className="h-4.5 w-4.5" />
      </Link>
      <Link
        href={creditsHref}
        className="hidden h-8 items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted md:inline-flex"
      >
        <Coins className="h-3.5 w-3.5" />
        Credits
      </Link>
    </>
  );
}
