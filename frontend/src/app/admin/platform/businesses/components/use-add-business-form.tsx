"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { flagFromIso2 } from "@/app/admin/platform/categories/utils";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { fetchBusinessCategoryOptions, fetchCountries, fetchServiceCategoryOptions } from "@/app/admin/platform/categories/store/categories-slice";
import { ApiError } from "@/lib/api/http";
import { businessesApi } from "../apis";
import { createBusiness } from "../store/businesses-slice";
import type { BusinessCreateInput } from "../apis/types";
import { URL_FIELDS } from "../const";
import { buildPhone, isValidEmail, isValidPhoneForCountry, isValidUrl } from "../utils";

type FormState = Partial<BusinessCreateInput> & { business_name: string };

const EMPTY_FORM: FormState = { business_name: "" };

/** State, validation and submit for the admin "Add Business" form. */
export function useAddBusinessForm() {
  const router = useRouter();
  const dispatch = useAppDispatch();

  const businessCategories = useAppSelector((state) => state.platformCategories.businessCategoryOptions);
  const serviceCategories = useAppSelector((state) => state.platformCategories.serviceCategoryOptions);
  const countries = useAppSelector((state) => state.platformCategories.countries);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
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
    if (businessCategories.length === 0) dispatch(fetchBusinessCategoryOptions());
    if (serviceCategories.length === 0) dispatch(fetchServiceCategoryOptions());
    if (countries.length === 0) dispatch(fetchCountries());
  }, []);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => (e[key as string] ? { ...e, [key]: undefined } : e));
  };

  const handleNameChange = (value: string) => set("business_name", value);

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

  return {
    form,
    setForm,
    set,
    errors,
    setErrors,
    saving,
    businessCategories,
    serviceCategories,
    countries,
    allowedServiceIds,
    phoneCountryId,
    setPhoneCountryId,
    phoneNumber,
    setPhoneNumber,
    logoPreview,
    coverPreview,
    pickLogoFile,
    pickCoverFile,
    handleNameChange,
    handleCategoryChange,
    toggleServiceCategory,
    handleSubmit,
    countryOptions,
    phoneCountryOptions,
  };
}
