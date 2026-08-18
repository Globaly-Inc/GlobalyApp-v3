"use client";

import { useState } from "react";
import type { Audience } from "./data";
import { PricingHero } from "./components/pricing-hero";
import { PricingStudentSection } from "./components/pricing-student-section";
import { PricingBusinessSection } from "./components/pricing-business-section";
import { PricingCreditsExplainer } from "./components/pricing-credits-explainer";
import { PricingCostComparison } from "./components/pricing-cost-comparison";
import { PricingComparisonTable } from "./components/pricing-comparison-table";
import { PricingFaq } from "./components/pricing-faq";
import { PricingCta } from "./components/pricing-cta";

export default function PricingPage() {
  const [audience, setAudience] = useState<Audience>("students");
  const [annual, setAnnual] = useState(false);

  return (
    <div>
      <PricingHero audience={audience} setAudience={setAudience} />

      <div id="content">
        {audience === "students" ? (
          <PricingStudentSection />
        ) : (
          <PricingBusinessSection annual={annual} setAnnual={setAnnual} />
        )}
      </div>

      {audience === "business" && (
        <>
          <PricingCreditsExplainer />
          <PricingCostComparison />
          <PricingComparisonTable />
        </>
      )}

      <PricingFaq audience={audience} />
      <PricingCta />
    </div>
  );
}
