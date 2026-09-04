import type { Metadata } from "next";
import Link from "next/link";
import {
  FileText,
  Globe,
  Users,
  Copyright,
  MessageSquare,
  Lock,
  ShieldAlert,
  XCircle,
  Scale,
  RefreshCw,
  Megaphone,
  Gavel,
} from "lucide-react";
import { LegalHero } from "../components/legal/legal-hero";
import { LegalToc } from "../components/legal/legal-toc";
import { LegalSection } from "../components/legal/legal-section";
import { LegalContactCard } from "../components/legal/legal-contact-card";

export const metadata: Metadata = {
  title: "Terms of Service — Globaly",
};

const SECTIONS = [
  { id: "use-of-website", label: "Use of Website", icon: Globe },
  { id: "user-accounts", label: "User Accounts", icon: Users },
  { id: "content-ownership", label: "Content Ownership", icon: Copyright },
  { id: "user-generated-content", label: "User-Generated Content", icon: MessageSquare },
  { id: "privacy-policy", label: "Privacy Policy", icon: Lock },
  { id: "limitation-of-liability", label: "Limitation of Liability", icon: ShieldAlert },
  { id: "termination", label: "Termination", icon: XCircle },
  { id: "governing-law", label: "Governing Law", icon: Scale },
  { id: "changes", label: "Changes to the Terms", icon: RefreshCw },
  { id: "advertisements", label: "Advertisements", icon: Megaphone },
  { id: "dispute-resolution", label: "Dispute Resolution", icon: Gavel },
];

export default function TermsPage() {
  return (
    <div>
      <LegalHero
        icon={FileText}
        title="Terms and Conditions"
        description="The ground rules for using Globalyapp — plain, straightforward, and worth a read before you dive in."
        lastUpdated="20 February 2026"
      />

      <div className="container mx-auto grid max-w-5xl gap-12 px-4 py-16 lg:grid-cols-[200px_1fr]">
        <LegalToc items={SECTIONS.map(({ id, label }) => ({ id, label }))} />

        <div className="min-w-0">
          <p className="mb-6 text-muted-foreground">
            Thank you for visiting{" "}
            <a href="https://globalyapp.com" className="text-primary hover:underline">
              globalyapp.com
            </a>
            . These Terms and Conditions outline the rules and regulations for using our website
            (&quot;Globalyapp&quot;). By accessing or using the Website, you agree to be bound by these Terms.
          </p>

          <LegalSection id="use-of-website" icon={Globe} title="Use of Website">
            <p>
              <a href="https://globalyapp.com" className="text-primary hover:underline">
                globalyapp.com
              </a>{" "}
              provides a platform for students to search for courses, universities, educational services, and
              connect with education counselors and providers.
            </p>
            <p className="font-medium text-foreground">
              You may use the Website for lawful purposes only. You agree not to use the Website:
            </p>
            <ul>
              <li>To infringe on the intellectual property rights of others.</li>
              <li>To transmit any harmful, defamatory, obscene, or unlawful content.</li>
              <li>To disrupt the functionality of the Website.</li>
              <li>To impersonate any other person or entity.</li>
            </ul>
          </LegalSection>

          <LegalSection id="user-accounts" icon={Users} title="User Accounts">
            <p className="font-medium text-foreground">There are three types of user accounts on Globalyapp:</p>
            <ul>
              <li>
                <strong>Students:</strong> Students can create profiles to search for educational opportunities,
                connect with education counselors, and receive personalized recommendations.
              </li>
              <li>
                <strong>Education Counselors:</strong> Educational consultancies or service providers can register as education counselors to
                showcase their services and connect with students.
              </li>
              <li>
                <strong>Providers:</strong> Educational institutions like universities, colleges, and language
                schools can register to list their courses and programs.
              </li>
              <li>
                You are responsible for maintaining the confidentiality of your account login information and for
                all activity that occurs under your account.
              </li>
              <li>
                You agree to notify Globaly Inc. immediately of any unauthorized use of your account or any other
                security breach.
              </li>
            </ul>
          </LegalSection>

          <LegalSection id="content-ownership" icon={Copyright} title="Content Ownership">
            <ul>
              <li>Globaly Inc. owns the content on the Website, including information about countries, cities, courses, and providers.</li>
              <li>Education Counselors and Providers are responsible for the content they add to the Website, including descriptions of their services and programs.</li>
            </ul>
          </LegalSection>

          <LegalSection id="user-generated-content" icon={MessageSquare} title="User-Generated Content">
            <ul>
              <li>
                Students may create profiles and interact with other users. You are responsible for the content
                you post on the Website and agree to comply with these Terms.
              </li>
              <li>Globaly Inc. reserves the right to remove any content that violates these Terms or is deemed inappropriate.</li>
            </ul>
          </LegalSection>

          <LegalSection id="privacy-policy" icon={Lock} title="Privacy Policy">
            <p>
              Globaly Inc. respects your privacy. Please refer to our separate{" "}
              <Link href="/privacy" className="text-primary hover:underline">
                Privacy Policy
              </Link>{" "}
              for details on how we collect, store, and use your information. The Privacy Policy is incorporated by
              reference into these Terms.
            </p>
          </LegalSection>

          <LegalSection id="limitation-of-liability" icon={ShieldAlert} title="Limitation of Liability">
            <ul>
              <li>Globaly Inc. makes no warranties, express or implied, about the accuracy, completeness, or reliability of the content on the Website.</li>
              <li>We will not be liable for any damages arising from your use of the Website or the services offered by education counselors and providers.</li>
            </ul>
          </LegalSection>

          <LegalSection id="termination" icon={XCircle} title="Termination">
            <ul>
              <li>Globaly Inc. reserves the right to terminate your account at any time for any reason.</li>
              <li>You may terminate your account at any time by following the instructions on the Website.</li>
            </ul>
          </LegalSection>

          <LegalSection id="governing-law" icon={Scale} title="Governing Law">
            <p>
              These Terms will be governed by and construed in accordance with the laws of New South Wales,
              Australia.
            </p>
          </LegalSection>

          <LegalSection id="changes" icon={RefreshCw} title="Changes to the Terms">
            <ul>
              <li>Globaly Inc. reserves the right to update these Terms at any time. We will notify you of any changes by posting the revised Terms on the Website.</li>
              <li>Your continued use of the Website after the revised Terms are posted constitutes your agreement to the changes.</li>
            </ul>
          </LegalSection>

          <LegalSection id="advertisements" icon={Megaphone} title="Advertisements">
            <ul>
              <li>Globaly Inc. displays advertisements on the Website to help support our ongoing operations and provide a free service to users.</li>
              <li>These advertisements may be targeted to you based on your interests and search history.</li>
              <li>We work with reputable advertising partners to ensure the advertisements are relevant and safe.</li>
              <li>You acknowledge and agree that we are not responsible for the content or accuracy of any advertisements displayed on the Website.</li>
              <li>Your interactions with advertisers found on our platform are at your own risk.</li>
            </ul>
          </LegalSection>

          <LegalSection id="dispute-resolution" icon={Gavel} title="Dispute Resolution">
            <p className="font-medium text-foreground">
              We are committed to resolving disputes with our users promptly and fairly. Here are the steps to
              follow in case of a dispute:
            </p>
            <ul>
              <li>
                <strong>Informal Negotiation:</strong> We encourage you to first contact us directly to try to
                resolve the dispute informally.
              </li>
              <li>
                <strong>Mediation:</strong> If we cannot reach a resolution through informal negotiation, you may
                choose to resolve the dispute through mediation. Mediation is a confidential process where a
                neutral third party helps both parties reach a mutually agreeable solution. The cost of mediation
                will be shared equally by both parties.
              </li>
              <li>
                <strong>Arbitration:</strong> If mediation is unsuccessful, you may choose to resolve the dispute
                through binding arbitration. Arbitration is a final and binding proceeding before a neutral
                arbitrator. The arbitrator&apos;s decision will be final and binding on both parties. The
                arbitration will be conducted in accordance with the rules of the American Arbitration
                Association.
              </li>
            </ul>
            <p>
              You agree that any dispute arising out of or relating to your use of the Website will be settled by
              binding arbitration in accordance with this Section.
            </p>
          </LegalSection>

          <LegalContactCard description="If you have any questions about these Terms, we're happy to help." />
        </div>
      </div>
    </div>
  );
}
