"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Combobox } from "@/components/combobox";
import { FieldError } from "@/components/field-error";
import { AddressAutocomplete } from "@/components/address-autocomplete";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAppDispatch } from "@/lib/hooks";
import { flagFromIso2 } from "@/app/admin/platform/categories/utils";
import { isValidEmail } from "@/app/admin/platform/businesses/utils";
import { toNumberOrNull } from "@/lib/utils";
import type { PlaceDetails } from "@/lib/api/places";
import { updateMyProfile } from "@/app/business/store/business-onboarding-slice";
import type { BusinessProfile } from "@/app/business/apis/types";
import type { Country } from "@/app/geo/apis";
import type { Branch } from "../apis/types";
import { updateBranch } from "../store/business-profile-detail-slice";

/**
 * Which row of the Locations card is being edited. The two cases write to different places — the
 * business's own address lives on the profile, a branch on `business_branches` — so the caller
 * resolves that once and the form below renders the same fields over either.
 */
export type LocationTarget =
  | { kind: "business"; profile: BusinessProfile }
  | { kind: "branch"; branch: Branch };

type FormState = {
  name: string;
  countryId: string;
  address: string;
  city: string;
  state: string;
  postcode: string;
  email: string;
  phone: string;
  latitude: number | null;
  longitude: number | null;
};

// Branches store the country as a plain name; the profile stores a country_id. Both resolve to the
// same combobox value here, and are converted back on save.
function toForm(target: LocationTarget, countries: Country[]): FormState {
  if (target.kind === "business") {
    const p = target.profile;
    return {
      name: p.business_name,
      countryId: p.country_id ? String(p.country_id) : "",
      address: p.address ?? "",
      city: p.city ?? "",
      state: p.state ?? "",
      postcode: p.postcode ?? "",
      email: p.email ?? "",
      phone: p.phone ?? "",
      latitude: toNumberOrNull(p.latitude),
      longitude: toNumberOrNull(p.longitude),
    };
  }
  const b = target.branch;
  return {
    name: b.name,
    countryId: String(countries.find((c) => c.name === b.country)?.id ?? ""),
    address: b.address ?? "",
    city: b.city ?? "",
    state: b.state ?? "",
    postcode: "",
    email: b.email ?? "",
    phone: b.phone ?? "",
    latitude: null,
    longitude: null,
  };
}

export function LocationEditDialog({
  open,
  onOpenChange,
  target,
  businessId,
  countries,
}: Readonly<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Null while closed. The form remounts per target, so it never shows a stale row's values. */
  target: LocationTarget | null;
  businessId: number;
  countries: Country[];
}>) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto" style={{ maxWidth: "36rem" }}>
        <DialogHeader>
          <DialogTitle>Edit location</DialogTitle>
          <DialogDescription>
            {target?.kind === "business"
              ? "This is the business's own address — saving also updates Contact Details."
              : "Branch type and shared services are edited on the Branches tab."}
          </DialogDescription>
        </DialogHeader>

        {target && (
          // Keying on the row means `useState` re-initialises from that row on open, with no effect
          // syncing props into state.
          <LocationForm
            key={target.kind === "business" ? "business" : target.branch.id}
            target={target}
            businessId={businessId}
            countries={countries}
            onDone={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function LocationForm({
  target,
  businessId,
  countries,
  onDone,
}: Readonly<{
  target: LocationTarget;
  businessId: number;
  countries: Country[];
  onDone: () => void;
}>) {
  const dispatch = useAppDispatch();
  const [form, setForm] = useState<FormState>(() => toForm(target, countries));
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [saving, setSaving] = useState(false);

  const isBusiness = target.kind === "business";

  const countryOptions = useMemo(
    () => countries.map((c) => ({ value: String(c.id), label: `${flagFromIso2(c.iso2)} ${c.name}` })),
    [countries],
  );
  const countryIso2 = countries.find((c) => String(c.id) === form.countryId)?.iso2;

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => (e[key as string] ? { ...e, [key]: undefined } : e));
  };

  // Picking a suggestion fills in what Google resolved and, for the business row, puts the
  // coordinates on the record that the map below the cards reads.
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
    const next: Record<string, string | undefined> = {};
    if (form.name.trim().length < 2) next.name = "A name is required";
    if (!form.countryId) next.countryId = "Select a country";
    if (form.email && !isValidEmail(form.email)) next.email = "Enter a valid email";
    // The profile's own address is required on the business record; a branch may have none yet.
    if (isBusiness && !form.address.trim()) next.address = "This field is required";
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setSaving(true);
    try {
      if (target.kind === "business") {
        await dispatch(updateMyProfile({
          business_name: form.name.trim(),
          country_id: Number(form.countryId),
          address: form.address,
          city: form.city,
          state: form.state,
          postcode: form.postcode || null,
          email: form.email || null,
          phone: form.phone || null,
          latitude: form.latitude,
          longitude: form.longitude,
        })).unwrap();
      } else {
        await dispatch(updateBranch({
          id: businessId,
          branchId: target.branch.id,
          // Location fields only — branch type and service sharing keep their current values.
          patch: {
            name: form.name.trim(),
            country: countries.find((c) => String(c.id) === form.countryId)?.name ?? null,
            state: form.state || null,
            city: form.city || null,
            address: form.address || null,
            email: form.email || null,
            phone: form.phone || null,
          },
        })).unwrap();
      }
      toast.success("Location updated");
      onDone();
    } catch (e) {
      toast.error("Couldn't save location", { description: (e as Error).message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="space-y-4">
        <div className="space-y-2">
          <Label>
            Name <span className="text-destructive">*</span>
          </Label>
          <Input className="h-10" value={form.name} onChange={(e) => set("name", e.target.value)} aria-invalid={!!errors.name} />
          <FieldError message={errors.name} />
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="flex flex-col gap-2">
            <Label>
              Country <span className="text-destructive">*</span>
            </Label>
            <Combobox
              value={form.countryId}
              onChange={(v) => set("countryId", v)}
              options={countryOptions}
              placeholder="Select country"
              searchPlaceholder="Search countries..."
              aria-invalid={!!errors.countryId}
            />
            <FieldError message={errors.countryId} />
          </div>
          <div className="col-span-2 flex flex-col gap-2">
            <Label>
              Address {isBusiness && <span className="text-destructive">*</span>}
            </Label>
            <AddressAutocomplete
              value={form.address}
              onChange={(v) => set("address", v)}
              onResolved={handlePlaceResolved}
              countryIso2={countryIso2}
            />
            <FieldError message={errors.address} />
          </div>
        </div>

        <div className={isBusiness ? "grid grid-cols-3 gap-3" : "grid grid-cols-2 gap-3"}>
          <div className="space-y-2">
            <Label>City</Label>
            <Input className="h-10" value={form.city} onChange={(e) => set("city", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>State/Province</Label>
            <Input className="h-10" value={form.state} onChange={(e) => set("state", e.target.value)} />
          </div>
          {/* Branches have no postcode column — offering the field would silently drop it. */}
          {isBusiness && (
            <div className="space-y-2">
              <Label>Postcode</Label>
              <Input className="h-10" value={form.postcode} onChange={(e) => set("postcode", e.target.value)} />
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label>Email</Label>
            <Input className="h-10" value={form.email} onChange={(e) => set("email", e.target.value)} aria-invalid={!!errors.email} />
            <FieldError message={errors.email} />
          </div>
          <div className="space-y-2">
            <Label>Phone</Label>
            <Input className="h-10" value={form.phone} onChange={(e) => set("phone", e.target.value)} />
          </div>
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" className="h-10" onClick={onDone} disabled={saving}>
          Cancel
        </Button>
        <Button className="h-10 gap-1.5" onClick={save} disabled={saving}>
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          Save changes
        </Button>
      </DialogFooter>
    </>
  );
}
