"use client";

import { useEffect, useRef, useState } from "react";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Combobox } from "@/components/combobox";
import { cn } from "@/lib/utils";
import { useAppDispatch } from "@/lib/hooks";
import { categoriesApi, type Category } from "@/app/admin/platform/categories/apis";
import { createJob } from "../store/all-extractions-slice";
import { GUIDED_URL_CATEGORIES, SOURCE_TYPE_OPTIONS } from "../const";

const STEPS = ["Categories", "Source", "Review"];

const cleanUrls = (urls: string[] | undefined) => (urls ?? []).map((u) => u.trim()).filter(Boolean);

/** A growable list of URL inputs for one guided-URL bucket. */
function UrlList({
  id,
  values,
  onChange,
}: Readonly<{ id: string; values: string[]; onChange: (next: string[]) => void }>) {
  // Always render at least one input so an empty bucket still has somewhere to type.
  const rows = values.length > 0 ? values : [""];

  return (
    <div className="flex flex-col gap-1.5">
      {rows.map((url, index) => (
        // Index key on purpose: rows are positional and two blank rows are indistinguishable.
        <div key={index} className="flex items-center gap-1.5">
          <Input
            id={index === 0 ? id : undefined}
            type="url"
            placeholder="https://university.edu/…"
            value={url}
            onChange={(e) => onChange(rows.map((r, i) => (i === index ? e.target.value : r)))}
          />
          {rows.length > 1 && (
            <Button
              variant="ghost"
              size="icon-sm"
              className="shrink-0 cursor-pointer"
              title="Remove URL"
              onClick={() => onChange(rows.filter((_, i) => i !== index))}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      ))}
      <Button
        variant="ghost"
        size="sm"
        className="h-7 w-fit gap-1 px-1.5 text-xs cursor-pointer"
        onClick={() => onChange([...rows, ""])}
      >
        <Plus className="h-3 w-3" />
        Add URL
      </Button>
    </div>
  );
}

/** One line of the review step. Blank optional values show as "Not set" rather than vanishing. */
function SummaryRow({ label, value }: Readonly<{ label: string; value: string | string[] }>) {
  const list = Array.isArray(value) ? value : [value].filter(Boolean);
  return (
    <div className="flex flex-col gap-0.5 border-b border-border pb-2 last:border-0">
      <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
      {list.length === 0 ? (
        <span className="text-muted-foreground/70">Not set</span>
      ) : (
        list.map((item, i) => (
          <span key={`${item}-${i}`} className="break-all">{item}</span>
        ))
      )}
    </div>
  );
}
const SEARCH_DEBOUNCE_MS = 300;

const toOptions = (categories: Category[]) =>
  categories.map((c) => ({ value: String(c.id), label: c.name }));

export function NewExtractionDialog({
  open,
  onOpenChange,
}: Readonly<{ open: boolean; onOpenChange: (open: boolean) => void }>) {
  const dispatch = useAppDispatch();
  const [step, setStep] = useState(0);
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
    setLoadingCategories(true);
    Promise.all([categoriesApi.getBusinessCategories({ limit: 10 }), categoriesApi.getServiceCategories({ limit: 10 })])
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
      const { data } = await categoriesApi.getBusinessCategories({ search: query.trim() || undefined, limit: 10 });
      setBusinessOptions(data);
    }, SEARCH_DEBOUNCE_MS);
  };

  const handleServiceSearch = (query: string) => {
    if (serviceSearchRef.current) clearTimeout(serviceSearchRef.current);
    serviceSearchRef.current = setTimeout(async () => {
      const { data } = await categoriesApi.getServiceCategories({ search: query.trim() || undefined, limit: 10 });
      setServiceOptions(data);
    }, SEARCH_DEBOUNCE_MS);
  };

  const handleOpenChange = (next: boolean) => {
    if (next) {
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
    }
    onOpenChange(next);
  };

  // A stray backdrop click or Escape would wipe a half-filled three-step form, so the only
  // ways out are Cancel and the corner ×. Outside presses are blocked by disablePointerDismissal.
  const handleOpenChangeWithReason = (next: boolean, details: { reason?: string }) => {
    if (!next && details.reason === "escape-key") return;
    handleOpenChange(next);
  };

  const stepOneValid = Boolean(businessCategory && serviceCategory && sourceType);

  const handleSubmit = async () => {
    if (!institutionUrl.trim()) return;

    const guided_urls: Record<string, string[]> = {};
    for (const { key } of GUIDED_URL_CATEGORIES) {
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
      toast.error("Couldn't start extraction", { description: result.error.message ?? "Please try again." });
      return;
    }
    toast.success("Extraction started");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChangeWithReason} disablePointerDismissal>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>New Extraction</DialogTitle>
        </DialogHeader>

        <div className="flex items-center gap-2">
          {STEPS.map((label, index) => (
            <div key={label} className="flex flex-1 items-center gap-2">
              <span
                className={cn(
                  "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs",
                  index <= step ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                )}
              >
                {index + 1}
              </span>
              <span className={cn("text-xs", index === step ? "text-foreground" : "text-muted-foreground")}>
                {label}
              </span>
              {index < STEPS.length - 1 && <div className="h-px flex-1 bg-border" />}
            </div>
          ))}
        </div>

        {step === 0 ? (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="business-category">Business category</Label>
              <Combobox
                id="business-category"
                options={toOptions(businessOptions)}
                value={businessCategory}
                onChange={(v) => {
                  setBusinessCategory(v);
                  setBusinessLabel(businessOptions.find((c) => String(c.id) === v)?.name ?? "");
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
                  setServiceCategory(v);
                  setServiceLabel(serviceOptions.find((c) => String(c.id) === v)?.name ?? "");
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
                options={SOURCE_TYPE_OPTIONS}
                value={sourceType}
                onChange={setSourceType}
                placeholder="Select source type"
              />
            </div>
          </div>
        ) : step === 1 ? (
          <div className="flex max-h-[65vh] flex-col gap-4 overflow-y-auto pr-1">
            <div className="flex flex-col gap-2">
              <Label htmlFor="institution-url">Institution website URL</Label>
              <Input
                id="institution-url"
                type="url"
                placeholder="https://university.edu"
                value={institutionUrl}
                onChange={(e) => setInstitutionUrl(e.target.value)}
              />
            </div>

            <p className="text-xs text-muted-foreground">
              Everything below is optional — leave it blank and the AI discovers pages itself. Pointing it at
              the right pages gives markedly better results. Add as many URLs per section as you need.
            </p>

            <div className="flex flex-col gap-2">
              <Label htmlFor="sample-course-url">Sample course page URL</Label>
              <Input
                id="sample-course-url"
                type="url"
                placeholder="https://university.edu/courses/bachelor-of-science"
                value={sampleCourseUrl}
                onChange={(e) => setSampleCourseUrl(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">One individual course page, so the AI learns the URL pattern.</p>
            </div>

            {GUIDED_URL_CATEGORIES.map(({ key, label, ...rest }) => (
              <div key={key} className="flex flex-col gap-2">
                <Label htmlFor={key}>{label} page URLs</Label>
                <UrlList
                  id={key}
                  values={guidedUrls[key] ?? []}
                  onChange={(next) => setGuidedUrls((prev) => ({ ...prev, [key]: next }))}
                />
                {"hint" in rest && <p className="text-xs text-muted-foreground">{rest.hint}</p>}
              </div>
            ))}

            <div className="flex flex-col gap-2">
              <Label htmlFor="guidance-notes">Additional guidance for the AI</Label>
              <Textarea
                id="guidance-notes"
                rows={3}
                placeholder="e.g. Fees are shown per semester — multiply by 2 for annual. CRICOS codes appear in the sidebar."
                value={guidanceNotes}
                onChange={(e) => setGuidanceNotes(e.target.value)}
              />
            </div>
          </div>
        ) : (
          <div className="flex max-h-[65vh] flex-col gap-3 overflow-y-auto pr-1 text-sm">
            <SummaryRow label="Business category" value={businessLabel} />
            <SummaryRow label="Service category" value={serviceLabel} />
            <SummaryRow
              label="Source type"
              value={SOURCE_TYPE_OPTIONS.find((o) => o.value === sourceType)?.label ?? sourceType}
            />
            <SummaryRow label="Institution website URL" value={institutionUrl.trim()} />
            <SummaryRow label="Sample course page URL" value={sampleCourseUrl.trim()} />

            {GUIDED_URL_CATEGORIES.map(({ key, label }) => (
              <SummaryRow key={key} label={`${label} page URLs`} value={cleanUrls(guidedUrls[key])} />
            ))}

            <SummaryRow label="Guidance for the AI" value={guidanceNotes.trim()} />
          </div>
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
  );
}
