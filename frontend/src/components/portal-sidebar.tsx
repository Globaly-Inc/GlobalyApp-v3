"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import type { ComponentType } from "react";
import { cn } from "@/lib/utils";

/**
 * Desktop navigation for every portal (personal, business, admin), shaped like GlobalyOS's `AppSidebar`
 * (`apps/web/src/components/layout/AppSidebar.tsx`): an 80px rail of stacked icon-over-label tiles, plus a
 * 200px submenu column carrying the active group's second-level items. Rail tiles show GlobalyOS's 3D
 * clay glyphs (`public/rail/*.webp`, see RAIL_GLYPHS) and fall back to the group's own icon.
 *
 * It expects the caller's own nav registry — `personal/const`, `business/const`, `admin/nav-config` all
 * already describe groups with optional `items`, so nothing has to be restated here. A group with one item
 * (or none) shows no column; the rail links to `href` if given, else the group's first item.
 *
 * Sits below a full-width header, so it is sticky at `top-16` with a viewport-minus-header height — exactly
 * how GlobalyOS pins its rail under its own 4rem bar.
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

/** Rail label → 3D glyph in `public/rail/`. Keyed by label so the three nav registries stay as they are;
    a label with no entry (e.g. "Ask Aly", which has its own orb) keeps its icon. */
const RAIL_GLYPHS: Record<string, string> = {
  Home: "home",
  Socials: "home",
  Overview: "chart",
  Explore: "compass",
  Earn: "coins",
  Learning: "cap",
  LMS: "cap",
  Enquiries: "inbox",
  Inbox: "inbox",
  Messages: "chat",
  Business: "campus",
  Platform: "globe",
  Data: "database",
  Monitoring: "shield",
  Marketing: "megaphone",
  Scribe: "book",
  Revenue: "wallet",
  Settings: "settings",
};

export function RailGlyph({ group, className }: Readonly<{ group: PortalNavGroup; className?: string }>) {
  const glyph = RAIL_GLYPHS[group.label];
  if (!glyph) return <group.icon className={cn("h-5 w-5", className)} />;
  // Decorative: the tile's aria-label/visible label names it.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={`/rail/${glyph}.webp`} alt="" width={24} height={24} className={cn("size-6 object-contain", className)} />;
}

export const groupHref = (group: PortalNavGroup) => group.href ?? group.items?.[0]?.href ?? "#";

export const isGroupActive = (pathname: string | null, search: string | null, group: PortalNavGroup) =>
  (!!group.href && isPortalNavActive(pathname, group.href, search)) ||
  !!group.items?.some((item) => isPortalNavActive(pathname, item.href, search));

export function PortalSidebar({ groups }: Readonly<{ groups: PortalNavGroup[] }>) {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const activeGroup = groups.find((group) => isGroupActive(pathname, search, group));
  // One item needs no column of its own — the rail tile already goes there.
  const submenuItems = (activeGroup?.items?.length ?? 0) > 1 ? activeGroup!.items! : [];

  return (
    <aside className="hidden md:flex sticky top-16 z-30 h-[calc(100vh-4rem)] shrink-0 border-r border-border bg-sidebar">
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
                "flex h-[3.75rem] w-16 flex-col items-center justify-center gap-1 rounded-lg px-1 transition-colors",
                activeGroup?.label === group.label
                  ? "bg-primary-light text-primary"
                  : "text-sidebar-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              <RailGlyph group={group} />
              <span className="max-w-full truncate text-center text-[10px] font-medium leading-tight">
                {group.label}
              </span>
            </Link>
          ))}
        </nav>
      </div>

      {submenuItems.length > 0 && activeGroup && (
        <div className="flex w-[200px] flex-col overflow-y-auto py-3">
          <div className="px-4 pb-2 font-heading text-sm font-medium text-foreground">
            {activeGroup.label}
          </div>
          <nav className="flex flex-col gap-0.5 px-2">
            {submenuItems.map((item) => {
              const active = isPortalNavActive(pathname, item.href, search);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "relative flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors",
                    active
                      ? "bg-primary-light font-medium text-primary"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground",
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
