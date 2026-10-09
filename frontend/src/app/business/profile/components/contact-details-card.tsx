"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Globe, Mail, MapPin, Pencil, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { joinParts } from "@/app/(web)/components/profile/profile-data";
import { useValidatedForm } from "@/lib/use-validated-form";
import { useAppDispatch } from "@/lib/hooks";
import { updateMyProfile } from "@/app/business/store/business-onboarding-slice";
import type { BusinessProfile } from "@/app/business/apis/types";
import type { Country } from "@/app/geo/apis";
import { HEADER_PENCIL } from "../const";
import { PrivacyBadge } from "@/components/privacy-badge";
import { useSectionVisibility } from "./use-section-visibility";
import { ProfileCard } from "./profile-card";
import { ContactInfoRow } from "./contact-info-row";
import { ContactDetailsForm } from "./contact-details-form";
import { buildContactSchema, toContactForm } from "./contact-details-schema";

/** "https://www.example.com/" → "example.com"; anything unparseable is shown as typed. */
function bareHost(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return url;
  }
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
  const schema = useMemo(() => buildContactSchema(countries), [countries]);
  const { form, setForm, errors, reset, validate } = useValidatedForm(schema, () => toContactForm(profile, countries));
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const startEditing = () => {
    reset(toContactForm(profile, countries));
    setEditing(true);
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
  const onAdd = readOnly ? undefined : startEditing;

  return (
    <ProfileCard
      id="profile-contact"
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
        <ContactDetailsForm form={form} setForm={setForm} errors={errors} countries={countries} saving={saving} onSave={save} />
      ) : (
        <div>
          <ContactInfoRow icon={Mail} label="Email" value={profile.email} onAdd={onAdd} />
          <ContactInfoRow icon={Phone} label="Phone" value={profile.phone} onAdd={onAdd} />
          <ContactInfoRow
            icon={Globe}
            label="Website"
            value={profile.website ? bareHost(profile.website) : null}
            href={profile.website ?? undefined}
            onAdd={onAdd}
          />
          <ContactInfoRow icon={MapPin} label="Address" value={addressLabel} onAdd={onAdd} />
        </div>
      )}
    </ProfileCard>
  );
}
