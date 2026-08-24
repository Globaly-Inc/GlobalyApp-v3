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
import { useAuthState, switchAccount } from "@/app/auth/store/auth-slice";
import { fetchMyProfile, updateMyProfile } from "@/app/business/store/business-onboarding-slice";
import { businessApi } from "@/app/business/apis";
import type { BusinessProfilePatch } from "../apis/types";
import { BusinessDetailsDialog } from "./business-details-dialog";
import { BranchesTab } from "./components/tabs/branches-tab";
import { ServicesTab } from "./components/tabs/services-tab";
import { PartnersTab } from "./components/tabs/partners-tab";
import { MembersTab } from "./components/tabs/members-tab";
import { ScholarshipsTab } from "./components/tabs/scholarships-tab";
import { ActivityTab } from "./components/tabs/activity-tab";
import { ProfileTab } from "./components/tabs/profile-tab";
import { ProfileHeaderCard } from "./components/profile-header-card";

// Tab switching happens only via the sidebar (`BUSINESS_NAV_GROUPS`) — this page renders no
// second, in-content tab strip.
const VALID_TABS = ["profile", "branches", "partners", "team", "services", "scholarships", "activity"] as const;
type Tab = (typeof VALID_TABS)[number];
function parseTab(raw: string | null): Tab {
  return (VALID_TABS as readonly string[]).includes(raw ?? "") ? (raw as Tab) : "profile";
}

export function BusinessProfileDetailView({ businessId }: Readonly<{ businessId: number }>) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const dispatch = useAppDispatch();
  const { profile, status } = useAppSelector((state) => state.businessOnboarding);
  const [countries, setCountries] = useState<Country[]>([]);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [contextReady, setContextReady] = useState(false);
  const [imageUploading, setImageUploading] = useState<"logo" | "cover" | null>(null);
  const [previewMode, setPreviewMode] = useState(false);

  const { user: authUser, initializing } = useAuthState();
  const isBusiness = authUser?.user_category === "business";
  const tab = parseTab(searchParams.get("tab"));

  useEffect(() => {
    if (initializing) return;
    if (!authUser) router.replace("/auth/sign-in");
    else if (authUser.type === "admin") router.replace("/admin/overview");
    else if (!isBusiness) router.replace("/personal/profile");
  }, [initializing, authUser, isBusiness, router]);

  const switchedRef = useRef(false);
  useEffect(() => {
    if (initializing || !isBusiness || switchedRef.current) return;
    const target = authUser?.businesses.find((b) => b.id === businessId);
    if (!target) return;
    switchedRef.current = true;
    if (target.org_id === authUser?.orgId) {
      // Already in the right business context — BusinessShell has already fetched this profile.
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
  }, [initializing, isBusiness, authUser, businessId, dispatch]);

  useEffect(() => {
    if (!isBusiness) return;
    geoApi.getCountries().then(setCountries).catch(() => setCountries([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isBusiness]);

  if (initializing || !isBusiness || !contextReady || !profile) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const saving = status === "saving";

  const handleSaveDetails = async (patch: BusinessProfilePatch) => {
    const result = await dispatch(updateMyProfile(patch));
    if (updateMyProfile.rejected.match(result)) {
      toast.error("Couldn't save", { description: result.error.message ?? "Please try again." });
      return false;
    }
    return true;
  };

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

  return (
    <div className="space-y-4">
      {tab === "profile" && (
      <>
      <div className="flex items-center justify-end gap-3">
        <Button variant="outline" size="sm" onClick={() => setPreviewMode((v) => !v)}>
          <Eye className="mr-1.5 h-3.5 w-3.5" /> {previewMode ? "Exit preview" : "Preview"}
        </Button>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">{profile.is_published ? "Published" : "Unpublished"}</span>
          <Switch checked={profile.is_published} onCheckedChange={handleTogglePublished} />
        </div>
      </div>

      <ProfileHeaderCard
        profile={profile}
        countries={countries}
        previewMode={previewMode}
        onCoverFile={(file) => handleImageFile("cover", file)}
        coverUploading={imageUploading === "cover"}
        onLogoFile={(file) => handleImageFile("logo", file)}
        logoUploading={imageUploading === "logo"}
        onEditDetails={() => setDetailsOpen(true)}
      />
      </>
      )}

      <div>
        <Card>
          <CardContent>
            {tab === "profile" && <ProfileTab profile={profile} countries={countries} readOnly={previewMode} />}
            {tab === "branches" && <BranchesTab businessId={businessId} />}
            {tab === "partners" && <PartnersTab businessId={businessId} businessName={profile.business_name} />}
            {tab === "team" && <MembersTab businessId={businessId} />}
            {tab === "services" && <ServicesTab businessId={businessId} />}
            {tab === "scholarships" && <ScholarshipsTab businessId={businessId} />}
            {tab === "activity" && <ActivityTab businessId={businessId} />}
          </CardContent>
        </Card>
      </div>

      <BusinessDetailsDialog
        open={detailsOpen}
        onOpenChange={setDetailsOpen}
        profile={profile}
        countries={countries}
        onSave={handleSaveDetails}
        saving={saving}
      />
    </div>
  );
}
