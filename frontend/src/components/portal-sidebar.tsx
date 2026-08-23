"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Desktop navigation for every portal (personal, business, admin), shaped like GlobalyOS's `AppSidebar`
 * (`apps/web/src/components/layout/AppSidebar.tsx`): an 80px rail of stacked icon-over-label tiles, plus a
 * 180px submenu column carrying the active group's second-level items.
 *
 * It expects the caller's own nav registry — `personal/const`, `business/const`, `admin/nav-config` all
 * already describe groups with optional `items`, so nothing has to be restated here. A group with one item
 * (or none) shows no column; the rail links to `href` if given, else the group's first item.
 *
 * Sits below a full-width header, so it is sticky at `top-16` with a viewport-minus-header height — exactly
 * how GlobalyOS pins its rail under its own 4rem bar. Colours are this app's tokens (`bg-primary/10`);
 * `bg-primary-light` is GlobalyOS-only.
 */
export type PortalNavItem = { label: string; icon: LucideIcon; href: string };

export type PortalNavGroup = {
  label: string;
  icon: LucideIcon;
  /** Where the rail tile points. Defaults to the first item's href. */
  href?: string;
  items?: PortalNavItem[];
};

/** Exact match, otherwise prefix match — query strings stripped first, as admin's hrefs can carry them. */
export function isPortalNavActive(pathname: string | null, href: string): boolean {
  const path = href.split("?")[0];
  return pathname === path || !!pathname?.startsWith(`${path}/`);
}

const groupHref = (group: PortalNavGroup) => group.href ?? group.items?.[0]?.href ?? "#";

const isGroupActive = (pathname: string | null, group: PortalNavGroup) =>
  (!!group.href && isPortalNavActive(pathname, group.href)) ||
  !!group.items?.some((item) => isPortalNavActive(pathname, item.href));

export function PortalSidebar({ groups }: Readonly<{ groups: PortalNavGroup[] }>) {
  const pathname = usePathname();
  const activeGroup = groups.find((group) => isGroupActive(pathname, group));
  // One item needs no column of its own — the rail tile already goes there.
  const submenuItems = (activeGroup?.items?.length ?? 0) > 1 ? activeGroup!.items! : [];

  return (
    <aside className="hidden md:flex sticky top-16 z-30 h-[calc(100vh-4rem)] shrink-0 border-r border-border bg-card/95 backdrop-blur">
      <div
        className={cn(
          "flex w-20 flex-col items-center overflow-y-auto py-3",
          // Only a divider when there is a second column to divide from.
          submenuItems.length > 0 && "border-r border-border",
        )}
      >
        <nav className="flex flex-col items-center gap-1">
          {groups.map((group) => (
            <Link
              key={group.label}
              href={groupHref(group)}
              aria-label={group.label}
              className={cn(
                "flex h-14 w-16 flex-col items-center justify-center gap-1 rounded-lg px-1 transition-colors",
                activeGroup?.label === group.label
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <group.icon className="h-5 w-5" />
              <span className="max-w-full truncate text-center text-[10px] font-medium leading-tight">
                {group.label}
              </span>
            </Link>
          ))}
        </nav>
      </div>

      {submenuItems.length > 0 && activeGroup && (
        <div className="flex w-[180px] flex-col overflow-y-auto py-3">
          <div className="px-4 pb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {activeGroup.label}
          </div>
          <nav className="flex flex-col gap-0.5 px-2">
            {submenuItems.map((item) => {
              const active = isPortalNavActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "relative flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors",
                    active
                      ? "bg-primary/10 font-medium text-primary"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  {active && (
                    <span
                      aria-hidden
                      className="absolute left-0 top-1.5 bottom-1.5 w-[2px] rounded-full bg-primary"
                    />
                  )}
                  <item.icon className="h-4 w-4 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>
      )}
    </aside>
  );
}
