"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import type { ComponentType } from "react";
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
/** A `lucide` icon, or anything else that renders from a `className` — see `AlyOrbIcon`. */
export type PortalNavIcon = ComponentType<{ className?: string }>;

export type PortalNavItem = { label: string; icon: PortalNavIcon; href: string };

export type PortalNavGroup = {
  label: string;
  icon: PortalNavIcon;
  /** Where the rail tile points. Defaults to the first item's href. */
  href?: string;
  items?: PortalNavItem[];
};

export function isPortalNavActive(pathname: string | null, href: string, currentSearch?: string | null): boolean {
  const [path, hrefQuery] = href.split("?");
  const isExactPath = pathname === path;
  if (!isExactPath && !pathname?.startsWith(`${path}/`)) return false;
  const hrefTab = new URLSearchParams(hrefQuery ?? "").get("tab");
  if (!isExactPath) return hrefTab === null;
  const currentTab = new URLSearchParams(currentSearch ?? "").get("tab");
  return hrefTab === currentTab;
}

const groupHref = (group: PortalNavGroup) => group.href ?? group.items?.[0]?.href ?? "#";

/**
 * Which item (if any) among a group's own `?tab=` links is active — the exact-path+tab match
 * `isPortalNavActive` already handles, PLUS a route one level deeper than the tabbed page itself
 * (e.g. `/business/profile/49/services/:id/edit`, a real sub-route, not a `?tab=` page): the
 * first extra path segment ("services") is matched against each item's own tab value first, so
 * Services highlights there instead of always falling back to whichever item has no tab at all.
 */
function bestActiveItem(pathname: string | null, currentSearch: string | null, items: PortalNavItem[]): PortalNavItem | null {
  // A TRUE exact-path match (the tabbed page itself) — checked directly rather than through
  // isPortalNavActive, whose own nested-route fallback would otherwise let the tab-less item
  // win this pass too and never reach the segment-matching logic below.
  const exact = items.find((item) => pathname === item.href.split("?")[0]
    && new URLSearchParams(item.href.split("?")[1] ?? "").get("tab") === new URLSearchParams(currentSearch ?? "").get("tab"));
  if (exact) return exact;
  if (!pathname) return null;
  for (const item of items) {
    const [path = "", hrefQuery] = item.href.split("?");
    if (!pathname.startsWith(`${path}/`)) continue;
    const hrefTab = new URLSearchParams(hrefQuery ?? "").get("tab");
    const extraSegment = pathname.slice(path.length + 1).split("/")[0];
    if (hrefTab === extraSegment) return item;
  }
  // No sibling's tab matches the extra segment — fall back to the tab-less item, same as
  // isPortalNavActive's own nested-route behavior (a group whose page has no tab query at all).
  return items.find((item) => {
    const [path, hrefQuery] = item.href.split("?");
    return pathname.startsWith(`${path}/`) && new URLSearchParams(hrefQuery ?? "").get("tab") === null;
  }) ?? null;
}

const isGroupActive = (pathname: string | null, search: string | null, group: PortalNavGroup) =>
  (!!group.href && isPortalNavActive(pathname, group.href, search)) ||
  !!(group.items && bestActiveItem(pathname, search, group.items));

export function PortalSidebar({ groups }: Readonly<{ groups: PortalNavGroup[] }>) {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const activeGroup = groups.find((group) => isGroupActive(pathname, search, group));
  // One item needs no column of its own — the rail tile already goes there.
  const submenuItems = (activeGroup?.items?.length ?? 0) > 1 ? activeGroup!.items! : [];
  const activeItem = activeGroup?.items ? bestActiveItem(pathname, search, activeGroup.items) : null;

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
              const active = activeItem?.href === item.href;
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
