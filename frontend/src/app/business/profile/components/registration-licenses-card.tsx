"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Pencil, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAppDispatch } from "@/lib/hooks";
import { updateMyProfile } from "@/app/business/store/business-onboarding-slice";
import type { BusinessProfile } from "@/app/business/apis/types";
import { SectionVisibilityToggle } from "./section-visibility-toggle";

type RegLicense = { type: string; number: string };
type RegLicenses = { business_registration?: RegLicense; licenses?: RegLicense[] };

export function RegistrationLicensesCard({ profile, readOnly }: Readonly<{ profile: BusinessProfile; readOnly: boolean }>) {
  const dispatch = useAppDispatch();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<RegLicenses>({});
  const [saving, setSaving] = useState(false);

  const registration = (profile.registration_licenses as RegLicenses | null) ?? {};

  const toggleVisibility = async (isPublic: boolean) => {
    const next = { ...(profile.public_visibility ?? {}), registration: isPublic };
    try {
      await dispatch(updateMyProfile({ public_visibility: next })).unwrap();
    } catch (e) {
      toast.error("Couldn't update visibility", { description: (e as Error).message });
    }
  };

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
      await dispatch(updateMyProfile({ registration_licenses: draft })).unwrap();
      toast.success("Registration & licenses updated");
      setEditing(false);
    } catch (e) {
      toast.error("Couldn't save", { description: (e as Error).message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldCheck className="h-4 w-4 text-muted-foreground" /> Registration & Licenses
        </CardTitle>
        <div className="flex items-center gap-1">
          {!readOnly && (
            <SectionVisibilityToggle section="registration" publicVisibility={profile.public_visibility} onToggle={toggleVisibility} />
          )}
          {!readOnly && (
            <Button size="icon-sm" variant="ghost" aria-label="Edit registration & licenses" onClick={() => (editing ? setEditing(false) : startEditing())}>
              <Pencil className="h-4 w-4" />
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {editing ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2">
              <Input
                placeholder="Registration type"
                value={draft.business_registration?.type ?? ""}
                onChange={(e) => setDraft((d) => ({ ...d, business_registration: { type: e.target.value, number: d.business_registration?.number ?? "" } }))}
              />
              <Input
                placeholder="Registration number"
                value={draft.business_registration?.number ?? ""}
                onChange={(e) => setDraft((d) => ({ ...d, business_registration: { type: d.business_registration?.type ?? "", number: e.target.value } }))}
              />
            </div>

            {(draft.licenses ?? []).map((license, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input
                  placeholder="License type"
                  value={license.type}
                  onChange={(e) =>
                    setDraft((d) => {
                      const licenses = [...(d.licenses ?? [])];
                      licenses[i] = { ...licenses[i]!, type: e.target.value };
                      return { ...d, licenses };
                    })
                  }
                />
                <Input
                  placeholder="License number"
                  value={license.number}
                  onChange={(e) =>
                    setDraft((d) => {
                      const licenses = [...(d.licenses ?? [])];
                      licenses[i] = { ...licenses[i]!, number: e.target.value };
                      return { ...d, licenses };
                    })
                  }
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
            ))}

            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              onClick={() => setDraft((d) => ({ ...d, licenses: [...(d.licenses ?? []), { type: "", number: "" }] }))}
            >
              <Plus className="h-3.5 w-3.5" /> Add license
            </Button>

            <Button size="sm" className="w-full" onClick={save} disabled={saving}>
              Save
            </Button>
          </div>
        ) : registration.business_registration?.number || (registration.licenses?.length ?? 0) > 0 ? (
          <div className="space-y-2">
            {registration.business_registration?.number && (
              <div className="flex items-center gap-2">
                <Badge variant="secondary">{registration.business_registration.type || "Registration"}</Badge>
                <span className="text-sm font-medium">{registration.business_registration.number}</span>
              </div>
            )}
            {registration.licenses?.map((license, i) => (
              <div key={i} className="flex items-center gap-2">
                <Badge variant="outline">{license.type || "License"}</Badge>
                <span className="text-sm">{license.number}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm italic text-muted-foreground">No registration or license added yet.</p>
        )}
      </CardContent>
    </Card>
  );
}
