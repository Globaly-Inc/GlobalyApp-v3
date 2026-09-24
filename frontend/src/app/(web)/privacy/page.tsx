import type { Metadata } from "next";
import { Baby, Clock, Database, Globe2, RefreshCw, Settings2, Shield, ShieldCheck, SlidersHorizontal } from "lucide-react";
import { LegalHero } from "../components/legal/legal-hero";
import { LegalToc } from "../components/legal/legal-toc";
import { LegalSection } from "../components/legal/legal-section";
import { LegalContactCard } from "../components/legal/legal-contact-card";

export const metadata: Metadata = {
  title: "Privacy Policy — Globaly",
};

const SECTIONS = [
  { id: "information-we-collect", label: "Information We Collect", icon: Database },
  { id: "use-of-information", label: "Use of Information", icon: Settings2 },
  { id: "your-choices", label: "Your Choices", icon: SlidersHorizontal },
  { id: "data-retention", label: "Data Retention", icon: Clock },
  { id: "security", label: "Security", icon: ShieldCheck },
  { id: "childrens-privacy", label: "Children's Privacy", icon: Baby },
  { id: "international-transfers", label: "International Transfers", icon: Globe2 },
  { id: "changes", label: "Changes to this Policy", icon: RefreshCw },
];

export default function PrivacyPolicyPage() {
  return (
    <div>
      <LegalHero
        icon={Shield}
        title="Privacy Policy"
        description="Your trust matters to us. Here's exactly how we collect, use, and protect your information across Globaly."
        lastUpdated="20 February 2026"
      />

      <div className="container mx-auto grid max-w-5xl gap-12 px-4 py-16 lg:grid-cols-[200px_1fr]">
        <LegalToc items={SECTIONS.map(({ id, label }) => ({ id, label }))} />

        <div className="min-w-0">
          <LegalSection id="information-we-collect" icon={Database} title="Information We Collect">
            <p>We collect several types of information when you use our Website:</p>
            <ul>
              <li>
                <strong>Information you provide:</strong> When you create an account, you may provide information
                such as your name, email address, phone number, educational background, and interests.
              </li>
              <li>Students may choose to create a public profile with additional information.</li>
              <li>Education Counselors and Providers may provide information about their services and programs.</li>
              <li>
                <strong>Information collected automatically:</strong> We collect information about your use of the
                Website, such as the pages you visit, the searches you perform, and the links you click.
              </li>
              <li>We may also collect information about your device, such as your IP address, browser type, and operating system.</li>
              <li>
                <strong>Cookies and other tracking technologies:</strong> We use cookies and other tracking
                technologies to collect information about your activity on the Website. Cookies are small data
                files stored on your device that help us remember your preferences, understand how you use the
                Website, and improve your experience.
              </li>
            </ul>
          </LegalSection>

          <LegalSection id="use-of-information" icon={Settings2} title="Use of Information">
            <p>We use the information we collect for the following purposes:</p>
            <ul>
              <li>To operate and maintain the Website.</li>
              <li>To provide you with personalized recommendations and search results.</li>
              <li>To connect you with education counselors and providers that may be able to assist you.</li>
              <li>To send you marketing communications (with your consent).</li>
              <li>To analyze how you use the Website.</li>
              <li>To improve the Website.</li>
              <li>To comply with the law.</li>
            </ul>
          </LegalSection>

          <LegalSection id="your-choices" icon={SlidersHorizontal} title="Your Choices">
            <p>You have choices about how we collect, use and share your information:</p>
            <ul>
              <li>
                <strong>Cookies:</strong> You can adjust your browser settings to control how cookies are accepted
                or rejected.
              </li>
              <li>
                <strong>Marketing Communications:</strong> You can opt out of receiving marketing communications
                from us by following the unsubscribe instructions in those communications.
              </li>
              <li>
                <strong>Account Information:</strong> You can access and update your account information at any
                time by logging in to your account.
              </li>
            </ul>
          </LegalSection>

          <LegalSection id="data-retention" icon={Clock} title="Data Retention">
            <p>
              We will retain your information for as long as your account is active or as needed to provide you
              with services. We will also retain your information as necessary to comply with our legal
              obligations, resolve disputes, and enforce our agreements.
            </p>
          </LegalSection>

          <LegalSection id="security" icon={ShieldCheck} title="Security">
            <p>
              We take reasonable steps to protect your information from unauthorized access, disclosure,
              alteration, or destruction. However, no website or internet transmission is completely secure.
            </p>
          </LegalSection>

          <LegalSection id="childrens-privacy" icon={Baby} title="Children's Privacy">
            <p>
              Our Website is not directed to children under the age of 13. We do not knowingly collect personal
              information from children under 13. If you are a parent or guardian and you believe that your child
              has provided us with personal information, please contact us.
            </p>
          </LegalSection>

          <LegalSection id="international-transfers" icon={Globe2} title="International Transfers">
            <p>
              Your information may be transferred to and processed in countries other than your own. These
              countries may have different data protection laws than your own country.
            </p>
          </LegalSection>

          <LegalSection id="changes" icon={RefreshCw} title="Changes to this Privacy Policy">
            <p>
              We may update this Privacy Policy from time to time. We will notify you of any changes by posting the
              revised Privacy Policy on the Website.
            </p>
          </LegalSection>

          <LegalContactCard description="If you have any questions about this Privacy Policy, we're happy to help." />
        </div>
      </div>
    </div>
  );
}
