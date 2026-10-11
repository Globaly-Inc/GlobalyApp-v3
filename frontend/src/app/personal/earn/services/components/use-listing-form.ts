"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { z } from "zod";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { useValidatedForm } from "@/lib/use-validated-form";
import { geoApi, type Country } from "@/app/geo/apis";
import { servicesApi, type City, type Currency, type Listing } from "../apis";
import { CURRENCIES } from "../apis";
import { MAX_COVER_MB } from "../const";
import { currencySymbol, toMajorUnitsInput, toMinorUnits } from "../utils";
import { createListing, updateListing, uploadCover } from "../store/my-services-slice";

// A type alias, not an interface: useValidatedForm takes `T extends Record<string, unknown>`, and TypeScript
// only infers an implicit index signature for type aliases. Every other form in this app does the same.
export type FormState = {
  title: string;
  /** The combobox works in strings; converted to a number id on submit. */
  categoryId: string;
  description: string;
  /** The price exactly as typed, in currency units. Converted to minor units once, on submit. */
  price: string;
  currency: string;
  countryId: string;
  cityId: string;
};

export type CoverState = { storagePath: string | null; url: string | null };

const schema: z.ZodType<FormState> = z.object({
  title: z.string().trim().min(1, "Give your service a title").max(200, "Keep the title under 200 characters"),
  categoryId: z.string().min(1, "Pick a category"),
  description: z.string().max(5000, "Keep the description under 5000 characters"),
  // The user types "50", not "5000". Validated in the units they typed, so the message matches what they see.
  price: z
    .string()
    .trim()
    .min(1, "Set a price")
    .refine((v) => toMinorUnits(v) !== null, "Enter a price like 50 or 49.99")
    .refine((v) => (toMinorUnits(v) ?? 0) > 0, "Your price must be more than zero"),
  currency: z.string().min(1),
  countryId: z.string(),
  cityId: z.string(),
});

export const emptyForm = (): FormState => ({
  title: "",
  categoryId: "",
  description: "",
  price: "",
  currency: "AUD",
  countryId: "",
  cityId: "",
});

export const toForm = (listing: Listing): FormState => ({
  title: listing.title,
  categoryId: String(listing.category_id),
  description: listing.description ?? "",
  // 5000 → "50.00". The word "cents" appears nowhere in this UI.
  price: toMajorUnitsInput(listing.price_minor),
  currency: listing.currency,
  countryId: listing.country_id ? String(listing.country_id) : "",
  cityId: listing.city_id ? String(listing.city_id) : "",
});

/** Everything the listing form holds: values, option lists, the cover upload and submit. */
export function useListingForm(serviceId: number | undefined, initial: FormState, initialCover: CoverState) {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const { meta, saving, uploading } = useAppSelector((state) => state.myServices);
  const isEdit = serviceId !== undefined;

  const { form, setForm, errors, validate } = useValidatedForm(schema, () => initial);
  const [countries, setCountries] = useState<Country[]>([]);
  // Cities are cached against the country they belong to, so a stale list can never be shown for a newly
  // picked country — and the fetch effect needs no setState of its own to clear them.
  const [cityCache, setCityCache] = useState<{ countryId: string; list: City[] }>({ countryId: "", list: [] });
  const [cover, setCover] = useState<CoverState>(initialCover);

  // Derived, not stored: a country is selected but its cities have not arrived yet. Both the success and the
  // failure path stamp the cache with the country they fetched, so this flips false either way.
  const citiesLoading = !!form.countryId && cityCache.countryId !== form.countryId;

  useEffect(() => {
    geoApi.getCountries().then(setCountries).catch(() => setCountries([]));
  }, []);

  // Cities follow the selected country.
  useEffect(() => {
    const countryId = form.countryId;
    if (!countryId || cityCache.countryId === countryId) return;
    let cancelled = false;
    servicesApi
      .getCities(Number(countryId))
      .then((list) => !cancelled && setCityCache({ countryId, list }))
      // A failed lookup still stamps the country, so the field settles on "no cities" instead of spinning.
      .catch(() => !cancelled && setCityCache({ countryId, list: [] }));
    return () => {
      cancelled = true;
    };
    // cityCache.countryId is a genuine dependency: once the fetch stamps it, this re-runs and the guard above
    // returns immediately. No loop, and no lying to the linter.
  }, [form.countryId, cityCache.countryId]);

  const countryOptions = useMemo(
    () => countries.map((c) => ({ value: String(c.id), label: c.name })),
    [countries],
  );
  const cityOptions = useMemo(
    () =>
      cityCache.countryId === form.countryId
        ? cityCache.list.map((c) => ({ value: String(c.id), label: c.name }))
        : [],
    [cityCache, form.countryId],
  );
  // Straight from service_categories — an admin adding one appears here with no deploy.
  const categoryOptions = useMemo(
    () => (meta?.categories ?? []).map((c) => ({ value: String(c.id), label: c.name })),
    [meta],
  );
  const currencyOptions = useMemo(
    () => (meta?.currencies ?? CURRENCIES).map((c) => ({ value: c, label: c })),
    [meta],
  );

  const priceMinor = toMinorUnits(form.price);
  const symbol = currencySymbol(form.currency);

  const handlePickCover = async (file: File) => {
    if (file.size > MAX_COVER_MB * 1024 * 1024) {
      toast.error("That image is too large", { description: `Keep it under ${MAX_COVER_MB}MB.` });
      return;
    }
    const result = await dispatch(uploadCover(file));
    if (uploadCover.rejected.match(result)) {
      // The submission is abandoned rather than half-saved: nothing is created without its image.
      toast.error("Image upload failed", { description: result.error.message ?? "Please try again." });
      return;
    }
    setCover({ storagePath: result.payload.storage_path, url: result.payload.url });
  };

  const handleSubmit = async () => {
    const data = validate();
    if (!data) {
      toast.error("Please fill in required fields");
      return;
    }
    const minor = toMinorUnits(data.price);
    // Belt and braces: the schema already refused this, and the server refuses it again.
    if (minor === null || minor <= 0) {
      toast.error("Please check the price");
      return;
    }

    const payload = {
      title: data.title,
      category_id: Number(data.categoryId),
      description: data.description.trim() ? data.description.trim() : null,
      price_minor: minor,
      currency: data.currency as Currency,
      country_id: data.countryId ? Number(data.countryId) : null,
      city_id: data.cityId ? Number(data.cityId) : null,
      cover_storage_path: cover.storagePath,
    };

    const result = isEdit
      ? await dispatch(updateListing({ serviceId, input: payload }))
      : await dispatch(createListing(payload));

    if (createListing.rejected.match(result) || updateListing.rejected.match(result)) {
      toast.error(isEdit ? "Couldn't update the listing" : "Couldn't create the listing", {
        description: result.error.message ?? "Please try again.",
      });
      return;
    }

    toast.success(isEdit ? "Service updated" : "Service created");
    router.push("/personal/earn/services");
  };

  return {
    isEdit,
    meta,
    saving,
    uploading,
    form,
    setForm,
    errors,
    cover,
    setCover,
    citiesLoading,
    countryOptions,
    cityOptions,
    categoryOptions,
    currencyOptions,
    priceMinor,
    symbol,
    handlePickCover,
    handleSubmit,
  };
}

export type ListingFormModel = ReturnType<typeof useListingForm>;
