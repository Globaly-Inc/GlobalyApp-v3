"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { LogOut, Menu as MenuIcon, Moon } from "lucide-react";
import { useTheme } from "next-themes";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { groupHref, isGroupActive, RailGlyph, type PortalNavGroup, type PortalNavItem } from "./portal-sidebar";

/** Tabs that fit beside "More" on a 360px phone. */
const TAB_COUNT = 4;

/**
 * Below `md` the rail is hidden: a bottom tab bar carries the first groups, and "More" opens a sheet with
 * every group, its second-level items, the dark mode switch and sign out (GlobalyOS-V2 `MobileBottomNav`).
 */
export function PortalMobileNav({
  title,
  groups,
  moreLinks = [],
  onSignOut,
}: Readonly<{
  title: string;
  groups: PortalNavGroup[];
  /** Extra links listed in the More sheet only, e.g. the header pills that are desktop-only. */
  moreLinks?: PortalNavItem[];
  onSignOut: () => void;
}>) {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const [open, setOpen] = useState(false);
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  return (
    <>
      <nav
        aria-label={`${title} navigation`}
        className="fixed inset-x-0 bottom-0 z-40 flex items-stretch justify-around border-t border-border bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
      >
        {groups.slice(0, TAB_COUNT).map((group) => (
          <Link
            key={group.label}
            href={groupHref(group)}
            className={cn(
              "flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[10px] font-medium",
              isGroupActive(pathname, search, group) ? "text-primary" : "text-muted-foreground",
            )}
          >
            <RailGlyph group={group} className="size-5" />
            {group.label}
          </Link>
        ))}
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex min-h-14 flex-1 cursor-pointer flex-col items-center justify-center gap-0.5 text-[10px] font-medium text-muted-foreground"
        >
          <MenuIcon className="size-5" />
          More
        </button>
      </nav>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="max-h-[85vh] rounded-t-xl">
          <SheetHeader>
            <SheetTitle>{title}</SheetTitle>
          </SheetHeader>
          <nav className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-2">
            {groups.map((group) => (
              <div key={group.label} className="flex flex-col gap-0.5">
                <Link
                  href={groupHref(group)}
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium hover:bg-accent"
                >
                  <RailGlyph group={group} className="size-5" /> {group.label}
                </Link>
                {(group.items?.length ?? 0) > 1 &&
                  group.items!.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setOpen(false)}
                      className="flex items-center gap-2 rounded-md py-2 pl-11 pr-3 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
                    >
                      {item.label}
                    </Link>
                  ))}
              </div>
            ))}
            <div className="my-1 h-px bg-border" />
            {moreLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className="flex items-center gap-3 rounded-md px-3 py-2 text-sm hover:bg-accent"
              >
                <link.icon className="size-4" /> {link.label}
              </Link>
            ))}
            <button
              type="button"
              onClick={() => setTheme(isDark ? "light" : "dark")}
              className="flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-sm hover:bg-accent"
            >
              <Moon className="size-4" />
              <span className="flex-1 text-left">Dark mode</span>
              <Switch checked={isDark} tabIndex={-1} aria-hidden className="pointer-events-none" />
            </button>
            <button
              type="button"
              onClick={onSignOut}
              className="mb-4 flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-sm text-destructive hover:bg-destructive/10"
            >
              <LogOut className="size-4" /> Sign out
            </button>
          </nav>
        </SheetContent>
      </Sheet>
    </>
  );
}
