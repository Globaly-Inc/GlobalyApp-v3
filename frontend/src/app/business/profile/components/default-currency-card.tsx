"use client";

import { useState } from "react";
import { toast } from "sonner";
import { DollarSign, Loader2, Pencil, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/combobox";
import { Label } from "@/components/ui/label";
import { flagEmoji } from "@/components/ui/phone-input";
import { useAppDispatch } from "@/lib/hooks";
import { updateMyProfile } from "@/app/business/store/business-onboarding-slice";
import type { BusinessProfile } from "@/app/business/apis/types";
import type { Country } from "@/app/geo/apis";
import { HEADER_PENCIL } from "../const";
import { ProfileCard } from "./profile-card";

// Matches only what a Combobox needs — not exhaustive, the API accepts any ISO code. Full names
// (not the countries table's code + symbol list the fee and scholarship forms use) because this
// card shows "NPR - Nepalese Rupee".
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
function currencyName(code: string): string | undefined {
  return CURRENCY_OPTIONS.find((o) => o.value === code)?.label.replace(/\s*\([A-Z]{3}\)$/, "");
}

function currencyLabel(code: string): string {
  const name = currencyName(code);
  return name ? `${code} - ${name}` : code;
}

/** "NPR" → "Rs", "USD" → "$"; an unknown or invalid code falls back to the code itself. */
function currencySymbol(code: string): string {
  try {
    const parts = new Intl.NumberFormat("en", { style: "currency", currency: code, currencyDisplay: "narrowSymbol" }).formatToParts(0);
    return parts.find((p) => p.type === "currency")?.value ?? code;
  } catch {
    return code;
  }
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
    <ProfileCard
      id="profile-currency"
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
      <div className="flex flex-col gap-3">
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
              <div className="flex items-center gap-3">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-[hsl(var(--primary-bright))] font-heading text-xl font-bold text-primary-foreground">
                  {currencySymbol(profile.currency)}
                </span>
                <div className="min-w-0">
                  <p className="text-[15px] font-semibold">{currencyName(profile.currency) ?? profile.currency}</p>
                  <p className="text-[12.5px] text-muted-foreground">
                    {profile.currency} · used for fees and prices
                    {country && <> · {flagEmoji(country.iso2)} {country.name}</>}
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-sm italic text-muted-foreground">No default currency set.</p>
            )}
            <p className="text-xs text-muted-foreground">Applied to new services and fee structures. Not shown on your public profile.</p>
          </>
        )}
      </div>
    </ProfileCard>
  );
}
