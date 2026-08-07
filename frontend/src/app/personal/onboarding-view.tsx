"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, Check, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Combobox } from "@/components/combobox";
import { DatePicker } from "@/components/ui/date-picker";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { geoApi, type Country } from "../geo/apis";
import { updateProfile, updateSubCategory } from "./store/profile-slice";
import { CATEGORIES, GENDER_OPTIONS, DEGREE_LEVELS, FIELDS_OF_STUDY } from "./static/onboarding-content";
import { validateStep2, validateStep2Field } from "./validation";
import { clearFieldErrorIfNowValid } from "./utils";
import type { StudentProfile, StudentProfilePatch } from "./apis/types";

const TOTAL_STEPS = 3;
const SELECT_TRIGGER_CLASS = "w-full data-[size=default]:h-10";

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
          <Image src="/globaly-logo.png" alt="Globaly" width={753} height={157} className="h-8 w-auto" />
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
            <div className="space-y-4">
              <div>
                <h1 className="text-2xl font-bold text-foreground">What brings you to Globaly?</h1>
                <p className="text-muted-foreground mt-1">This helps us personalise your experience.</p>
              </div>
              <div className="space-y-3">
                {CATEGORIES.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setCategory(opt.value)}
                    className={cn(
                      "w-full flex items-center gap-4 p-4 rounded-lg border-2 text-left transition-all",
                      category === opt.value ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground/30",
                    )}
                  >
                    <div
                      className={cn(
                        "h-10 w-10 rounded-lg flex items-center justify-center shrink-0",
                        category === opt.value ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
                      )}
                    >
                      <opt.icon className="h-5 w-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-foreground">{opt.title}</p>
                      <p className="text-sm text-muted-foreground">{opt.description}</p>
                    </div>
                    <div
                      className={cn(
                        "h-5 w-5 rounded-full border-2 flex items-center justify-center shrink-0",
                        category === opt.value ? "border-primary bg-primary" : "border-muted-foreground/40",
                      )}
                    >
                      {category === opt.value && <Check className="h-3 w-3 text-primary-foreground" />}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div>
                <h1 className="text-2xl font-bold text-foreground">Tell us about yourself</h1>
                <p className="text-muted-foreground mt-1">We&apos;ll use this to match you with the right opportunities.</p>
              </div>
              <div className="space-y-4">
                <div className="flex flex-col gap-2">
                  <Label className="text-sm font-medium">
                    Country of Nationality <span className="text-destructive">*</span>
                  </Label>
                  <Combobox
                    value={nationalityId}
                    onChange={handleNationalityChange}
                    placeholder="Select your nationality"
                    searchPlaceholder="Search countries..."
                    options={countryOptions}
                    aria-invalid={!!fieldErrors.nationalityId}
                  />
                  {fieldErrors.nationalityId && <p className="text-sm text-destructive">{fieldErrors.nationalityId}</p>}
                </div>


                <div className="flex flex-col gap-2">
                  <Label className="text-sm font-medium">
                    Date of Birth <span className="text-destructive">*</span>
                  </Label>
                  <DatePicker
                    value={dob}
                    onChange={handleDobChange}
                    placeholder="Select your date of birth"
                    toYear={new Date().getFullYear()}
                    disabled={(date) => date > new Date()}
                    aria-invalid={!!fieldErrors.dob}
                  />
                  {fieldErrors.dob && <p className="text-sm text-destructive">{fieldErrors.dob}</p>}
                </div>

                <div className="flex flex-col gap-2">
                  <Label className="text-sm font-medium">
                    Gender <span className="text-destructive">*</span>
                  </Label>
                  <Select value={gender} onValueChange={(v) => handleGenderChange(String(v))}>
                    <SelectTrigger className={SELECT_TRIGGER_CLASS} aria-invalid={!!fieldErrors.gender}>
                      <SelectValue placeholder="Select gender" />
                    </SelectTrigger>
                    <SelectContent>
                      {GENDER_OPTIONS.map((g) => (
                        <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {fieldErrors.gender && <p className="text-sm text-destructive">{fieldErrors.gender}</p>}
                </div>

                <div className="flex flex-col gap-2">
                  <Label className="text-sm font-medium">
                    Current Address <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    className="h-10"
                    value={address}
                    onChange={(e) => handleAddressChange(e.target.value)}
                    placeholder="Street, city, etc."
                    aria-invalid={!!fieldErrors.address}
                  />
                  {fieldErrors.address && <p className="text-sm text-destructive">{fieldErrors.address}</p>}
                </div>

                {category !== "education_provider" && (
                  <>
                    <div>
                      <Label className="text-sm font-medium">
                        Preferred Destinations (max 5) <span className="text-destructive">*</span>
                      </Label>
                      <Combobox
                        value=""
                        onChange={toggleDestination}
                        placeholder="Add a destination country"
                        searchPlaceholder="Search countries..."
                        options={destinationOptions}
                        className="mt-1"
                        aria-invalid={!!fieldErrors.destinations}
                      />
                      {destinations.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-2">
                          {destinations.map((d) => (
                            <Badge
                              key={d}
                              variant="secondary"
                              className="cursor-pointer hover:bg-destructive/10"
                              onClick={() => toggleDestination(d)}
                            >
                              {countryNameById.get(d) ?? d} ×
                            </Badge>
                          ))}
                        </div>
                      )}
                      {fieldErrors.destinations && <p className="text-sm text-destructive mt-2">{fieldErrors.destinations}</p>}
                    </div>
                    <div>
                      <Label className="text-sm font-medium">
                        Fields of Study <span className="text-destructive">*</span>
                      </Label>
                      <div className="flex flex-wrap gap-2 mt-1">
                        {FIELDS_OF_STUDY.map((f) => (
                          <Badge key={f} variant={fields.includes(f) ? "default" : "outline"} className="cursor-pointer" onClick={() => toggleField(f)}>
                            {f}
                          </Badge>
                        ))}
                      </div>
                      {fieldErrors.fields && <p className="text-sm text-destructive mt-2">{fieldErrors.fields}</p>}
                    </div>
                    <div className="flex flex-col gap-2">
                      <Label className="text-sm font-medium">
                        Degree Level <span className="text-destructive">*</span>
                      </Label>
                      <Select value={degreeLevel} onValueChange={(v) => handleDegreeLevelChange(String(v))}>
                        <SelectTrigger className={SELECT_TRIGGER_CLASS} aria-invalid={!!fieldErrors.degreeLevel}>
                          <SelectValue placeholder="Select degree level" />
                        </SelectTrigger>
                        <SelectContent>
                          {DEGREE_LEVELS.map((d) => (
                            <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {fieldErrors.degreeLevel && <p className="text-sm text-destructive">{fieldErrors.degreeLevel}</p>}
                    </div>
                  </>
                )}
              </div>
            </div>
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
