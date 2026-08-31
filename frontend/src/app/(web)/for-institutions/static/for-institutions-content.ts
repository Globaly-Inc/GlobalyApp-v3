import {
  FolderKanban,
  Globe,
  Handshake,
  GraduationCap,
  // CalendarCheck, Code2, Megaphone, Sparkles come back with the parked WHY_JOIN cards below.
  UserPlus,
  School,
  BookMarked,
  Rocket,
} from "lucide-react";
import { MEDIA_URL } from "../../const/index";

export const INSTITUTION_TYPING_PHRASES = [
  "Reach & Impact",
  "Student Pipeline",
  "Education Counselor Network",
  "Course Listings",
  "Brand Presence",
];

export const FAQS = [
  {
    q: "How do I connect with Education Counselor?",
    a: "You can connect with trusted education consultancies directly on Globaly from our 'Partnership' feature. Once your institution is verified, you'll be able to search and partner with education counselors, allowing them to represent you to your mentioned regions.",
  },
  {
    q: "How does the partnership with education counselors work?",
    a: "Institutions can build and manage partnerships with education counselors through Globaly's secure platform. Once connected, education counselors can represent your courses, handle student enquiries, and support application processes — all within your partner network.",
  },
  {
    q: "Can we manage and update our courses easily?",
    a: "Yes, Globaly provides a user-friendly portal that allows you to add, edit, or remove course listings anytime. You can also include eligibility requirements, fees, study units, and accreditations with ease. All the updates to the course will be notified to all the associate branches and partners — all at once.",
  },
  {
    q: "Can we add branches from other locations?",
    a: "Absolutely. You can create and manage multiple branches under your institution profile. Each branch can have its own set of courses, partnerships, and Profile setup.",
  },
  {
    q: "How does Globaly ensure the quality of student enquiries?",
    a: "Student enquiries come from verified users who complete essential profile information. You will receive enquiries that match your eligibility criteria from all around the world.",
  },
  {
    q: "Is there a cost to list our institution and courses?",
    a: "Globaly is absolutely free for institutions to list their business in Globaly. Institutions do not have to worry about any cost while adding and sharing courses with their branches and partners.",
  },
  {
    q: "Do I need to be verified to access full features?",
    a: "Yes, verification is required to ensure the authenticity and credibility of your institution. Once verified, you'll be able to set up a full business profile, add team members, list your services, form partnerships with institutions, and unlock all platform capabilities.",
  },
  {
    q: "Is Globaly compliant with data protection and privacy regulations?",
    a: "Yes, Globaly follows strict data protection standards and is compliant with international privacy laws. We ensure that both institution and student data are securely stored and only accessible to authorized parties.",
  },
];

export const WHY_JOIN = [
  {
    Icon: FolderKanban,
    title: "Total Control Over Your Course Data",
    desc: "Upload, manage, and update your course listings, fees, scholarships, and intake details directly. No third-party edits. No outdated information.",
  },
  {
    Icon: Globe,
    title: "Feature on a Global, Open Marketplace",
    desc: "Be discovered by students, education counselors, and migration counselors actively searching for programs like yours — transparent, open, and bias-free.",
  },
  {
    Icon: Handshake,
    title: "Connect and Collaborate with verified Education Counselors",
    desc: "Build your own network of trusted education and migration agents worldwide — without relying on aggregators or super-agents.",
  },
  {
    Icon: GraduationCap,
    title: "Access Highly Qualified, Pre-Checked Student Leads",
    desc: "Receive student inquiries through verified education counselors with eligibility-checked applications, reducing application errors and improving conversion rates.",
  },
  /* Parked until the LMS ships:
  {
    Icon: CalendarCheck,
    title: "Train & Certify Your Education Counselor Network",
    desc: "Create training programs with chapters, video content, and assessments. Issue Bronze, Silver, and Gold certifications to your education counselor network. Track performance with Trust Scores and leaderboards.",
  },
  {
    Icon: Code2,
    title: "Embed course search and eligibility check",
    desc: "Add Globaly.app's powerful course search and eligibility test tool directly to your institution's site to capture and convert student traffic instantly.",
  },
  {
    Icon: Megaphone,
    title: "Launch Ambassador Programs",
    desc: "Deploy student ambassadors to represent your institution. Track performance, manage peer inquiries, and let ambassadors earn through your programs.",
  },
  {
    Icon: Sparkles,
    title: "AI-Powered Training Content",
    desc: "Generate chapter outlines, assessment questions, and summaries with AI. Build comprehensive training programs in minutes, not weeks.",
  },
  */
];

export const HOW_IT_WORKS = [
  {
    Icon: UserPlus,
    title: "Join Globaly",
    desc: "Create your institutional profile and become part of a global education network.",
  },
  {
    Icon: School,
    title: "Setup your Institution",
    desc: "Add your campuses, Team Members, accreditation, and key details to showcase your offerings.",
  },
  {
    Icon: BookMarked,
    title: "List and Manage courses",
    desc: "Easily add courses, intakes, fees, and appoint branches that offers services.",
  },
  {
    Icon: Handshake,
    title: "Connect with trusted Education Counselors",
    desc: "Collaborate with verified education consultants to reach students in key markets.",
  },
  {
    Icon: Rocket,
    title: "Expand your global presence",
    desc: "Attract diverse international students and grow your reach across borders.",
  },
];

export const BLOG_POSTS = [
  {
    title: "Visa Document Checklist for Australia (2025 Edition)",
    date: "Jan 2, 2026",
    category: "🇦🇺 Australia",
    image:
      "https://cdn.sanity.io/images/ghn0jurr/production/87712abb1eadffd2eff78ee7b4b1883ca59e5656-5472x3648.jpg?auto=format&fit=max&q=75&w=600",
  },
  {
    title: "How Many Hours Can Students Work in Australia? (2025 Guide)",
    date: "Jan 2, 2026",
    category: "🇦🇺 Australia",
    image:
      "https://cdn.sanity.io/images/ghn0jurr/production/e02fa6d1c7406eace5eff2b85ce4e5f5e38cb616-2296x3440.jpg?auto=format&fit=max&q=75&w=600",
  },
  {
    title: "Choosing the Right Education Consultants for Your University",
    date: "Jan 1, 2026",
    category: "University",
    image:
      "https://cdn.sanity.io/images/ghn0jurr/production/4c5d34b2576d352ab41a48f85f8fc03c47cdef51-5760x3840.jpg?auto=format&fit=max&q=75&w=600",
  },
  {
    title: "Global Strategies for Higher Education Institutions to Connect with Students",
    date: "Nov 6, 2025",
    category: "University",
    image:
      "https://cdn.sanity.io/images/ghn0jurr/production/92fe97c08c52886274307d24b8cce02216be87ac-1000x667.jpg?auto=format&fit=max&q=75&w=600",
  },
];

// Same photo V2 bundled from assets/public/photos/, served from public/ here.
export const OWN_DATA_PHOTO_URL = `${MEDIA_URL}/institution-faculty.jpg`;

export const OWN_DATA_ITEMS = [
  {
    title: "Full Ownership & Control",
    desc: "Upload, manage, and update your course, fee, and scholarship details anytime — no third-party edits or outdated listings.",
  },
  {
    title: "Global Open Marketplace Visibility",
    desc: "Feature your institution and programs on a transparent platform where students, education counselors, and migration counselors actively search for programs like yours.",
  },
  {
    title: "Real-Time Data Sync for Education Counselors & Students",
    desc: "Ensure your verified education counselors and prospective students always see your latest course offerings, eligibility criteria, and intake schedules.",
  },
  {
    title: "Embed Powerful Course Search",
    desc: "Integrate Globaly.app's powerful course search tool and live API into your own website or CRM, keeping your student and education counselor audiences up-to-date everywhere you operate.",
    comingSoon: true,
  },
];

export const AGENT_NETWORK_ITEMS = [
  {
    title: "Connect with Verified Education Counselors",
    desc: "Build a trusted, independent network of education counselors worldwide — no super-education counselor restrictions, no aggregator middlemen.",
  },
  {
    title: "Smart Recruitment Analytics",
    desc: "Track recruitment volume, education counselor performance, and student enrollment trends with a clear, live analytics dashboard.",
  },
  {
    title: "Direct Partnership Management",
    desc: "Grant education counselor branches access to represent you in specific regions, manage certifications, and track partner performance effortlessly.",
  },
  {
    title: "Eligibility-Checked Leads",
    desc: "Receive student inquiries that have already been matched against your course requirements, academic scores, and intake dates.",
  },
];
