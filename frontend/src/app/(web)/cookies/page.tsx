import type { Metadata } from "next";
import { Cookie, Layers, Settings2 } from "lucide-react";
import { LegalHero } from "../components/legal/legal-hero";
import { LegalToc } from "../components/legal/legal-toc";
import { LegalSection } from "../components/legal/legal-section";
import { LegalContactCard } from "../components/legal/legal-contact-card";

export const metadata: Metadata = {
  title: "Cookie Policy — Globaly",
};

const BROWSER_LINKS = [
  { label: "Chrome", href: "https://support.google.com/accounts/answer/61416?hl=en&co=GENIE.Platform%3DDesktop" },
  { label: "Firefox", href: "https://support.mozilla.org/en-US/kb/websites-say-cookies-are-blocked-unblock-them" },
  { label: "Safari", href: "https://www.apple.com/legal/privacy/en-ww/cookies/" },
  {
    label: "Edge",
    href: "https://support.microsoft.com/en-au/topic/adjust-privacy-settings-in-microsoft-edge-600ee799-081c-4ab7-b6c2-d8a9baeda3c4",
  },
];

const SECTIONS = [
  { id: "how-we-use-cookies", label: "How We Use Cookies", icon: Cookie },
  { id: "types-of-cookies", label: "Types of Cookies", icon: Layers },
  { id: "managing-cookies", label: "Managing Cookies", icon: Settings2 },
];

export default function CookiePolicyPage() {
  return (
    <div>
      <LegalHero
        icon={Cookie}
        title="Cookie Policy"
        description="A quick, honest breakdown of the cookies we use, why we use them, and how you stay in control."
        lastUpdated="20 February 2026"
      />

      <div className="container mx-auto grid max-w-5xl gap-12 px-4 py-16 lg:grid-cols-[200px_1fr]">
        <LegalToc items={SECTIONS.map(({ id, label }) => ({ id, label }))} />

        <div className="min-w-0">
          <LegalSection id="how-we-use-cookies" icon={Cookie} title="How We Use Cookies">
            <p>
              We use cookies and other tracking technologies to collect information about your activity on the
              Website. Cookies are small data files that are stored on your device when you visit a website. They
              help us to:
            </p>
            <ul>
              <li>Remember your preferences, such as your language or region.</li>
              <li>Understand how you use the Website, so we can improve your experience.</li>
              <li>Personalize the content and advertisements you see on the Website.</li>
              <li>Analyze the effectiveness of our marketing campaigns.</li>
            </ul>
          </LegalSection>

          <LegalSection id="types-of-cookies" icon={Layers} title="Types of Cookies We Use">
            <p>
              The specific types of cookies we use and the purposes for which we use them may vary over time.
              However, we generally use the following categories of cookies:
            </p>
            <ul>
              <li>
                <strong>Session Cookies:</strong> These cookies are temporary and are deleted from your device when
                you close your browser.
              </li>
              <li>
                <strong>Persistent Cookies:</strong> These cookies remain on your device for a longer period of
                time (the length of time will vary depending on the cookie).
              </li>
              <li>
                <strong>Third-Party Cookies:</strong> These cookies are placed on your device by third-party
                service providers that we use to provide certain functionalities on the Website, such as analytics
                or advertising.
              </li>
            </ul>
          </LegalSection>

          <LegalSection id="managing-cookies" icon={Settings2} title="Managing Cookies">
            <p>
              You can control how cookies are used on your device by adjusting your browser settings. Most browsers
              allow you to block cookies altogether, only accept cookies from certain websites, or delete cookies
              when you close your browser. Here are links to popular browsers and their cookie settings
              information:
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              {BROWSER_LINKS.map(({ label, href }) => (
                <a
                  key={label}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-full bg-primary/10 px-3 py-1 text-sm font-medium text-primary transition-colors hover:bg-primary/20"
                >
                  {label}
                </a>
              ))}
            </div>
          </LegalSection>

          <LegalContactCard description="If you have any questions about our Cookie Policy, we're happy to help." />
        </div>
      </div>
    </div>
  );
}
