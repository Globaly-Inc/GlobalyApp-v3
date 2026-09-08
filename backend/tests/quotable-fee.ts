import assert from "node:assert";
import { isQuotableFee } from "../src/modules/superadmin/data-extraction/lib/staging-writer";

// Tuition + application/enrolment only. Unnamed fees come from the bulk tuition table.
const keep = ["", null, "Tuition Fee", "Tuition & Fees", "Default Fee", "Total Program Fee",
  "Per Credit Fee", "Semester Fee", "International Tuition Fee", "Application Fee",
  "Enrolment Fee", "Registration Fee", "Course Fees", "Dual Degree Fee"];
const drop = ["Health Cover", "OSHC", "Overseas Student Health Cover", "Medical Examination Fee",
  "Student Health Insurance", "Material Fee", "Books & Equipment", "Comprehensive Exam Fee",
  "Late Payment Fee", "Student Services and Amenities Fee", "Visa Application Fee",
  "Accommodation Bond", "Airport Pickup", "Graduation Fee", "Library Fine", "Transport Fee"];

for (const n of keep) assert(isQuotableFee(n), `should keep: ${n}`);
for (const n of drop) assert(!isQuotableFee(n), `should drop: ${n}`);
console.log("✓ quotable-fee: %d kept, %d dropped", keep.length, drop.length);
