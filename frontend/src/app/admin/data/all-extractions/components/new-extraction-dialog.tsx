"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Combobox } from "@/components/combobox";
import { cn } from "@/lib/utils";
import { useAppDispatch } from "@/lib/hooks";
import { categoriesApi, type Category } from "@/app/admin/platform/categories/apis";
import { createJob } from "../store/all-extractions-slice";
import { SOURCE_TYPE_OPTIONS } from "../const";

const STEPS = ["Categories", "Source"];
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
  const [sourceType, setSourceType] = useState("institution");
  const [institutionUrl, setInstitutionUrl] = useState("");
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
      setSourceType("institution");
      setInstitutionUrl("");
    }
    onOpenChange(next);
  };

  const stepOneValid = Boolean(businessCategory && serviceCategory && sourceType);

  const handleSubmit = async () => {
    if (!institutionUrl.trim()) return;
    setCreating(true);
    const result = await dispatch(
      createJob({
        institution_url: institutionUrl.trim(),
        business_category_id: Number(businessCategory),
        service_category_id: Number(serviceCategory),
        source_type: sourceType,
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
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
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
                onChange={setBusinessCategory}
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
                onChange={setServiceCategory}
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
        ) : (
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
        )}

        <DialogFooter className="sm:flex-row">
          <Button
            className="h-10 w-1/4 cursor-pointer"
            variant="outline"
            onClick={() => (step === 0 ? onOpenChange(false) : setStep(0))}
          >
            {step === 0 ? "Cancel" : "Back"}
          </Button>
          {step === 0 ? (
            <Button className="h-10 w-3/4 cursor-pointer" onClick={() => setStep(1)} disabled={!stepOneValid}>
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
