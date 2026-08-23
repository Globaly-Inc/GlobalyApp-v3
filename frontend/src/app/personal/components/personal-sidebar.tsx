"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { NAV_ITEMS, isNavActive } from "../const";

/**
 * Desktop navigation, shaped like GlobalyOS's `AppSidebar`
 * (`apps/web/src/components/layout/AppSidebar.tsx`): an 80px rail of stacked icon-over-label tiles, plus a
 * 180px submenu column carrying the active module's second-level nav — Earn's My Services / Ambassadors /
 * Referrals, which used to be a tab band above the page body.
 *
 * The header spans the full viewport above this, so the rail starts below it: sticky at `top-16` with a
 * viewport-minus-header height, exactly as GlobalyOS pins its own rail under its 4rem bar.
 *
 * Colours come from this app's tokens (`bg-primary/10`), since `bg-primary-light` is GlobalyOS-only.
 */
export function PersonalSidebar() {
  const pathname = usePathname();
  const activeModule = NAV_ITEMS.find((item) => isNavActive(pathname, item.href));
  const submenuItems = activeModule?.items ?? [];

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
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-label={item.label}
              className={cn(
                "relative flex h-14 w-16 flex-col items-center justify-center gap-1 rounded-lg px-1 transition-colors",
                activeModule?.href === item.href
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <item.icon className="h-5 w-5" />
              <span className="max-w-full truncate text-center text-[10px] font-medium leading-tight">
                {item.label}
              </span>
              {item.href === "/personal/messages" && (
                <span className="absolute right-2 top-2 size-1.5 rounded-full bg-destructive" />
              )}
            </Link>
          ))}
        </nav>
      </div>

      {submenuItems.length > 0 && activeModule && (
        <div className="flex w-[180px] flex-col overflow-y-auto py-3">
          <div className="px-4 pb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {activeModule.label}
          </div>
          <nav className="flex flex-col gap-0.5 px-2">
            {submenuItems.map((item) => {
              const active = isNavActive(pathname, item.href);
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
