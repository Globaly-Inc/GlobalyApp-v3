"use client";

import { useState } from "react";
import { toast } from "sonner";
import { DollarSign, Loader2, Pencil, Save } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/combobox";
import { Label } from "@/components/ui/label";
import { flagEmoji } from "@/components/ui/phone-input";
import { ProfileSection } from "@/app/(web)/components/profile/profile-section";
import { useAppDispatch } from "@/lib/hooks";
import { updateMyProfile } from "@/app/business/store/business-onboarding-slice";
import type { BusinessProfile } from "@/app/business/apis/types";
import type { Country } from "@/app/geo/apis";
import { HEADER_PENCIL } from "../const";

// Matches only what a Combobox needs — not exhaustive, the API accepts any ISO code.
const CURRENCY_OPTIONS = [
  { value: "USD", label: "US Dollar (USD)" },
  { value: "GBP", label: "British Pound (GBP)" },
  { value: "EUR", label: "Euro (EUR)" },
  { value: "AUD", label: "Australian Dollar (AUD)" },
  { value: "CAD", label: "Canadian Dollar (CAD)" },
  { value: "NZD", label: "New Zealand Dollar (NZD)" },
  { value: "INR", label: "Indian Rupee (INR)" },
  { value: "NPR", label: "Nepalese Rupee (NPR)" },
  { value: "SGD", label: "Singapore Dollar (SGD)" },
  { value: "AED", label: "UAE Dirham (AED)" },
  { value: "JPY", label: "Japanese Yen (JPY)" },
  { value: "CNY", label: "Chinese Yuan (CNY)" },
];

/** V1 showed the code and its full name together — "NPR - Nepalese Rupee", not a bare code. */
function currencyLabel(code: string): string {
  const name = CURRENCY_OPTIONS.find((o) => o.value === code)?.label.replace(/\s*\([A-Z]{3}\)$/, "");
  return name ? `${code} - ${name}` : code;
}

export function DefaultCurrencyCard({
  profile,
  countries,
  readOnly,
}: Readonly<{ profile: BusinessProfile; countries: Country[]; readOnly: boolean }>) {
  const dispatch = useAppDispatch();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(profile.currency ?? "");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await dispatch(updateMyProfile({ currency: draft || null })).unwrap();
      toast.success("Default currency updated");
      setEditing(false);
    } catch (e) {
      toast.error("Couldn't save currency", { description: (e as Error).message });
    } finally {
      setSaving(false);
    }
  };

  const country = countries.find((c) => c.id === profile.country_id) ?? null;

  return (
    <ProfileSection
      icon={DollarSign}
      title="Default Currency"
      action={
        readOnly ? null : (
          <Button
            size="icon-sm"
            variant="ghost"
            className={HEADER_PENCIL}
            aria-label="Edit default currency"
            onClick={() => {
              setDraft(profile.currency ?? "");
              setEditing((v) => !v);
            }}
          >
            <Pencil className="h-4 w-4" />
          </Button>
        )
      }
    >
      <div className="space-y-2">
        {editing ? (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-2">
              <Label className="text-xs text-muted-foreground">Currency</Label>
              <Combobox
                options={CURRENCY_OPTIONS}
                value={draft}
                onChange={setDraft}
                placeholder="Select currency"
                searchPlaceholder="Search currencies..."
                className="h-10 w-full"
              />
              {/* The country's own currency, so a mismatch is a deliberate override rather than a
                  slip — V1 showed the same line under the picker. */}
              {country?.currency && (
                <p className="text-xs text-muted-foreground">
                  {flagEmoji(country.iso2)} Default for {country.name}: {currencyLabel(country.currency)}
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                Used as the default currency for all services and fees in this business.
              </p>
            </div>
            <Button className="h-10 w-full gap-1.5" onClick={save} disabled={saving || !draft}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save
            </Button>
          </div>
        ) : (
          <>
            {profile.currency ? (
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary" className="text-sm font-medium">{currencyLabel(profile.currency)}</Badge>
                {country && (
                  <span className="text-xs text-muted-foreground">{flagEmoji(country.iso2)} {country.name}</span>
                )}
              </div>
            ) : (
              <p className="text-sm italic text-muted-foreground">No default currency set.</p>
            )}
            <p className="text-xs text-muted-foreground">Applied to new services and fee structures. Not shown on your public profile.</p>
          </>
        )}
      </div>
    </ProfileSection>
  );
}
