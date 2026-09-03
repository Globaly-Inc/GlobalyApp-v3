"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { flagFromIso2 } from "@/app/admin/platform/categories/utils";
import { categoriesApi } from "@/app/admin/platform/categories/apis";
import type { CityOption } from "@/app/admin/platform/categories/apis/types";
import { fetchCountries } from "@/app/admin/platform/categories/store/categories-slice";
import type { Branch, BranchType, SharedServices } from "../../apis/types";
import { createBranch, updateBranch } from "../../store/businesses-slice";
import { isValidEmail, isValidUrl } from "../../utils";
import { BranchStepper } from "./branch-stepper";
import { CreateBranchDetailsStep, EMPTY_BRANCH_FORM } from "./create-branch-details-step";
import { CreateBranchCopyStep } from "./create-branch-copy-step";
import { ServiceSharingPicker } from "../services/service-sharing-picker";

const STEPS = ["Details", "Copy", "Services"] as const;

export function CreateBranchDialog({
  open,
  onOpenChange,
  businessId,
  editBranch,
}: Readonly<{ open: boolean; onOpenChange: (open: boolean) => void; businessId: number; editBranch?: Branch | null }>) {
  const dispatch = useAppDispatch();
  const detail = useAppSelector((s) => s.platformBusinesses.detail);
  const parent = detail?.id === businessId ? detail : undefined;
  const countries = useAppSelector((s) => s.platformCategories.countries);
  const isEdit = !!editBranch;

  const [step, setStep] = useState(0);
  const [form, setForm] = useState(EMPTY_BRANCH_FORM);
  const [cities, setCities] = useState<CityOption[]>([]);
  const [citiesLoading, setCitiesLoading] = useState(false);
  const [branchType, setBranchType] = useState<BranchType>("same_company");
  const [copyDescription, setCopyDescription] = useState(false);
  const [sharedServices, setSharedServices] = useState<SharedServices>([]);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});

  const set = <K extends keyof typeof EMPTY_BRANCH_FORM>(key: K, value: string) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => (e[key as string] ? { ...e, [key]: undefined } : e));
  };

  useEffect(() => {
    if (!open) return;
    setStep(0);
    if (editBranch) {
      const country = countries.find((c) => c.name === editBranch.country);
      setForm({
        ...EMPTY_BRANCH_FORM,
        name: editBranch.name,
        countryId: country ? String(country.id) : "",
        city: editBranch.city ?? "",
        address: editBranch.address ?? "",
        state: editBranch.state ?? "",
        email: editBranch.email ?? "",
        phone: editBranch.phone ?? "",
      });
      setBranchType(editBranch.branch_type);
      setCopyDescription(editBranch.share_description);
      setSharedServices(editBranch.shared_services);
    } else {
      setForm(EMPTY_BRANCH_FORM);
      setBranchType("same_company");
      setCopyDescription(false);
      setSharedServices([]);
    }
    setCities([]);
    setErrors({});
    if (countries.length === 0) dispatch(fetchCountries());
  }, [open, editBranch]);

  useEffect(() => {
    if (!form.countryId) {
      setCities([]);
      return;
    }
    setCitiesLoading(true);
    categoriesApi
      .getCitiesByCountry(Number(form.countryId))
      .then(setCities)
      .finally(() => setCitiesLoading(false));
  }, [form.countryId]);

  const countryOptions = useMemo(
    () => countries.map((c) => ({ value: String(c.id), label: `${flagFromIso2(c.iso2)} ${c.name}` })),
    [countries],
  );
  const cityOptions = useMemo(() => cities.map((c) => ({ value: c.name, label: c.name })), [cities]);

  const handleCityChange = (cityName: string) => {
    set("city", cityName);
    const city = cities.find((c) => c.name === cityName);
    if (city?.stateName && !form.state) set("state", city.stateName);
  };

  const validateDetails = () => {
    const next: typeof errors = {};
    if (form.name.trim().length < 2) next.name = "Branch name is required";
    if (!form.countryId) next.countryId = "Select a country";
    if (form.email && !isValidEmail(form.email)) next.email = "Enter a valid email";
    if (form.website && !isValidUrl(form.website)) next.website = "Enter a valid website URL";
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleNext = () => {
    if (step === 0 && !validateDetails()) return;
    setStep((s) => s + 1);
  };

  const handleCreate = async () => {
    if (!isEdit && !parent) return;
    if (!validateDetails()) return;
    setSaving(true);
    try {
      const country = countries.find((c) => String(c.id) === form.countryId);
      const input = {
        name: form.name,
        country: country?.name ?? null,
        state: form.state || null,
        city: form.city || null,
        address: form.address || null,
        phone: form.phone || null,
        email: form.email || null,
        branch_type: branchType,
        share_description: copyDescription,
        shared_services: sharedServices,
      };

      if (isEdit && editBranch) {
        await dispatch(updateBranch({ id: businessId, branchId: editBranch.id, patch: input })).unwrap();
        toast.success("Branch updated");
      } else {
        await dispatch(createBranch({ id: businessId, input })).unwrap();
        const description = country ? `${form.name} (${country.name}).` : `${form.name}.`;
        toast.success("Branch created", { description });
      }
      onOpenChange(false);
    } catch (e) {
      toast.error(isEdit ? "Couldn't update branch" : "Couldn't create branch", { description: (e as Error).message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Plus className="h-4 w-4" /> {isEdit ? "Edit branch" : "Create new branch"}
          </SheetTitle>
          <SheetDescription>
            {isEdit ? (
              <>Update <strong>{editBranch?.name}</strong>&apos;s details.</>
            ) : (
              <>Add a new branch location under <strong>{parent?.business_name ?? "this business"}</strong>.</>
            )}
          </SheetDescription>
        </SheetHeader>

        <div className="px-4">
          <BranchStepper steps={STEPS} current={step} />
        </div>

        <div className="flex flex-col gap-5 px-4">
          {step === 0 && (
            <CreateBranchDetailsStep
              form={form}
              onChange={set}
              errors={errors}
              countryOptions={countryOptions}
              cityOptions={cityOptions}
              citiesLoading={citiesLoading}
              onCityChange={handleCityChange}
              branchType={branchType}
              onBranchTypeChange={setBranchType}
            />
          )}

          {step === 1 && (
            <CreateBranchCopyStep parent={parent} copyDescription={copyDescription} onCopyDescriptionChange={setCopyDescription} />
          )}

          {step === 2 && (
            <>
              <p className="text-sm text-muted-foreground">Share services from the parent business.</p>
              <ServiceSharingPicker
                businessId={businessId}
                value={sharedServices}
                onChange={setSharedServices}
                emptyText="No services available to share."
              />
            </>
          )}
        </div>

        <SheetFooter className="flex-row justify-end gap-2">
          {step > 0 && (
            <Button variant="outline" onClick={() => setStep((s) => s - 1)} disabled={saving}>
              Back
            </Button>
          )}
          {step < STEPS.length - 1 ? (
            <Button className="min-w-32" onClick={handleNext}>
              Next
            </Button>
          ) : (
            <Button className="min-w-32" onClick={handleCreate} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isEdit ? "Save changes" : "Create branch"}
            </Button>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
