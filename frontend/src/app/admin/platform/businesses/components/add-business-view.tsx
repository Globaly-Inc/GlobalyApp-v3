"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { flagFromIso2 } from "@/app/admin/platform/categories/utils";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { fetchBusinessCategories, fetchCountries, fetchServiceCategories } from "@/app/admin/platform/categories/store/categories-slice";
import { ApiError } from "@/lib/api/http";
import { businessesApi } from "../apis";
import { createBusiness } from "../store/businesses-slice";
import type { BusinessCreateInput } from "../apis/types";
import { URL_FIELDS } from "../const";
import { buildPhone, isValidEmail, isValidPhoneForCountry, isValidUrl, sanitizeSlug, toSlug } from "../utils";
import { CategoryPickerCard } from "./add-business/category-picker-card";
import { BasicInfoCard } from "./add-business/basic-info-card";
import { LocationCard } from "./add-business/location-card";
import { ContactCard } from "./add-business/contact-card";
import { SocialMediaCard } from "./add-business/social-media-card";
import { MediaUrlsCard } from "./add-business/media-urls-card";
import { ServiceCategoriesCard } from "./add-business/service-categories-card";

type FormState = Partial<BusinessCreateInput> & { business_name: string };

const EMPTY_FORM: FormState = { business_name: "" };

export function AddBusinessView() {
  const router = useRouter();
  const dispatch = useAppDispatch();

  const businessCategories = useAppSelector((state) => state.platformCategories.businessCategories.data);
  const serviceCategories = useAppSelector((state) => state.platformCategories.serviceCategories.data);
  const countries = useAppSelector((state) => state.platformCategories.countries);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [slugManual, setSlugManual] = useState(false);
  const [allowedServiceIds, setAllowedServiceIds] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState(false);
  const [phoneCountryId, setPhoneCountryId] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);

  const pickLogoFile = (file: File) => {
    setLogoFile(file);
    setLogoPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(file);
    });
  };

  const pickCoverFile = (file: File) => {
    setCoverFile(file);
    setCoverPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(file);
    });
  };

  const fetchedRef = useRef(false);
  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    if (businessCategories.length === 0) dispatch(fetchBusinessCategories({}));
    if (serviceCategories.length === 0) dispatch(fetchServiceCategories({}));
    if (countries.length === 0) dispatch(fetchCountries());
  }, []);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => (e[key as string] ? { ...e, [key]: undefined } : e));
  };

  const handleNameChange = (value: string) => {
    set("business_name", value);
    if (!slugManual) set("subdomain", toSlug(value));
  };

  const handleCategoryChange = (id: number) => set("business_category_id", id);

  const toggleServiceCategory = (id: number) => {
    setAllowedServiceIds((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const validate = () => {
    const nextErrors: typeof errors = {};
    if (form.business_name.trim().length < 2) nextErrors.business_name = "Business name is required";
    if (!form.business_category_id) nextErrors.business_category_id = "Select a business category";
    if (!form.subdomain?.trim()) nextErrors.subdomain = "Slug is required";
    if (!form.first_name?.trim()) nextErrors.first_name = "Owner first name is required";
    if (!form.last_name?.trim()) nextErrors.last_name = "Owner last name is required";
    if (!form.email?.trim()) nextErrors.email = "Email is required";
    else if (!isValidEmail(form.email)) nextErrors.email = "Enter a valid email";
    if (phoneNumber.trim()) {
      if (!phoneCountryId) nextErrors.phone = "Select a country code";
      else if (!isValidPhoneForCountry(phoneNumber, countries.find((c) => String(c.id) === phoneCountryId)?.iso2)) {
        nextErrors.phone = "Enter a valid phone number for the selected country";
      }
    }
    for (const [key, label] of URL_FIELDS) {
      const value = form[key] as string | null | undefined;
      if (value && !isValidUrl(value)) nextErrors[key as string] = `Enter a valid ${label} URL`;
    }
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate() || !form.business_category_id || !form.email) return;
    setSaving(true);
    try {
      let logo_url: string | null;
      let cover_url: string | null;
      try {
        [logo_url, cover_url] = await Promise.all([
          logoFile ? businessesApi.uploadImage(logoFile).then((r) => r.path) : form.logo_url ?? null,
          coverFile ? businessesApi.uploadImage(coverFile).then((r) => r.path) : form.cover_url ?? null,
        ]);
      } catch (e) {
        const err = e as ApiError;
        toast.error("Couldn't upload logo/cover image", { description: err.message });
        return;
      }

      const phoneCode = countries.find((c) => String(c.id) === phoneCountryId)?.phoneCode ?? "";
      const phone = buildPhone(phoneCode, phoneNumber);
      await dispatch(
        createBusiness({
          ...form,
          business_name: form.business_name,
          business_category_id: form.business_category_id,
          email: form.email,
          subdomain: form.subdomain || toSlug(form.business_name),
          allowed_service_category_ids: Array.from(allowedServiceIds),
          phone: phone || null,
          logo_url,
          cover_url,
        }),
      ).unwrap();
      toast.success("Business created");
      router.push("/admin/platform/businesses");
    } catch (e) {
      const err = e as ApiError;
      toast.error("Couldn't create business", {
        description: err.message,
      });
    } finally {
      setSaving(false);
    }
  };

  const countryOptions = countries.map((c) => ({ value: String(c.id), label: c.name }));
  const phoneCountryOptions = useMemo(
    () => countries
      .filter((c) => c.phoneCode)
      .map((c) => ({ value: String(c.id), label: `${c.name} (${c.phoneCode})`, icon: <span>{flagFromIso2(c.iso2)}</span> })),
    [countries],
  );

  return (
    <div className="space-y-4 pb-20">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Button
            variant="ghost"
            className="mb-1 h-10 cursor-pointer gap-1 px-1 text-muted-foreground"
            onClick={() => router.push("/admin/platform/businesses")}
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
          <h1 className="text-2xl font-bold text-foreground">Add Business</h1>
          <p className="mt-1 text-muted-foreground">
            Pre-seed a business listing. It will be created in pending status with is_claimed = false.
          </p>
        </div>
        <Button className="cursor-pointer" disabled={saving} onClick={handleSubmit}>
          {saving ? "Creating…" : "Create Business"}
        </Button>
      </div>

      <CategoryPickerCard
        categories={businessCategories}
        selectedId={form.business_category_id}
        onSelect={handleCategoryChange}
        error={errors.business_category_id}
      />

      <BasicInfoCard
        businessName={form.business_name}
        onNameChange={handleNameChange}
        nameError={errors.business_name}
        description={form.description ?? ""}
        onDescriptionChange={(v) => set("description", v)}
        subdomain={form.subdomain ?? ""}
        onSubdomainChange={(v) => {
          setSlugManual(true);
          set("subdomain", sanitizeSlug(v));
        }}
        subdomainError={errors.subdomain}
      />

      <LocationCard
        countryOptions={countryOptions}
        countryId={form.country_id}
        onCountryChange={(id) => set("country_id", id)}
        countryIso2={countries.find((c) => c.id === form.country_id)?.iso2}
        address={form.address ?? ""}
        onAddressChange={(v) => set("address", v)}
        onPlaceResolved={(details) => {
          setForm((f) => ({
            ...f,
            latitude: details.latitude,
            longitude: details.longitude,
            city: details.city ?? f.city,
            state: details.state ?? f.state,
            postcode: details.postcode ?? f.postcode,
          }));
        }}
        city={form.city ?? ""}
        onCityChange={(v) => set("city", v)}
        state={form.state ?? ""}
        onStateChange={(v) => set("state", v)}
        postcode={form.postcode ?? ""}
        onPostcodeChange={(v) => set("postcode", v)}
        website={form.website ?? ""}
        onWebsiteChange={(v) => set("website", v)}
        websiteError={errors.website}
      />

      <ContactCard
        firstName={form.first_name ?? ""}
        onFirstNameChange={(v) => set("first_name", v)}
        firstNameError={errors.first_name}
        lastName={form.last_name ?? ""}
        onLastNameChange={(v) => set("last_name", v)}
        lastNameError={errors.last_name}
        email={form.email ?? ""}
        onEmailChange={(v) => set("email", v)}
        emailError={errors.email}
        phoneCountryId={phoneCountryId}
        onPhoneCountryChange={(v) => {
          setPhoneCountryId(v);
          setErrors((e) => (e.phone ? { ...e, phone: undefined } : e));
        }}
        phoneCountryOptions={phoneCountryOptions}
        phoneNumber={phoneNumber}
        onPhoneNumberChange={(v) => {
          setPhoneNumber(v);
          setErrors((e) => (e.phone ? { ...e, phone: undefined } : e));
        }}
        phoneError={errors.phone}
      />

      <SocialMediaCard
        fields={[
          { label: "LinkedIn", placeholder: "https://linkedin.com/company/...", value: form.linkedin_url ?? "", onChange: (v) => set("linkedin_url", v), error: errors.linkedin_url },
          { label: "Facebook", placeholder: "https://facebook.com/...", value: form.facebook_url ?? "", onChange: (v) => set("facebook_url", v), error: errors.facebook_url },
          { label: "Instagram", placeholder: "https://instagram.com/...", value: form.instagram_url ?? "", onChange: (v) => set("instagram_url", v), error: errors.instagram_url },
          { label: "Twitter / X", placeholder: "https://twitter.com/...", value: form.twitter_url ?? "", onChange: (v) => set("twitter_url", v), error: errors.twitter_url },
        ]}
      />

      <MediaUrlsCard
        logoPreview={logoPreview}
        onLogoFile={pickLogoFile}
        coverPreview={coverPreview}
        onCoverFile={pickCoverFile}
        logoFallback={form.business_name.charAt(0).toUpperCase() || "B"}
      />

      <ServiceCategoriesCard categories={serviceCategories} selectedIds={allowedServiceIds} onToggle={toggleServiceCategory} />
    </div>
  );
}
