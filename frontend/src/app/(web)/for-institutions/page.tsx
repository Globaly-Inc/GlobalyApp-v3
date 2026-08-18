"use client";

import { HeroSection } from "./components/hero-section";
import { StatsBar } from "./components/stats-bar";
import { WhyJoinSection } from "./components/why-join-section";
import { OwnDataSection } from "./components/own-data-section";
import { FreeListingCta } from "./components/free-listing-cta";
import { AgentNetworkSection } from "./components/agent-network-section";
import { HowItWorksSection } from "./components/how-it-works-section";
import { BlogSection } from "./components/blog-section";
import { FaqSection } from "./components/faq-section";
import { FooterCta } from "./components/footer-cta";

export default function ForInstitutionsPage() {
  return (
    <>
      <HeroSection />
      <StatsBar />
      <WhyJoinSection />
      <OwnDataSection />
      <FreeListingCta />
      <AgentNetworkSection />
      <HowItWorksSection />
      <BlogSection />
      <FaqSection />
      <FooterCta />
    </>
  );
}
