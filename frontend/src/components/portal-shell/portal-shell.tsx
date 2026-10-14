"use client";

import { cn } from "@/lib/utils";
import { PortalHeader } from "./portal-header";
import { PortalMobileNav } from "./portal-mobile-nav";
import { PortalSidebar, type PortalNavGroup, type PortalNavItem } from "./portal-sidebar";
import type { PortalAccount } from "./portal-account-menu";

/**
 * How a page sits under the header:
 * - `default`: the centred max-w-7xl content column.
 * - `wide`: same padding, no max width — admin tables and the business profile's wide tabs.
 * - `full`: edge to edge, no padding. App surfaces (chat, the AI counsellor) own the whole space below
 *   the header and do their own bottom-nav math.
 */
export type PortalWidth = "default" | "wide" | "full";

const CONTENT: Record<Exclude<PortalWidth, "full">, string> = {
  default: "mx-auto w-full max-w-7xl px-3 md:px-8",
  wide: "w-full px-3 md:px-8",
};

type PortalShellProps = {
  /** Names the portal for the mobile nav, e.g. "Business Portal". */
  title: string;
  groups: PortalNavGroup[];
  /** Header area beside the mark: the portal's switcher or label. */
  context: React.ReactNode;
  /** Extra header controls before the account menu. */
  headerActions?: React.ReactNode;
  account: PortalAccount;
  onSignOut: () => void;
  width?: PortalWidth;
  /** Rail on desktop. Off while a portal has no navigation to offer (the personal portal today). */
  showNav?: boolean;
  /** The phone bottom bar. Off for app surfaces that keep the screen to themselves. */
  showMobileNav?: boolean;
  /** Extra links in the phone "More" sheet. */
  moreLinks?: PortalNavItem[];
  children: React.ReactNode;
};

/** The one layout every portal (personal, business, admin) renders: header, rail, content, phone nav. */
export function PortalShell({
  title,
  groups,
  context,
  headerActions,
  account,
  onSignOut,
  width = "default",
  showNav = true,
  showMobileNav = true,
  moreLinks,
  children,
}: Readonly<PortalShellProps>) {
  const mobileNav = showNav && showMobileNav;
  return (
    <div data-shell="portal" className="flex min-h-screen flex-col bg-background">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-card focus:px-3 focus:py-2 focus:text-sm focus:shadow-md"
      >
        Skip to content
      </a>
      <PortalHeader context={context} actions={headerActions} account={account} onSignOut={onSignOut} />

      <div className="flex flex-1">
        {showNav && <PortalSidebar groups={groups} />}
        <main
          id="main-content"
          tabIndex={-1}
          className={cn(
            "min-w-0 flex-1 overflow-x-clip outline-none",
            width !== "full" && "py-4 md:py-8",
            // Clears the fixed bottom bar on phones.
            width !== "full" && mobileNav && "pb-24 md:pb-8",
          )}
        >
          {width === "full" ? children : <div className={CONTENT[width]}>{children}</div>}
        </main>
      </div>
      {mobileNav && <PortalMobileNav title={title} groups={groups} moreLinks={moreLinks} onSignOut={onSignOut} />}
    </div>
  );
}
