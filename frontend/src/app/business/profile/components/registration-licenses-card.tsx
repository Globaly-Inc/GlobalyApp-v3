"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Loader2, Pencil, Plus, Save, ShieldCheck, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Combobox, type ComboboxOption } from "@/components/combobox";
import { ProfileSection } from "@/app/(web)/components/profile/profile-section";
import { useAppDispatch } from "@/lib/hooks";
import { updateMyProfile } from "@/app/business/store/business-onboarding-slice";
import type { BusinessProfile } from "@/app/business/apis/types";
import { businessProfileDetailApi } from "../apis";
import { HEADER_PENCIL } from "../const";
import { PrivacyBadge } from "@/components/privacy-badge";
import { useSectionVisibility } from "./use-section-visibility";

type RegLicense = { type: string; number: string };
type RegLicenses = { business_registration?: RegLicense; licenses?: RegLicense[] };

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

// No `countries` prop any more: the server resolves the country's registration types (and the
// fallback) from profile.country_id, so the card no longer needs the name to match a const key.
export function RegistrationLicensesCard({
  profile,
  readOnly,
}: Readonly<{ profile: BusinessProfile; readOnly: boolean }>) {
  const dispatch = useAppDispatch();
  const { isPublic, toggle, canToggle } = useSectionVisibility(profile);
  const canEditVisibility = !readOnly && canToggle;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<RegLicenses>({});
  const [saving, setSaving] = useState(false);

  const registration = (profile.registration_licenses as RegLicenses | null) ?? {};

  // Which identifier a business quotes depends on where it is registered — an Australian agent
  // has an ABN, a Singaporean one a UEN. Both lists are admin-managed reference data (Platform →
  // Categories); the server picks the country's set and falls back to the generic one, so there
  // is no country-name matching left on this side.
  const [registrationTypes, setRegistrationTypes] = useState<ComboboxOption[]>([]);
  const [licenseTypes, setLicenseTypes] = useState<ComboboxOption[]>([]);

  // Keyed to the country, not a bare boolean: the card keeps its instance when the owner edits
  // the profile's country, and the offered identifiers change with it.
  //
  // Two countries in quick succession leave two requests in flight, and they can land in either
  // order — so only the newest may write. Without that, the slower response for the country the
  // owner just left would replace the current one's options, and its failure handler would clear
  // options that had loaded fine: the editor would offer, and save, another country's identifier.
  const fetchedForRef = useRef<number | null | undefined>(undefined);
  const countryRequestRef = useRef(0);
  useEffect(() => {
    if (fetchedForRef.current === profile.country_id) return;
    fetchedForRef.current = profile.country_id;
    const seq = ++countryRequestRef.current;
    businessProfileDetailApi
      .getRegistrationTypes(profile.country_id)
      .then(({ data }) => {
        if (seq !== countryRequestRef.current) return;
        setRegistrationTypes(data.map((r) => ({ value: r.code, label: r.label })));
      })
      .catch(() => {
        if (seq === countryRequestRef.current) setRegistrationTypes([]);
      });
  }, [profile.country_id]);

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
              options={withSaved(registrationTypes, draft.business_registration?.type)}
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
