"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Building2, Loader2, Pencil, Save, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Combobox } from "@/components/combobox";
import { FieldError } from "@/components/field-error";
import { ProfileSection } from "@/app/(web)/components/profile/profile-section";
import { useAppDispatch } from "@/lib/hooks";
import { businessApi } from "@/app/business/apis";
import { updateMyProfile } from "@/app/business/store/business-onboarding-slice";
import type { BusinessProfile } from "@/app/business/apis/types";
import { HEADER_PENCIL, INSTITUTION_TYPE_OPTIONS } from "../const";
import { businessTypeLabel } from "../utils";
import { PrivacyBadge } from "@/components/privacy-badge";

/**
 * V1's General Information section: the pencil turns the card body into the form in place rather
 * than opening a dialog, so the owner edits what they were just reading, in the same column.
 */
export function GeneralInformationCard({
  profile,
  readOnly,
  isInstitution,
}: Readonly<{
  profile: BusinessProfile;
  readOnly: boolean;
  /**
   * Drives two things: the ownership-sector field, which only `institutions` has a column for,
   * and the AI button — `/businesses/me/ai-assist` sits behind a business-context guard.
   */
  isInstitution: boolean;
}>) {
  const dispatch = useAppDispatch();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(profile.business_name);
  const [description, setDescription] = useState(profile.description ?? "");
  const [institutionType, setInstitutionType] = useState(profile.institution_type ?? "");
  const [nameError, setNameError] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);
  const [improving, setImproving] = useState(false);

  const startEditing = () => {
    setName(profile.business_name);
    setDescription(profile.description ?? "");
    setInstitutionType(profile.institution_type ?? "");
    setNameError(undefined);
    setEditing(true);
  };

  const improveWithAi = async () => {
    setImproving(true);
    try {
      const { text } = await businessApi.aiAssist({
        field: "description",
        business_name: name || profile.business_name,
        business_type: profile.business_category_name ?? businessTypeLabel(profile.business_type) ?? undefined,
        // The current copy steers the rewrite when there is some; a blank box asks for a first draft.
        hint: description.trim() || undefined,
      });
      setDescription(text);
      toast.success("Draft ready", { description: "Review it before saving — it's a suggestion, not final copy." });
    } catch (e) {
      toast.error("Couldn't generate a description", { description: (e as Error).message });
    } finally {
      setImproving(false);
    }
  };

  const save = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setNameError("This field is required");
      return;
    }
    setSaving(true);
    try {
      await dispatch(updateMyProfile({
        business_name: trimmed,
        description: description.trim() || null,
        // Only sent for an institution — `institution_type` is not a column on `businesses`, and
        // the business endpoint's schema is `.strict()`.
        ...(isInstitution ? { institution_type: institutionType || null } : {}),
      })).unwrap();
      toast.success("General information updated");
      setEditing(false);
    } catch (e) {
      toast.error("Couldn't save", { description: (e as Error).message });
    } finally {
      setSaving(false);
    }
  };

  // The badge takes no `onToggle`: V1 rendered this one as a fixed "Public" pill. The name and
  // description are what a listing *is* — hiding them would publish an empty card.
  return (
    <ProfileSection
      icon={Building2}
      title="General Information"
      badge={<PrivacyBadge isPublic />}
      action={
        readOnly ? null : (
          <Button
            size="icon-sm"
            variant="ghost"
            className={HEADER_PENCIL}
            aria-label={editing ? "Stop editing general information" : "Edit general information"}
            onClick={() => (editing ? setEditing(false) : startEditing())}
          >
            <Pencil className="h-4 w-4" />
          </Button>
        )
      }
    >
      {editing ? (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>
              Business Name <span className="text-destructive">*</span>
            </Label>
            <Input
              className="h-10"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (nameError) setNameError(undefined);
              }}
              aria-invalid={!!nameError}
              required
            />
            <FieldError message={nameError} />
          </div>

          {isInstitution && (
            <div className="flex flex-col gap-2">
              <Label>Institution Type</Label>
              <Combobox
                options={INSTITUTION_TYPE_OPTIONS}
                value={institutionType}
                onChange={setInstitutionType}
                placeholder="Select institution type"
                searchPlaceholder="Search types..."
                className="h-10 w-full"
              />
              <p className="text-xs text-muted-foreground">
                Ownership sector. Shown on your profile badge and used by the institutions search filter.
              </p>
            </div>
          )}

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label>Description</Label>
              {!isInstitution && (
                <Button size="sm" variant="ghost" className="gap-1.5 text-primary" onClick={improveWithAi} disabled={improving}>
                  {improving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                  Improve with AI
                </Button>
              )}
            </div>
            <Textarea
              className="min-h-28"
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What does this business do, and who is it for?"
            />
          </div>

          <div className="flex justify-end">
            <Button className="h-10 gap-1.5 px-4" onClick={save} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save changes
            </Button>
          </div>
        </div>
      ) : profile.description ? (
        <p className="whitespace-pre-line text-sm leading-relaxed text-foreground">
          {profile.description.replace(/<[^>]*>/g, "")}
        </p>
      ) : (
        <p className="text-sm italic text-muted-foreground">No description added yet.</p>
      )}
    </ProfileSection>
  );
}
