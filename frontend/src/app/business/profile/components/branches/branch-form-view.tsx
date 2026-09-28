"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { flagFromIso2 } from "@/app/admin/platform/categories/utils";
import { geoApi, type City, type Country } from "@/app/geo/apis";
import { CreateBranchDetailsStep, EMPTY_BRANCH_FORM } from "@/app/admin/platform/businesses/components/branches/create-branch-details-step";
import { isValidEmail, isValidUrl } from "@/app/admin/platform/businesses/utils";
import type { Branch, BranchType, SharedServices } from "../../apis/types";
import { createBranch, fetchBranch, updateBranch } from "../../store/business-profile-detail-slice";
import { useOrgContext } from "../use-org-context";
import { RegistrationLicensesFields, cleanRegistrationLicenses, type RegLicenses } from "../registration-licenses-fields";
import { fetchMe } from "@/app/auth/store/auth-slice";
import { BranchStepper } from "@/app/admin/platform/businesses/components/branches/branch-stepper";
import { CreateBranchCopyStep } from "./create-branch-copy-step";
import { ServiceSharingPicker } from "../services/service-sharing-picker";

const STEPS = ["Details", "Copy", "Services"] as const;

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
  const contextReady = useOrgContext(businessId);
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
  const [form, setForm] = useState(EMPTY_BRANCH_FORM);
  const [countries, setCountries] = useState<Country[]>([]);
  const [cities, setCities] = useState<City[]>([]);
  const [citiesLoading, setCitiesLoading] = useState(false);
  const [branchType, setBranchType] = useState<BranchType>("same_company");
  const [copyDescription, setCopyDescription] = useState(false);
  const [sharedServices, setSharedServices] = useState<SharedServices>([]);
  const [registration, setRegistration] = useState<RegLicenses>({});
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});

  const set = <K extends keyof typeof EMPTY_BRANCH_FORM>(key: K, value: string) => {
    setForm((f) => ({ ...f, [key]: value }));
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
        await dispatch(updateBranch({ id: businessId, branchId, patch: input })).unwrap();
        toast.success("Branch updated");
      } else {
        // Same Company → nothing sent; the backend copies the parent's registration.
        const registration_licenses = branchType === "same_company" ? {} : cleanRegistrationLicenses(registration);
        await dispatch(createBranch({
          id: businessId,
          input: { ...input, ...(Object.keys(registration_licenses).length ? { registration_licenses } : {}) },
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

  return (
    <div className="mx-auto max-w-7xl">
      <Button variant="ghost" size="sm" className="mb-3 -ml-2" onClick={() => router.push(backHref)}>
        <ArrowLeft className="mr-1.5 h-4 w-4" /> Back to branches
      </Button>

      <div className="mb-4">
        <h2 className="flex items-center gap-2 text-lg font-bold">
          <Plus className="h-4 w-4" /> {isEdit ? "Edit branch" : "Create new branch"}
        </h2>
        <p className="text-sm text-muted-foreground">
          {isEdit ? (
            <>Update <strong>{editBranch?.name}</strong>&apos;s details.</>
          ) : (
            <>Add a new branch location under <strong>{parent?.business_name ?? "this business"}</strong>.</>
          )}
        </p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <BranchStepper steps={STEPS} current={step} />

          <div className="mt-5 flex flex-col gap-5">
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

            {/* Only a separately registered branch (subsidiary / franchise) has its own registration.
                A Same Company branch IS the parent's legal entity — the backend copies the parent's
                registration onto it instead of asking. Create only: the edit form is for plain
                branch rows, which have no registration of their own. */}
            {step === 0 && !isEdit && branchType !== "same_company" && (
              <div className="flex flex-col gap-4 border-t pt-5">
                <p className="text-sm font-semibold">Registration &amp; Licenses</p>
                <RegistrationLicensesFields
                  value={registration}
                  onChange={setRegistration}
                  countryId={form.countryId ? Number(form.countryId) : null}
                />
              </div>
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

          <div className="mt-6 flex justify-end gap-2">
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
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
