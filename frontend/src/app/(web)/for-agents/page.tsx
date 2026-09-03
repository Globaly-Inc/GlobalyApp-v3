"use client";

import { useTypingEffect } from "../hooks/use-typing-effect";
import { HeroSection } from "./components/hero-section";
import { WhyAgentsJoinSection } from "./components/why-agents-join-section";
import { QualifiedLeadsSection } from "./components/qualified-leads-section";
import { CoinsBannerSection } from "./components/coins-banner-section";
import { PartnershipsSection } from "./components/partnerships-section";
import { HowItWorksSection } from "./components/how-it-works-section";
import { LatestBlogSection } from "../components/latest-blog-section";
import { FaqSection } from "./components/faq-section";
import { CtaSection } from "./components/cta-section";

const AGENT_TYPING_PHRASES = [
  "Globally",
  "With Fair Pricing",
  "With Top Universities",
  "With Verified Leads",
  "With Direct Partnerships",
];

export default function ForAgentsPage() {
  const { displayText, showCursor } = useTypingEffect(AGENT_TYPING_PHRASES);

  return (
    <>
      <HeroSection displayText={displayText} showCursor={showCursor} />
      <WhyAgentsJoinSection />
      <QualifiedLeadsSection />
      <CoinsBannerSection />
      <PartnershipsSection />
      <HowItWorksSection />
      <LatestBlogSection subtitle="Expert insights on international education and agent success." />
      <FaqSection />
      <CtaSection />
    </>
  );
}
