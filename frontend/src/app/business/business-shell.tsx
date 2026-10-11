"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { currentOrgId, ensureBusinessContext } from "@/lib/api/http";
import { getSelectedOrgId, saveSelectedOrgId } from "@/lib/session";
import { authApi } from "@/app/auth/apis";
import type { AuthMeInstitution } from "@/app/auth/apis";
import { logout, useAuthState } from "@/app/auth/store/auth-slice";
import { fetchMyProfile } from "@/app/business/store/business-onboarding-slice";
import { useExtractionLock } from "./utils/use-extraction-lock";
import { BUSINESS_NAV_GROUPS, INSTITUTION_SCHOLARSHIPS_ITEM, withBusinessId } from "./const";
import { BusinessSwitcher, type SwitcherOrg } from "./components/business-switcher";
import { ExtractionInProgress } from "./components/extraction-in-progress";
import { PortalShell, type PortalWidth } from "@/components/portal-shell/portal-shell";
import { PortalHeaderLinks } from "@/components/portal-shell/portal-header";
import { PortalLoadError, PortalLoading } from "@/components/portal-shell/portal-status";
import { SHOW_HEADER_EXTRAS } from "@/app/personal/const";
import { SIGN_IN_HREF } from "@/app/auth/const";

/**
 * Routes that render edge-to-edge under the header (PortalShell `width="full"`). Chat is
 * an app surface, not a page in the content column: it owns the whole space below the
 * header and does its own bottom-nav math. Mirrors PersonalShell's list.
 */
const FULL_BLEED_ROUTES = ["/business/messages"] as const;
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
  // Business profile tabs (services, branches, scholarships, team…) and the visitors list are
  // wide tables — give them the full content width.
  const isWide = /^\/business\/profile\/\d/.test(pathname ?? "") || pathname === "/business/contacts/visitors";
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
    return contextReady ? <>{children}</> : <PortalLoading />;
  }

  if (mounted && status === "failed" && !profile) {
    return <PortalLoadError message={error ?? "Failed to load your business profile."} onSignOut={handleSignOut} />;
  }

  if (!contextReady || !profile) return <PortalLoading />;

  const isInstitution = institutionOrgIds.has(activeOrgId ?? "");
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
  // The extraction lock replaces even a full-bleed page, so it gets the normal content column.
  const width: PortalWidth = lockedOut ? "default" : isFullBleed ? "full" : isWide ? "wide" : "default";

  return (
    <PortalShell
      title="Business Portal"
      groups={navGroups}
      context={<BusinessSwitcher businesses={businesses} activeOrgId={activeOrgId} onSwitch={handleSwitchBusiness} />}
      headerActions={SHOW_HEADER_EXTRAS && <PortalHeaderLinks notificationsHref="/business/notifications" creditsHref="/business/credits" />}
      account={{
        name: [user?.first_name, user?.last_name].filter(Boolean).join(" "),
        email: user?.email,
        photoUrl: user?.photo_url,
        isAdmin: !!user?.is_admin,
      }}
      onSignOut={handleSignOut}
      width={width}
      // Chat owns the full height below the header, so it keeps the screen to itself on mobile.
      showMobileNav={!isFullBleed}
    >
      {lockedOut ? <ExtractionInProgress status={extractionStatus} /> : children}
    </PortalShell>
  );
}
