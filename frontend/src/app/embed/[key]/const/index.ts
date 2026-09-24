import { ClipboardCheck, Coins, Compass, GraduationCap, MapPin, Plane } from "lucide-react";
import type { StarterCategory } from "@/app/ai/const";

export type EmbedOwnerKind = "business" | "institution";

/**
 * Starter questions for the embedded panel, per owner kind.
 *
 * The shared `STARTER_CATEGORIES` are marketplace questions ("What MBA programs are
 * available in Australia?") — wrong on both widgets: they read as another institution's
 * catalog under a university's brand, and as an oddly specific opening for a consultancy.
 *
 * What each widget can actually answer decides the wording:
 * - An **institution** widget is scoped to its own extraction job, its own crawled site
 *   and its own profile (`buildEmbedContext`), so every question is about *it*.
 * - A **business** widget has no owner profile and no rack — the crawled-site path is
 *   institution-only — and its course scope is empty unless its website domain matches a
 *   crawled institution. So its starters stay open counselling questions the model can
 *   answer without owner-specific retrieval.
 */
export function embedStarters(kind: EmbedOwnerKind): StarterCategory[] {
  if (kind === "institution") {
    return [
      {
        label: "Programs",
        Icon: GraduationCap,
        questions: [
          // Second person, not the display name: that field holds whatever the owner typed
          // when creating the widget ("AIT widget"), which reads as nonsense in a sentence.
          "What courses do you offer?",
          "Which postgraduate programs are open to international students?",
          "Do you offer part-time, online or pathway options?",
        ],
      },
      {
        label: "Admissions",
        Icon: ClipboardCheck,
        questions: [
          "What are the entry requirements?",
          "What English test score do I need?",
          "When are the next intakes and application deadlines?",
        ],
      },
      {
        label: "Fees & Scholarships",
        Icon: Coins,
        questions: [
          "How much is tuition for international students?",
          "What scholarships are available?",
          "Are there payment plans or fee waivers?",
        ],
      },
      {
        label: "Campus & Contact",
        Icon: MapPin,
        questions: [
          "Where are your campuses?",
          "How do I contact the admissions team?",
          "What accreditations do you hold?",
        ],
      },
    ];
  }

  return [
    {
      label: "Where to study",
      Icon: Compass,
      questions: [
        "I want to study abroad — where do I start?",
        "Which country suits my budget and grades?",
        "Compare studying in Australia, Canada and the UK",
      ],
    },
    {
      label: "Find a course",
      Icon: GraduationCap,
      questions: [
        "Help me choose a course for my background",
        "What can I study with a 3-year bachelor's degree?",
        "Which programs still have intakes I can apply for?",
      ],
    },
    {
      label: "Applying",
      Icon: ClipboardCheck,
      questions: [
        "What documents do I need for my application?",
        "What IELTS or PTE score will I need?",
        "How do I write a strong statement of purpose?",
      ],
    },
    {
      label: "Costs & Visa",
      Icon: Plane,
      questions: [
        "How much does studying abroad cost in total?",
        "What scholarships can I apply for?",
        "How does the student visa process work?",
      ],
    },
  ];
}
