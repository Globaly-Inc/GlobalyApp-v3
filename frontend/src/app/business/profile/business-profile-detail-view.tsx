"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Eye, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { geoApi, type Country } from "@/app/geo/apis";
import { fetchMe, useAuthState, switchAccount } from "@/app/auth/store/auth-slice";
import { fetchMyProfile, updateMyProfile } from "@/app/business/store/business-onboarding-slice";
import { businessApi } from "@/app/business/apis";
import type { SocialLinks } from "@/app/business/apis/types";
import { authApi } from "@/app/auth/apis";
import { SocialLinksDialog } from "./components/social-links-dialog";
import { BranchesTab } from "./components/tabs/branches-tab";
import { ServicesTab } from "./components/tabs/services-tab";
import { PartnersTab } from "./components/tabs/partners-tab";
import { MembersTab } from "./components/tabs/members-tab";
import { ScholarshipsTab } from "./components/tabs/scholarships-tab";
import { ActivityTab } from "./components/tabs/activity-tab";
import { ProfileTab } from "./components/tabs/profile-tab";
import { ProfileHeaderCard } from "./components/profile-header-card";
import { SiteUrlsCard } from "../portal/components/site-urls-card";

// Tab switching happens only via the sidebar (`BUSINESS_NAV_GROUPS`) — this page renders no
// second, in-content tab strip.
const VALID_TABS = ["profile", "branches", "partners", "team", "services", "scholarships", "activity", "site_mapping"] as const;
type Tab = (typeof VALID_TABS)[number];
function parseTab(raw: string | null): Tab {
  return (VALID_TABS as readonly string[]).includes(raw ?? "") ? (raw as Tab) : "profile";
}

// Mirrors backend's `courseSlug(name, id)` scheme (see courses.routes.ts) used for institution
// public URLs: slugified name + the id zero-padded to 6 digits, no dedicated slug column.
function institutionPublicSlug(name: string, id: number): string {
  const slugified = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${slugified}-${String(id).padStart(6, "0")}`;
}

export function BusinessProfileDetailView({ businessId }: Readonly<{ businessId: number }>) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const dispatch = useAppDispatch();
  const { profile } = useAppSelector((state) => state.businessOnboarding);
  const [countries, setCountries] = useState<Country[]>([]);
  const [socialOpen, setSocialOpen] = useState(false);
  const [savingSocials, setSavingSocials] = useState(false);
  const [contextReady, setContextReady] = useState(false);
  const [imageUploading, setImageUploading] = useState<"logo" | "cover" | null>(null);

  const { user: authUser, initializing } = useAuthState();
  const isBusiness = authUser?.user_category === "business";
  const isInstitution = authUser?.user_category === "institution";
  // Membership lists are the authoritative source for whether THIS businessId is a business or
  // institution — user_category only gives the primary role, so a dual-role user always resolves
  // to "business" even when they're viewing an institution profile.
  const isViewingInstitution =
    !authUser?.businesses.some((b) => b.id === businessId) &&
    !!authUser?.institutions.some((i) => i.id === businessId);
  const parsedTab = parseTab(searchParams.get("tab"));
  // Partners/Scholarships/Activity have no institution-side data — the sidebar never links
  // there for an institution, but fall back to profile if the URL is edited directly. Branches
  // DOES apply to institutions (a university's own campuses) and is linked from the sidebar.
  const institutionTabAllowed = ["profile", "branches", "team", "services", "partners", "scholarships", "site_mapping"].includes(parsedTab);
  const isDisallowedForRole = (isInstitution && !institutionTabAllowed) || (isBusiness && parsedTab === "scholarships");
  const tab = isDisallowedForRole ? "profile" : parsedTab;

  useEffect(() => {
    if (initializing) return;
    if (!authUser) router.replace("/auth/sign-in");
    // A business/institution membership takes priority over `type` — a super-admin who
    // also owns or manages a business must still be able to view it, not get bounced to
    // the admin dashboard just because their session is admin-typed.
    else if (isBusiness || isInstitution) return;
    else if (authUser.type === "admin") router.replace("/admin/overview");
    else router.replace("/personal/profile");
  }, [initializing, authUser, isBusiness, isInstitution, router]);

  const switchedRef = useRef(false);
  const refetchedMeRef = useRef(false);
  useEffect(() => {
    if (initializing || (!isBusiness && !isInstitution) || switchedRef.current) return;
    // Search both lists — user_category picks the primary role, so a dual-role user has
    // isBusiness=true even when navigating to an institution profile.
    const target =
      authUser?.businesses.find((b) => b.id === businessId) ??
      authUser?.institutions.find((i) => i.id === businessId);
    if (!target) {
      // This business/institution isn't in the session's cached membership list — most likely
      // the user was granted access after login and /auth/me hasn't been refetched since. Try
      // once before giving up, instead of leaving the page stuck on its loading spinner forever.
      if (!refetchedMeRef.current) {
        refetchedMeRef.current = true;
        dispatch(fetchMe());
      } else {
        toast.error("Couldn't load this business", { description: "You may not have access to it, or your session is out of date." });
      }
      return;
    }
    switchedRef.current = true;
    if (target.org_id === authUser?.orgId) {
      // Already in the right org context — BusinessShell has already fetched this profile.
      setContextReady(true);
      return;
    }
    dispatch(switchAccount(target.org_id))
      .unwrap()
      .then(() => {
        setContextReady(true);
        dispatch(fetchMyProfile());
      })
      .catch((e: Error) => toast.error("Couldn't switch to this business", { description: e.message }));
  }, [initializing, isBusiness, isInstitution, authUser, businessId, dispatch]);

  useEffect(() => {
    if (!isBusiness && !isInstitution) return;
    geoApi.getCountries().then(setCountries).catch(() => setCountries([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isBusiness, isInstitution]);

  if (initializing || (!isBusiness && !isInstitution) || !contextReady || !profile) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const handleImageFile = async (category: "logo" | "cover", file: File) => {
    setImageUploading(category);
    try {
      await businessApi.uploadImage(category, file);
      await dispatch(fetchMyProfile());
    } catch (e) {
      toast.error("Upload failed", { description: e instanceof Error ? e.message : "Please try again." });
    } finally {
      setImageUploading(null);
    }
  };

  const handleTogglePublished = async (is_published: boolean) => {
    const result = await dispatch(updateMyProfile({ is_published }));
    if (updateMyProfile.rejected.match(result)) {
      toast.error("Couldn't update", { description: result.error.message ?? "Please try again." });
      return;
    }
    toast.success(is_published ? "Profile published" : "Profile unpublished");
  };

  const handleSaveSocials = async (patch: Partial<SocialLinks>) => {
    setSavingSocials(true);
    try {
      await dispatch(updateMyProfile(patch)).unwrap();
      toast.success("Social links updated");
      return true;
    } catch (e) {
      toast.error("Couldn't save social links", { description: (e as Error).message });
      return false;
    } finally {
      setSavingSocials(false);
    }
  };

  return (
    <div className="space-y-4 md:space-y-6">
      {/* V1's profile body is a column of bordered cards, not one card wrapping everything — so
          only the other tabs, which are tables and lists, keep the outer <Card>. */}
      {tab === "profile" ? (
        <>
          <div className="flex flex-wrap items-center justify-end gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (!isViewingInstitution) {
                  window.open(`/business/${profile.subdomain}`, "_blank");
                  return;
                }
                // Mints a short-lived, single-purpose preview token (never the caller's own
                // session access token) so an unpublished institution's owner can still preview
                // it — see issuePreviewToken (backend) and the matching bypass in
                // findPublicInstitutionBySlug. Opens the tab synchronously (inside the click
                // gesture) so popup blockers don't catch it, then redirects once the token
                // comes back.
                const path = `/institution/${institutionPublicSlug(profile.business_name, profile.id)}`;
                const tab = window.open("", "_blank");
                authApi.mintPreviewToken()
                  .then(({ preview_token }) => {
                    if (tab) tab.location.href = `${path}?preview_token=${encodeURIComponent(preview_token)}`;
                  })
                  .catch(() => { if (tab) tab.location.href = path; });
              }}
            >
              <Eye className="mr-1.5 h-3.5 w-3.5" /> Preview
            </Button>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">{profile.is_published ? "Published" : "Unpublished"}</span>
              <Switch checked={profile.is_published} onCheckedChange={handleTogglePublished} />
            </div>
          </div>

          <ProfileHeaderCard
            profile={profile}
            countries={countries}
            previewMode={false}
            onCoverFile={(file) => handleImageFile("cover", file)}
            coverUploading={imageUploading === "cover"}
            onLogoFile={(file) => handleImageFile("logo", file)}
            logoUploading={imageUploading === "logo"}
            onEditSocials={() => setSocialOpen(true)}
          />

          <ProfileTab profile={profile} countries={countries} isInstitution={isViewingInstitution} />
        </>
      ) : tab === "site_mapping" ? (
        <SiteUrlsCard />
      ) : (
        <Card>
          <CardContent>
            {tab === "branches" && <BranchesTab businessId={businessId} isInstitution={isViewingInstitution} />}
            {tab === "partners" && (
              <PartnersTab businessId={businessId} businessName={profile.business_name} isInstitution={isViewingInstitution} />
            )}
            {tab === "team" && <MembersTab businessId={businessId} />}
            {tab === "services" && <ServicesTab businessId={businessId} readOnly={isViewingInstitution} />}
            {tab === "scholarships" && <ScholarshipsTab businessId={businessId} />}
            {tab === "activity" && <ActivityTab businessId={businessId} />}
          </CardContent>
        </Card>
      )}

      <SocialLinksDialog
        open={socialOpen}
        onOpenChange={setSocialOpen}
        profile={profile}
        onSave={handleSaveSocials}
        saving={savingSocials}
      />
    </div>
  );
}
