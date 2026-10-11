"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Briefcase, CheckCircle, EyeOff, Globe, GraduationCap, Loader2, Pencil, XCircle } from "lucide-react";
import { BackButton } from "@/components/ui/back-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageBody } from "@/components/ui/page-body";
import { PageHeader } from "@/components/ui/page-header";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { fetchBusinessCategories, fetchCountries } from "@/app/admin/platform/categories/store/categories-slice";
import {
  fetchBusinessDetail, updateBusinessDetail, updateBusinessPublished, updateBusinessStatus, updateEnquirySettings,
} from "../store/businesses-slice";
import {
  fetchInstitutionDetail, updateInstitutionDetail, updateInstitutionPublished, updateInstitutionStatus,
} from "../store/institution-detail-slice";
import { STATUS_LABELS, STATUS_VARIANT } from "../const";
import type { BusinessPatch, BusinessStatus, InstitutionPatch } from "../apis/types";
import { BusinessHeaderDialog } from "./business-detail/business-header-dialog";
import { BusinessOverviewDialog } from "./business-detail/business-overview-dialog";
import { InstitutionHeaderDialog } from "./institution-header-dialog";
import { InstitutionOverviewDialog } from "./institution-overview-dialog";
import { SocialMediaDialog } from "./social-media-dialog";
import { DetailSidebar } from "./detail-sidebar";
import { DetailTabs } from "./detail-tabs";
import { ListingHeaderCard } from "./listing-header-card";

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
  const [socialOpen, setSocialOpen] = useState(false);

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
    if (categories.length === 0) dispatch(fetchBusinessCategories({}));
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
  // Pre-seeded businesses/institutions have no tenant schema yet, so their branches/services tabs
  // read the source extraction job's campuses/courses instead — those rows aren't editable here.
  const isPreSeeded = kind === "business"
    ? business?.account_status === 0 && !!business.source_job_id
    : institution?.account_status === 0 && !!institution?.source_job_id;

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

  const TitleIcon = kind === "institution" ? GraduationCap : Briefcase;

  return (
    <PageBody>
      <PageHeader
        leading={<BackButton onClick={() => router.back()} label="Back" />}
        title={<><TitleIcon /> {detail.business_name}</>}
        badges={
          <>
            <Badge variant={STATUS_VARIANT[detail.status]}>{STATUS_LABELS[detail.status]}</Badge>
            <Badge variant="outline">{kind === "institution" ? "Institution" : "Business"}</Badge>
            {detail.category_name && <Badge variant="secondary">{detail.category_name}</Badge>}
          </>
        }
        subtitle={location || undefined}
      >
        {detail.status !== "verified" && (
          <div className="text-right">
            <Button variant="outline" onClick={() => runStatus("verified")} disabled={!canVerify}>
              <CheckCircle /> {detail.status === "suspended" ? "Reinstate" : "Verify"}
            </Button>
            {!canVerify && <p className="mt-1 text-xs text-muted-foreground">Available after the owner claims this profile.</p>}
          </div>
        )}
        {detail.status === "verified" && (
          <Button variant="outline" className="border-destructive/30 text-destructive hover:bg-destructive/10" onClick={() => runStatus("suspended")}>
            <XCircle /> Suspend
          </Button>
        )}
        {detail.is_published ? (
          <Button variant="outline" disabled={publishBusy} onClick={runTogglePublish}>
            <EyeOff /> Unpublish
          </Button>
        ) : (
          <Button disabled={publishBusy || detail.status !== "verified"} onClick={runTogglePublish}>
            <Globe /> Publish
          </Button>
        )}
        {!readOnly && (
          <Button variant="outline" onClick={() => setHeaderOpen(true)}>
            <Pencil /> Edit details
          </Button>
        )}
      </PageHeader>

      <ListingHeaderCard detail={detail} onSave={handleSave} readOnly={readOnly} />

      <DetailTabs
        kind={kind}
        id={id}
        businessName={business?.business_name}
        businessType={business?.business_type}
        readOnly={readOnly}
        isPreSeeded={isPreSeeded}
        sidebar={
          <DetailSidebar
            description={detail.description}
            onEditOverview={() => setOverviewOpen(true)}
            statusLabel={STATUS_LABELS[detail.status]}
            statusVariant={STATUS_VARIANT[detail.status]}
            sourceLabel={detail.is_unclaimed ? "Pre-seeded" : "Claimed"}
            readOnly={readOnly}
            social={{
              linkedin_url: detail.linkedin_url,
              facebook_url: detail.facebook_url,
              instagram_url: detail.instagram_url,
              twitter_url: detail.twitter_url,
              youtube_url: detail.youtube_url,
              whatsapp_url: detail.whatsapp_url,
            }}
            onEditSocial={() => setSocialOpen(true)}
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
        }
      />

      {kind === "business" ? (
        <>
          <BusinessHeaderDialog open={headerOpen} onOpenChange={setHeaderOpen} business={business!} categories={categories} countries={countries} onSave={handleSave} saving={saving} />
          <BusinessOverviewDialog open={overviewOpen} onOpenChange={setOverviewOpen} business={business!} onSave={handleSave} saving={saving} />
        </>
      ) : (
        <>
          <InstitutionHeaderDialog open={headerOpen} onOpenChange={setHeaderOpen} institution={institution!} categories={categories} countries={countries} onSave={handleSave} saving={saving} />
          <InstitutionOverviewDialog open={overviewOpen} onOpenChange={setOverviewOpen} institution={institution!} onSave={handleSave} saving={saving} />
        </>
      )}

      <SocialMediaDialog
        open={socialOpen}
        onOpenChange={setSocialOpen}
        values={{
          linkedin_url: detail.linkedin_url,
          facebook_url: detail.facebook_url,
          instagram_url: detail.instagram_url,
          twitter_url: detail.twitter_url,
          youtube_url: detail.youtube_url,
          whatsapp_url: detail.whatsapp_url,
        }}
        onSave={handleSave}
        saving={saving}
      />
    </PageBody>
  );
}
