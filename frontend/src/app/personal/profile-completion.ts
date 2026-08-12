import type { LanguageTest, Qualification, StudentProfile } from "./apis/types";

export type CompletionItem = { label: string; met: boolean };

export function computeCompletion(
  profile: StudentProfile,
  qualifications: Qualification[],
  languageTests: LanguageTest[],
): { percentage: number; items: CompletionItem[] } {
  const items: CompletionItem[] = [
    { label: "Full name", met: !!(profile.first_name && profile.last_name) },
    { label: "Profile photo", met: !!profile.photo_url },
    { label: "Nationality", met: !!profile.nationality_id },
    { label: "Country of residence", met: !!profile.country_of_residence_id },
    { label: "Education background", met: qualifications.length > 0 },
    { label: "Test scores", met: languageTests.length > 0 },
    { label: "Budget range", met: !!(profile.budget_min && profile.budget_max) },
    { label: "Preferred destinations", met: !!profile.preferred_destinations?.length },
  ];
  const percentage = Math.round((items.filter((i) => i.met).length / items.length) * 100);
  return { percentage, items };
}
