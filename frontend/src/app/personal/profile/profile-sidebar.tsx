"use client";

import { GraduationCap, CheckCircle2, Circle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { SectionCard, Field } from "./section-card";
import type { ProfileCompletion, StudentProfile } from "../apis/types";

export function ProfileSidebar({
  completion,
  profile,
  countryName,
  onEditPreferences,
}: Readonly<{
  completion: ProfileCompletion;
  profile: StudentProfile;
  countryName: (id: number | null) => string | null;
  onEditPreferences: () => void;
}>) {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Profile Completion</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-3">
            <Progress value={completion.percentage} className="h-2 flex-1" />
            <span className="text-sm font-medium text-muted-foreground">{completion.percentage}%</span>
          </div>
          {completion.percentage === 100 ? (
            <p className="flex items-center gap-1.5 text-sm text-primary">
              <CheckCircle2 className="h-4 w-4" /> Your profile is complete!
            </p>
          ) : (
            <ul className="space-y-1.5">
              {completion.items
                .filter((i) => !i.met)
                .map((i) => (
                  <li key={i.label} className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <Circle className="h-3.5 w-3.5" /> {i.label}
                  </li>
                ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <SectionCard icon={GraduationCap} title="Study Preferences" onEdit={onEditPreferences}>
        <div className="space-y-3">
          <div>
            <p className="text-xs text-muted-foreground mb-1">Destinations</p>
            <div className="flex flex-wrap gap-1.5">
              {profile.preferred_destinations?.length ? (
                profile.preferred_destinations.map((id) => (
                  <Badge key={id} variant="secondary">{countryName(id) ?? id}</Badge>
                ))
              ) : (
                <span className="text-sm text-muted-foreground">—</span>
              )}
            </div>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">Fields of Study</p>
            <div className="flex flex-wrap gap-1.5">
              {profile.preferred_fields?.length ? (
                profile.preferred_fields.map((f) => <Badge key={f} variant="secondary">{f}</Badge>)
              ) : (
                <span className="text-sm text-muted-foreground">—</span>
              )}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Degree Level" value={profile.preferred_degree_levels?.join(", ")} />
            <Field label="Expected Start" value={profile.expected_start_date} />
          </div>
          <Field
            label="Budget"
            value={
              profile.budget_min || profile.budget_max
                ? `${profile.budget_currency ?? ""} ${profile.budget_min ?? "?"} – ${profile.budget_max ?? "?"} / year`
                : null
            }
          />
        </div>
      </SectionCard>
    </div>
  );
}
