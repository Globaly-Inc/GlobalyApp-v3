"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { User, Mail, GraduationCap, Briefcase, Languages, CheckCircle2, Circle, Loader2, Camera, Lock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { geoApi, type Country } from "../../geo/apis";
import {
  fetchFullProfile,
  updateProfile,
  addQualification,
  editQualification,
  removeQualification,
  addLanguageTest,
  editLanguageTest,
  removeLanguageTest,
  addWorkExperience,
  editWorkExperience,
  removeWorkExperience,
} from "../store/profile-slice";
import type {
  LanguageTestInput,
  Qualification,
  QualificationInput,
  StudentProfilePatch,
  WorkExperience,
  WorkExperienceInput,
  LanguageTest
} from "../apis/types";
import { computeCompletion } from "../profile-completion";
import { SectionCard, OneToManySection, Field } from "./section-card";
import { ItemRow } from "./item-row";
import { PersonalDetailsDialog } from "./personal-details-dialog";
import { ContactDialog } from "./contact-dialog";
import { PreferencesDialog } from "./preferences-dialog";
import { QualificationDialog } from "./qualification-dialog";
import { WorkExperienceDialog } from "./work-experience-dialog";
import { TestScoreDialog } from "./test-score-dialog";

function formatRange(start: string | null, end: string | null, isCurrent: boolean) {
  if (!start && !end) return null;
  return `${start ?? "—"} – ${isCurrent ? "Present" : (end ?? "—")}`;
}

function formatDate(value: string | null) {
  return value ? value.split("T")[0] : null;
}

export function ProfileView() {
  const dispatch = useAppDispatch();
  const { profile, qualifications, languageTests, workExperiences, status } = useAppSelector((state) => state.profile);
  const [countries, setCountries] = useState<Country[]>([]);

  const [personalOpen, setPersonalOpen] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const [qualificationDialog, setQualificationDialog] = useState<{ open: boolean; item: Qualification | null }>({
    open: false,
    item: null,
  });
  const [testScoreDialog, setTestScoreDialog] = useState<{ open: boolean; item: LanguageTest | null }>({
    open: false,
    item: null,
  });
  const [workExperienceDialog, setWorkExperienceDialog] = useState<{ open: boolean; item: WorkExperience | null }>({
    open: false,
    item: null,
  });
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

  const handleSaveProfile = async (patch: StudentProfilePatch) => {
    const result = await dispatch(updateProfile(patch));
    if (updateProfile.rejected.match(result)) {
      toast.error("Couldn't save", { description: result.error.message ?? "Please try again." });
      return false;
    }
    return true;
  };

  const handleSaveQualification = async (data: QualificationInput) => {
    const result = qualificationDialog.item
      ? await dispatch(editQualification({ id: qualificationDialog.item.id, patch: data }))
      : await dispatch(addQualification(data));
    if (result.meta.requestStatus === "rejected") {
      toast.error("Couldn't save education");
      return false;
    }
    return true;
  };

  const handleSaveTestScore = async (data: LanguageTestInput) => {
    const result = testScoreDialog.item
      ? await dispatch(editLanguageTest({ id: testScoreDialog.item.id, patch: data }))
      : await dispatch(addLanguageTest(data));
    if (result.meta.requestStatus === "rejected") {
      toast.error("Couldn't save test score");
      return false;
    }
    return true;
  };

  const handleSaveWorkExperience = async (data: WorkExperienceInput) => {
    const result = workExperienceDialog.item
      ? await dispatch(editWorkExperience({ id: workExperienceDialog.item.id, patch: data }))
      : await dispatch(addWorkExperience(data));
    if (result.meta.requestStatus === "rejected") {
      toast.error("Couldn't save work experience");
      return false;
    }
    return true;
  };

  const confirmDelete = (label: string) => window.confirm(`Delete this ${label}?`);

  const completion = computeCompletion(profile, qualifications, languageTests);
  const initial = profile.first_name?.[0]?.toUpperCase() ?? "U";

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

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
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

          <OneToManySection
            icon={GraduationCap}
            title="Education Background"
            count={qualifications.length}
            onAdd={() => setQualificationDialog({ open: true, item: null })}
            emptyText="No education history added yet."
          >
            <div className="space-y-2">
              {qualifications.map((q) => (
                <ItemRow
                  key={q.id}
                  title={q.degree_title || q.qualification_type || "Qualification"}
                  subtitle={[q.institution_name, q.subject_area].filter(Boolean).join(" · ")}
                  meta={formatRange(q.start_date, q.end_date, q.is_current)}
                  onEdit={() => setQualificationDialog({ open: true, item: q })}
                  onDelete={() => confirmDelete("qualification") && dispatch(removeQualification(q.id))}
                />
              ))}
            </div>
          </OneToManySection>

          <OneToManySection
            icon={Languages}
            title="Test Scores"
            count={languageTests.length}
            onAdd={() => setTestScoreDialog({ open: true, item: null })}
            emptyText="No test scores added yet."
          >
            <div className="space-y-2">
              {languageTests.map((t) => (
                <ItemRow
                  key={t.id}
                  title={t.test_type ?? "Test"}
                  subtitle={t.test_status === "completed" ? `Score: ${t.overall_score ?? "—"}` : "Awaiting results"}
                  meta={formatDate(t.test_date)}
                  onEdit={() => setTestScoreDialog({ open: true, item: t })}
                  onDelete={() => confirmDelete("test score") && dispatch(removeLanguageTest(t.id))}
                />
              ))}
            </div>
          </OneToManySection>

          <OneToManySection
            icon={Briefcase}
            title="Work Experience"
            count={workExperiences.length}
            onAdd={() => setWorkExperienceDialog({ open: true, item: null })}
            emptyText="No work experience added yet."
          >
            <div className="space-y-2">
              {workExperiences.map((w) => (
                <ItemRow
                  key={w.id}
                  title={w.job_title}
                  subtitle={w.organization_name}
                  meta={formatRange(w.start_date, w.end_date, w.is_current)}
                  onEdit={() => setWorkExperienceDialog({ open: true, item: w })}
                  onDelete={() => confirmDelete("work experience") && dispatch(removeWorkExperience(w.id))}
                />
              ))}
            </div>
          </OneToManySection>
        </div>

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

          <SectionCard icon={GraduationCap} title="Study Preferences" onEdit={() => setPreferencesOpen(true)}>
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
      </div>

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
      <PreferencesDialog
        open={preferencesOpen}
        onOpenChange={setPreferencesOpen}
        profile={profile}
        countries={countries}
        onSave={handleSaveProfile}
        saving={saving}
      />
      <QualificationDialog
        open={qualificationDialog.open}
        onOpenChange={(open) => setQualificationDialog((s) => ({ ...s, open }))}
        item={qualificationDialog.item}
        onSave={handleSaveQualification}
        saving={saving}
      />
      <TestScoreDialog
        open={testScoreDialog.open}
        onOpenChange={(open) => setTestScoreDialog((s) => ({ ...s, open }))}
        item={testScoreDialog.item}
        onSave={handleSaveTestScore}
        saving={saving}
      />
      <WorkExperienceDialog
        open={workExperienceDialog.open}
        onOpenChange={(open) => setWorkExperienceDialog((s) => ({ ...s, open }))}
        item={workExperienceDialog.item}
        onSave={handleSaveWorkExperience}
        saving={saving}
      />
    </div>
  );
}
