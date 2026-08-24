"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Bell, Coins, GraduationCap, LogOut, Loader2, MessageCircle, Sparkles, User } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { ensureBusinessContext } from "@/lib/api/http";
import { getSelectedOrgId, saveSelectedOrgId } from "@/lib/session";
import { authApi } from "@/app/auth/apis";
import type { AuthMeBusiness } from "@/app/auth/apis";
import { logout } from "@/app/auth/store/auth-slice";
import { fetchMyProfile } from "@/app/business/store/business-onboarding-slice";
import { BUSINESS_NAV_GROUPS } from "./const";
import { BusinessSwitcher } from "./components/business-switcher";
import { PortalSidebar } from "@/components/portal-sidebar";

const SHELL_WIDTH = "mx-auto w-full max-w-7xl px-3 sm:px-4 md:px-6";

export function BusinessShell({ children }: Readonly<{ children: React.ReactNode }>) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const dispatch = useAppDispatch();
  const { profile, status, error } = useAppSelector((state) => state.businessOnboarding);

  // Tenant-scoped endpoints 403 without an `orgId` claim, and login never issues
  // one. Establish it here rather than in each page, so children can fetch
  // freely — and hold them back until it resolves, or their mount-time fetch
  // races the switch and 403s.
  const [contextReady, setContextReady] = useState(false);
  const [businesses, setBusinesses] = useState<AuthMeBusiness[]>([]);
  const [activeOrgId, setActiveOrgId] = useState<string | null>(null);
  // Next's router cache can rehydrate a previously-rendered page's HTML against a client Redux store
  // that has since moved on (e.g. after a back/forward navigation) — `status`/`profile` in that cached
  // HTML can genuinely disagree with the live store. Gate on `mounted` so the branch below matches
  // whatever HTML is being hydrated against on the very first render.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    let active = true;
    ensureBusinessContext()
      .catch(() => false)
      .then(() => (active ? authApi.listMyBusinesses().catch(() => []) : []))
      .then((list) => {
        if (!active) return;
        setBusinesses(list);
        setActiveOrgId(getSelectedOrgId() ?? [...list].sort((a, b) => a.id - b.id)[0]?.org_id ?? null);
        // A zero-business user has nothing for /businesses/me to return — fetching
        // it would just 403. onboarding-view.tsx handles the empty case itself.
        if (list.length > 0) dispatch(fetchMyProfile());
      })
      .finally(() => {
        if (active) setContextReady(true);
      });
    return () => {
      active = false;
    };
  }, [dispatch]);

  // A full reload is the honest way to re-switch: every slice already holds data
  // fetched under the previous business, and there is no cross-slice reset.
  //
  // /business/profile/[businessId] is an exception: it owns its own org-reconciliation
  // effect, switching context to whatever business the URL names (needed for deep links).
  // Reloading the SAME url there would leave it pointed at the OLD business id, and that
  // effect would immediately switch back — silently undoing this switch. Navigate to the
  // new business's own profile url instead and let that page do the (now-agreeing) switch.
  const handleSwitchBusiness = async (orgId: string) => {
    if (orgId === activeOrgId) return;
    saveSelectedOrgId(orgId);
    if (pathname?.startsWith("/business/profile")) {
      const target = businesses.find((b) => b.org_id === orgId);
      if (target) {
        window.location.assign(`/business/profile/${target.id}`);
        return;
      }
    }
    await ensureBusinessContext(true);
    window.location.reload();
  };

  const handleSignOut = () => {
    dispatch(logout());
    router.push("/auth/sign-in");
  };

  // Fresh business-track users (zero businesses) and an explicit "create another"
  // request both need to reach the onboarding form with no chrome and no profile
  // dependency — render it bare rather than gating on a fetch that never happens.
  const wantsNewBusiness = searchParams.get("new") === "1";
  const bareOnboarding = pathname === "/business/onboarding" && (businesses.length === 0 || wantsNewBusiness);
  const needsOnboardingRedirect = contextReady && businesses.length === 0 && pathname !== "/business/onboarding";

  useEffect(() => {
    if (needsOnboardingRedirect) router.replace("/business/onboarding");
  }, [needsOnboardingRedirect, router]);

  if (bareOnboarding) {
    return contextReady ? <>{children}</> : (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (mounted && status === "failed" && !profile) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-background text-center px-4">
        <p className="text-sm text-muted-foreground">
          {error ?? "Failed to load your business profile."}
        </p>
        <button
          type="button"
          onClick={handleSignOut}
          className="text-sm font-medium text-primary underline underline-offset-4"
        >
          Sign out
        </button>
      </div>
    );
  }

  if (!contextReady || !profile) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const initial = profile?.business_name?.[0]?.toUpperCase() ?? "B";

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Full-width bar above the rail, matching the personal portal and GlobalyOS: the mark sits over the
          rail (hence the w-20 box), navigation lives in the sidebar, and this keeps identity only. */}
      <header className="sticky top-0 z-40 h-16 shrink-0 border-b border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/60">
        <div className="flex h-16 items-center">
          <div className="flex h-16 shrink-0 items-center px-3 sm:px-4 md:w-20 md:justify-center md:px-0">
            <Link href="/" className="flex shrink-0 items-center">
              <Image src="/globaly-red-icon.png" alt="Globaly" width={64} height={64} className="size-9 rounded-[10px]" />
            </Link>
          </div>
          {/* ~60% of the bar's height: it marks the rail's edge without reading as a second border. */}
          <span className="hidden md:block h-10 w-px shrink-0 bg-border" aria-hidden />
          <div className="flex min-w-0 items-center pl-3 md:pl-4">
            <BusinessSwitcher businesses={businesses} activeOrgId={activeOrgId} onSwitch={handleSwitchBusiness} />
          </div>

          <div className="flex items-center gap-2 ml-auto pr-3 sm:pr-4 md:pr-2">
            <Link
              href="/business/notifications"
              className="hidden md:inline-flex relative items-center justify-center rounded-full p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Notifications"
            >
              <Bell className="h-4.5 w-4.5" />
              <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-destructive" aria-hidden />
            </Link>
            <Link
              href="/business/messages"
              className="hidden md:inline-flex items-center justify-center rounded-full p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Messages"
            >
              <MessageCircle className="h-4.5 w-4.5" />
            </Link>
            <Link
              href="/business/ai-widget"
              className="hidden md:inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 h-8 text-xs font-semibold bg-primary/10 text-primary hover:bg-primary/15 transition-colors"
            >
              <Sparkles className="h-3.5 w-3.5" />
              AI Counsellor
            </Link>
            <Link
              href="/business/credits"
              className="hidden md:inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 h-8 text-xs font-medium text-muted-foreground hover:bg-muted"
            >
              <Coins className="h-3.5 w-3.5" />
              Credits
            </Link>
          </div>

          {/* Account menu carries identity actions only — business switching lives in
              BusinessSwitcher above, matching V1's split between the two menus. */}
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <button className="mr-3 sm:mr-4 md:mr-6 flex shrink-0 items-center gap-2 rounded-lg px-1.5 py-1 hover:bg-muted cursor-pointer" type="button" />
              }
            >
              <Avatar className="size-8">
                {profile?.logo_url && <AvatarImage src={profile.logo_url} alt={profile.business_name} />}
                <AvatarFallback>{initial}</AvatarFallback>
              </Avatar>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem className="cursor-pointer" onClick={() => router.push("/business/profile")}>
                <User /> My Profile
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="cursor-pointer" onClick={() => router.push("/personal/portal")}>
                <GraduationCap /> Personal Portal
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="cursor-pointer" variant="destructive" onClick={handleSignOut}>
                <LogOut /> Sign Out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <div className="flex flex-1">
        <PortalSidebar groups={BUSINESS_NAV_GROUPS} />

        <main className="min-w-0 flex-1 py-4 md:py-6">
          <div className={SHELL_WIDTH}>{children}</div>
        </main>
      </div>
    </div>
  );
}
