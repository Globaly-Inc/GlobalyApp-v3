"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Pencil, Save, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ProfileSection } from "@/app/(web)/components/profile/profile-section";
import { useAppDispatch } from "@/lib/hooks";
import { updateMyProfile } from "@/app/business/store/business-onboarding-slice";
import type { BusinessProfile } from "@/app/business/apis/types";
import { HEADER_PENCIL } from "../const";
import { PrivacyBadge } from "@/components/privacy-badge";
import { useSectionVisibility } from "./use-section-visibility";
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
          {/* Which identifier a business quotes depends on where it is registered — see
              RegistrationLicensesFields (shared with the create-branch form). */}
          <RegistrationLicensesFields value={draft} onChange={setDraft} countryId={profile.country_id} />

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
