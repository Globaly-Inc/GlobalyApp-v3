"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { geoApi, type Country } from "../geo/apis";
import { updateProfile, updateSubCategory } from "./store/profile-slice";
import { validateStep2, validateStep2Field } from "./validation";
import { clearFieldErrorIfNowValid } from "./utils";
import type { StudentProfile, StudentProfilePatch } from "./apis/types";
import { LOGO } from "@/lib/public-assets";
import { OnboardingCategoryStep } from "./onboarding-category-step";
import { OnboardingDetailsStep } from "./onboarding-details-step";

const TOTAL_STEPS = 3;

export function OnboardingView() {
  const router = useRouter();
  const { profile, status } = useAppSelector((state) => state.profile);

  useEffect(() => {
    if (profile?.onboarding_completed) router.replace("/personal/profile");
  }, [profile, router]);

  if (!profile || status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (profile.onboarding_completed) return null;

  return <OnboardingForm initialProfile={profile} />;
}

function resumeStep(profile: StudentProfile): number {
  return profile.user_sub_category ? 2 : 1;
}

function OnboardingForm({ initialProfile }: Readonly<{ initialProfile: StudentProfile }>) {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const { status } = useAppSelector((state) => state.profile);
  const saving = status === "saving";

  const [countries, setCountries] = useState<Country[]>([]);
  const [step, setStep] = useState(() => resumeStep(initialProfile));
  const [category, setCategory] = useState(initialProfile.user_sub_category);
  const [nationalityId, setNationalityId] = useState(initialProfile.nationality_id ? String(initialProfile.nationality_id) : "");
  const [dob, setDob] = useState(initialProfile.date_of_birth ?? "");
  const [gender, setGender] = useState(initialProfile.gender ?? "");
  const [address, setAddress] = useState(initialProfile.personal_address_street ?? "");
  const [destinations, setDestinations] = useState<string[]>(
    (initialProfile.preferred_destinations ?? []).map(String),
  );
  const [fields, setFields] = useState<string[]>(initialProfile.preferred_fields ?? []);
  const [degreeLevel, setDegreeLevel] = useState(initialProfile.preferred_degree_levels?.[0] ?? "");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    geoApi.getCountries().then(setCountries).catch(() => setCountries([]));
  }, []);

  const progressValue = (step / TOTAL_STEPS) * 100;

  const save = useCallback(
    async (patch: StudentProfilePatch) => {
      const result = await dispatch(updateProfile(patch));
      if (updateProfile.rejected.match(result)) {
        toast.error("Couldn't save", { description: result.error.message ?? "Please try again." });
        return false;
      }
      return true;
    },
    [dispatch],
  );

  const handleNationalityChange = (value: string) => {
    setNationalityId(value);
    clearFieldErrorIfNowValid(setFieldErrors, "nationalityId", validateStep2Field("nationalityId", value) === null);
  };
  const handleDobChange = (value: string) => {
    setDob(value);
    clearFieldErrorIfNowValid(setFieldErrors, "dob", validateStep2Field("dob", value) === null);
  };
  const handleGenderChange = (value: string) => {
    setGender(value);
    clearFieldErrorIfNowValid(setFieldErrors, "gender", validateStep2Field("gender", value) === null);
  };
  const handleDegreeLevelChange = (value: string) => {
    setDegreeLevel(value);
    clearFieldErrorIfNowValid(setFieldErrors, "degreeLevel", validateStep2Field("degreeLevel", value) === null);
  };
  const handleAddressChange = (value: string) => {
    setAddress(value);
    clearFieldErrorIfNowValid(setFieldErrors, "address", validateStep2Field("address", value) === null);
  };

  const handleNext = useCallback(async () => {
    if (step === 1 && category) {
      const result = await dispatch(updateSubCategory({ user_sub_category: category }));
      if (updateSubCategory.rejected.match(result)) {
        toast.error("Couldn't save", { description: result.error.message ?? "Please try again." });
        return;
      }
      setFieldErrors({});
      setStep(2);
    } else if (step === 2) {
      const errors = validateStep2({ nationalityId, dob, gender, address, category, destinations, fields, degreeLevel });
      if (errors) {
        setFieldErrors(errors);
        return;
      }
      setFieldErrors({});
      const patch: StudentProfilePatch = {
        nationality_id: Number(nationalityId),
        date_of_birth: dob,
        gender,
        personal_address_street: address,
      };
      if (category === "student") {
        patch.preferred_destinations = destinations.map(Number);
        if (fields.length) patch.preferred_fields = fields;
        patch.preferred_degree_levels = [degreeLevel];
      }
      if (!(await save(patch))) return;
      setStep(3);
    } else if (step === 3) {
      if (!(await save({ onboarding_completed: true }))) return;
      router.replace("/personal/profile");
    }
  }, [step, category, nationalityId, dob, gender, address, destinations, fields, degreeLevel, save, router, dispatch]);

  const handleBack = useCallback(() => {
    setFieldErrors({});
    setStep((s) => Math.max(1, s - 1));
  }, []);

  const handleSkip = useCallback(async () => {
    if (step === 1) setStep(2);
    else if (step === 2) setStep(3);
    else {
      await save({ onboarding_completed: true });
      router.replace("/personal/profile");
    }
  }, [step, save, router]);

  const toggleField = useCallback((field: string) => {
    setFields((prev) => {
      const next = prev.includes(field) ? prev.filter((f) => f !== field) : [...prev, field];
      clearFieldErrorIfNowValid(setFieldErrors, "fields", validateStep2Field("fields", next) === null);
      return next;
    });
  }, []);

  const toggleDestination = useCallback((countryId: string) => {
    setDestinations((prev) => {
      if (prev.includes(countryId)) {
        const next = prev.filter((c) => c !== countryId);
        clearFieldErrorIfNowValid(setFieldErrors, "destinations", validateStep2Field("destinations", next) === null);
        return next;
      }
      if (prev.length >= 5) return prev;
      const next = [...prev, countryId];
      clearFieldErrorIfNowValid(setFieldErrors, "destinations", validateStep2Field("destinations", next) === null);
      return next;
    });
  }, []);

  const displayStep = step > TOTAL_STEPS ? TOTAL_STEPS : step;
  const countryOptions = countries.map((c) => ({ value: String(c.id), label: c.name }));
  const countryNameById = new Map(countries.map((c) => [String(c.id), c.name]));
  const availableDestinationCountries = countries.filter((c) => !destinations.includes(String(c.id)));
  const destinationOptions = availableDestinationCountries.map((c) => ({ value: String(c.id), label: c.name }));

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="flex items-center justify-between px-6 py-4 border-b border-border">
        <Link href="/">
          <Image src={LOGO.src} alt="GlobalyAI" width={LOGO.width} height={LOGO.height} className="h-8 w-auto" />
        </Link>
        <Button variant="ghost" size="sm" onClick={handleSkip} className="text-muted-foreground">
          Skip
        </Button>
      </header>

      <Progress value={progressValue} className="h-1 rounded-none" />

      <main className="flex-1 flex flex-col items-center justify-center px-4 py-8">
        <div className="w-full max-w-lg space-y-6">
          <p className="text-sm text-muted-foreground">
            Step {displayStep} of {TOTAL_STEPS}
          </p>

          {step === 1 && (
            <OnboardingCategoryStep category={category} setCategory={setCategory} />
          )}

          {step === 2 && (
            <OnboardingDetailsStep
              category={category}
              countryOptions={countryOptions}
              nationalityId={nationalityId}
              handleNationalityChange={handleNationalityChange}
              dob={dob}
              handleDobChange={handleDobChange}
              gender={gender}
              handleGenderChange={handleGenderChange}
              address={address}
              handleAddressChange={handleAddressChange}
              destinations={destinations}
              destinationOptions={destinationOptions}
              countryNameById={countryNameById}
              toggleDestination={toggleDestination}
              fields={fields}
              toggleField={toggleField}
              degreeLevel={degreeLevel}
              handleDegreeLevelChange={handleDegreeLevelChange}
              fieldErrors={fieldErrors}
            />
          )}

          {step === 3 && (
            <div className="space-y-6 text-center">
              <div className="mx-auto h-20 w-20 rounded-full bg-primary/10 flex items-center justify-center">
                <Sparkles className="h-10 w-10 text-primary" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-foreground">You&apos;re all set!</h1>
                <p className="text-muted-foreground mt-2">
                  Your personalised dashboard is ready. You can always update your details from your profile.
                </p>
              </div>
            </div>
          )}

          <div className="flex items-center gap-3 pt-2">
            {step > 1 && (
              <Button variant="outline" onClick={handleBack} className="h-10 gap-2 cursor-pointer">
                <ArrowLeft className="h-4 w-4" /> Back
              </Button>
            )}
            <Button onClick={handleNext} disabled={(step === 1 && !category) || saving} className="h-10 flex-1 gap-2 cursor-pointer">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {step === 3 ? "Go to Dashboard" : "Continue"}
              {step < 3 && <ArrowRight className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}
