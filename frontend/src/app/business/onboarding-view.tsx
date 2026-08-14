"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { toast } from "sonner";
import { Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/combobox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { geoApi, type Country } from "../geo/apis";
import { updateMyProfile, updateSubCategory } from "./store/business-onboarding-slice";
import { BUSINESS_TYPES } from "./static/onboarding-content";
import { slugify, validateBusinessDetails, validateBusinessField } from "./validation";
import { clearFieldErrorIfNowValid } from "./utils";
import type { BusinessProfile, BusinessType } from "./apis/types";

const TOTAL_STEPS = 2;

export function OnboardingView() {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const { profile, status } = useAppSelector((state) => state.businessOnboarding);

  useEffect(() => {
    if (profile?.onboarding_completed) router.replace("/business");
  }, [profile, router]);

  if (!profile || status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (profile.onboarding_completed) return null;

  return <OnboardingForm initialProfile={profile} />;
}

function resumeStep(profile: BusinessProfile): number {
  return profile.business_type ? 2 : 1;
}

function OnboardingForm({ initialProfile }: Readonly<{ initialProfile: BusinessProfile }>) {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const { status } = useAppSelector((state) => state.businessOnboarding);
  const saving = status === "saving";

  const [countries, setCountries] = useState<Country[]>([]);
  const [step, setStep] = useState(() => resumeStep(initialProfile));
  const [businessType, setBusinessType] = useState<BusinessType | null>(initialProfile.business_type);
  const [businessName, setBusinessName] = useState(initialProfile.business_name ?? "");
  const [subdomain, setSubdomain] = useState(initialProfile.subdomain ?? "");
  const [subdomainTouched, setSubdomainTouched] = useState(false);
  const [phone, setPhone] = useState(initialProfile.phone ?? "");
  const [countryId, setCountryId] = useState(initialProfile.country_id ? String(initialProfile.country_id) : "");
  const [state, setState] = useState(initialProfile.state ?? "");
  const [city, setCity] = useState(initialProfile.city ?? "");
  const [address, setAddress] = useState(initialProfile.address ?? "");
  const [postcode, setPostcode] = useState(initialProfile.postcode ?? "");
  const [companyRegistrationFile, setCompanyRegistrationFile] = useState<File | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    geoApi.getCountries().then(setCountries).catch(() => setCountries([]));
  }, []);

  const countryOptions = countries.map((c) => ({ value: String(c.id), label: c.name }));

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
    if (!subdomainTouched) {
      const generated = slugify(value);
      setSubdomain(generated);
      clearFieldErrorIfNowValid(setFieldErrors, "subdomain", validateBusinessField("subdomain", generated) === null);
    }
  };
  const handleSubdomainChange = (value: string) => {
    setSubdomainTouched(true);
    setSubdomain(value);
    clearFieldErrorIfNowValid(setFieldErrors, "subdomain", validateBusinessField("subdomain", value) === null);
  };
  const handlePhoneChange = (value: string) => {
    setPhone(value);
    clearFieldErrorIfNowValid(setFieldErrors, "phone", validateBusinessField("phone", value) === null);
  };
  const handleCountryChange = (value: string) => {
    setCountryId(value);
    clearFieldErrorIfNowValid(setFieldErrors, "countryId", validateBusinessField("countryId", value) === null);
  };
  const handleAddressChange = (value: string) => {
    setAddress(value);
    clearFieldErrorIfNowValid(setFieldErrors, "address", validateBusinessField("address", value) === null);
  };

  const handleContinueFromType = async () => {
    if (!businessType) return;
    if (!(await save({ business_type: businessType }))) return;
    dispatch(updateSubCategory({ sub_category: businessType }));
    setStep(2);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const errors = validateBusinessDetails({ phone, countryId, address, subdomain, businessName, businessType });
    if (errors) {
      setFieldErrors(errors);
      return;
    }
    setFieldErrors({});
    const ok = await save({
      phone,
      country_id: Number(countryId),
      address,
      state: state || null,
      city: city || null,
      postcode: postcode || null,
      onboarding_completed: true,
    });
    if (!ok) return;
    toast.success("Business details saved!");
    router.replace("/business");
  };

  let content: React.ReactNode;
  if (step === 1) {
    content = (
      <div className="space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold">What type of business are you?</h1>
          <p className="text-muted-foreground mt-1">Choose the option that best describes your organisation.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {BUSINESS_TYPES.map((cat) => (
            <Card
              key={cat.value}
              onClick={() => setBusinessType(cat.value)}
              className={cn(
                "cursor-pointer transition-all hover:shadow-md border-2",
                businessType === cat.value ? "border-primary bg-primary/5" : "border-border",
              )}
            >
              <CardContent className="p-5">
                <div
                  className={cn(
                    "w-10 h-10 rounded-xl flex items-center justify-center mb-3",
                    businessType === cat.value ? "bg-primary text-primary-foreground" : "bg-muted",
                  )}
                >
                  <cat.icon className="h-5 w-5" />
                </div>
                <p className="font-semibold">{cat.title}</p>
                <p className="text-sm text-muted-foreground mt-1">{cat.description}</p>
              </CardContent>
            </Card>
          ))}
        </div>
        <Button onClick={handleContinueFromType} disabled={!businessType || saving} className="h-10 w-full cursor-pointer">
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Continue
        </Button>
      </div>
    );
  } else {
    content = (
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold">Business Details</h1>
          <p className="text-muted-foreground mt-1">Tell us about your organisation.</p>
        </div>
        <Card>
          <CardContent className="p-6 space-y-4">
            <div className="space-y-2">
              <Label>
                {businessType === "institution" ? "Institution Name *" : "Business Name"}
              </Label>
              <Input
                className="h-10"
                value={businessName}
                onChange={(e) => handleBusinessNameChange(e.target.value)}
                placeholder={businessType === "institution" ? "e.g. Global State University" : "e.g. Global Education Agency"}
                aria-invalid={!!fieldErrors.businessName}
              />
              {fieldErrors.businessName && <p className="text-sm text-destructive">{fieldErrors.businessName}</p>}
            </div>
            {businessType !== "institution" && (
              <div className="space-y-2">
                <Label>Subdomain *</Label>
                <div className="flex items-center gap-2">
                  <Input
                    className="h-10"
                    value={subdomain}
                    onChange={(e) => handleSubdomainChange(e.target.value.toLowerCase())}
                    placeholder="your-agency"
                    aria-invalid={!!fieldErrors.subdomain}
                  />
                  <span className="text-sm text-muted-foreground whitespace-nowrap">.globalyhub.com</span>
                </div>
                {fieldErrors.subdomain && <p className="text-sm text-destructive">{fieldErrors.subdomain}</p>}
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Phone *</Label>
                <Input
                  className="h-10"
                  value={phone}
                  onChange={(e) => handlePhoneChange(e.target.value)}
                  aria-invalid={!!fieldErrors.phone}
                />
                {fieldErrors.phone && <p className="text-sm text-destructive">{fieldErrors.phone}</p>}
              </div>
              <div className="flex flex-col gap-2">
                <Label>Country *</Label>
                <Combobox
                  value={countryId}
                  onChange={handleCountryChange}
                  placeholder="Select country"
                  searchPlaceholder="Search countries..."
                  options={countryOptions}
                  aria-invalid={!!fieldErrors.countryId}
                />
                {fieldErrors.countryId && <p className="text-sm text-destructive">{fieldErrors.countryId}</p>}
              </div>
            </div>
            <div className="space-y-2">
              <Label>Address *</Label>
              <Input
                className="h-10"
                value={address}
                onChange={(e) => handleAddressChange(e.target.value)}
                aria-invalid={!!fieldErrors.address}
              />
              {fieldErrors.address && <p className="text-sm text-destructive">{fieldErrors.address}</p>}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>State</Label>
                <Input className="h-10" value={state} onChange={(e) => setState(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>City</Label>
                <Input className="h-10" value={city} onChange={(e) => setCity(e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Postcode</Label>
              <Input className="h-10" value={postcode} onChange={(e) => setPostcode(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Company Registration Document</Label>
              <Input
                type="file"
                accept=".pdf,.jpg,.jpeg,.png"
                onChange={(e) => setCompanyRegistrationFile(e.target.files?.[0] ?? null)}
              />
              {companyRegistrationFile && (
                <p className="text-sm text-muted-foreground">Selected: {companyRegistrationFile.name}</p>
              )}
            </div>
          </CardContent>
        </Card>
        <div className="flex gap-3">
          <Button type="button" variant="outline" onClick={() => setStep(1)} className="h-10 flex-1 cursor-pointer">
            Back
          </Button>
          <Button type="submit" disabled={saving} className="h-10 flex-1 cursor-pointer">
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Finish
          </Button>
        </div>
      </form>
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
