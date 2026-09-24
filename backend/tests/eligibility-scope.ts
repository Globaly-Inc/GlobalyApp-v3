/**
 * isAdmissionRequirement: keeps scholarship criteria and application paperwork out of the
 * eligibility table. Pure, no DB.   npm run test:eligibility-scope
 */
import { isAdmissionRequirement } from "../src/modules/superadmin/data-extraction/lib/staging-writer.js";

let failed = 0;
const check = (expect: boolean, row: { name?: string | null; description?: string | null }) => {
  const got = isAdmissionRequirement(row);
  const ok = got === expect;
  if (!ok) failed++;
  console.log(`  ${ok ? "✓" : "✗"} ${expect ? "keep" : "drop"}: ${row.name ?? "(no name)"}`);
};

// Real staged rows that must be dropped
check(false, { name: "Global Scholars Program Eligibility", description: "You must be a new-to-Curtin student to apply for the Global Scholars Program." });
check(false, { name: "Curtin English Scholarship Eligibility", description: "All international students studying Gateway…" });
check(false, { name: "Supplementary Documents", description: "Please submit the following documents with your application: CV, 1 relevant referee report, A personal statement" });
check(false, { name: "Application Documents Requirement", description: "Academic transcript and award certificate, Resume, Personal statement" });
check(false, { name: "Visa Restriction Requirement", description: "This course is not CRICOS registered and is not available to students on a visa subclass 500." });
check(false, { name: "Interview", description: "Eligible applicants will be invited to attend an interview." });
check(false, { name: "Personal Statement", description: "Eligible applicants must also submit a personal statement." });
check(false, { name: "Academic Referee Reports", description: "External applicants must arrange for two academic referee reports." });
check(false, { name: "Design Major Portfolio", description: "Please include a visual portfolio of 5–10 images." });
check(false, { name: "Relational skills Inherent Requirement", description: "Dietetic practice requires the ability to use interpersonal skills." });
check(false, { name: "New-to-Curtin Student Status", description: "You must be a new-to-Curtin student to apply for the Global Scholars Program." }); // live after-fix leak
// Scholarship criteria under an innocent name: the description decides
check(false, { name: "Academic Entry", description: "Minimum GPA of 3.5 to hold the International Excellence Scholarship, worth £5,000." });

// Genuine admission criteria that must survive — including ones whose wording brushes the noise list
check(true, { name: "Academic Entry", description: "Bachelor's degree in a relevant field with a minimum GPA of 3.0." });
check(true, { name: "English Language Requirement", description: "IELTS 6.5 with no band below 6.0, or an approved equivalent. Waived if your previous degree was taught in English." });
check(true, { name: "English Language Proficiency", description: "A scaled score of at least 50 in WACE ATAR English." });
check(true, { name: "Admission test", description: "GMAT required; average score of admitted students is 700." });
check(true, { name: "Prerequisite", description: "Mathematics Methods ATAR and Chemistry ATAR." });
check(true, { name: "Age Requirement", description: "Aged 17 or over." });
check(true, { name: "Work Experience", description: "A minimum of two years' relevant professional experience is required for admission." });
check(true, { name: "Standard Academic Entry", description: "112 UCAS points; or 96 UCAS points for a contextual offer. Applicants must submit a CV with their UCAS application." }); // paperwork mentioned inside a real requirement is not the row's subject
check(true, { name: null, description: "Completion of a Master's degree with CGPA 3.0 out of 4.0." });

console.log(failed ? `\n${failed} FAILED` : "\nall passed");
if (failed) process.exit(1);
