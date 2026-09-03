"use client";

import { useState } from "react";
import { toast } from "sonner";
import { DollarSign, Pencil } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Combobox } from "@/components/combobox";
import { useAppDispatch } from "@/lib/hooks";
import { updateMyProfile } from "@/app/business/store/business-onboarding-slice";
import type { BusinessProfile } from "@/app/business/apis/types";

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

export function DefaultCurrencyCard({ profile, readOnly }: Readonly<{ profile: BusinessProfile; readOnly: boolean }>) {
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

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2 text-base">
          <DollarSign className="h-4 w-4 text-muted-foreground" /> Default Currency
        </CardTitle>
        {!readOnly && (
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label="Edit default currency"
            onClick={() => {
              setDraft(profile.currency ?? "");
              setEditing((v) => !v);
            }}
          >
            <Pencil className="h-4 w-4" />
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-2">
        {editing ? (
          <div className="space-y-3">
            <Combobox
              options={CURRENCY_OPTIONS}
              value={draft}
              onChange={setDraft}
              placeholder="Select currency"
              searchPlaceholder="Search currencies..."
              className="h-10 w-full"
            />
            <Button size="sm" className="w-full" onClick={save} disabled={saving || !draft}>
              Save
            </Button>
          </div>
        ) : profile.currency ? (
          <Badge variant="secondary" className="text-sm font-medium">{profile.currency}</Badge>
        ) : (
          <p className="text-sm italic text-muted-foreground">No default currency set.</p>
        )}
        <p className="text-xs text-muted-foreground">Applied to new services and fee structures. Not shown on your public profile.</p>
      </CardContent>
    </Card>
  );
}
