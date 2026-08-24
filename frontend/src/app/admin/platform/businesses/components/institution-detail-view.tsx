"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Building2, CheckCircle, EyeOff, Globe, Loader2, Mail, Pencil, Phone, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { AdminSegmentedTabs } from "@/app/admin/components/admin-segmented-tabs";
import { fetchCountries } from "@/app/admin/platform/categories/store/categories-slice";
import { STATUS_COLORS, STATUS_LABELS } from "../const";
import {
  fetchInstitutionDetail, updateInstitutionDetail, updateInstitutionPublished, updateInstitutionStatus,
} from "../store/institution-detail-slice";
import type { BusinessStatus, InstitutionPatch } from "../apis/types";
import { InstitutionCoursesTab } from "./tabs/institution-courses-tab";
import { InstitutionMembersTab } from "./tabs/institution-members-tab";
import { InstitutionHeaderDialog } from "./institution-header-dialog";
import { InstitutionOverviewDialog } from "./institution-overview-dialog";

// Tab keys/labels match the business detail page's (Members, Services) — institutions render
// courses under the "services" tab so links built for either kind (e.g. `?tab=services`) work.
const TABS = [
  { value: "members", label: "Members" },
  { value: "services", label: "Services" },
] as const;

type Tab = (typeof TABS)[number]["value"];

const VALID_TABS: Tab[] = TABS.map((t) => t.value);

function parseTab(raw: string | null): Tab {
  return (VALID_TABS as string[]).includes(raw ?? "") ? (raw as Tab) : "members";
}

export function InstitutionDetailView({ id }: Readonly<{ id: number }>) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const dispatch = useAppDispatch();
  const { detail: institution, detailStatus, detailError } = useAppSelector((state) => state.platformInstitutionDetail);
  const countries = useAppSelector((state) => state.platformCategories.countries);
  const [publishBusy, setPublishBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [headerOpen, setHeaderOpen] = useState(false);
  const [overviewOpen, setOverviewOpen] = useState(false);
  const tab = parseTab(searchParams.get("tab"));
  const setTab = (next: Tab) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", next);
    router.push(`${pathname}?${params.toString()}`);
  };

  const fetchedIdRef = useRef<number | null>(null);
  useEffect(() => {
    if (fetchedIdRef.current === id) return;
    fetchedIdRef.current = id;
    dispatch(fetchInstitutionDetail(id));
  }, [dispatch, id]);

  const fetchedCountriesRef = useRef(false);
  useEffect(() => {
    if (fetchedCountriesRef.current) return;
    fetchedCountriesRef.current = true;
    if (countries.length === 0) dispatch(fetchCountries());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (detailStatus === "loading" || !institution) {
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

  const location = [institution.address, institution.city, institution.state, institution.country_name].filter(Boolean).join(", ");
  const canVerify = !(institution.status === "unverified" && institution.is_unclaimed);

  const runStatus = async (status: BusinessStatus) => {
    try {
      await dispatch(updateInstitutionStatus({ id: institution.id, status })).unwrap();
      toast.success(`Institution ${STATUS_LABELS[status].toLowerCase()}`);
    } catch (e) {
      toast.error("Couldn't update status", { description: (e as Error).message });
    }
  };

  const handleSave = async (patch: InstitutionPatch) => {
    setSaving(true);
    const result = await dispatch(updateInstitutionDetail({ id: institution.id, patch }));
    setSaving(false);
    if (updateInstitutionDetail.rejected.match(result)) {
      toast.error("Couldn't save", { description: result.error.message ?? "Please try again." });
      return false;
    }
    toast.success("Institution updated");
    return true;
  };

  const runTogglePublish = async () => {
    setPublishBusy(true);
    try {
      await dispatch(updateInstitutionPublished({ id: institution.id, is_published: !institution.is_published })).unwrap();
      toast.success(institution.is_published ? "Institution unpublished" : "Institution published");
    } catch (e) {
      toast.error("Couldn't update publish status", { description: (e as Error).message });
    } finally {
      setPublishBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="ghost" className="gap-1.5" onClick={() => router.push("/admin/platform/businesses")}>
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
        <div className="flex flex-wrap items-center gap-2">
          {institution.status !== "verified" && (
            <div className="text-right">
              <Button className="h-10" variant="outline" onClick={() => runStatus("verified")} disabled={!canVerify}>
                <CheckCircle className="mr-1.5 h-3.5 w-3.5" />
                {institution.status === "suspended" ? "Reinstate" : "Verify"}
              </Button>
              {!canVerify && <p className="mt-0.5 text-[11px] text-muted-foreground">Available after the owner claims this profile.</p>}
            </div>
          )}
          {institution.status === "verified" && (
            <Button className="h-10 border-destructive/30 text-destructive hover:bg-destructive/10" variant="outline" onClick={() => runStatus("suspended")}>
              <XCircle className="mr-1.5 h-3.5 w-3.5" /> Suspend
            </Button>
          )}
          {institution.is_published ? (
            <Button className="h-10" variant="outline" disabled={publishBusy} onClick={runTogglePublish}>
              <EyeOff className="mr-1.5 h-3.5 w-3.5" /> Unpublish
            </Button>
          ) : (
            <Button className="h-10" disabled={publishBusy || institution.status !== "verified"} onClick={runTogglePublish}>
              <Globe className="mr-1.5 h-3.5 w-3.5" /> Publish
            </Button>
          )}
        </div>
      </div>

      <Card className="overflow-hidden">
        <CardContent className="flex items-start gap-4 pt-6">
          <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center overflow-hidden rounded-xl bg-muted">
            {institution.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={institution.logo_url} alt="" className="h-full w-full object-contain p-1" />
            ) : (
              <Building2 className="h-6 w-6 text-muted-foreground" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-lg font-bold text-foreground">{institution.business_name}</h1>
              <Badge variant="outline" className="border-sky-200 text-sky-700">Institution</Badge>
              <Badge className={STATUS_COLORS[institution.status]}>{STATUS_LABELS[institution.status]}</Badge>
            </div>
            {location && <p className="mt-1 text-sm text-muted-foreground">{location}</p>}
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
              {institution.email && (
                <span className="flex items-center gap-1.5">
                  <Mail className="h-3.5 w-3.5" /> {institution.email}
                </span>
              )}
              {institution.phone && (
                <span className="flex items-center gap-1.5">
                  <Phone className="h-3.5 w-3.5" /> {institution.phone}
                </span>
              )}
            </div>
          </div>
          <Button variant="ghost" size="icon-sm" onClick={() => setHeaderOpen(true)} aria-label="Edit institution">
            <Pencil className="h-4 w-4" />
          </Button>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardContent>
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold">Overview</h2>
              <Button variant="ghost" size="icon-sm" onClick={() => setOverviewOpen(true)} aria-label="Edit description">
                <Pencil className="h-3.5 w-3.5" />
              </Button>
            </div>
            {institution.description ? (
              <div
                className="prose prose-sm dark:prose-invert max-w-none text-foreground"
                dangerouslySetInnerHTML={{ __html: institution.description }}
              />
            ) : (
              <p className="text-sm text-muted-foreground">No description yet.</p>
            )}
            {institution.website && (
              <a href={institution.website} target="_blank" rel="noreferrer" className="mt-3 block text-sm text-primary underline">
                {institution.website}
              </a>
            )}
            <div className="mt-4 space-y-1 text-xs text-muted-foreground">
              <p>Subdomain: {institution.subdomain}</p>
              <p>Source: {institution.is_unclaimed ? "Pre-seeded" : "Claimed"}</p>
            </div>
          </CardContent>
        </Card>

        <div className="lg:col-span-2">
          <AdminSegmentedTabs options={institution.source_job_id ? TABS : TABS.filter((t) => t.value !== "services")} value={tab} onChange={setTab} />
          <Card>
            <CardContent>
              {tab === "members" && <InstitutionMembersTab institutionId={institution.id} />}
              {tab === "services" && institution.source_job_id && <InstitutionCoursesTab institutionId={institution.id} />}
            </CardContent>
          </Card>
        </div>
      </div>

      <InstitutionHeaderDialog
        open={headerOpen}
        onOpenChange={setHeaderOpen}
        institution={institution}
        countries={countries}
        onSave={handleSave}
        saving={saving}
      />
      <InstitutionOverviewDialog
        open={overviewOpen}
        onOpenChange={setOverviewOpen}
        institution={institution}
        onSave={handleSave}
        saving={saving}
      />
    </div>
  );
}
