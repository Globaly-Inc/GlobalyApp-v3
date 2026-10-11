"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Combobox } from "@/components/combobox";
import { DatePicker } from "@/components/ui/date-picker";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { GENDER_OPTIONS, DEGREE_LEVELS, FIELDS_OF_STUDY } from "./static/onboarding-content";
import type { StudentProfile } from "./apis/types";

const SELECT_TRIGGER_CLASS = "w-full data-[size=default]:h-10";

type Option = { value: string; label: string };

export function OnboardingDetailsStep({
  category,
  countryOptions,
  nationalityId,
  handleNationalityChange,
  dob,
  handleDobChange,
  gender,
  handleGenderChange,
  address,
  handleAddressChange,
  destinations,
  destinationOptions,
  countryNameById,
  toggleDestination,
  fields,
  toggleField,
  degreeLevel,
  handleDegreeLevelChange,
  fieldErrors,
}: Readonly<{
  category: StudentProfile["user_sub_category"];
  countryOptions: Option[];
  nationalityId: string;
  handleNationalityChange: (value: string) => void;
  dob: string;
  handleDobChange: (value: string) => void;
  gender: string;
  handleGenderChange: (value: string) => void;
  address: string;
  handleAddressChange: (value: string) => void;
  destinations: string[];
  destinationOptions: Option[];
  countryNameById: Map<string, string>;
  toggleDestination: (countryId: string) => void;
  fields: string[];
  toggleField: (field: string) => void;
  degreeLevel: string;
  handleDegreeLevelChange: (value: string) => void;
  fieldErrors: Record<string, string>;
}>) {
  return (
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
  );
}
