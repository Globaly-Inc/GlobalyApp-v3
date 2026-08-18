"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { flagFromIso2 } from "@/app/admin/platform/categories/utils";
import { geoApi, type City, type Country } from "@/app/geo/apis";
import { CreateBranchDetailsStep, EMPTY_BRANCH_FORM } from "@/app/admin/platform/businesses/components/branches/create-branch-details-step";
import { buildPhone, isValidEmail, isValidUrl } from "@/app/admin/platform/businesses/utils";
import type { Branch, BranchType, SharedServices } from "../../apis/types";
import { createBranch, updateBranch } from "../../store/business-profile-detail-slice";
import { BranchStepper } from "@/app/admin/platform/businesses/components/branches/branch-stepper";
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
  const parent = useAppSelector((s) => s.businessOnboarding.profile);
  const isEdit = !!editBranch;

  const [step, setStep] = useState(0);
  const [form, setForm] = useState(EMPTY_BRANCH_FORM);
  const [countries, setCountries] = useState<Country[]>([]);
  const [fetchedCities, setFetchedCities] = useState<City[]>([]);
  const [citiesLoadedFor, setCitiesLoadedFor] = useState<string>();
  const [branchType, setBranchType] = useState<BranchType>("same_company");
  const [copyDescription, setCopyDescription] = useState(false);
  const [sharedServices, setSharedServices] = useState<SharedServices>([]);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});

  const set = <K extends keyof typeof EMPTY_BRANCH_FORM>(key: K, value: string) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => (e[key as string] ? { ...e, [key]: undefined } : e));
  };

  // Re-seed the form when the sheet opens, or when a different branch is handed in while
  // it is open. Derived by comparing against the previous props during render — seeding
  // from an effect would commit one render of the stale form first.
  const seedFor = open ? (editBranch ?? null) : undefined;
  const [seededFor, setSeededFor] = useState<Branch | null | undefined>(undefined);
  // Nothing to re-seed while closing — leaving the form alone keeps it from flashing
  // empty behind the sheet's exit animation, exactly as the `if (!open) return` did.
  if (seedFor !== seededFor && open) {
    setStep(0);
    if (editBranch) {
      const country = countries.find((c) => c.name === editBranch.country);
      const phoneCountry = editBranch.phone
        ? countries.find((c) => c.phoneCode && editBranch.phone!.startsWith(c.phoneCode))
        : undefined;
      setForm({
        ...EMPTY_BRANCH_FORM,
        name: editBranch.name,
        countryId: country ? String(country.id) : "",
        city: editBranch.city ?? "",
        address: editBranch.address ?? "",
        state: editBranch.state ?? "",
        email: editBranch.email ?? "",
        phoneCountryId: phoneCountry ? String(phoneCountry.id) : "",
        phoneNumber: phoneCountry ? editBranch.phone!.slice(phoneCountry.phoneCode!.length).trim() : (editBranch.phone ?? ""),
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
    setErrors({});
  }
  if (seedFor !== seededFor) setSeededFor(seedFor);

  useEffect(() => {
    if (open && countries.length === 0) geoApi.getCountries().then(setCountries).catch(() => setCountries([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Cities belong to the picked country: none without one, and loading until the fetch
  // for that country settles. Both derived, so the effect only owns the fetch itself.
  const cities = useMemo(
    () => (citiesLoadedFor === form.countryId ? fetchedCities : []),
    [citiesLoadedFor, form.countryId, fetchedCities],
  );
  const citiesLoading = !!form.countryId && citiesLoadedFor !== form.countryId;
  useEffect(() => {
    if (!form.countryId) return;
    geoApi
      .getCities(Number(form.countryId))
      .then(setFetchedCities)
      .finally(() => setCitiesLoadedFor(form.countryId));
  }, [form.countryId]);

  const countryOptions = useMemo(
    () => countries.map((c) => ({ value: String(c.id), label: `${flagFromIso2(c.iso2)} ${c.name}` })),
    [countries],
  );
  const cityOptions = useMemo(() => cities.map((c) => ({ value: c.name, label: c.name })), [cities]);
  const phoneCountryOptions = useMemo(
    () =>
      countries
        .filter((c) => c.phoneCode)
        .map((c) => ({ value: String(c.id), label: `${c.name} (${c.phoneCode})`, icon: <span>{flagFromIso2(c.iso2)}</span> })),
    [countries],
  );

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
    if (!validateDetails()) return;
    setSaving(true);
    try {
      const phoneCode = countries.find((c) => String(c.id) === form.phoneCountryId)?.phoneCode ?? "";
      const phone = buildPhone(phoneCode, form.phoneNumber);
      const country = countries.find((c) => String(c.id) === form.countryId);
      const input = {
        name: form.name,
        country: country?.name ?? null,
        state: form.state || null,
        city: form.city || null,
        address: form.address || null,
        phone: phone || null,
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
              phoneCountryOptions={phoneCountryOptions}
              branchType={branchType}
              onBranchTypeChange={setBranchType}
            />
          )}

          {step === 1 && (
            <CreateBranchCopyStep
              parent={parent ? { logo_url: parent.logo_url, business_name: parent.business_name } : undefined}
              copyDescription={copyDescription}
              onCopyDescriptionChange={setCopyDescription}
            />
          )}

          {step === 2 && (
            <>
              <p className="text-sm text-muted-foreground">Share services from the parent business.</p>
              <ServiceSharingPicker
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
