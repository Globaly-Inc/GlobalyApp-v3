"use client";

import { useMemo, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { Globe, Loader2, Mail, MapPin, Pencil, Phone, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Combobox } from "@/components/combobox";
import { FieldError } from "@/components/field-error";
import { AddressAutocomplete } from "@/components/address-autocomplete";
import { ProfileSection } from "@/app/(web)/components/profile/profile-section";
import { ContactRow } from "@/app/(web)/components/profile/profile-contact-card";
import { joinParts } from "@/app/(web)/components/profile/profile-data";
import { useValidatedForm } from "@/lib/use-validated-form";
import { useAppDispatch } from "@/lib/hooks";
import { flagFromIso2 } from "@/app/admin/platform/categories/utils";
import { isValidPhoneForCountry } from "@/app/admin/platform/businesses/utils";
import { splitPhone, toNumberOrNull } from "@/lib/utils";
import type { PlaceDetails } from "@/lib/api/places";
import { updateMyProfile } from "@/app/business/store/business-onboarding-slice";
import type { BusinessProfile } from "@/app/business/apis/types";
import type { Country } from "@/app/geo/apis";
import { HEADER_PENCIL } from "../const";
import { PrivacyBadge } from "@/components/privacy-badge";
import { useSectionVisibility } from "./use-section-visibility";

const REQUIRED = "This field is required";

type FormState = {
  email: string;
  phoneCountryId: string;
  phoneNumber: string;
  website: string;
  countryId: string;
  address: string;
  city: string;
  state: string;
  postcode: string;
  latitude: number | null;
  longitude: number | null;
};

// Same rules the details dialog enforced — the fields moved into the card, the validation didn't
// change. Postcode stays optional: plenty of the addresses here have none.
function buildSchema(countries: Country[]): z.ZodType<FormState> {
  return z.object({
    email: z.string().min(1, REQUIRED).pipe(z.email("Enter a valid email")),
    phoneCountryId: z.string().min(1, REQUIRED),
    phoneNumber: z.string().min(1, REQUIRED),
    website: z.string().refine((v) => v === "" || z.string().url().safeParse(v).success, "Enter a valid URL"),
    countryId: z.string().min(1, REQUIRED),
    address: z.string().min(1, REQUIRED),
    city: z.string().min(1, REQUIRED),
    state: z.string().min(1, REQUIRED),
    postcode: z.string(),
    latitude: z.number().nullable(),
    longitude: z.number().nullable(),
  }).superRefine((data, ctx) => {
    if (!data.phoneCountryId || !data.phoneNumber) return;
    const iso2 = countries.find((c) => String(c.id) === data.phoneCountryId)?.iso2;
    if (!isValidPhoneForCountry(data.phoneNumber, iso2)) {
      ctx.addIssue({ code: "custom", path: ["phoneNumber"], message: "Enter a valid phone number for the selected country" });
    }
  });
}

function toForm(profile: BusinessProfile, countries: Country[]): FormState {
  const { phoneCountryId, phoneNumber } = splitPhone(profile.phone, countries);
  return {
    email: profile.email ?? "",
    phoneCountryId,
    phoneNumber,
    website: profile.website ?? "",
    countryId: profile.country_id ? String(profile.country_id) : "",
    address: profile.address ?? "",
    city: profile.city ?? "",
    state: profile.state ?? "",
    postcode: profile.postcode ?? "",
    latitude: toNumberOrNull(profile.latitude),
    longitude: toNumberOrNull(profile.longitude),
  };
}

/** V1's Contact Details section — contact fields then the address block, edited in place. */
export function ContactDetailsCard({
  profile,
  countries,
  readOnly,
}: Readonly<{ profile: BusinessProfile; countries: Country[]; readOnly: boolean }>) {
  const dispatch = useAppDispatch();
  const { isPublic, toggle, canToggle } = useSectionVisibility(profile);
  const canEditVisibility = !readOnly && canToggle;
  const schema = useMemo(() => buildSchema(countries), [countries]);
  const { form, setForm, errors, reset, validate } = useValidatedForm(schema, () => toForm(profile, countries));
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const countryOptions = useMemo(() => countries.map((c) => ({ value: String(c.id), label: c.name })), [countries]);
  const phoneCountryOptions = useMemo(
    () => countries
      .filter((c) => c.phoneCode)
      .map((c) => ({ value: String(c.id), label: `${c.name} (${c.phoneCode})`, icon: <span>{flagFromIso2(c.iso2)}</span> })),
    [countries],
  );
  const countryIso2 = countries.find((c) => String(c.id) === form.countryId)?.iso2;

  const startEditing = () => {
    reset(toForm(profile, countries));
    setEditing(true);
  };

  // Picking a suggestion fills in what Google resolved, so the owner isn't retyping the city and
  // state it already knows — and it's what puts coordinates on the row for the map.
  const handlePlaceResolved = (details: PlaceDetails) => {
    setForm((f) => ({
      ...f,
      latitude: details.latitude,
      longitude: details.longitude,
      city: details.city ?? f.city,
      state: details.state ?? f.state,
      postcode: details.postcode ?? f.postcode,
    }));
  };

  const save = async () => {
    const data = validate();
    if (!data) return;
    setSaving(true);
    try {
      const phoneCode = countries.find((c) => String(c.id) === data.phoneCountryId)?.phoneCode ?? "";
      await dispatch(updateMyProfile({
        email: data.email,
        phone: [phoneCode, data.phoneNumber].filter(Boolean).join(" "),
        website: data.website || null,
        country_id: Number(data.countryId),
        address: data.address,
        city: data.city,
        state: data.state,
        postcode: data.postcode || null,
        latitude: data.latitude,
        longitude: data.longitude,
      })).unwrap();
      toast.success("Contact details updated");
      setEditing(false);
    } catch (e) {
      toast.error("Couldn't save", { description: (e as Error).message });
    } finally {
      setSaving(false);
    }
  };

  const addressLabel = joinParts(
    profile.address,
    profile.city,
    profile.state,
    countries.find((c) => c.id === profile.country_id)?.name,
    profile.postcode,
  );

  return (
    <ProfileSection
      icon={Phone}
      title="Contact Details"
      badge={<PrivacyBadge isPublic={isPublic("contact")} onToggle={canEditVisibility ? () => toggle("contact") : undefined} />}
      action={
        readOnly ? null : (
          <Button
            size="icon-sm"
            variant="ghost"
            className={HEADER_PENCIL}
            aria-label={editing ? "Stop editing contact details" : "Edit contact details"}
            onClick={() => (editing ? setEditing(false) : startEditing())}
          >
            <Pencil className="h-4 w-4" />
          </Button>
        )
      }
    >
      {editing ? (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Email</Label>
            <Input
              className="h-10"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              aria-invalid={!!errors.email}
            />
            <FieldError message={errors.email} />
          </div>

          <div className="space-y-2">
            <Label>Phone</Label>
            <div className="grid grid-cols-3 gap-2">
              <Combobox
                value={form.phoneCountryId}
                onChange={(v) => setForm((f) => ({ ...f, phoneCountryId: v }))}
                options={phoneCountryOptions}
                placeholder="Code"
                searchPlaceholder="Search countries..."
                aria-invalid={!!errors.phoneCountryId}
              />
              <Input
                className="col-span-2 h-10"
                value={form.phoneNumber}
                onChange={(e) => setForm((f) => ({ ...f, phoneNumber: e.target.value }))}
                aria-invalid={!!errors.phoneNumber}
                placeholder="984 1234567"
              />
            </div>
            <FieldError message={errors.phoneCountryId ?? errors.phoneNumber} />
          </div>

          <div className="space-y-2">
            <Label>Website</Label>
            <Input
              className="h-10"
              type="url"
              value={form.website}
              onChange={(e) => setForm((f) => ({ ...f, website: e.target.value }))}
              aria-invalid={!!errors.website}
              placeholder="https://example.com"
            />
            <FieldError message={errors.website} />
          </div>

          <div className="space-y-3">
            <Label>Address</Label>
            <div className="grid grid-cols-2 gap-2">
              <div className="flex flex-col gap-2">
                <Label className="text-xs font-normal text-muted-foreground">Country</Label>
                <Combobox
                  value={form.countryId}
                  onChange={(v) => setForm((f) => ({ ...f, countryId: v }))}
                  placeholder="Select country"
                  searchPlaceholder="Search countries..."
                  options={countryOptions}
                  aria-invalid={!!errors.countryId}
                />
                <FieldError message={errors.countryId} />
              </div>
              <div className="flex flex-col gap-2">
                <Label className="text-xs font-normal text-muted-foreground">Address</Label>
                <AddressAutocomplete
                  value={form.address}
                  onChange={(v) => setForm((f) => ({ ...f, address: v }))}
                  onResolved={handlePlaceResolved}
                  countryIso2={countryIso2}
                />
                <FieldError message={errors.address} />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-2">
                <Label className="text-xs font-normal text-muted-foreground">City</Label>
                <Input
                  className="h-10"
                  value={form.city}
                  onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
                  aria-invalid={!!errors.city}
                />
                <FieldError message={errors.city} />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-normal text-muted-foreground">State/Province</Label>
                <Input
                  className="h-10"
                  value={form.state}
                  onChange={(e) => setForm((f) => ({ ...f, state: e.target.value }))}
                  aria-invalid={!!errors.state}
                />
                <FieldError message={errors.state} />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-normal text-muted-foreground">Postcode</Label>
                <Input
                  className="h-10"
                  value={form.postcode}
                  onChange={(e) => setForm((f) => ({ ...f, postcode: e.target.value }))}
                  placeholder="Postcode"
                />
              </div>
            </div>
          </div>

          <Button className="h-10 w-full gap-1.5" onClick={save} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <ContactRow icon={Mail} label="Email" value={profile.email} />
          <ContactRow icon={Phone} label="Phone" value={profile.phone} />
          <ContactRow icon={Globe} label="Website" value={profile.website} isLink />
          <ContactRow icon={MapPin} label="Address" value={addressLabel} />
        </div>
      )}
    </ProfileSection>
  );
}
