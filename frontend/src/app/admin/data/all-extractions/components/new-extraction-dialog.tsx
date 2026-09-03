"use client";

import { useEffect, useRef, useState } from "react";
import { ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Combobox } from "@/components/combobox";
import { DynamicIcon } from "@/components/dynamic-icon";
import { useAppDispatch } from "@/lib/hooks";
import { categoriesApi, type Category } from "@/app/admin/platform/categories/apis";
import { createJob } from "../store/all-extractions-slice";
import type { ExistingJobConflict } from "../apis/types";
import {
  GUIDED_URL_CATEGORIES,
  SOURCE_TYPE_OPTIONS,
  VISA_SERVICE_GUIDED_URL_CATEGORIES,
  VISA_SERVICE_SOURCE_TYPE_OPTIONS,
} from "../const";
import { ExtractionStepIndicator } from "./extraction-step-indicator";
import { ExtractionSourceStep } from "./extraction-source-step";
import { ExtractionReviewStep } from "./extraction-review-step";

const STEPS = ["Categories", "Source", "Review"];

const cleanUrls = (urls: string[] | undefined) => (urls ?? []).map((u) => u.trim()).filter(Boolean);

const SEARCH_DEBOUNCE_MS = 300;

const toOptions = (categories: Category[]) =>
  categories.map((c) => ({
    value: String(c.id),
    label: c.name,
    icon: <DynamicIcon name={c.icon} fallback="Building2" className="h-4 w-4" />,
  }));

export function NewExtractionDialog({
  open,
  onOpenChange,
}: Readonly<{ open: boolean; onOpenChange: (open: boolean) => void }>) {
  const dispatch = useAppDispatch();
  const [step, setStep] = useState(0);
  const [conflict, setConflict] = useState<ExistingJobConflict | null>(null);
  const [businessCategory, setBusinessCategory] = useState("");
  const [serviceCategory, setServiceCategory] = useState("");
  // Kept alongside the ids so the review step still has a name after a search
  // has swapped out the option list the selection came from.
  const [businessLabel, setBusinessLabel] = useState("");
  const [serviceLabel, setServiceLabel] = useState("");
  const [sourceType, setSourceType] = useState("institution");
  const [institutionUrl, setInstitutionUrl] = useState("");
  const [sampleCourseUrl, setSampleCourseUrl] = useState("");
  const [guidedUrls, setGuidedUrls] = useState<Record<string, string[]>>({});
  const [guidanceNotes, setGuidanceNotes] = useState("");
  const [creating, setCreating] = useState(false);
  const [businessOptions, setBusinessOptions] = useState<Category[]>([]);
  const [serviceOptions, setServiceOptions] = useState<Category[]>([]);
  const [loadingCategories, setLoadingCategories] = useState(false);
  const fetchedForOpenRef = useRef(false);
  const businessSearchRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const serviceSearchRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!open) {
      fetchedForOpenRef.current = false;
      return;
    }
    if (fetchedForOpenRef.current) return;
    fetchedForOpenRef.current = true;

    setStep(0);
    setBusinessCategory("");
    setServiceCategory("");
    setBusinessLabel("");
    setServiceLabel("");
    setSourceType("institution");
    setInstitutionUrl("");
    setSampleCourseUrl("");
    setGuidedUrls({});
    setGuidanceNotes("");

    setLoadingCategories(true);
    Promise.all([
      categoriesApi.getBusinessCategories({ limit: 10, active: true }),
      categoriesApi.getServiceCategories({ limit: 10, active: true }),
    ])
      .then(([business, service]) => {
        setBusinessOptions(business.data);
        setServiceOptions(service.data);
      })
      .catch(() => toast.error("Couldn't load categories"))
      .finally(() => setLoadingCategories(false));
  }, [open]);

  const handleBusinessSearch = (query: string) => {
    if (businessSearchRef.current) clearTimeout(businessSearchRef.current);
    businessSearchRef.current = setTimeout(async () => {
      const { data } = await categoriesApi.getBusinessCategories({ search: query.trim() || undefined, limit: 10, active: true });
      setBusinessOptions(data);
    }, SEARCH_DEBOUNCE_MS);
  };

  const handleServiceSearch = (query: string) => {
    if (serviceSearchRef.current) clearTimeout(serviceSearchRef.current);
    serviceSearchRef.current = setTimeout(async () => {
      const { data } = await categoriesApi.getServiceCategories({ search: query.trim() || undefined, limit: 10, active: true });
      setServiceOptions(data);
    }, SEARCH_DEBOUNCE_MS);
  };

  // A stray backdrop click or Escape would wipe a half-filled three-step form, so the only
  // ways out are Cancel and the corner ×. Outside presses are blocked by disablePointerDismissal.
  const handleOpenChangeWithReason = (next: boolean, details: { reason?: string }) => {
    if (!next && details.reason === "escape-key") return;
    onOpenChange(next);
  };

  // "Visa Services" is both a business category and a service category — when an admin
  // picks that combination, the only sensible source is a visa/migration consultancy's own
  // website, not a university. Matched by name rather than id so this doesn't break if the
  // categories get reseeded with different ids.
  const isVisaServiceCategory =
    businessLabel.trim().toLowerCase() === "visa services" && serviceLabel.trim().toLowerCase() === "visa services";
  const sourceTypeOptions = isVisaServiceCategory ? VISA_SERVICE_SOURCE_TYPE_OPTIONS : SOURCE_TYPE_OPTIONS;
  const isVisaServiceSource = sourceType === "visa_service";
  const guidedUrlCategories = isVisaServiceSource ? VISA_SERVICE_GUIDED_URL_CATEGORIES : GUIDED_URL_CATEGORIES;

  // Keep sourceType valid for whichever option list applies to the category combination
  // being chosen. Applied directly in the category onChange handlers below (not an effect
  // reacting to already-committed state) — the category pick is the actual event that can
  // invalidate the current sourceType, so this is where React wants that reset to happen.
  const resetSourceTypeFor = (nextBusinessLabel: string, nextServiceLabel: string) => {
    const isVisa = nextBusinessLabel.trim().toLowerCase() === "visa services" && nextServiceLabel.trim().toLowerCase() === "visa services";
    const options = isVisa ? VISA_SERVICE_SOURCE_TYPE_OPTIONS : SOURCE_TYPE_OPTIONS;
    const fallback = isVisa ? "visa_service" : "institution";
    setSourceType((prev) => (options.some((o) => o.value === prev) ? prev : fallback));
  };

  const stepOneValid = Boolean(businessCategory && serviceCategory && sourceType);

  const handleSubmit = async () => {
    if (!institutionUrl.trim()) return;

    const guided_urls: Record<string, string[]> = {};
    for (const { key } of guidedUrlCategories) {
      const urls = cleanUrls(guidedUrls[key]);
      if (urls.length) guided_urls[key] = urls;
    }

    setCreating(true);
    const result = await dispatch(
      createJob({
        institution_url: institutionUrl.trim(),
        business_category_id: Number(businessCategory),
        service_category_id: Number(serviceCategory),
        source_type: sourceType,
        ...(Object.keys(guided_urls).length && { guided_urls }),
        ...(guidanceNotes.trim() && { guidance_notes: guidanceNotes.trim() }),
        ...(sampleCourseUrl.trim() && { sample_course_url: sampleCourseUrl.trim() }),
      })
    );
    setCreating(false);
    if (createJob.rejected.match(result)) {
      if (result.payload?.existingJob) {
        setConflict(result.payload.existingJob);
        return;
      }
      toast.error("Couldn't start extraction", { description: result.payload?.message ?? result.error.message ?? "Please try again." });
      return;
    }
    toast.success("Extraction started");
    onOpenChange(false);
  };

  return (
    <>
    <Dialog open={open} onOpenChange={handleOpenChangeWithReason} disablePointerDismissal>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>New Extraction</DialogTitle>
        </DialogHeader>

        <ExtractionStepIndicator steps={STEPS} current={step} />

        {step === 0 ? (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="business-category">Business category</Label>
              <Combobox
                id="business-category"
                options={toOptions(businessOptions)}
                value={businessCategory}
                onChange={(v) => {
                  const label = businessOptions.find((c) => String(c.id) === v)?.name ?? "";
                  setBusinessCategory(v);
                  setBusinessLabel(label);
                  resetSourceTypeFor(label, serviceLabel);
                }}
                onQueryChange={handleBusinessSearch}
                loading={loadingCategories}
                placeholder="Select business category"
                searchPlaceholder="Search business categories…"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="service-category">Service category</Label>
              <Combobox
                id="service-category"
                options={toOptions(serviceOptions)}
                value={serviceCategory}
                onChange={(v) => {
                  const label = serviceOptions.find((c) => String(c.id) === v)?.name ?? "";
                  setServiceCategory(v);
                  setServiceLabel(label);
                  resetSourceTypeFor(businessLabel, label);
                }}
                onQueryChange={handleServiceSearch}
                loading={loadingCategories}
                placeholder="Select service category"
                searchPlaceholder="Search service categories…"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="source-type">Source type</Label>
              <Combobox
                id="source-type"
                options={sourceTypeOptions}
                value={sourceType}
                onChange={setSourceType}
                placeholder="Select source type"
              />
              {isVisaServiceCategory && (
                <p className="text-xs text-muted-foreground">
                  Visa Services category selected — pointing this at a visa/migration consultancy&apos;s own website.
                </p>
              )}
            </div>
          </div>
        ) : step === 1 ? (
          <ExtractionSourceStep
            isVisaServiceSource={isVisaServiceSource}
            guidedUrlCategories={guidedUrlCategories}
            institutionUrl={institutionUrl}
            onInstitutionUrlChange={setInstitutionUrl}
            sampleCourseUrl={sampleCourseUrl}
            onSampleCourseUrlChange={setSampleCourseUrl}
            guidedUrls={guidedUrls}
            onGuidedUrlsChange={setGuidedUrls}
            guidanceNotes={guidanceNotes}
            onGuidanceNotesChange={setGuidanceNotes}
          />
        ) : (
          <ExtractionReviewStep
            businessLabel={businessLabel}
            serviceLabel={serviceLabel}
            sourceTypeLabel={sourceTypeOptions.find((o) => o.value === sourceType)?.label ?? sourceType}
            isVisaServiceSource={isVisaServiceSource}
            institutionUrl={institutionUrl}
            sampleCourseUrl={sampleCourseUrl}
            guidedUrlCategories={guidedUrlCategories}
            guidedUrls={guidedUrls}
            guidanceNotes={guidanceNotes}
          />
        )}

        <DialogFooter className="sm:flex-row">
          <Button
            className="h-10 w-1/4 cursor-pointer"
            variant="outline"
            onClick={() => (step === 0 ? onOpenChange(false) : setStep(step - 1))}
          >
            {step === 0 ? "Cancel" : "Back"}
          </Button>
          {step === 0 ? (
            <Button className="h-10 w-3/4 cursor-pointer" onClick={() => setStep(1)} disabled={!stepOneValid}>
              Next
            </Button>
          ) : step === 1 ? (
            <Button
              className="h-10 w-3/4 cursor-pointer"
              onClick={() => setStep(2)}
              disabled={!institutionUrl.trim()}
            >
              Next
            </Button>
          ) : (
            <Button
              className="h-10 w-3/4 cursor-pointer"
              onClick={handleSubmit}
              disabled={creating || !institutionUrl.trim()}
            >
              {creating ? "Starting…" : "Start Extraction"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog open={!!conflict} onOpenChange={(open) => !open && setConflict(null)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Institution already exists</DialogTitle>
          <DialogDescription>
            {conflict?.institutionName || "An institution"} with a matching website is already being tracked
            {conflict?.email || conflict?.phone ? " — " : "."}
            {conflict?.email && ` ${conflict.email}`}
            {conflict?.phone && ` · ${conflict.phone}`}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" className="cursor-pointer" onClick={() => setConflict(null)}>
            Close
          </Button>
          <Button
            className="gap-1.5 cursor-pointer"
            onClick={() => {
              if (conflict) window.open(`/admin/data/all-extractions/${conflict.id}`, "_blank", "noopener,noreferrer");
              setConflict(null);
            }}
          >
            <ExternalLink className="h-3.5 w-3.5" />
            View existing job
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}
