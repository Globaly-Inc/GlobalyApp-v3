"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { flagFromIso2 } from "@/app/admin/platform/categories/utils";
import { geoApi, type City, type Country } from "@/app/geo/apis";
import { CreateBranchDetailsStep, EMPTY_BRANCH_FORM, branchWebsite, branchWebsiteError, branchWebsitePatch, websiteFields } from "@/app/admin/platform/businesses/components/branches/create-branch-details-step";
import { isValidEmail } from "@/app/admin/platform/businesses/utils";
import type { Branch, BranchType, SharedServices } from "../../apis/types";
import { createBranch, fetchBranch, updateBranch } from "../../store/business-profile-detail-slice";
import { useOrgContext } from "../use-org-context";
import { cleanRegistrationLicenses, type RegLicenses } from "../registration-licenses-fields";
import { fetchMe } from "@/app/auth/store/auth-slice";
import { BranchStepper } from "@/app/admin/platform/businesses/components/branches/branch-stepper";
import { HowBranchesWork } from "@/app/admin/platform/businesses/components/branches/how-branches-work";
import { CreateBranchCopyStep } from "./create-branch-copy-step";
import { BranchLivePreview } from "./branch-live-preview";
import { BranchFormFooter } from "./branch-form-footer";
import { BranchFormHeader } from "./branch-form-header";
import { BranchRegistrationSection } from "./branch-registration-section";
import { ServiceSharingPicker } from "../services/service-sharing-picker";

const STEPS = ["Details", "Copy", "Services"] as const;
const STEP_HINTS = ["Where and who", "Branding", "What it offers"] as const;

/** Full-page branch create/edit form — was a Sheet (drawer) originally, moved to its own route
 * (/business/profile/:id/branches/add, /branches/:branchId/edit) to match the Services tab's own
 * add/edit pages rather than opening on top of the list. */
export function BranchFormView({ businessId, branchId }: Readonly<{ businessId: number; branchId?: string }>) {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const parent = useAppSelector((s) => s.businessOnboarding.profile);
  const branchList = useAppSelector((s) => s.businessProfileDetail.branches);
  // Only trust the cached list when it belongs to THIS org — another org's list can still be in the
  // store, and a uuid match there would edit the wrong tenant's branch.
  const branches = branchList.ownerId === businessId ? branchList.items : [];
  // The URL's org, not whichever one the session happens to be on, must receive these requests.
  const contextReady = useOrgContext(businessId, useSearchParams().get("org"));
  const [fetchedBranch, setFetchedBranch] = useState<Branch | null>(null);
  const editBranch = branchId ? branches.find((b) => b.id === branchId) ?? fetchedBranch ?? undefined : undefined;
  const isEdit = !!branchId;

  useEffect(() => {
    if (!contextReady || !branchId || branches.some((b) => b.id === branchId)) return;
    dispatch(fetchBranch({ id: businessId, branchId }))
      .unwrap()
      .then(setFetchedBranch)
      .catch((e: Error) => toast.error("Couldn't load branch", { description: e.message }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contextReady, branchId]);

  const backHref = `/business/profile/${businessId}?tab=branches`;

  const [step, setStep] = useState(0);
  // Which side the next step slides in from.
  const [stepDir, setStepDir] = useState<1 | -1>(1);
  const goTo = (next: number) => {
    setStepDir(next > step ? 1 : -1);
    setStep(next);
  };
  const [form, setForm] = useState(EMPTY_BRANCH_FORM);
  const [countries, setCountries] = useState<Country[]>([]);
  const [cities, setCities] = useState<City[]>([]);
  const [citiesLoading, setCitiesLoading] = useState(false);
  const [branchType, setBranchType] = useState<BranchType>("same_company");
  const [copyDescription, setCopyDescription] = useState(false);
  // A new branch defaults to the same website as its head office, so it shares the head office's
  // catalog; "own website" starts empty (it extracts its own). Once the owner picks in the
  // Services step, the website choice stops overriding them.
  const [sharedServices, setSharedServices] = useState<SharedServices>(isEdit ? [] : "all");
  const servicesTouchedRef = useRef(false);
  const pickServices = (v: SharedServices) => {
    servicesTouchedRef.current = true;
    setSharedServices(v);
  };
  const [registration, setRegistration] = useState<RegLicenses>({});
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});

  const set = <K extends keyof typeof EMPTY_BRANCH_FORM>(key: K, value: (typeof EMPTY_BRANCH_FORM)[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    if (key === "websiteMode" && !isEdit && !servicesTouchedRef.current) setSharedServices(value === "same" ? "all" : []);
    setErrors((e) => (e[key as string] ? { ...e, [key]: undefined } : e));
  };

  useEffect(() => {
    if (countries.length === 0) geoApi.getCountries().then(setCountries).catch(() => setCountries([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!editBranch) return;
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
      ...(editBranch.owned ? websiteFields(editBranch.website, parent?.website) : {}),
    });
    setBranchType(editBranch.branch_type);
    setCopyDescription(editBranch.share_description);
    setSharedServices(editBranch.shared_services);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editBranch, countries]);

  useEffect(() => {
    if (!form.countryId) {
      setCities([]);
      return;
    }
    setCitiesLoading(true);
    geoApi
      .getCities(Number(form.countryId))
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
    const websiteError = isEdit && !editBranch?.owned ? undefined : branchWebsiteError(form);
    if (websiteError) next.website = websiteError;
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleNext = () => {
    if (step === 0 && !validateDetails()) {
      // After the error render, move focus to the first field that failed.
      requestAnimationFrame(() => document.querySelector<HTMLElement>('.branch-form [aria-invalid="true"]')?.focus());
      return;
    }
    goTo(step + 1);
  };

  const handleCreate = async () => {
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

      if (isEdit && branchId) {
        const website = editBranch?.owned ? { website: branchWebsitePatch(form, parent?.website) } : {};
        await dispatch(updateBranch({ id: businessId, branchId, patch: { ...input, ...website } })).unwrap();
        toast.success("Branch updated");
      } else {
        // Same Company → nothing sent; the backend copies the parent's registration.
        const registration_licenses = branchType === "same_company" ? {} : cleanRegistrationLicenses(registration);
        await dispatch(createBranch({
          id: businessId,
          input: {
            ...input,
            ...(Object.keys(registration_licenses).length ? { registration_licenses } : {}),
            ...(branchWebsite(form) !== undefined ? { website: branchWebsite(form) } : {}),
          },
        })).unwrap();
        // The branch is a new org owned by this user — refetch /auth/me so the org switcher shows it.
        dispatch(fetchMe());
        const description = country ? `${form.name} (${country.name}).` : `${form.name}.`;
        toast.success("Branch created", { description });
      }
      router.push(backHref);
    } catch (e) {
      toast.error(isEdit ? "Couldn't update branch" : "Couldn't create branch", { description: (e as Error).message });
    } finally {
      setSaving(false);
    }
  };

  // Until the URL's org is active (and, when editing, its branch loaded) there is nothing safe to
  // show — saving a blank form would send default branch type/sharing over the saved settings.
  if (!contextReady || (isEdit && !editBranch)) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const country = countries.find((c) => String(c.id) === form.countryId);
  const parentCountry = countries.find((c) => c.id === parent?.country_id)?.name;
  const parentBrand = parent ? { logo_url: parent.logo_url, business_name: parent.business_name } : undefined;

  return (
    <div className="mx-auto max-w-7xl">
      <BranchFormHeader isEdit={isEdit} branchName={editBranch?.name} parentName={parent?.business_name} onBack={() => router.push(backHref)} />

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Card className="branch-form">
          <CardContent className="pt-6">
            <BranchStepper steps={STEPS} subLabels={STEP_HINTS} current={step} onStepClick={goTo} />

            <div key={step} className={cn("mt-6 flex flex-col gap-6", stepDir > 0 ? "animate-step-forward" : "animate-step-back")}>
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
                  countryIso2={country?.iso2 ?? null}
                  showWebsite={!isEdit || !!editBranch?.owned}
                  showHowItWorks={false}
                />
              )}

              {/* Create only: the edit form is for plain branch rows, which have no registration of their own. */}
              {step === 0 && !isEdit && (
                <BranchRegistrationSection
                  open={branchType !== "same_company"}
                  value={registration}
                  onChange={setRegistration}
                  countryId={form.countryId ? Number(form.countryId) : null}
                />
              )}

              {step === 1 && (
                <CreateBranchCopyStep parent={parentBrand} copyDescription={copyDescription} onCopyDescriptionChange={setCopyDescription} />
              )}

              {step === 2 && (
                <>
                  <p className="text-sm text-muted-foreground">Share services from the parent business.</p>
                  <ServiceSharingPicker value={sharedServices} onChange={pickServices} emptyText="No services available to share." />
                </>
              )}
            </div>

            <BranchFormFooter
              step={step}
              stepCount={STEPS.length}
              saving={saving}
              isEdit={isEdit}
              onBack={() => goTo(step - 1)}
              onNext={handleNext}
              onSubmit={handleCreate}
            />
          </CardContent>
        </Card>

        <aside className="flex flex-col gap-3 lg:sticky lg:top-4">
          <BranchLivePreview
            parent={parentBrand}
            parentLocation={[parent?.city, parentCountry].filter(Boolean).join(", ")}
            name={form.name}
            city={form.city}
            country={country?.name ?? ""}
            hasContact={!!(form.email || form.phone)}
            branchType={branchType}
            sharedServices={sharedServices}
          />
          <HowBranchesWork className="rounded-xl bg-card" />
        </aside>
      </div>
    </div>
  );
}
