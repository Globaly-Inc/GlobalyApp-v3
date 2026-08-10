"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { User, Mail, Camera, Lock, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { geoApi, type Country } from "@/app/geo/apis";
import { fetchFullProfile, updateProfile } from "@/app/personal/store/profile-slice";
import type { StudentProfilePatch } from "@/app/personal/apis/types";
import { SectionCard, Field } from "@/app/personal/profile/section-card";
import { PersonalDetailsDialog } from "@/app/personal/profile/personal-details-dialog";
import { ContactDialog } from "@/app/personal/profile/contact-dialog";

function formatDate(value: string | null) {
  return value ? value.split("T")[0] : null;
}

export function BusinessProfileView() {
  const dispatch = useAppDispatch();
  const { profile, status } = useAppSelector((state) => state.profile);
  const [countries, setCountries] = useState<Country[]>([]);
  const [personalOpen, setPersonalOpen] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);

  useEffect(() => {
    if (status === "idle" && !profile) dispatch(fetchFullProfile());
    geoApi.getCountries().then(setCountries).catch(() => setCountries([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!profile) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const countryName = (id: number | null) => countries.find((c) => c.id === id)?.name ?? null;
  const saving = status === "saving";
  const initial = profile.first_name?.[0]?.toUpperCase() ?? "U";

  const handleSaveProfile = async (patch: StudentProfilePatch) => {
    const result = await dispatch(updateProfile(patch));
    if (updateProfile.rejected.match(result)) {
      toast.error("Couldn't save", { description: result.error.message ?? "Please try again." });
      return false;
    }
    return true;
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Card className="overflow-hidden">
        <div className="relative h-40 bg-gradient-to-br from-primary to-primary/60 sm:h-48">
          <Button
            variant="secondary"
            size="sm"
            className="absolute right-4 top-4 gap-1.5"
            onClick={() => toast("Coming soon", { description: "Cover photo uploads aren't available yet." })}
          >
            <Camera className="h-4 w-4" /> Edit cover
          </Button>
          <Avatar className="absolute -bottom-12 left-6 size-24 border-4 border-background">
            {profile.photo_url && <AvatarImage src={profile.photo_url} alt={profile.first_name} />}
            <AvatarFallback className="text-2xl">{initial}</AvatarFallback>
          </Avatar>
        </div>
        <CardContent className="pt-16">
          <h1 className="text-xl font-bold text-foreground">
            {profile.first_name} {profile.last_name}
          </h1>
          {countryName(profile.nationality_id) && (
            <p className="text-sm text-muted-foreground">From {countryName(profile.nationality_id)}</p>
          )}
        </CardContent>
      </Card>

      <SectionCard
        icon={User}
        title="Personal Details"
        badge={
          <Badge variant="secondary" className="gap-1">
            <Lock className="h-3 w-3" /> Private
          </Badge>
        }
        onEdit={() => setPersonalOpen(true)}
      >
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <Field label="Full Name" value={`${profile.first_name} ${profile.last_name}`} />
          <Field label="Date of Birth" value={formatDate(profile.date_of_birth)} />
          <Field label="Gender" value={profile.gender} />
          <Field label="Nationality" value={countryName(profile.nationality_id)} />
          <Field label="City of Residence" value={profile.city_of_residence} />
        </div>
      </SectionCard>

      <SectionCard icon={Mail} title="Contact Details" onEdit={() => setContactOpen(true)}>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Email" value={profile.email} />
          <Field label="Phone" value={profile.phone} />
          <Field
            label="Address"
            value={[profile.personal_address_street, profile.personal_address_city, profile.personal_address_state]
              .filter(Boolean)
              .join(", ")}
          />
          <Field label="Country" value={countryName(profile.personal_address_country_id)} />
        </div>
      </SectionCard>

      <PersonalDetailsDialog
        open={personalOpen}
        onOpenChange={setPersonalOpen}
        profile={profile}
        countries={countries}
        onSave={handleSaveProfile}
        saving={saving}
      />
      <ContactDialog
        open={contactOpen}
        onOpenChange={setContactOpen}
        profile={profile}
        countries={countries}
        onSave={handleSaveProfile}
        saving={saving}
      />
    </div>
  );
}
