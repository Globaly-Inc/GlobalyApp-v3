"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { toast } from "sonner";
import { Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn, splitPhone } from "@/lib/utils";
import { saveAccessToken, saveSelectedOrgId } from "@/lib/session";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { DynamicIcon } from "@/components/dynamic-icon";
import { geoApi, type Country } from "../geo/apis";
import { businessApi } from "./apis";
import { registerBusiness, registerInstitution, updateMyProfile } from "./store/business-onboarding-slice";
import { validateBusinessDetails, validateBusinessField } from "./validation";
import { clearFieldErrorIfNowValid } from "./utils";
import { BusinessDetailsStep } from "./components/business-details-step";
import type { BusinessCategoryOption, BusinessProfile } from "./apis/types";
import { flagFromIso2 } from "@/app/admin/platform/categories/utils";
import type { PlaceDetails } from "@/lib/api/places";
// The one category whose flow differs (name field instead of subdomain) — keyed on the
// seeded slug, see backend/database/seeders/globalyapp/business_categories_seeder.ts.
const INSTITUTION_SLUG = "institutions";

const TOTAL_STEPS = 2;

export function OnboardingView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { profile, status } = useAppSelector((state) => state.businessOnboarding);
  const isNew = searchParams.get("new") === "1" || !profile;

  useEffect(() => {
    if (!isNew && profile?.onboarding_completed) router.replace("/business/profile");
  }, [isNew, profile, router]);

  if (!isNew && status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isNew && profile?.onboarding_completed) return null;

  return <OnboardingForm initialProfile={isNew ? null : profile} isNew={isNew} />;
}

function resumeStep(profile: BusinessProfile): number {
  return profile.business_category_id ? 2 : 1;
}

function OnboardingForm({
  initialProfile,
  isNew,
}: Readonly<{ initialProfile: BusinessProfile | null; isNew: boolean }>) {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const { status } = useAppSelector((state) => state.businessOnboarding);
  const saving = status === "saving";

  const [countries, setCountries] = useState<Country[]>([]);
  const [categories, setCategories] = useState<BusinessCategoryOption[]>([]);
  const [step, setStep] = useState(() => (initialProfile ? resumeStep(initialProfile) : 1));
  const [categoryId, setCategoryId] = useState(
    initialProfile?.business_category_id ? String(initialProfile.business_category_id) : "",
  );
  const [businessName, setBusinessName] = useState(initialProfile?.business_name ?? "");
  const [phoneCountryId, setPhoneCountryId] = useState("");
  const [phoneNumber, setPhoneNumber] = useState(initialProfile?.phone ?? "");
  const [countryId, setCountryId] = useState(initialProfile?.country_id ? String(initialProfile.country_id) : "");
  const [state, setState] = useState(initialProfile?.state ?? "");
  const [city, setCity] = useState(initialProfile?.city ?? "");
  const [address, setAddress] = useState(initialProfile?.address ?? "");
  const [postcode, setPostcode] = useState(initialProfile?.postcode ?? "");
  const [latitude, setLatitude] = useState<number | null>(initialProfile?.latitude ?? null);
  const [longitude, setLongitude] = useState<number | null>(initialProfile?.longitude ?? null);
  const [companyRegistrationFile, setCompanyRegistrationFile] = useState<File | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const fetchedRef = useRef(false);
  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    geoApi.getCountries().then(setCountries).catch(() => setCountries([]));
    businessApi.getBusinessCategories().then(setCategories).catch(() => setCategories([]));
  }, []);

  const phoneHydratedRef = useRef(false);
  useEffect(() => {
    if (phoneHydratedRef.current || !countries.length || !initialProfile?.phone) return;
    phoneHydratedRef.current = true;
    const parsed = splitPhone(initialProfile.phone, countries);
    setPhoneCountryId(parsed.phoneCountryId);
    setPhoneNumber(parsed.phoneNumber);
  }, [countries, initialProfile]);

  const countryOptions = countries.map((c) => ({ value: String(c.id), label: c.name }));
  const isInstitution = categories.find((c) => c.value === categoryId)?.slug === INSTITUTION_SLUG;
  const countryIso2 = countries.find((c) => String(c.id) === countryId)?.iso2;
  const phoneCountryOptions = countries
    .filter((c) => c.phoneCode)
    .map((c) => ({ value: String(c.id), label: `${c.name} (${c.phoneCode})`, icon: <span>{flagFromIso2(c.iso2)}</span> }));
  const phoneIso2 = countries.find((c) => String(c.id) === phoneCountryId)?.iso2;

  const save = useCallback(
    async (patch: Parameters<typeof updateMyProfile>[0]) => {
      const outcome = await dispatch(updateMyProfile(patch));
      if (updateMyProfile.rejected.match(outcome)) {
        toast.error("Couldn't save", { description: outcome.error.message ?? "Please try again." });
        return false;
      }
      return true;
    },
    [dispatch],
  );

  const handleBusinessNameChange = (value: string) => {
    setBusinessName(value);
    clearFieldErrorIfNowValid(setFieldErrors, "businessName", validateBusinessField("businessName", value) === null);
  };
  const handlePhoneCountryChange = (value: string) => {
    setPhoneCountryId(value);
    clearFieldErrorIfNowValid(setFieldErrors, "phoneCountryId", validateBusinessField("phoneCountryId", value) === null);
  };
  const handlePhoneNumberChange = (value: string) => {
    setPhoneNumber(value);
    clearFieldErrorIfNowValid(setFieldErrors, "phoneNumber", validateBusinessField("phoneNumber", value) === null);
  };
  const handleCountryChange = (value: string) => {
    setCountryId(value);
    clearFieldErrorIfNowValid(setFieldErrors, "countryId", validateBusinessField("countryId", value) === null);
  };
  const handleAddressChange = (value: string) => {
    setAddress(value);
    clearFieldErrorIfNowValid(setFieldErrors, "address", validateBusinessField("address", value) === null);
  };
  const handlePlaceResolved = (details: PlaceDetails) => {
    setLatitude(details.latitude);
    setLongitude(details.longitude);
    if (details.city) setCity(details.city);
    if (details.state) setState(details.state);
    if (details.postcode) setPostcode(details.postcode);
  };

  const handleContinueFromType = async () => {
    if (!categoryId) return;
    // No business row exists yet in `isNew` mode — there's nothing to PATCH until
    // registration on the final step.
    if (!isNew && !(await save({ business_category_id: Number(categoryId) }))) return;
    setStep(2);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const errors = validateBusinessDetails({
      isInstitution,
      phoneCountryId,
      phoneNumber,
      phoneIso2,
      countryId,
      address,
      businessName,
    });
    if (errors) {
      setFieldErrors(errors);
      return;
    }
    setFieldErrors({});
    const phoneCode = countries.find((c) => String(c.id) === phoneCountryId)?.phoneCode ?? "";
    const phone = [phoneCode, phoneNumber].filter(Boolean).join(" ");

    if (isNew) {
      if (isInstitution) {
        const outcome = await dispatch(
          registerInstitution({
            institution_name: businessName,
            phone,
            country_id: Number(countryId),
            address,
            state: state || undefined,
            city: city || undefined,
            postcode: postcode || undefined,
          }),
        );
        if (registerInstitution.rejected.match(outcome)) {
          toast.error("Couldn't create institution", { description: outcome.error.message ?? "Please try again." });
          return;
        }
        saveAccessToken(outcome.payload.access_token);
        saveSelectedOrgId(outcome.payload.institution.org_id);
        toast.success("Institution created!");
        window.location.assign("/business/profile");
        return;
      }

      const outcome = await dispatch(
        registerBusiness({
          business_name: businessName,
          business_category_id: Number(categoryId),
          phone,
          country_id: Number(countryId),
          address,
          state: state || undefined,
          city: city || undefined,
          postcode: postcode || undefined,
        }),
      );
      if (registerBusiness.rejected.match(outcome)) {
        toast.error("Couldn't create business", { description: outcome.error.message ?? "Please try again." });
        return;
      }
      // Full reload, matching the switcher's own re-fetch rationale — every slice
      // needs a clean re-fetch under the newly created tenant context.
      saveAccessToken(outcome.payload.access_token);
      saveSelectedOrgId(outcome.payload.org.org_id);
      toast.success("Business created!");
      window.location.assign("/business/profile");
      return;
    }

    const ok = await save({
      phone,
      country_id: Number(countryId),
      address,
      state: state || null,
      city: city || null,
      postcode: postcode || null,
      latitude,
      longitude,
      onboarding_completed: true,
    });
    if (!ok) return;
    toast.success("Business details saved!");
    router.replace("/business/profile");
  };

  let content: React.ReactNode;
  if (step === 1) {
    content = (
      <div className="space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold">What type of business are you?</h1>
          <p className="text-muted-foreground mt-1">Choose the option that best describes your organisation.</p>
        </div>
        {categories.length === 0 ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {categories.map((cat) => (
              <Card
                key={cat.value}
                onClick={() => setCategoryId(cat.value)}
                className={cn(
                  "cursor-pointer transition-all hover:shadow-md border-2",
                  categoryId === cat.value ? "border-primary bg-primary/5" : "border-border",
                )}
              >
                <CardContent className="p-5">
                  <div
                    className={cn(
                      "w-10 h-10 rounded-xl flex items-center justify-center mb-3",
                      categoryId === cat.value ? "bg-primary text-primary-foreground" : "bg-muted",
                    )}
                  >
                    <DynamicIcon name={cat.icon} fallback="Building2" className="h-5 w-5" />
                  </div>
                  <p className="font-semibold">{cat.label}</p>
                  {cat.description && <p className="text-sm text-muted-foreground mt-1">{cat.description}</p>}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
        <Button onClick={handleContinueFromType} disabled={!categoryId || saving} className="h-10 w-full cursor-pointer">
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Continue
        </Button>
      </div>
    );
  } else {
    content = (
      <BusinessDetailsStep
        isInstitution={isInstitution}
        businessName={businessName}
        onBusinessNameChange={handleBusinessNameChange}
        phoneCountryId={phoneCountryId}
        onPhoneCountryChange={handlePhoneCountryChange}
        phoneNumber={phoneNumber}
        onPhoneNumberChange={handlePhoneNumberChange}
        phoneCountryOptions={phoneCountryOptions}
        countryId={countryId}
        onCountryChange={handleCountryChange}
        countryOptions={countryOptions}
        countryIso2={countryIso2}
        address={address}
        onAddressChange={handleAddressChange}
        onPlaceResolved={handlePlaceResolved}
        state={state}
        onStateChange={setState}
        city={city}
        onCityChange={setCity}
        postcode={postcode}
        onPostcodeChange={setPostcode}
        companyRegistrationFile={companyRegistrationFile}
        onCompanyRegistrationFileChange={setCompanyRegistrationFile}
        fieldErrors={fieldErrors}
        saving={saving}
        onBack={() => setStep(1)}
        onSubmit={handleSubmit}
      />
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-muted/30">
      <header className="h-16 border-b border-border bg-background flex items-center justify-between px-6">
        <Link href="/" className="flex items-center">
          <Image src="/globaly-logo.png" alt="Globaly.io" width={753} height={157} className="h-7 w-auto" />
        </Link>
        <div className="flex items-center gap-1.5">
          {Array.from({ length: TOTAL_STEPS }, (_, i) => i + 1).map((s, i, arr) => (
            <div key={s} className="flex items-center gap-1.5">
              <div
                className={cn(
                  "w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors",
                  step >= s ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
                )}
              >
                {step > s ? <Check className="h-3.5 w-3.5" /> : s}
              </div>
              {i < arr.length - 1 && <div className={cn("w-8 h-0.5 transition-colors", step > s ? "bg-primary" : "bg-muted")} />}
            </div>
          ))}
        </div>
      </header>

      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-2xl">{content}</div>
      </div>
    </div>
  );
}
