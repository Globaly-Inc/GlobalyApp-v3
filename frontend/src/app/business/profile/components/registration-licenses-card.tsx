"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Pencil, Plus, Save, ShieldCheck, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Combobox } from "@/components/combobox";
import { ProfileSection } from "@/app/(web)/components/profile/profile-section";
import { useAppDispatch } from "@/lib/hooks";
import { updateMyProfile } from "@/app/business/store/business-onboarding-slice";
import type { BusinessProfile } from "@/app/business/apis/types";
import type { Country } from "@/app/geo/apis";
import {
  COUNTRY_REGISTRATION_TYPES, DEFAULT_REGISTRATION_TYPES, HEADER_PENCIL, LICENSE_TYPE_OPTIONS,
} from "../const";
import { PrivacyBadge } from "@/components/privacy-badge";
import { useSectionVisibility } from "./use-section-visibility";

type RegLicense = { type: string; number: string };
type RegLicenses = { business_registration?: RegLicense; licenses?: RegLicense[] };

const GROUP_LABEL = "text-xs font-semibold uppercase tracking-wide text-muted-foreground";

export function RegistrationLicensesCard({
  profile,
  countries,
  readOnly,
}: Readonly<{ profile: BusinessProfile; countries: Country[]; readOnly: boolean }>) {
  const dispatch = useAppDispatch();
  const { isPublic, toggle, canToggle } = useSectionVisibility(profile);
  const canEditVisibility = !readOnly && canToggle;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<RegLicenses>({});
  const [saving, setSaving] = useState(false);

  const registration = (profile.registration_licenses as RegLicenses | null) ?? {};

  // Which identifier a business quotes depends on where it is registered — an Australian agent
  // has an ABN, a Singaporean one a UEN. Anywhere unlisted gets the generic option.
  const countryName = countries.find((c) => c.id === profile.country_id)?.name ?? "";
  const registrationTypes = COUNTRY_REGISTRATION_TYPES[countryName] ?? DEFAULT_REGISTRATION_TYPES;

  const startEditing = () => {
    setDraft({
      business_registration: registration.business_registration ?? { type: "", number: "" },
      licenses: registration.licenses ?? [],
    });
    setEditing(true);
  };

  const updateRegistration = (patch: Partial<RegLicense>) =>
    setDraft((d) => ({
      ...d,
      business_registration: { type: "", number: "", ...d.business_registration, ...patch },
    }));

  const updateLicense = (index: number, patch: Partial<RegLicense>) =>
    setDraft((d) => {
      const licenses = [...(d.licenses ?? [])];
      licenses[index] = { ...licenses[index]!, ...patch };
      return { ...d, licenses };
    });

  const save = async () => {
    setSaving(true);
    try {
      // Half-filled rows are noise on the public profile, so they never reach the column.
      const licenses = (draft.licenses ?? []).filter((l) => l.type && l.number);
      const registrationRow = draft.business_registration;
      await dispatch(updateMyProfile({
        registration_licenses: {
          ...(registrationRow?.number ? { business_registration: registrationRow } : {}),
          ...(licenses.length > 0 ? { licenses } : {}),
        },
      })).unwrap();
      toast.success("Registration & licenses updated");
      setEditing(false);
    } catch (e) {
      toast.error("Couldn't save", { description: (e as Error).message });
    } finally {
      setSaving(false);
    }
  };

  const hasSaved = !!registration.business_registration?.number || (registration.licenses?.length ?? 0) > 0;

  return (
    <ProfileSection
      icon={ShieldCheck}
      title="Registration & Licenses"
      badge={<PrivacyBadge isPublic={isPublic("registration")} onToggle={canEditVisibility ? () => toggle("registration") : undefined} />}
      action={
        readOnly ? null : (
          <Button
            size="icon-sm"
            variant="ghost"
            className={HEADER_PENCIL}
            aria-label={editing ? "Stop editing registration & licenses" : "Edit registration & licenses"}
            onClick={() => (editing ? setEditing(false) : startEditing())}
          >
            <Pencil className="h-4 w-4" />
          </Button>
        )
      }
    >
      {editing ? (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <p className={GROUP_LABEL}>Business Registration</p>
            <Combobox
              options={registrationTypes}
              value={draft.business_registration?.type ?? ""}
              onChange={(v) => updateRegistration({ type: v })}
              placeholder="Select registration type"
              searchPlaceholder="Search types..."
              className="h-10 w-full"
            />
            <Input
              className="h-10"
              placeholder="Registration number"
              value={draft.business_registration?.number ?? ""}
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
                onClick={() => setDraft((d) => ({ ...d, licenses: [...(d.licenses ?? []), { type: "", number: "" }] }))}
              >
                <Plus className="h-3.5 w-3.5" /> Add
              </Button>
            </div>

            {(draft.licenses ?? []).length === 0 ? (
              <p className="text-sm italic text-muted-foreground">No licenses added. Click &ldquo;Add&rdquo; to add one.</p>
            ) : (
              (draft.licenses ?? []).map((license, i) => (
                // Index key: these rows have no id and are only ever appended or removed whole.
                <div key={i} className="flex flex-col gap-2 rounded-lg border border-border p-2.5">
                  <div className="flex items-center gap-2">
                    <Combobox
                      options={LICENSE_TYPE_OPTIONS}
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
                      onClick={() => setDraft((d) => ({ ...d, licenses: (d.licenses ?? []).filter((_, li) => li !== i) }))}
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

          <Button className="h-10 w-full gap-1.5" onClick={save} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save
          </Button>
        </div>
      ) : hasSaved ? (
        <div className="space-y-2">
          {registration.business_registration?.number && (
            <div className="flex items-center gap-2">
              <Badge variant="secondary">{registration.business_registration.type || "Registration"}</Badge>
              <span className="text-sm font-medium">{registration.business_registration.number}</span>
            </div>
          )}
          {registration.licenses?.map((license) => (
            <div key={`${license.type}-${license.number}`} className="flex items-center gap-2">
              <Badge variant="outline">{license.type || "License"}</Badge>
              <span className="text-sm">{license.number}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm italic text-muted-foreground">No registration or license added yet.</p>
      )}
    </ProfileSection>
  );
}
