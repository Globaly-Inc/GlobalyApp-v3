"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Globe, Link2, Mail, MapPin, Pencil, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAppDispatch } from "@/lib/hooks";
import { updateMyProfile } from "@/app/business/store/business-onboarding-slice";
import type { BusinessProfile, SocialLinks } from "@/app/business/apis/types";
import type { Country } from "@/app/geo/apis";
import { SectionVisibilityToggle } from "../section-visibility-toggle";
import { SocialLinksDialog } from "../social-links-dialog";

const BUSINESS_TYPE_LABELS: Record<string, string> = {
  agent: "Education Agency",
  institution: "Institution",
  service_provider: "Service Provider",
  immigration_department: "Immigration Department",
};

export function businessTypeLabel(type: string | null): string | null {
  return type ? BUSINESS_TYPE_LABELS[type] ?? type : null;
}

export function businessLocationLine(profile: Pick<BusinessProfile, "city" | "state" | "country_id">, countries: Country[]): string | null {
  const country = countries.find((c) => c.id === profile.country_id)?.name ?? null;
  return [profile.city, profile.state, country].filter(Boolean).join(", ") || null;
}

const SOCIAL_LABELS: Record<keyof SocialLinks, string> = {
  linkedin_url: "LinkedIn", facebook_url: "Facebook", instagram_url: "Instagram", twitter_url: "Twitter / X",
  youtube_url: "YouTube", whatsapp_url: "WhatsApp", tiktok_url: "TikTok", threads_url: "Threads",
  messenger_url: "Messenger", telegram_url: "Telegram", line_url: "Line", viber_url: "Viber",
};

export function ProfileTab({
  profile,
  countries,
  readOnly = false,
}: Readonly<{ profile: BusinessProfile; countries: Country[]; readOnly?: boolean }>) {
  const dispatch = useAppDispatch();
  const [socialOpen, setSocialOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const toggleSection = async (section: string, isPublic: boolean) => {
    const next = { ...(profile.public_visibility ?? {}), [section]: isPublic };
    try {
      await dispatch(updateMyProfile({ public_visibility: next })).unwrap();
    } catch (e) {
      toast.error("Couldn't update visibility", { description: (e as Error).message });
    }
  };

  const saveSocialLinks = async (patch: Partial<SocialLinks>) => {
    setSaving(true);
    try {
      await dispatch(updateMyProfile(patch)).unwrap();
      toast.success("Social links updated");
      return true;
    } catch (e) {
      toast.error("Couldn't save social links", { description: (e as Error).message });
      return false;
    } finally {
      setSaving(false);
    }
  };

  const activeSocials = (Object.keys(SOCIAL_LABELS) as (keyof SocialLinks)[]).filter((k) => profile[k]);

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">General Information</CardTitle>
          {!readOnly && (
            <SectionVisibilityToggle section="general" publicVisibility={profile.public_visibility} onToggle={(v) => toggleSection("general", v)} />
          )}
        </CardHeader>
        <CardContent>
          {profile.description ? (
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">{profile.description}</p>
          ) : (
            <p className="text-sm italic text-muted-foreground">No description added yet.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Contact Details</CardTitle>
          {!readOnly && (
            <SectionVisibilityToggle section="contact" publicVisibility={profile.public_visibility} onToggle={(v) => toggleSection("contact", v)} />
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-start gap-2">
            <Mail className="mt-0.5 h-4 w-4 text-muted-foreground" />
            <div>
              <p className="text-xs text-muted-foreground">Email</p>
              <p className="text-sm">{profile.email ?? "—"}</p>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <Phone className="mt-0.5 h-4 w-4 text-muted-foreground" />
            <div>
              <p className="text-xs text-muted-foreground">Phone</p>
              <p className="text-sm">{profile.phone ?? "—"}</p>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <Globe className="mt-0.5 h-4 w-4 text-muted-foreground" />
            <div>
              <p className="text-xs text-muted-foreground">Website</p>
              <p className="text-sm">{profile.website ?? "—"}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Location</CardTitle>
          {!readOnly && (
            <SectionVisibilityToggle section="address" publicVisibility={profile.public_visibility} onToggle={(v) => toggleSection("address", v)} />
          )}
        </CardHeader>
        <CardContent>
          <div className="flex items-start gap-2">
            <MapPin className="mt-0.5 h-4 w-4 text-muted-foreground" />
            <p className="text-sm">
              {[profile.address, businessLocationLine(profile, countries)].filter(Boolean).join(", ") || "—"}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Social Links</CardTitle>
          {!readOnly && (
            <Button size="icon-sm" variant="ghost" onClick={() => setSocialOpen(true)} aria-label="Edit social links">
              <Pencil className="h-4 w-4" />
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {activeSocials.length === 0 ? (
            <p className="text-sm italic text-muted-foreground">No social links added yet.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {activeSocials.map((key) => (
                <a
                  key={key}
                  href={profile[key]!}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  <Link2 className="h-3 w-3" />
                  {SOCIAL_LABELS[key]}
                </a>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <SocialLinksDialog open={socialOpen} onOpenChange={setSocialOpen} profile={profile} onSave={saveSocialLinks} saving={saving} />
    </div>
  );
}
