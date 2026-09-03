"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, CheckCircle, EyeOff, Globe, Loader2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { fetchBusinessCategories, fetchCountries } from "@/app/admin/platform/categories/store/categories-slice";
import {
  fetchBusinessDetail, updateBusinessDetail, updateBusinessPublished, updateBusinessStatus, updateEnquirySettings,
} from "../store/businesses-slice";
import {
  fetchInstitutionDetail, updateInstitutionDetail, updateInstitutionPublished, updateInstitutionStatus,
} from "../store/institution-detail-slice";
import { STATUS_COLORS, STATUS_LABELS } from "../const";
import type { BusinessPatch, BusinessStatus, InstitutionPatch } from "../apis/types";
import { BusinessHeaderCard } from "./business-detail/business-header-card";
import { BusinessHeaderDialog } from "./business-detail/business-header-dialog";
import { BusinessOverviewDialog } from "./business-detail/business-overview-dialog";
import { InstitutionHeaderCard } from "./institution-header-card";
import { InstitutionHeaderDialog } from "./institution-header-dialog";
import { InstitutionOverviewDialog } from "./institution-overview-dialog";
import { DetailSidebar } from "./detail-sidebar";
import { DetailTabs } from "./detail-tabs";

export function DetailView({ kind, id }: Readonly<{ kind: "business" | "institution"; id: number }>) {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const business = useAppSelector((state) => state.platformBusinesses.detail);
  const businessStatus = useAppSelector((state) => state.platformBusinesses.detailStatus);
  const businessError = useAppSelector((state) => state.platformBusinesses.detailError);
  const institution = useAppSelector((state) => state.platformInstitutionDetail.detail);
  const institutionStatus = useAppSelector((state) => state.platformInstitutionDetail.detailStatus);
  const institutionError = useAppSelector((state) => state.platformInstitutionDetail.detailError);
  const categories = useAppSelector((state) => state.platformCategories.businessCategories.data);
  const countries = useAppSelector((state) => state.platformCategories.countries);

  const [saving, setSaving] = useState(false);
  const [publishBusy, setPublishBusy] = useState(false);
  const [headerOpen, setHeaderOpen] = useState(false);
  const [overviewOpen, setOverviewOpen] = useState(false);

  const fetchedRef = useRef<string | null>(null);
  useEffect(() => {
    const key = `${kind}-${id}`;
    if (fetchedRef.current === key) return;
    fetchedRef.current = key;
    if (kind === "business") {
      if (business?.id !== id) dispatch(fetchBusinessDetail(id));
    } else if (institution?.id !== id) {
      dispatch(fetchInstitutionDetail(id));
    }
  }, [dispatch, kind, id]);

  const fetchedCatalogRef = useRef(false);
  useEffect(() => {
    if (fetchedCatalogRef.current) return;
    fetchedCatalogRef.current = true;
    if (kind === "business" && categories.length === 0) dispatch(fetchBusinessCategories({}));
    if (countries.length === 0) dispatch(fetchCountries());
  }, []);

  const detail = kind === "business" ? business : institution;
  const detailStatus = kind === "business" ? businessStatus : institutionStatus;
  const detailError = kind === "business" ? businessError : institutionError;

  if (detailStatus === "loading" || !detail) {
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

  const location = [detail.address, detail.city, detail.state, detail.country_name].filter(Boolean).join(", ");
  const canVerify = !(detail.status === "unverified" && detail.is_unclaimed);
  // The owner has claimed this listing — superadmin can view its details but not edit them.
  const readOnly = !detail.is_unclaimed;
  // Pre-seeded businesses have no tenant schema yet, so their branches/services tabs read
  // the source extraction job's campuses/courses instead — those rows aren't editable here.
  const isPreSeeded = kind === "business" && business?.account_status === 0 && !!business.source_job_id;

  const handleSave = async (patch: BusinessPatch | InstitutionPatch) => {
    setSaving(true);
    if (kind === "business") {
      const result = await dispatch(updateBusinessDetail({ id, patch: patch as BusinessPatch }));
      setSaving(false);
      if (updateBusinessDetail.rejected.match(result)) {
        toast.error("Couldn't save", { description: result.error.message ?? "Please try again." });
        return false;
      }
      toast.success("Business updated");
      return true;
    }
    const result = await dispatch(updateInstitutionDetail({ id, patch: patch as InstitutionPatch }));
    setSaving(false);
    if (updateInstitutionDetail.rejected.match(result)) {
      toast.error("Couldn't save", { description: result.error.message ?? "Please try again." });
      return false;
    }
    toast.success("Institution updated");
    return true;
  };

  const runStatus = async (status: BusinessStatus) => {
    try {
      if (kind === "business") await dispatch(updateBusinessStatus({ kind: "business", id, status })).unwrap();
      else await dispatch(updateInstitutionStatus({ id, status })).unwrap();
      toast.success(`${kind === "business" ? "Business" : "Institution"} ${STATUS_LABELS[status].toLowerCase()}`);
    } catch (e) {
      toast.error("Couldn't update status", { description: (e as Error).message });
    }
  };

  const runTogglePublish = async () => {
    setPublishBusy(true);
    try {
      if (kind === "business") await dispatch(updateBusinessPublished({ kind: "business", id, is_published: !detail.is_published })).unwrap();
      else await dispatch(updateInstitutionPublished({ id, is_published: !detail.is_published })).unwrap();
      toast.success(detail.is_published ? "Unpublished" : "Published");
    } catch (e) {
      toast.error("Couldn't update publish status", { description: (e as Error).message });
    } finally {
      setPublishBusy(false);
    }
  };

  const runEnquiryPatch = async (patch: Parameters<typeof updateEnquirySettings>[0]["patch"]) => {
    try {
      await dispatch(updateEnquirySettings({ id, patch })).unwrap();
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
          {detail.status !== "verified" && (
            <div className="text-right">
              <Button className="h-10" variant="outline" onClick={() => runStatus("verified")} disabled={!canVerify}>
                <CheckCircle className="mr-1.5 h-3.5 w-3.5" />
                {detail.status === "suspended" ? "Reinstate" : "Verify"}
              </Button>
              {!canVerify && <p className="mt-0.5 text-[11px] text-muted-foreground">Available after the owner claims this profile.</p>}
            </div>
          )}
          {detail.status === "verified" && (
            <Button className="h-10 border-destructive/30 text-destructive hover:bg-destructive/10" variant="outline" onClick={() => runStatus("suspended")}>
              <XCircle className="mr-1.5 h-3.5 w-3.5" /> Suspend
            </Button>
          )}
          {/* Publish/unpublish is institution-only for now — deliberately hidden for businesses, see business-detail-view history. */}
          {(detail.is_published ? (
            <Button className="h-10" variant="outline" disabled={publishBusy} onClick={runTogglePublish}>
              <EyeOff className="mr-1.5 h-3.5 w-3.5" /> Unpublish
            </Button>
          ) : (
            <Button className="h-10" disabled={publishBusy || detail.status !== "verified"} onClick={runTogglePublish}>
              <Globe className="mr-1.5 h-3.5 w-3.5" /> Publish
            </Button>
          ))}
        </div>
      </div>

      {kind === "business" ? (
        <BusinessHeaderCard business={business!} location={location} onSave={handleSave} onEdit={() => setHeaderOpen(true)} readOnly={readOnly} />
      ) : (
        <InstitutionHeaderCard institution={institution!} location={location} onSave={handleSave} onEdit={() => setHeaderOpen(true)} readOnly={readOnly} />
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <DetailSidebar
          description={detail.description}
          onEditOverview={() => setOverviewOpen(true)}
          statusLabel={STATUS_LABELS[detail.status]}
          statusColor={STATUS_COLORS[detail.status]}
          sourceLabel={detail.is_unclaimed ? "Pre-seeded" : "Claimed"}
          readOnly={readOnly}
          enquiry={
            kind === "business" && business
              ? {
                  enabled: business.enquiry_enabled,
                  coinCost: business.enquiry_coin_cost,
                  maxDistributions: business.enquiry_max_distributions,
                  onPatch: runEnquiryPatch,
                }
              : null
          }
        />
        <DetailTabs kind={kind} id={id} businessName={business?.business_name} readOnly={readOnly} isPreSeeded={isPreSeeded} />
      </div>

      {kind === "business" ? (
        <>
          <BusinessHeaderDialog open={headerOpen} onOpenChange={setHeaderOpen} business={business!} categories={categories} countries={countries} onSave={handleSave} saving={saving} />
          <BusinessOverviewDialog open={overviewOpen} onOpenChange={setOverviewOpen} business={business!} onSave={handleSave} saving={saving} />
        </>
      ) : (
        <>
          <InstitutionHeaderDialog open={headerOpen} onOpenChange={setHeaderOpen} institution={institution!} countries={countries} onSave={handleSave} saving={saving} />
          <InstitutionOverviewDialog open={overviewOpen} onOpenChange={setOverviewOpen} institution={institution!} onSave={handleSave} saving={saving} />
        </>
      )}
    </div>
  );
}
