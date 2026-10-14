"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Briefcase, Loader2, Save } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { BackButton } from "@/components/ui/back-button";
import { Button } from "@/components/ui/button";
import { CardSkeleton } from "@/components/ui/list-skeleton";
import { FormSection } from "@/components/ui/form-section";
import { PageBody } from "@/components/ui/page-body";
import { PageHeader } from "@/components/ui/page-header";
import { StickySaveBar } from "@/components/ui/sticky-save-bar";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { clearListing, fetchListing, fetchMeta } from "../store/my-services-slice";
import { CoverImageField } from "./cover-image-field";
import { ListingDetailsSection } from "./listing-details-section";
import { ListingLocationSection } from "./listing-location-section";
import { ListingPricingSection } from "./listing-pricing-section";
import { SectionError } from "./section-error";
import { emptyForm, toForm, useListingForm, type CoverState, type FormState } from "./use-listing-form";

const SERVICES_HREF = "/personal/earn/services";
const back = <BackButton href={SERVICES_HREF} label="Back to Services" />;

/**
 * Create and edit, split in two.
 *
 * This outer component only waits for data; the form below it is mounted with its values already in place, so
 * there is no hydration effect and no `initialized` flag. V2 called setState during render behind exactly such
 * a flag, which is what made its edit fields flicker and reset after load — a shape that cannot occur here
 * because the form never exists before its data does.
 */
export function ListingFormView({ serviceId }: Readonly<{ serviceId?: number }>) {
  const dispatch = useAppDispatch();
  const { listing, listingStatus, listingError } = useAppSelector((state) => state.myServices);
  const isEdit = serviceId !== undefined;

  useEffect(() => {
    dispatch(fetchMeta());
    if (isEdit) dispatch(fetchListing(serviceId));
    return () => {
      dispatch(clearListing());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serviceId]);

  if (isEdit && listingStatus === "failed") {
    return (
      <PageBody>
        <PageHeader leading={back} title={<><Briefcase /> Edit Service</>} />
        <SectionError message={listingError} onRetry={() => dispatch(fetchListing(serviceId))} />
      </PageBody>
    );
  }

  const loaded = !isEdit || (listing !== null && listing.id === serviceId);
  if (!loaded) {
    return (
      <PageBody>
        <CardSkeleton lines={6} />
      </PageBody>
    );
  }

  const initial = isEdit && listing ? toForm(listing) : emptyForm();
  const initialCover: CoverState =
    isEdit && listing ? { storagePath: listing.cover_storage_path, url: listing.cover_url } : { storagePath: null, url: null };

  return (
    <ListingForm
      // Remount if the route ever points at a different listing, so initial values are re-taken.
      key={serviceId ?? "new"}
      serviceId={serviceId}
      initial={initial}
      initialCover={initialCover}
      isActive={isEdit && listing ? listing.is_active : undefined}
    />
  );
}

function ListingForm({
  serviceId,
  initial,
  initialCover,
  isActive,
}: Readonly<{ serviceId?: number; initial: FormState; initialCover: CoverState; isActive?: boolean }>) {
  const model = useListingForm(serviceId, initial, initialCover);
  const { isEdit, meta, saving, uploading, cover, setCover, handlePickCover, handleSubmit } = model;

  const saveButton = (
    <Button className="gap-2" onClick={handleSubmit} disabled={saving || uploading}>
      {saving || uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
      {uploading ? "Uploading…" : saving ? "Saving…" : isEdit ? "Update Service" : "Create Service"}
    </Button>
  );

  return (
    <PageBody>
      <PageHeader
        leading={back}
        title={<><Briefcase /> {isEdit ? "Edit Service" : "Create New Service"}</>}
        badges={
          isActive !== undefined && (
            <Badge variant={isActive ? "success" : "secondary"}>{isActive ? "Active" : "Paused"}</Badge>
          )
        }
        subtitle={isEdit ? initial.title : "Describe what you offer, set a price and choose where."}
      >
        {saveButton}
      </PageHeader>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <ListingDetailsSection model={model} />
          <ListingPricingSection model={model} />
          <ListingLocationSection model={model} />
        </div>

        <div className="flex flex-col gap-6">
          <FormSection title="Cover image" description="Shown on your listing card and page." columns={1}>
            <CoverImageField
              // Hidden entirely when no bucket is configured, rather than offering an upload that must fail.
              available={meta?.cover_upload_available ?? false}
              previewUrl={cover.url}
              uploading={uploading}
              onPick={handlePickCover}
              onRemove={() => setCover({ storagePath: null, url: null })}
            />
          </FormSection>
        </div>
      </div>

      <StickySaveBar>
        <Button variant="outline" render={<Link href={SERVICES_HREF} />}>Cancel</Button>
        {saveButton}
      </StickySaveBar>
    </PageBody>
  );
}
