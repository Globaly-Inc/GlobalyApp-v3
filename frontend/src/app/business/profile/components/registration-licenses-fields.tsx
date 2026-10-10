"use client";

import { useEffect, useRef, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Combobox, type ComboboxOption } from "@/components/combobox";
import { businessProfileDetailApi } from "../apis";

export type RegLicense = { type: string; number: string };
export type RegLicenses = { business_registration?: RegLicense; licenses?: RegLicense[] };

const GROUP_LABEL = "text-xs font-semibold uppercase tracking-wide text-muted-foreground";

/**
 * An escape hatch, not catalogue data — it stays client-side so an admin can't delete it, and so
 * profiles that already saved the literal "Other" keep resolving to a label.
 */
const OTHER_LICENSE: ComboboxOption = { value: "Other", label: "Other", description: "Custom license type" };

/**
 * Both pickers draw from admin-managed catalogs now, so a value can be deactivated, renamed or
 * simply belong to a country whose list no longer carries it. A Combobox whose value matches no
 * option renders its empty placeholder, which would read as "nothing selected" over a license the
 * business did save — so anything already saved is pinned into the list it is shown in.
 */
const withSaved = (options: ComboboxOption[], saved: string | undefined) =>
  saved && !options.some((o) => o.value === saved)
    ? [...options, { value: saved, label: saved, description: "No longer offered" }]
    : options;

/** Half-filled rows are noise on the public profile, so they never reach the column. */
export function cleanRegistrationLicenses(draft: RegLicenses): RegLicenses {
  const licenses = (draft.licenses ?? []).filter((l) => l.type && l.number);
  const registrationRow = draft.business_registration;
  return {
    ...(registrationRow?.number ? { business_registration: registrationRow } : {}),
    ...(licenses.length > 0 ? { licenses } : {}),
  };
}

/**
 * The Business Registration + Industry Licenses editor — shared by the profile's
 * Registration & Licenses card and the create-branch form (a branch is its own org, so it has its
 * own registration). `countryId` picks which identifiers are offered (an ABN in Australia, a UEN
 * in Singapore); the server falls back to the generic list.
 */
export function RegistrationLicensesFields({
  value,
  onChange,
  countryId,
}: Readonly<{ value: RegLicenses; onChange: (next: RegLicenses) => void; countryId: number | null | undefined }>) {
  const [registrationTypes, setRegistrationTypes] = useState<ComboboxOption[]>([]);
  const [licenseTypes, setLicenseTypes] = useState<ComboboxOption[]>([]);

  // Keyed to the country, not a bare boolean: the offered identifiers change with it.
  //
  // Two countries in quick succession leave two requests in flight, and they can land in either
  // order — so only the newest may write. Without that, the slower response for the country just
  // left would replace the current one's options, and its failure handler would clear options that
  // had loaded fine: the editor would offer, and save, another country's identifier.
  const fetchedForRef = useRef<number | null | undefined>(undefined);
  const countryRequestRef = useRef(0);
  useEffect(() => {
    if (fetchedForRef.current === countryId) return;
    fetchedForRef.current = countryId;
    const seq = ++countryRequestRef.current;
    businessProfileDetailApi
      .getRegistrationTypes(countryId)
      .then(({ data }) => {
        if (seq !== countryRequestRef.current) return;
        setRegistrationTypes(data.map((r) => ({ value: r.code, label: r.label })));
      })
      .catch(() => {
        if (seq === countryRequestRef.current) setRegistrationTypes([]);
      });
  }, [countryId]);

  const fetchedLicensesRef = useRef(false);
  useEffect(() => {
    if (fetchedLicensesRef.current) return;
    fetchedLicensesRef.current = true;
    businessProfileDetailApi
      .getAccreditations({ limit: 100 })
      .then(({ data }) =>
        setLicenseTypes(data.map((a) => ({ value: a.name, label: a.name, description: a.description ?? undefined }))),
      )
      .catch(() => setLicenseTypes([]));
  }, []);

  const updateRegistration = (patch: Partial<RegLicense>) =>
    onChange({ ...value, business_registration: { type: "", number: "", ...value.business_registration, ...patch } });

  const updateLicense = (index: number, patch: Partial<RegLicense>) => {
    const licenses = [...(value.licenses ?? [])];
    licenses[index] = { ...licenses[index]!, ...patch };
    onChange({ ...value, licenses });
  };

  return (
    <>
      <div className="flex flex-col gap-2">
        <p className={GROUP_LABEL}>Business Registration</p>
        <Combobox
          options={withSaved(registrationTypes, value.business_registration?.type)}
          value={value.business_registration?.type ?? ""}
          onChange={(v) => updateRegistration({ type: v })}
          placeholder="Select registration type"
          searchPlaceholder="Search types..."
          className="h-10 w-full"
        />
        <Input
          className="h-10"
          placeholder="Registration number"
          value={value.business_registration?.number ?? ""}
          onChange={(e) => updateRegistration({ number: e.target.value })}
        />
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <p className={GROUP_LABEL}>Industry Licenses</p>
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            onClick={() => onChange({ ...value, licenses: [...(value.licenses ?? []), { type: "", number: "" }] })}
          >
            <Plus className="h-3.5 w-3.5" /> Add
          </Button>
        </div>

        {(value.licenses ?? []).length === 0 ? (
          <p className="text-sm italic text-muted-foreground">No licenses added. Click &ldquo;Add&rdquo; to add one.</p>
        ) : (
          (value.licenses ?? []).map((license, i) => (
            // Index key: these rows have no id and are only ever appended or removed whole.
            <div key={i} className="flex flex-col gap-2 rounded-lg border border-border p-2.5">
              <div className="flex items-center gap-2">
                <Combobox
                  options={withSaved([...licenseTypes, OTHER_LICENSE], license.type)}
                  value={license.type}
                  onChange={(v) => updateLicense(i, { type: v })}
                  placeholder="License type"
                  searchPlaceholder="Search licenses..."
                  className="h-10 w-full"
                />
                <Button
                  size="icon-sm"
                  variant="ghost"
                  className="shrink-0 text-destructive"
                  aria-label="Remove license"
                  onClick={() => onChange({ ...value, licenses: (value.licenses ?? []).filter((_, li) => li !== i) })}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              <Input
                className="h-10"
                placeholder="License number"
                value={license.number}
                onChange={(e) => updateLicense(i, { number: e.target.value })}
              />
            </div>
          ))
        )}
      </div>
    </>
  );
}
