import { FaqAccordion } from "../../components/faq-accordion";

const FAQS = [
  {
    q: "What is Globaly and how does it benefit education consultancies?",
    a: "Globaly is a unified platform that connects education consultancies with students and institutions worldwide, helping you streamline student recruitment, access global opportunities, and grow your business.",
  },
  {
    q: "Is Globaly free to use for agents?",
    a: "Yes, Globaly is free to join and use. We operate as a zero-commission platform, meaning you keep 100% of what you earn. While core features are free, certain advanced tools—like accessing premium enquiries—require Globaly Coins.",
  },
  {
    q: "How can I start receiving student enquiries on Globaly?",
    a: "Simply complete your consultancy profile, connect with institutions, and use Globaly Coins to unlock and respond to quality student enquiries tailored to your offerings.",
  },
  {
    q: "How do I connect with institutions and manage partnerships?",
    a: "You can explore available institutions on Globaly, request partnerships, and represent their services from your agent portal with ease and transparency.",
  },
  {
    q: "What is Globaly Coin and how does the credit system work?",
    a: "Globaly Coin is a credit-based system used to unlock student enquiries. You can top up credits and use them as needed to engage with potential verified students.",
  },
  {
    q: "How does Globaly ensure the quality of institutions and courses?",
    a: "We work only with verified institutions, and each course listing goes through a review process to ensure it meets academic standards and relevance for student needs.",
  },
  {
    q: "Do I need to be verified to access full features?",
    a: "Yes, verification is required to ensure the authenticity and credibility of your consultancy. Once verified, you'll be able to set up a full business profile, add team members, list your services, form partnerships with institutions, and unlock all platform capabilities.",
  },
  {
    q: "Is there support available if I need help using the platform?",
    a: "Absolutely. Our support team is available via email, and we also offer tutorials and support articles to guide you through.",
  },
];

export function FaqSection() {
  return <FaqAccordion faqs={FAQS.map((f) => ({ q: f.q, a: f.a }))} />;
}
