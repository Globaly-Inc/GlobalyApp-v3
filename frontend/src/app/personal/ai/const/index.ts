import { GraduationCap, ClipboardCheck, Coins, Plane, type LucideIcon } from "lucide-react";

export type StarterCategory = {
  label: string;
  Icon: LucideIcon;
  questions: string[];
};

export const STARTER_CATEGORIES: StarterCategory[] = [
  {
    label: "Course Search",
    Icon: GraduationCap,
    questions: [
      "What MBA programs are available in Australia?",
      "Compare computer science degrees in Canada vs UK",
      "Which universities offer nursing programs with clinical placements?",
    ],
  },
  {
    label: "Admissions",
    Icon: ClipboardCheck,
    questions: [
      "What IELTS score do I need for a Master's in the UK?",
      "What are the entry requirements for UBC Engineering?",
      "Which universities accept 3-year bachelor's degrees?",
    ],
  },
  {
    label: "Scholarships & Fees",
    Icon: Coins,
    questions: [
      "What scholarships are available for international students in Australia?",
      "Compare tuition fees for MBA programs in Melbourne",
      "Are there fee waivers for developing country applicants?",
    ],
  },
  {
    label: "Visa & Living",
    Icon: Plane,
    questions: [
      "What is the student visa process for Australia?",
      "How much does it cost to live in Toronto as a student?",
      "Can I work part-time on a student visa in the UK?",
    ],
  },
];
