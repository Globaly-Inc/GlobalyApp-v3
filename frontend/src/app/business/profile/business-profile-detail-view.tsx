"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Camera, Loader2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { geoApi, type Country } from "@/app/geo/apis";
import { useAuthState, switchAccount } from "@/app/auth/store/auth-slice";
import { fetchMyProfile, updateMyProfile } from "@/app/business/store/business-onboarding-slice";
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
  const [switched, setSwitched] = useState(false);

  const { user: authUser, initializing } = useAuthState();
  const isBusiness = authUser?.user_category === "business";
  const target = authUser?.businesses.find((b) => b.id === businessId);
  // Already in the right business context means we are ready without switching —
  // that is readable from the auth state during render, so only the switch itself
  // needs to land in state.
  const contextReady = (!!target && target.org_id === authUser?.orgId) || switched;
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
    if (!target) return;
    switchedRef.current = true;
    // Already in the right business context — BusinessShell has already fetched this
    // profile, and `contextReady` reads that from the auth state without a switch.
    if (target.org_id === authUser?.orgId) return;
    dispatch(switchAccount(target.org_id))
      .unwrap()
      .then(() => {
        setSwitched(true);
        dispatch(fetchMyProfile());
      })
      .catch((e: Error) => toast.error("Couldn't switch to this business", { description: e.message }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <Card className="overflow-hidden">
        <div className="relative h-40 bg-gradient-to-br from-primary to-primary/60 sm:h-48">
          <Button
            variant="secondary"
            size="sm"
            className="absolute right-4 top-4 gap-1.5"
            onClick={() => toast("Coming soon", { description: "Cover photo uploads aren't available yet." })}
          >
            <Camera className="h-4 w-4" /> Edit cover
          </Button>
          <Avatar className="absolute -bottom-12 left-6 size-24 border-4 border-background">
            {profile.logo_url && <AvatarImage src={profile.logo_url} alt={profile.business_name} />}
            <AvatarFallback className="text-2xl">{initial}</AvatarFallback>
          </Avatar>
        </div>
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
