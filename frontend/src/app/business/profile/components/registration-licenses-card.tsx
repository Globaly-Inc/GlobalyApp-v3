"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Pencil, Plus, Save, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAppDispatch } from "@/lib/hooks";
import { updateMyProfile } from "@/app/business/store/business-onboarding-slice";
import type { BusinessProfile } from "@/app/business/apis/types";
import { HEADER_PENCIL } from "../const";
import { PrivacyBadge } from "@/components/privacy-badge";
import { useSectionVisibility } from "./use-section-visibility";
import { ProfileCard } from "./profile-card";
import { RegistrationLicensesFields, cleanRegistrationLicenses, type RegLicenses } from "./registration-licenses-fields";

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

  const startEditing = () => {
    setDraft({
      business_registration: registration.business_registration ?? { type: "", number: "" },
      licenses: registration.licenses ?? [],
    });
    setEditing(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      await dispatch(updateMyProfile({ registration_licenses: cleanRegistrationLicenses(draft) })).unwrap();
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
    <ProfileCard
      id="profile-registration"
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
          {/* Which identifier a business quotes depends on where it is registered — see
              RegistrationLicensesFields (shared with the create-branch form). */}
          <RegistrationLicensesFields value={draft} onChange={setDraft} countryId={profile.country_id} />

          <Button className="h-10 w-full gap-1.5" onClick={save} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save
          </Button>
        </div>
      ) : hasSaved ? (
        <dl>
          {registration.business_registration?.number && (
            <RegRow label="Business registration" type={registration.business_registration.type || "Registration"} number={registration.business_registration.number} />
          )}
          {registration.licenses?.map((license) => (
            <RegRow key={`${license.type}-${license.number}`} label="Licence" type={license.type || "License"} number={license.number} />
          ))}
        </dl>
      ) : readOnly ? (
        <p className="text-sm italic text-muted-foreground">No registration or license added yet.</p>
      ) : (
        <div className="grid justify-items-center gap-2 rounded-xl border-[1.5px] border-dashed p-[18px] text-center text-[12.5px] text-muted-foreground">
          <p className="text-[13px] font-semibold text-foreground">No registration added</p>
          <p>Add your registration number so students can trust this listing.</p>
          <Button size="sm" className="mt-1 gap-1" onClick={startEditing}>
            <Plus /> Add registration
          </Button>
        </div>
      )}
    </ProfileCard>
  );
}

function RegRow({ label, type, number }: Readonly<{ label: string; type: string; number: string }>) {
  return (
    <div className="flex items-center gap-3 border-b py-2.5 first:pt-0 last:border-b-0 last:pb-0">
      <div className="min-w-0 flex-1">
        <dt className="text-[11.5px] text-muted-foreground">{label}</dt>
        <dd className="break-all font-mono text-[13px] font-semibold">{number}</dd>
      </div>
      <Badge variant="secondary" className="shrink-0 text-[10px]">{type}</Badge>
    </div>
  );
}
