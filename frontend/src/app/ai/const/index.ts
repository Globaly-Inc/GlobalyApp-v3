import { GraduationCap, ClipboardCheck, Coins, Plane, type LucideIcon } from "lucide-react";

export type StarterCategory = {
  label: string;
  Icon: LucideIcon;
  questions: string[];
};

/** Random study-flavoured greetings for the chat hero. `{name}` is replaced with the first name. */
export const GREETINGS: string[] = [
  "What's cooking, {name}?",
  "Which country is calling, {name}?",
  "Dreaming of a new campus, {name}?",
  "Let's find your perfect program, {name}",
  "Exploring your options, {name}?",
  "Where in the world next, {name}?",
  "Let's map out your future, {name}",
  "Big plans brewing, {name}?",
  "Scholarships, visas, universities — where do we start, {name}?",
  "Your next chapter starts here, {name}",
];

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
