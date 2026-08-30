// Static content ported verbatim from V2's PricingPage.tsx — no live pricing-plans
// backend endpoint exists in v3, so the plan cards below are the permanent data
// source (not a loading fallback, as they were in V2).
export type Audience = "students" | "business";

export const trustStats = [
  { value: "50K+", label: "Students registered" },
  { value: "2,400+", label: "Verified businesses" },
  { value: "35+", label: "Countries covered" },
  { value: "180K+", label: "Services listed" },
];

export const studentFeatures = [
  { text: "Full student profile with documents", sub: "Qualifications, language tests, work experience" },
  { text: "Search & compare 180K+ services", sub: "Courses, institutions, education counselors across 35+ countries" },
  { text: "Send up to 3 enquiries per day", sub: "Direct contact with verified education counselors and institutions" },
  { text: "AI eligibility checking", sub: "Know your chances before applying" },
  { text: "Real student ambassador connections", sub: "Chat with students already on the course" },
  { text: "Jobs, events, accommodation, services", sub: "The full settling-in marketplace" },
  { text: "10 free credits every month", sub: "For AI counselling and writing tools" },
];

export const earnCards = [
  { emoji: "🗓", amount: "10", unit: "credits / month", title: "Monthly free grant", desc: "Just for showing up. 10 credits deposited to your wallet every month, automatically.", tag: "Auto — no action needed" },
  { emoji: "✅", amount: "20", unit: "credits · one-time", title: "Complete your profile", desc: "Fill out your qualifications, test scores and preferences to 100%. Earn 20 credits instantly.", tag: "One-time lifetime bonus" },
  { emoji: "👥", amount: "20", unit: "credits per student referral", title: "Refer a friend", desc: "Share your unique referral link. Earn 20 credits for each student who completes their profile.", tag: "Unlimited referrals" },
  { emoji: "🏢", amount: "100", unit: "credits per business referral", title: "Refer a business", desc: "Know an education counselor or institution? Earn 100 credits when they verify their account.", tag: "Unlimited referrals" },
  { emoji: "🎓", amount: "5–50", unit: "credits per milestone", title: "Ambassador milestones", desc: "Represent a university as a student ambassador. Earn credits as you hit program milestones.", tag: "Per program" },
  { emoji: "💳", amount: "Buy", unit: "top-up credits", title: "Purchase a credit pack", desc: "Need more? Buy credits from $10 AUD. Bulk packs save up to 50%. They never expire.", tag: "Packs from 50 cr / $10 AUD" },
];

export const aiCosts = [
  { label: "AI counsellor session", cost: "10 cr", dollar: "= $2.00 AUD" },
  { label: "AI writing assist", cost: "5 cr", dollar: "= $1.00 AUD" },
  { label: "AI eligibility check", cost: "5 cr", dollar: "= $1.00 AUD" },
  { label: "AI job match score", cost: "5 cr", dollar: "= $1.00 AUD" },
];

export const creditCosts = [
  { emoji: "🔓", label: "Unlock a student enquiry", cr: "20 cr", aud: "$4 AUD" },
  { emoji: "📍", label: "Spotlight listing for 1 week", cr: "75 cr", aud: "$15 AUD" },
  { emoji: "🏠", label: "Homepage banner for 1 day", cr: "150 cr", aud: "$30 AUD" },
  { emoji: "📢", label: "1,000 ad impressions (CPM)", cr: "50 cr", aud: "$10 AUD" },
  { emoji: "🤖", label: "AI counselling session", cr: "10 cr", aud: "$2 AUD" },
];

export const creditPacks = [
  { cr: 50, price: 10, save: null as string | null },
  { cr: 100, price: 18, save: "10%" },
  { cr: 300, price: 48, save: "20%" },
  { cr: 600, price: 84, save: "30%" },
  { cr: 1500, price: 180, save: "40%" },
  { cr: 5000, price: 500, save: "50%" },
];

export const traditionalCosts = [
  { label: "Per qualified lead", value: "$30–$150" },
  { label: "Annual listing fee", value: "$5,000–$50,000" },
  { label: "Event sponsorship", value: "$3,000–$15,000" },
  { label: "Ad CPM", value: "$15–$50" },
  { label: "Contract requirement", value: "Annual mandatory" },
];

export const globalyCosts = [
  { label: "Per enquiry unlock (20 credits)", value: "$4.00" },
  { label: "Annual listing fee", value: "$0 — always free" },
  { label: "Run an ad campaign", value: "From $10 (50 cr CPM)" },
  { label: "Ad CPM on Globaly", value: "$10 per 1,000" },
  { label: "Contract requirement", value: "None — cancel anytime" },
];

export const comparisonSections = [
  {
    title: "PRICING (AUD)",
    rows: [
      { feature: "Monthly price", values: ["$0", "$49", "$99", "$199", "$499"] },
      { feature: "Annual price (per month)", values: ["—", "$39", "$79", "$159", "$399"] },
      { feature: "Annual saving", values: ["—", "$120/yr", "$240/yr", "$480/yr", "$1,200/yr"] },
    ],
  },
  {
    title: "CREDITS (MONTHLY)",
    rows: [
      { feature: "Business wallet credits/mo", values: ["0 (buy)", "100 cr", "300 cr", "800 cr", "2,000 cr"] },
      { feature: "Personal credits per member", values: ["10 cr", "20 cr", "30 cr", "50 cr", "100 cr"] },
      { feature: "Subscription credit rollover", values: ["N/A", "Resets monthly", "Resets monthly", "Resets monthly", "Resets monthly"] },
    ],
  },
  {
    title: "PROFILE & SERVICES",
    rows: [
      { feature: "Published services", values: ["∞", "∞", "∞", "∞", "∞"] },
      { feature: "Team members", values: ["∞", "∞", "∞", "∞", "∞"] },
      { feature: "Branch connections", values: ["—", "3", "10", "∞", "∞"] },
      { feature: "Trust score boost", values: ["—", "Minor", "Standard", "Priority", "Maximum"] },
    ],
  },
  {
    title: "LEADS & ENQUIRIES",
    rows: [
      { feature: "Receive enquiries", values: ["✓", "✓", "✓", "✓", "✓"] },
      { feature: "Enquiry unlock cost", values: ["20 cr (buy)", "20 cr", "20 cr", "20 cr", "Custom"] },
      { feature: "Enquiry analytics", values: ["—", "Basic", "Advanced", "Full CRM view", "Full + custom"] },
      { feature: "Lead export (per 10)", values: ["20 cr (buy)", "20 cr (buy)", "20 cr (buy)", "20 cr (buy)", "Included"] },
    ],
  },
  {
    title: "ADVERTISING",
    rows: [
      { feature: "Ad campaigns", values: ["1", "3", "10", "∞", "∞"] },
      { feature: "Spotlight listing (per week)", values: ["75 cr (buy)", "75 cr (buy)", "75 cr (buy)", "75 cr (buy)", "Custom"] },
      { feature: "Homepage banner (per day)", values: ["—", "—", "150 cr", "150 cr", "Custom"] },
      { feature: "Ad CPM (per 1,000)", values: ["50 cr = $10", "50 cr = $10", "50 cr = $10", "50 cr = $10", "Custom"] },
    ],
  },
  {
    title: "EVENTS, JOBS & PROGRAMS",
    rows: [
      { feature: "Events per month", values: ["—", "3", "10", "∞", "∞"] },
      { feature: "Job postings", values: ["—", "5 active", "∞", "∞", "∞"] },
      { feature: "Ambassador programs", values: ["—", "1", "3", "∞", "∞"] },
      { feature: "Training programs", values: ["—", "1", "3", "∞", "∞"] },
    ],
  },
  {
    title: "ANALYTICS & INTEGRATIONS",
    rows: [
      { feature: "Analytics dashboard", values: ["—", "Basic", "Advanced", "Full suite", "Full + custom"] },
      { feature: "Data export", values: ["—", "—", "CSV", "CSV + Excel", "All formats"] },
      { feature: "API & webhook access", values: ["—", "—", "—", "✓", "✓"] },
    ],
  },
  {
    title: "SUPPORT",
    rows: [
      { feature: "Support", values: ["Docs", "Email", "Priority 48hr", "Priority 24hr + Dedicated AM", "Chat"] },
      { feature: "SLA guarantee", values: ["—", "—", "—", "99.5%", "99.9%"] },
      { feature: "Onboarding", values: ["Self-serve", "Email", "Guided", "Premium", "Custom + QBRs"] },
    ],
  },
];

export const faqs = [
  { q: "Is the Free plan actually free, forever?", a: "Yes. No credit card, no time limit. The Free plan lets you list unlimited services, add unlimited team members, and receive enquiries. You only spend credits when you choose to unlock a lead or run an ad — and you can buy those credits any time." },
  { q: "What happens at the end of the 14-day trial?", a: "Your account automatically drops to the Free plan. No charge, no drama. Any credits you purchased during the trial are kept in your wallet permanently. Only the subscription credit grants are removed. You can subscribe at any time during or after the trial." },
  { q: "Do subscription credits roll over each month?", a: "Subscription credits reset monthly — they don't accumulate. This keeps the economy healthy. However, purchased credits never expire — they stay in your wallet indefinitely regardless of plan changes. We always spend subscription credits before touching your purchased balance." },
  { q: "Can I upgrade or downgrade at any time?", a: "Upgrades are immediate — you're charged only the pro-rated difference for remaining days, and new credits and features activate instantly. Downgrades take effect at the end of your billing period — you keep your current plan until the cycle ends, then move to the new tier." },
  { q: "What happens if my payment fails?", a: "Stripe retries over 7 days. During that time your subscription stays fully active. After 7 days your account enters a 7-day grace period before dropping to Free. Your purchased credits are always safe — they are never affected by billing issues." },
  { q: "Does Globaly take a commission on enrollments?", a: "No. Globaly does not charge per enrollment, per placement, or per application. You pay a flat subscription or buy credits. The value you generate from those leads is entirely yours." },
  { q: "What currencies do you support?", a: "We support AUD, USD, GBP, EUR, CAD, INR, and NPR. Pricing is adjusted per region — India and Nepal receive significant purchasing-power-parity discounts, not just currency conversion. Your billing currency is set at account creation and can be changed by contacting support." },
  { q: "Can I cancel anytime? What's the refund policy?", a: "Yes — cancel monthly plans anytime, effective at the end of your billing period. Annual plans are non-refundable but you retain access for the full year. Purchased credits are refundable within 14 days of purchase if unspent. Spent credits are non-refundable." },
];

export const studentFaqs = [
  { q: "Is Globaly really free for students?", a: "Yes, always. You can search courses, send enquiries, and build your profile at no cost. There are no hidden charges or surprise fees — ever." },
  { q: "What are Globaly credits and how do I use them?", a: "Credits unlock premium features like extended AI Counsellor sessions and priority support. You earn them for free through referrals, profile completion, and milestones — or top up if you'd like more." },
  { q: "How does the AI Counsellor work?", a: "Our AI Counsellor helps you shortlist courses, check your eligibility, compare destinations, and prepare your applications — all powered by AI trained on verified education data." },
  { q: "Do I need to pay to send enquiries?", a: "No. Sending enquiries to education counselors and institutions is always free for students. There is no limit on how many you can explore." },
  { q: "Can I earn credits without paying?", a: "Absolutely. Refer friends, complete your profile, hit milestones, or join ambassador programs — all of these reward you with free credits." },
  { q: "What happens to my credits if I stop using Globaly?", a: "Purchased credits never expire. Earned credits stay in your wallet as long as your account is active. You can come back and use them anytime." },
  { q: "Is my personal data safe?", a: "Yes. All data is encrypted and stored securely. We never share your personal information with third parties without your explicit consent." },
  { q: "Can I use Globaly from any country?", a: "Yes. Globaly is available globally. Credit top-up pricing is adjusted by region so it's fair no matter where you are." },
];

const planNames = ["Free", "Starter", "Growth", "Pro", "Enterprise"];
const planPricesMonthly = [0, 49, 99, 199, 499];
const planPricesAnnual = [0, 39, 79, 159, 399];
const planCredits = [0, 100, 300, 800, 2000];
const planPersonalCredits = [10, 20, 30, 50, 100];

const planHighlights: string[][] = [
  ["Unlimited services", "Receive enquiries", "Pay-per-lead only"],
  ["100 credits/mo", "3 events, 5 jobs", "Email support"],
  ["300 credits/mo", "10 events, unlimited jobs", "Advanced analytics"],
  ["800 credits/mo", "Unlimited everything", "Priority 24hr support"],
  ["2,000 credits/mo", "API & webhooks", "Custom onboarding + QBRs"],
];

export type PlanCard = {
  name: string;
  monthly: number;
  annualMonthly: number;
  credits: number;
  personalCredits: number;
  highlights: string[];
  isPopular: boolean;
};

// V2 fetched these from a live /pricing-plans endpoint with this array as the
// loading/error fallback. V3 has no such backend endpoint (out of scope to
// build), so these static cards are the page's permanent data source.
export const planCards: PlanCard[] = planNames.map((name, i) => ({
  name,
  monthly: planPricesMonthly[i]!,
  annualMonthly: planPricesAnnual[i]!,
  credits: planCredits[i]!,
  personalCredits: planPersonalCredits[i]!,
  highlights: planHighlights[i]!,
  isPopular: i === 3,
}));
