"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowLeft, CheckCircle, EyeOff, Globe, Loader2, Mail, Pencil, XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { AdminSegmentedTabs } from "@/app/admin/components/admin-segmented-tabs";
import {
  fetchBusinessDetail, updateBusinessDetail, updateBusinessPublished, updateBusinessStatus, updateEnquirySettings,
} from "../store/businesses-slice";
import { STATUS_COLORS, STATUS_LABELS } from "../const";
import type { BusinessPatch, BusinessStatus } from "../apis/types";
import { ActivityTab } from "./tabs/activity-tab";
import { BranchesTab } from "./tabs/branches-tab";
import { BusinessHeaderCard } from "./business-detail/business-header-card";
import { BusinessHeaderDialog } from "./business-detail/business-header-dialog";
import { BusinessOverviewDialog } from "./business-detail/business-overview-dialog";
import { ContactsTab } from "./tabs/contacts-tab";
import { EditableNumberField } from "./shared/editable-number-field";
import { MembersTab } from "./tabs/members-tab";
import { PartnersTab } from "./tabs/partners-tab";
import { ServicesTab } from "./tabs/services-tab";
import { fetchBusinessCategoryOptions, fetchCountries } from "@/app/admin/platform/categories/store/categories-slice";

const TABS = [
  { value: "branches", label: "Branches" },
  { value: "partners", label: "Partners" },
  { value: "members", label: "Members" },
  { value: "contacts", label: "Contacts" },
  { value: "services", label: "Services" },
  { value: "activity", label: "Activity" },
] as const;

type Tab = (typeof TABS)[number]["value"];

const VALID_TABS: Tab[] = TABS.map((t) => t.value);

function parseTab(raw: string | null): Tab {
  return (VALID_TABS as string[]).includes(raw ?? "") ? (raw as Tab) : "branches";
}

export function BusinessDetailView({ id }: Readonly<{ id: number }>) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const dispatch = useAppDispatch();
  const { detail: business, detailStatus, detailError } = useAppSelector((state) => state.platformBusinesses);
  const categories = useAppSelector((state) => state.platformCategories.businessCategoryOptions);
  const countries = useAppSelector((state) => state.platformCategories.countries);
  const tab = parseTab(searchParams.get("tab"));
  const setTab = (next: Tab) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", next);
    router.push(`${pathname}?${params.toString()}`);
  };
  const [saving, setSaving] = useState(false);
  const [publishBusy, setPublishBusy] = useState(false);
  const [headerOpen, setHeaderOpen] = useState(false);
  const [overviewOpen, setOverviewOpen] = useState(false);
  const [descExpanded, setDescExpanded] = useState(false);

  const fetchedIdRef = useRef<number | null>(null);
  useEffect(() => {
    if (fetchedIdRef.current === id) return;
    fetchedIdRef.current = id;
    dispatch(fetchBusinessDetail(id));
  }, [dispatch, id]);

  const fetchedCatalogRef = useRef(false);

  useEffect(() => {
    if (fetchedCatalogRef.current) return;
    fetchedCatalogRef.current = true;
    if (categories.length === 0) dispatch(fetchBusinessCategoryOptions());
    if (countries.length === 0) dispatch(fetchCountries());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (detailStatus === "loading" || !business) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        {detailStatus === "failed" ? (
          <p className="text-sm text-destructive">{detailError}</p>
        ) : (
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        )}
      </div>
    );
  }

  const location = [business.address, business.city, business.state, business.country_name].filter(Boolean).join(", ");
  const canVerify = !(business.status === "unverified" && business.is_unclaimed);

  const handleSave = async (patch: BusinessPatch) => {
    setSaving(true);
    const result = await dispatch(updateBusinessDetail({ id: business.id, patch }));
    setSaving(false);
    if (updateBusinessDetail.rejected.match(result)) {
      toast.error("Couldn't save", { description: result.error.message ?? "Please try again." });
      return false;
    }
    toast.success("Business updated");
    return true;
  };

  const runStatus = async (status: BusinessStatus) => {
    try {
      // The detail page is business-only — institutions have no detail route here.
      await dispatch(updateBusinessStatus({ kind: "business", id: business.id, status })).unwrap();
      toast.success(`Business ${STATUS_LABELS[status].toLowerCase()}`);
    } catch (e) {
      toast.error("Couldn't update status", { description: (e as Error).message });
    }
  };

  const runTogglePublish = async () => {
    setPublishBusy(true);
    try {
      await dispatch(updateBusinessPublished({ kind: "business", id: business.id, is_published: !business.is_published })).unwrap();
      toast.success(business.is_published ? "Business unpublished" : "Business published");
    } catch (e) {
      toast.error("Couldn't update publish status", { description: (e as Error).message });
    } finally {
      setPublishBusy(false);
    }
  };

  const runEnquiryPatch = async (patch: Parameters<typeof updateEnquirySettings>[0]["patch"]) => {
    try {
      await dispatch(updateEnquirySettings({ id: business.id, patch })).unwrap();
      toast.success("Enquiry settings updated");
    } catch (e) {
      toast.error("Couldn't update enquiry settings", { description: (e as Error).message });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="ghost" className="gap-1.5" onClick={() => router.push("/admin/platform/businesses")}>
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
        <div className="flex flex-wrap items-center gap-2">
          {business.status !== "verified" && (
            <div className="text-right">
              <Button className="h-10" variant="outline" onClick={() => runStatus("verified")} disabled={!canVerify}>
                <CheckCircle className="mr-1.5 h-3.5 w-3.5" />
                {business.status === "suspended" ? "Reinstate" : "Verify"}
              </Button>
              {!canVerify && <p className="mt-0.5 text-[11px] text-muted-foreground">Available after the owner claims this profile.</p>}
            </div>
          )}
          {business.status === "verified" && (
            <Button className="h-10 border-destructive/30 text-destructive hover:bg-destructive/10" variant="outline" onClick={() => runStatus("suspended")}>
              <XCircle className="mr-1.5 h-3.5 w-3.5" /> Suspend
            </Button>
          )}
          {business.is_published ? (
            <Button className="h-10" variant="outline" disabled={publishBusy} onClick={runTogglePublish}>
              <EyeOff className="mr-1.5 h-3.5 w-3.5" /> Unpublish
            </Button>
          ) : (
            <Button className="h-10" disabled={publishBusy || business.status !== "verified"} onClick={runTogglePublish}>
              <Globe className="mr-1.5 h-3.5 w-3.5" /> Publish
            </Button>
          )}
        </div>
      </div>

      <BusinessHeaderCard business={business} location={location} onSave={handleSave} onEdit={() => setHeaderOpen(true)} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-1">
          <Card>
            <CardContent>
              <h2 className="mb-3 text-sm font-semibold">Overview</h2>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-muted-foreground">Status</p>
                  <Badge className={STATUS_COLORS[business.status]}>{STATUS_LABELS[business.status]}</Badge>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Source</p>
                  <p className="text-sm font-medium">{business.is_unclaimed ? "Pre-seeded" : "Claimed"}</p>
                </div>
              </div>

              <div className="mt-4 flex items-start justify-between gap-2">
                <p className="text-xs text-muted-foreground">Description</p>
                <Button variant="ghost" size="icon-sm" onClick={() => setOverviewOpen(true)} aria-label="Edit description">
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
              </div>
              {business.description ? (
                <>
                  <div
                    className={
                      descExpanded
                        ? "prose prose-sm dark:prose-invert max-w-none text-foreground"
                        : "prose prose-sm dark:prose-invert line-clamp-3 max-w-none text-foreground"
                    }
                    dangerouslySetInnerHTML={{ __html: business.description }}
                  />
                  <button type="button" className="mt-1 text-xs font-medium text-primary" onClick={() => setDescExpanded((v) => !v)}>
                    {descExpanded ? "Show less" : "Show more"}
                  </button>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">No description yet.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <h2 className="mb-3 text-sm font-semibold">Enquiry Settings</h2>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-sm">
                  <Mail className="h-3.5 w-3.5 text-muted-foreground" /> Enabled
                </span>
                <Switch
                  checked={business.enquiry_enabled}
                  onCheckedChange={(checked) => runEnquiryPatch({ enquiry_enabled: checked })}
                />
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <EditableNumberField
                  label="Coin Cost per Unlock"
                  value={business.enquiry_coin_cost}
                  onSave={(next) => runEnquiryPatch({ enquiry_coin_cost: next })}
                />
                <EditableNumberField
                  label="Max Distributions"
                  value={business.enquiry_max_distributions}
                  onSave={(next) => runEnquiryPatch({ enquiry_max_distributions: next })}
                />
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-2">
          <AdminSegmentedTabs options={TABS} value={tab} onChange={setTab} />
          <Card>
            <CardContent>
              {tab === "branches" && <BranchesTab businessId={business.id} />}
              {tab === "partners" && <PartnersTab businessId={business.id} businessName={business.business_name} />}
              {tab === "members" && <MembersTab businessId={business.id} />}
              {tab === "contacts" && <ContactsTab businessId={business.id} />}
              {tab === "services" && <ServicesTab businessId={business.id} />}
              {tab === "activity" && <ActivityTab businessId={business.id} />}
            </CardContent>
          </Card>
        </div>
      </div>

      <BusinessHeaderDialog open={headerOpen} onOpenChange={setHeaderOpen} business={business} categories={categories} countries={countries} onSave={handleSave} saving={saving} />
      <BusinessOverviewDialog open={overviewOpen} onOpenChange={setOverviewOpen} business={business} onSave={handleSave} saving={saving} />
    </div>
  );
}
