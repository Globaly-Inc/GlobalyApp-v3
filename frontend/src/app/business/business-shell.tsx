"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Bell, ChevronDown, Coins, Loader2 } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { currentOrgId, ensureBusinessContext, refreshAccessToken } from "@/lib/api/http";
import { getSelectedOrgId, saveSelectedOrgId } from "@/lib/session";
import { authApi } from "@/app/auth/apis";
import type { AuthMeInstitution } from "@/app/auth/apis";
import { logout, useAuthState } from "@/app/auth/store/auth-slice";
import { fetchMyProfile } from "@/app/business/store/business-onboarding-slice";
import { useExtractionLock } from "./utils/use-extraction-lock";
import { BUSINESS_NAV_GROUPS, INSTITUTION_SCHOLARSHIPS_ITEM, withBusinessId } from "./const";
import { BusinessSwitcher, type SwitcherOrg } from "./components/business-switcher";
import { ExtractionInProgress } from "./components/extraction-in-progress";
import { PortalSidebar } from "@/components/portal-sidebar";
import { cn } from "@/lib/utils";
import { ICON, APP_ICON_ATTR } from "@/lib/public-assets";
import { PERSONAL_PORTAL_HOME, SHOW_HEADER_EXTRAS, SHOW_PERSONAL_PORTAL } from "@/app/personal/const";
import { SIGN_IN_HREF } from "@/app/auth/const";

const SHELL_WIDTH = "mx-auto w-full max-w-7xl px-3 sm:px-4 md:px-6";
const FULL_BLEED_ROUTES = ["/business/messages"] as const;

/** Same padding as SHELL_WIDTH but no max width — for the business profile's wide tables. */
const SHELL_WIDE = "w-full px-3 sm:px-4 md:px-6";
// Institution accounts act as businesses throughout this shell — their records are adapted
// to the SwitcherOrg shape so the switcher can render them uniformly, with kind="institution"
// to distinguish them visually and drive the nav-group filter.
function institutionsAsOrgs(institutions: AuthMeInstitution[]): SwitcherOrg[] {
  return institutions.map((inst) => ({
    id: inst.id,
    org_id: inst.org_id,
    business_name: inst.institution_name,
    subdomain: inst.subdomain,
    logo_url: inst.logo_url,
    owner_id: 0,
    role: inst.role,
    is_owner: inst.is_owner,
    kind: "institution" as const,
    parent_id: inst.parent_institution_id ?? null,
  }));
}

const INSTITUTION_BUSINESS_ITEM_ORDER = ["Business Profile", "Branches", "Services", "Scholarships", "Team", "Site contents"];

const INSTITUTION_NAV_GROUPS = BUSINESS_NAV_GROUPS.map((group) => {
  if (group.label !== "Business") return group;
  const byLabel = new Map([...group.items, INSTITUTION_SCHOLARSHIPS_ITEM].map((item) => [item.label, item]));
  const items = INSTITUTION_BUSINESS_ITEM_ORDER.map((label) => byLabel.get(label)).filter((item) => item !== undefined);
  return { ...group, items };
}).filter((group) => group.items.length > 0);

export function BusinessShell({ children }: Readonly<{ children: React.ReactNode }>) {
  const router = useRouter();
  const pathname = usePathname();
  const isFullBleed = FULL_BLEED_ROUTES.some((route) => pathname?.startsWith(route)) ?? false;
  const searchParams = useSearchParams();
  // Business profile tabs (services, branches, scholarships, team…) are mostly wide tables —
  // give the whole profile area the full content width.
  const isWide = /^\/business\/profile\/\d/.test(pathname ?? "");
  const dispatch = useAppDispatch();
  const { user } = useAuthState();
  const { profile, status, error } = useAppSelector((state) => state.businessOnboarding);
  const [contextReady, setContextReady] = useState(false);
  const [businesses, setBusinesses] = useState<SwitcherOrg[]>([]);
  const [institutionOrgIds, setInstitutionOrgIds] = useState<Set<string>>(new Set());
  const [activeOrgId, setActiveOrgId] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const loadOrgs = useCallback(async () => {
    const [bizList, instList] = await Promise.all([
      authApi.listMyBusinesses().catch(() => []),
      authApi.listMyInstitutions().catch(() => []),
    ]);
    const bizOrgs: SwitcherOrg[] = bizList.map((b) => ({ ...b, kind: "business" as const, parent_id: b.parent_business_id ?? null }));
    const instOrgs = institutionsAsOrgs(instList);
    const merged = [...bizOrgs, ...instOrgs];
    setBusinesses(merged);
    setInstitutionOrgIds(new Set(instOrgs.map((o) => o.org_id)));
    return merged;
  }, []);

  const orgCount = (user?.businesses?.length ?? 0) + (user?.institutions?.length ?? 0);
  const prevOrgCount = useRef(orgCount);
  useEffect(() => {
    const changed = prevOrgCount.current !== orgCount;
    prevOrgCount.current = orgCount;
    if (contextReady && changed) loadOrgs();
  }, [contextReady, orgCount, loadOrgs]);

  useEffect(() => {
    let active = true;
    ensureBusinessContext()
      .catch(() => false)
      .then(async () => {
        if (!active) return;
        const merged = await loadOrgs();
        if (!active) return;
        // The token's org first: it is what the page's data comes from, so the switcher must show it
        // too (a profile URL can switch the token to another org than the last one picked here).
        const saved = getSelectedOrgId();
        const pick = [currentOrgId(), saved].find((id) => merged.some((o) => o.org_id === id));
        setActiveOrgId(pick ?? [...merged].sort((a, b) => a.id - b.id)[0]?.org_id ?? null);
        if (merged.length > 0) dispatch(fetchMyProfile());
      })
      .finally(() => {
        if (active) setContextReady(true);
      });
    return () => {
      active = false;
    };
  }, [dispatch, loadOrgs]);

  
  const handleSwitchBusiness = async (orgId: string) => {
    if (orgId === activeOrgId) return;
    saveSelectedOrgId(orgId);
    // Switch the token first on every path — the next page reads its data (and its extraction
    // lock) from the token's org, not from the pick saved above.
    await ensureBusinessContext(true);
    if (pathname === "/business/profile" || /^\/business\/profile\/\d/.test(pathname ?? "")) {
      const target = businesses.find((b) => b.org_id === orgId);
      if (target) {
        window.location.assign(`/business/profile/${target.id}`);
        return;
      }
    }
    window.location.reload();
  };

  const handleSignOut = () => {
    dispatch(logout());
    router.push(SIGN_IN_HREF);
  };

  const { extractionStatus, lockedOut } = useExtractionLock(pathname);

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

  const isInstitution = institutionOrgIds.has(activeOrgId ?? "");
  const initial = (user?.first_name?.[0] ?? user?.email?.[0])?.toUpperCase() ?? "U";
  // Falls back to the loaded profile, so the nav's tab links always carry an id — a bare
  // /business/profile?tab=… link used to land back on the profile tab.
  const activeBusinessId = businesses.find((b) => b.org_id === activeOrgId)?.id ?? profile.id ?? null;
  // A listing promoted/claimed as a BUSINESS row in the Institutions category (not an institutions
  // row) still gets the business nav — but Representative is hidden for it, as for a real institution.
  const isInstitutionCategory = (profile.business_category_name ?? "").toLowerCase().includes("institution");
  const baseNav = isInstitution
    ? INSTITUTION_NAV_GROUPS
    : isInstitutionCategory ? BUSINESS_NAV_GROUPS.map((g) => ({ ...g, items: g.items.filter((i) => i.label !== "Representative") })) : BUSINESS_NAV_GROUPS;
  const navGroups = withBusinessId(baseNav, activeBusinessId);
  const content = lockedOut ? <ExtractionInProgress status={extractionStatus} /> : children;

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Full-width bar above the rail, matching the personal portal and GlobalyOS: the mark sits over the
          rail (hence the w-20 box), navigation lives in the sidebar, and this keeps identity only. */}
      <header className="sticky top-0 z-40 h-16 shrink-0 border-b border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/60">
        <div className="flex h-16 items-center">
          <div className="flex h-16 shrink-0 items-center px-3 sm:px-4 md:w-20 md:justify-center md:px-0">
            <Link href="/" className="flex shrink-0 items-center" {...{ [APP_ICON_ATTR]: "" }}>
              <Image src={ICON.src} alt="Globalyapp" width={ICON.width} height={ICON.height} className="size-9 rounded-[10px]" />
            </Link>
          </div>
          {/* ~60% of the bar's height: it marks the rail's edge without reading as a second border. */}
          <span className="hidden md:block h-10 w-px shrink-0 bg-border" aria-hidden />
          <div className="flex min-w-0 items-center pl-3 md:pl-4">
            <BusinessSwitcher
              businesses={businesses}
              activeOrgId={activeOrgId}
              onSwitch={handleSwitchBusiness}
            />
          </div>

          <div className="flex items-center gap-2 ml-auto pr-3 sm:pr-4 md:pr-2">
            {SHOW_HEADER_EXTRAS && (
              <>
                <Link
                  href="/business/notifications"
                  className="hidden md:inline-flex relative items-center justify-center rounded-full p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
                  aria-label="Notifications"
                >
                  <Bell className="h-4.5 w-4.5" />
                  <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-destructive" aria-hidden />
                </Link>
                <Link
                  href="/business/credits"
                  className="hidden md:inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 h-8 text-xs font-medium text-muted-foreground hover:bg-muted"
                >
                  <Coins className="h-3.5 w-3.5" />
                  Credits
                </Link>
              </>
            )}
          </div>

          {/* Account menu carries identity actions only — business switching lives in
              BusinessSwitcher above, matching V1's split between the two menus. */}
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <button
                  className="mr-3 sm:mr-4 md:mr-6 flex items-center gap-1.5 rounded-md border border-border py-1 pl-1 pr-2 hover:bg-muted cursor-pointer"
                  type="button"
                  aria-label="Account menu"
                />
              }
            >
              <Avatar className="size-7">
                {user?.photo_url && <AvatarImage src={user.photo_url} alt={user?.first_name ?? "User"} />}
                <AvatarFallback>{initial}</AvatarFallback>
              </Avatar>
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 p-1.5 rounded-md">
              <DropdownMenuItem
                className="cursor-pointer px-1.5 py-1.5 flex items-center gap-2"
                onClick={() => router.push("/personal/profile")}
              >
                <Avatar className="size-8 shrink-0">
                  {user?.photo_url && <AvatarImage src={user.photo_url} alt={user?.first_name ?? "User"} />}
                  <AvatarFallback className="text-primary-foreground!">{initial}</AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">
                    {[user?.first_name, user?.last_name].filter(Boolean).join(" ") || "User"}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
                </div>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {SHOW_PERSONAL_PORTAL && (
                <DropdownMenuItem className="cursor-pointer px-1.5 py-1.5" onClick={() => router.push(PERSONAL_PORTAL_HOME)}>
                  Personal Portal
                </DropdownMenuItem>
              )}
              <DropdownMenuItem className="cursor-pointer px-1.5 py-1.5" onClick={() => router.push("/business/portal")}>
                Business Portal
              </DropdownMenuItem>
              {user?.is_admin && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="cursor-pointer px-1.5 py-1.5" onClick={async () => { await refreshAccessToken(); window.location.assign("/admin/overview"); }}>
                    Super Admin
                  </DropdownMenuItem>
                </>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem className="cursor-pointer px-1.5 py-1.5" variant="destructive" onClick={handleSignOut}>
                Sign Out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <div className="flex flex-1">
        <PortalSidebar groups={navGroups} />

        <main className={cn("min-w-0 flex-1 overflow-x-clip", isFullBleed ? "" : "py-4 md:py-6")}>
          {isFullBleed && !lockedOut ? content : <div className={isWide ? SHELL_WIDE : SHELL_WIDTH}>{content}</div>}
        </main>
      </div>
    </div>
  );
}
