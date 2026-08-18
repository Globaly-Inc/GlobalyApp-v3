"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CoverLogoEditor } from "@/components/cover-logo-editor";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { geoApi, type Country } from "@/app/geo/apis";
import { useAuthState, switchAccount } from "@/app/auth/store/auth-slice";
import { fetchMyProfile, updateMyProfile } from "@/app/business/store/business-onboarding-slice";
import { businessApi } from "@/app/business/apis";
import type { BusinessProfilePatch } from "../apis/types";
import { BusinessDetailsDialog } from "./business-details-dialog";
import { AdminSegmentedTabs } from "@/app/admin/components/admin-segmented-tabs";
import { BranchesTab } from "./components/tabs/branches-tab";
import { ServicesTab } from "./components/tabs/services-tab";
import { PartnersTab } from "./components/tabs/partners-tab";
import { MembersTab } from "./components/tabs/members-tab";
import { ActivityTab } from "./components/tabs/activity-tab";

const TABS = [
  { value: "branches", label: "Branches" },
  { value: "partners", label: "Partners" },
  { value: "members", label: "Members" },
  { value: "services", label: "Services" },
  { value: "activity", label: "Activity" },
] as const;

type Tab = (typeof TABS)[number]["value"];
const VALID_TABS: Tab[] = TABS.map((t) => t.value);
function parseTab(raw: string | null): Tab {
  return (VALID_TABS as string[]).includes(raw ?? "") ? (raw as Tab) : "branches";
}

export function BusinessProfileDetailView({ businessId }: Readonly<{ businessId: number }>) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const dispatch = useAppDispatch();
  const { profile, status } = useAppSelector((state) => state.businessOnboarding);
  const [countries, setCountries] = useState<Country[]>([]);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [contextReady, setContextReady] = useState(false);
  const [imageUploading, setImageUploading] = useState<"logo" | "cover" | null>(null);

  const { user: authUser, initializing } = useAuthState();
  const isBusiness = authUser?.user_category === "business";
  const tab = parseTab(searchParams.get("tab"));
  const setTab = (next: Tab) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", next);
    router.push(`${pathname}?${params.toString()}`);
  };

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
  const initial = profile.business_name?.[0]?.toUpperCase() ?? "B";

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

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden">
        <CoverLogoEditor
          coverUrl={profile.cover_url}
          onCoverFile={(file) => handleImageFile("cover", file)}
          coverUploading={imageUploading === "cover"}
          logoUrl={profile.logo_url}
          logoFallback={initial}
          onLogoFile={(file) => handleImageFile("logo", file)}
          logoUploading={imageUploading === "logo"}
        />
        <CardContent className="pt-16">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h1 className="text-xl font-bold text-foreground">{profile.business_name}</h1>
              <p className="text-sm text-muted-foreground">{profile.subdomain}</p>
            </div>
            <Button variant="ghost" size="icon-sm" onClick={() => setDetailsOpen(true)} aria-label="Edit business details">
              <Pencil className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      <div>
        <AdminSegmentedTabs options={TABS} value={tab} onChange={setTab} />
        <Card>
          <CardContent>
            {tab === "branches" && <BranchesTab businessId={businessId} />}
            {tab === "partners" && <PartnersTab businessId={businessId} businessName={profile.business_name} />}
            {tab === "members" && <MembersTab businessId={businessId} />}
            {tab === "services" && <ServicesTab businessId={businessId} />}
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
