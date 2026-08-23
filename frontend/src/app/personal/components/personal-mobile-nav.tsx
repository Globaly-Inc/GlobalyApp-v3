"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import {
  Home,
  Bell,
  Coins,
  Sparkles,
  Menu as MenuIcon,
  User as UserIcon,
  LogOut,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { NAV_ITEMS } from "../const";

type PortalTarget = { label: string; icon: LucideIcon; href: string } | null;

/**
 * Below `md` the sidebar is hidden, so navigation comes from the bottom bar plus this drawer — which
 * also carries the header's utility links (AI Counsellor, Credits), since those are desktop-only pills.
 */
export function PersonalMobileNav({
  portalTarget,
  onSignOut,
}: Readonly<{ portalTarget: PortalTarget; onSignOut: () => void }>) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const tabClass = (href: string) =>
    cn(
      "flex flex-col items-center gap-0.5 px-4 py-1 text-xs",
      pathname === href ? "text-primary" : "text-muted-foreground",
    );

  return (
    <>
      <div className="fixed bottom-0 inset-x-0 z-40 flex items-center justify-around border-t border-border bg-background py-2 pb-[env(safe-area-inset-bottom)] md:hidden">
        <Link href="/personal/portal" className={tabClass("/personal/portal")}>
          <Home className="h-5 w-5" />
          Home
        </Link>
        <Link href="/personal/notifications" className={tabClass("/personal/notifications")}>
          <Bell className="h-5 w-5" />
          Alerts
        </Link>
        <Link href="/personal/profile" className={tabClass("/personal/profile")}>
          <UserIcon className="h-5 w-5" />
          My Profile
        </Link>
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          className="flex flex-col items-center gap-0.5 px-4 py-1 text-xs text-muted-foreground cursor-pointer"
        >
          <MenuIcon className="h-5 w-5" />
          Menu
        </button>
      </div>

      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent side="left">
          <SheetHeader>
            <SheetTitle>Personal Portal</SheetTitle>
          </SheetHeader>
          <nav className="flex flex-col gap-1 px-2">
            {NAV_ITEMS.map((item) => (
              <div key={item.href} className="flex flex-col gap-1">
                <Link
                  href={item.href}
                  onClick={() => setDrawerOpen(false)}
                  className="flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-muted"
                >
                  <item.icon className="h-4 w-4" /> {item.label}
                </Link>
                {/* Second-level routes are only reachable from here on mobile — the sidebar that carries
                    them on desktop is hidden below `md`. */}
                {item.items?.map((sub) => (
                  <Link
                    key={sub.href}
                    href={sub.href}
                    onClick={() => setDrawerOpen(false)}
                    className="flex items-center gap-2 rounded-md py-2 pl-9 pr-3 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <sub.icon className="h-4 w-4" /> {sub.label}
                  </Link>
                ))}
              </div>
            ))}
            <div className="my-1 h-px bg-border" />
            <Link
              href="/personal/ai"
              onClick={() => setDrawerOpen(false)}
              className="flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-muted"
            >
              <Sparkles className="h-4 w-4" /> AI Counsellor
            </Link>
            <Link
              href="/personal/credits"
              onClick={() => setDrawerOpen(false)}
              className="flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-muted"
            >
              <Coins className="h-4 w-4" /> Credits
            </Link>
            <Link
              href="/personal/profile"
              onClick={() => setDrawerOpen(false)}
              className="flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-muted"
            >
              <UserIcon className="h-4 w-4" /> My Profile
            </Link>
            {portalTarget && (
              <Link
                href={portalTarget.href}
                onClick={() => setDrawerOpen(false)}
                className="flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-muted"
              >
                <portalTarget.icon className="h-4 w-4" /> {portalTarget.label}
              </Link>
            )}
          </nav>
          <div className="mt-auto p-2">
            <Button variant="outline" className="w-full justify-start gap-2" onClick={onSignOut}>
              <LogOut className="h-4 w-4" /> Sign Out
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
