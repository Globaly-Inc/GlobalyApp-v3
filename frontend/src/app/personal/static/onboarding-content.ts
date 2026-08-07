import { GraduationCap, Briefcase, Users, Compass } from "lucide-react";

export const CATEGORIES = [
  { value: "student", icon: GraduationCap, title: "Student", description: "Searching for courses, universities, or study abroad opportunities" },
  { value: "education_provider", icon: Briefcase, title: "Education Professional", description: "Working in the education industry as a counsellor or consultant" },
  { value: "parents", icon: Users, title: "Parent / Guardian", description: "Exploring options for your child's education journey" },
  { value: "explorer", icon: Compass, title: "Just Exploring", description: "Browsing to learn more about international education" },
];

export const GENDER_OPTIONS = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "non_binary", label: "Non-binary" },
  { value: "prefer_not_to_say", label: "Prefer not to say" },
];

export const DEGREE_LEVELS = [
  { value: "certificate", label: "Certificate" },
  { value: "diploma", label: "Diploma" },
  { value: "associate", label: "Associate Degree" },
  { value: "bachelor", label: "Bachelor's Degree" },
  { value: "graduate_certificate", label: "Graduate Certificate" },
  { value: "graduate_diploma", label: "Graduate Diploma" },
  { value: "master", label: "Master's Degree" },
  { value: "doctoral", label: "Doctoral / PhD" },
  { value: "other", label: "Other" },
];

export const FIELDS_OF_STUDY = [
  "Business & Management", "Engineering", "Computer Science & IT",
  "Health & Medicine", "Law", "Education", "Arts & Humanities",
  "Science", "Architecture", "Agriculture", "Tourism & Hospitality",
  "Social Sciences", "Environmental Studies", "Finance & Accounting",
];
