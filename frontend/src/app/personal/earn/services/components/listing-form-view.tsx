"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Combobox } from "@/components/combobox";
import { FieldError } from "@/components/field-error";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { useValidatedForm } from "@/lib/use-validated-form";
import { geoApi, type Country } from "@/app/geo/apis";
import { servicesApi, type City, type Currency, type Listing } from "../apis";
import { CURRENCIES } from "../apis";
import { MAX_COVER_MB } from "../const";
import { currencySymbol, formatMoney, toMajorUnitsInput, toMinorUnits } from "../utils";
import {
  clearListing,
  createListing,
  fetchListing,
  fetchMeta,
  updateListing,
  uploadCover,
} from "../store/my-services-slice";
import { CoverImageField } from "./cover-image-field";
import { SectionError } from "./section-error";

// A type alias, not an interface: useValidatedForm takes `T extends Record<string, unknown>`, and TypeScript
// only infers an implicit index signature for type aliases. Every other form in this app does the same.
type FormState = {
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

type CoverState = { storagePath: string | null; url: string | null };

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

const emptyForm = (): FormState => ({
  title: "",
  categoryId: "",
  description: "",
  price: "",
  currency: "AUD",
  countryId: "",
  cityId: "",
});

const toForm = (listing: Listing): FormState => ({
  title: listing.title,
  categoryId: String(listing.category_id),
  description: listing.description ?? "",
  // 5000 → "50.00". The word "cents" appears nowhere in this UI.
  price: toMajorUnitsInput(listing.price_minor),
  currency: listing.currency,
  countryId: listing.country_id ? String(listing.country_id) : "",
  cityId: listing.city_id ? String(listing.city_id) : "",
});

/**
 * Create and edit, split in two.
 *
 * This outer component only waits for data; the form below it is mounted with its values already in place, so
 * there is no hydration effect and no `initialized` flag. V2 called setState during render behind exactly such
 * a flag, which is what made its edit fields flicker and reset after load — a shape that cannot occur here
 * because the form never exists before its data does.
 */
export function ListingFormView({ serviceId }: Readonly<{ serviceId?: number }>) {
  const dispatch = useAppDispatch();
  const { listing, listingStatus, listingError } = useAppSelector((state) => state.myServices);
  const isEdit = serviceId !== undefined;

  useEffect(() => {
    dispatch(fetchMeta());
    if (isEdit) dispatch(fetchListing(serviceId));
    return () => {
      dispatch(clearListing());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serviceId]);

  if (isEdit && listingStatus === "failed") {
    return (
      <div className="mx-auto w-full max-w-2xl space-y-4">
        <BackLink />
        <SectionError message={listingError} onRetry={() => dispatch(fetchListing(serviceId))} />
      </div>
    );
  }

  const loaded = !isEdit || (listing !== null && listing.id === serviceId);
  if (!loaded) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const initial = isEdit && listing ? toForm(listing) : emptyForm();
  const initialCover: CoverState =
    isEdit && listing ? { storagePath: listing.cover_storage_path, url: listing.cover_url } : { storagePath: null, url: null };

  return (
    <ListingForm
      // Remount if the route ever points at a different listing, so initial values are re-taken.
      key={serviceId ?? "new"}
      serviceId={serviceId}
      initial={initial}
      initialCover={initialCover}
    />
  );
}

function ListingForm({
  serviceId,
  initial,
  initialCover,
}: Readonly<{ serviceId?: number; initial: FormState; initialCover: CoverState }>) {
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

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4">
      <BackLink />

      <Card>
        <CardHeader>
          <CardTitle>{isEdit ? "Edit Service" : "Create New Service"}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="title">
              Title <span className="text-destructive">*</span>
            </Label>
            <Input
              id="title"
              value={form.title}
              placeholder="Airport Pickup — Sydney"
              aria-invalid={!!errors.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            />
            <FieldError message={errors.title} />
          </div>

          {/* flex + gap, never space-y — base-ui's focus guards inherit sibling margins and shift the layout
              when a Combobox popover opens (frontend/AGENTS.md). */}
          <div className="flex flex-col gap-2">
            <Label htmlFor="category">
              Category <span className="text-destructive">*</span>
            </Label>
            <Combobox
              id="category"
              options={categoryOptions}
              value={form.categoryId}
              onChange={(value) => setForm((f) => ({ ...f, categoryId: value }))}
              placeholder="Choose a category"
              searchPlaceholder="Search categories..."
              aria-invalid={!!errors.categoryId}
            />
            <FieldError message={errors.categoryId} />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              rows={4}
              value={form.description}
              placeholder="What's included, where you'll meet, how long it takes."
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            />
            <FieldError message={errors.description} />
          </div>

          <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
            <div className="flex flex-col gap-2">
              <Label htmlFor="price">
                Price <span className="text-destructive">*</span>
              </Label>
              <div className="relative">
                {/* The symbol sits in the field so there is no doubt what unit is being asked for. */}
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                  {symbol}
                </span>
                <Input
                  id="price"
                  inputMode="decimal"
                  className="pl-8"
                  value={form.price}
                  placeholder="50"
                  aria-invalid={!!errors.price}
                  onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
                />
              </div>
              <FieldError message={errors.price} />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="currency">Currency</Label>
              <Combobox
                id="currency"
                className="sm:w-28"
                options={currencyOptions}
                value={form.currency}
                onChange={(value) => setForm((f) => ({ ...f, currency: value }))}
                searchPlaceholder="Search..."
              />
            </div>
          </div>

          {/* The confirmation that makes the unit unambiguous. V2 asked for cents and showed nothing back. */}
          {priceMinor !== null && priceMinor > 0 && (
            <p className="-mt-2 text-sm text-muted-foreground">
              Buyers will pay <strong className="text-foreground">{formatMoney(priceMinor, form.currency)}</strong>
            </p>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="country">Country</Label>
              <Combobox
                id="country"
                options={countryOptions}
                value={form.countryId}
                // Changing the country clears the city — the old one belongs to a different country.
                onChange={(value) => setForm((f) => ({ ...f, countryId: value, cityId: "" }))}
                placeholder="Any country"
                searchPlaceholder="Search countries..."
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="city">City</Label>
              <Combobox
                id="city"
                options={cityOptions}
                value={form.cityId}
                onChange={(value) => setForm((f) => ({ ...f, cityId: value }))}
                placeholder={form.countryId ? "Any city" : "Pick a country first"}
                searchPlaceholder="Search cities..."
                loading={citiesLoading}
                disabled={!form.countryId}
              />
              <FieldError message={errors.cityId} />
            </div>
          </div>

          <CoverImageField
            // Hidden entirely when no bucket is configured, rather than offering an upload that must fail.
            available={meta?.cover_upload_available ?? false}
            previewUrl={cover.url}
            uploading={uploading}
            onPick={handlePickCover}
            onRemove={() => setCover({ storagePath: null, url: null })}
          />

          <Button className="w-full" onClick={handleSubmit} disabled={saving || uploading}>
            {uploading ? "Uploading…" : saving ? "Saving…" : isEdit ? "Update Service" : "Create Service"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function BackLink() {
  return (
    <Link
      href="/personal/earn/services"
      className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="h-4 w-4" />
      Back to Services
    </Link>
  );
}
