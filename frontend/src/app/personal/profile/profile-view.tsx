"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { useAuthState } from "@/app/auth/store/auth-slice";
import { geoApi, type Country } from "../../geo/apis";
import { personalApi } from "../apis";
import {
  fetchFullProfile,
  updateProfile,
  addQualification,
  editQualification,
  removeQualification,
  addLanguageTest,
  editLanguageTest,
  removeLanguageTest,
  addAcademicTest,
  editAcademicTest,
  removeAcademicTest,
  addWorkExperience,
  editWorkExperience,
  removeWorkExperience,
} from "../store/profile-slice";
import type {
  AcademicTest,
  AcademicTestInput,
  LanguageTestInput,
  Qualification,
  QualificationInput,
  StudentProfilePatch,
  WorkExperience,
  WorkExperienceInput,
  LanguageTest
} from "../apis/types";
import { ProfileHeroCard } from "./profile-hero-card";
import { ProfileDetailsCards } from "./profile-details-cards";
import { ProfileSidebar } from "./profile-sidebar";
import { RecordSections } from "./record-sections";
import { PersonalDetailsDialog } from "./personal-details-dialog";
import { ContactDialog } from "./contact-dialog";
import { PreferencesDialog } from "./preferences-dialog";
import { QualificationDialog } from "./qualification-dialog";
import { WorkExperienceDialog } from "./work-experience-dialog";
import { TestScoreDialog } from "./test-score-dialog";
import { AcademicTestDialog } from "./academic-test-dialog";
import { SectionError } from "@/components/feed/components/section-error";

export function ProfileView() {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const { profile, qualifications, languageTests, academicTests, workExperiences, status, error } = useAppSelector((state) => state.profile);
  const [countries, setCountries] = useState<Country[]>([]);

  const { user: authUser, initializing } = useAuthState();

  useEffect(() => {
    if (initializing) return;
    if (!authUser?.is_personal_account) router.replace("/business/profile");
  }, [initializing, authUser?.is_personal_account, router]);

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
  const [academicTestDialog, setAcademicTestDialog] = useState<{ open: boolean; item: AcademicTest | null }>({
    open: false,
    item: null,
  });
  const [workExperienceDialog, setWorkExperienceDialog] = useState<{ open: boolean; item: WorkExperience | null }>({
    open: false,
    item: null,
  });
  const [imageUploading, setImageUploading] = useState<"profile" | "cover" | null>(null);
  useEffect(() => {
    if (status === "idle" && !profile) dispatch(fetchFullProfile());
    geoApi.getCountries().then(setCountries).catch(() => setCountries([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A failed load has to say so and offer a retry. Falling through to the spinner below meant any
  // backend error on GET /platform-users/me left the page spinning forever with nothing to click,
  // and the mount effect only refetches from "idle" — so a reload could not recover it either.
  if (!profile && status === "failed") {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <SectionError
          message={error ?? "Couldn't load your profile."}
          onRetry={() => dispatch(fetchFullProfile())}
        />
      </div>
    );
  }

  if (!profile || initializing || !authUser?.is_personal_account) {
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

  const visibility = profile.public_visibility ?? {};
  const isSectionPublic = (key: string, defaultPublic = true) => visibility[key] ?? defaultPublic;
  const toggleVisibility = (key: string, defaultPublic = true) => {
    handleSaveProfile({ public_visibility: { ...visibility, [key]: !isSectionPublic(key, defaultPublic) } });
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

  const handleSaveAcademicTest = async (data: AcademicTestInput) => {
    const result = academicTestDialog.item
      ? await dispatch(editAcademicTest({ id: academicTestDialog.item.id, patch: data }))
      : await dispatch(addAcademicTest(data));
    if (result.meta.requestStatus === "rejected") {
      toast.error("Couldn't save academic test");
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

  const handleImageFile = async (category: "profile" | "cover", file: File) => {
    setImageUploading(category);
    try {
      await personalApi.uploadImage(category, file);
      await dispatch(fetchFullProfile());
    } catch (e) {
      toast.error("Upload failed", { description: e instanceof Error ? e.message : "Please try again." });
    } finally {
      setImageUploading(null);
    }
  };

  const completion = profile.completion ?? { percentage: 0, items: [] };
  const initial =
    `${profile.first_name?.[0] ?? ""}${profile.last_name?.[0] ?? ""}`.toUpperCase() || "U";

  return (
    <div className="space-y-6">
      <ProfileHeroCard
        profile={profile}
        initial={initial}
        imageUploading={imageUploading}
        onImageFile={handleImageFile}
        countries={countries}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <ProfileDetailsCards
            profile={profile}
            countryName={countryName}
            isSectionPublic={isSectionPublic}
            toggleVisibility={toggleVisibility}
            onEditPersonal={() => setPersonalOpen(true)}
            onEditContact={() => setContactOpen(true)}
          />

          <RecordSections
            qualifications={qualifications}
            workExperiences={workExperiences}
            academicTests={academicTests}
            languageTests={languageTests}
            isSectionPublic={isSectionPublic}
            toggleVisibility={toggleVisibility}
            onAddQualification={() => setQualificationDialog({ open: true, item: null })}
            onEditQualification={(q) => setQualificationDialog({ open: true, item: q })}
            onDeleteQualification={(id) => dispatch(removeQualification(id))}
            onAddWorkExperience={() => setWorkExperienceDialog({ open: true, item: null })}
            onEditWorkExperience={(w) => setWorkExperienceDialog({ open: true, item: w })}
            onDeleteWorkExperience={(id) => dispatch(removeWorkExperience(id))}
            onAddAcademicTest={() => setAcademicTestDialog({ open: true, item: null })}
            onEditAcademicTest={(t) => setAcademicTestDialog({ open: true, item: t })}
            onDeleteAcademicTest={(id) => dispatch(removeAcademicTest(id))}
            onAddLanguageTest={() => setTestScoreDialog({ open: true, item: null })}
            onEditLanguageTest={(t) => setTestScoreDialog({ open: true, item: t })}
            onDeleteLanguageTest={(id) => dispatch(removeLanguageTest(id))}
          />
        </div>

        <ProfileSidebar
          completion={completion}
          profile={profile}
          countryName={countryName}
          onEditPreferences={() => setPreferencesOpen(true)}
        />
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
      <AcademicTestDialog
        open={academicTestDialog.open}
        onOpenChange={(open) => setAcademicTestDialog((s) => ({ ...s, open }))}
        item={academicTestDialog.item}
        onSave={handleSaveAcademicTest}
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
