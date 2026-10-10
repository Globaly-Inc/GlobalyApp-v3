import type { Metadata } from "next";
import { LegalPage, LegalSection, sectionOf } from "@/components/v6/legal";
import { SiteShell } from "@/components/v6/shell";
import { STORAGE_KEYS, siteConfig } from "@/lib/site";

export const metadata: Metadata = {
  title: `Cookie Policy | ${siteConfig.name}`,
  description: `What the ${siteConfig.name} website stores on your device, why, and how to control it.`,
  alternates: { canonical: `${siteConfig.url}/cookies` },
};

const HEADINGS = [
  { id: "what", title: "What cookies are" },
  { id: "use", title: "What we store today" },
  { id: "not", title: "What we do not use" },
  { id: "third-parties", title: "Third parties" },
  { id: "assistant", title: "The assistant on institutions' websites" },
  { id: "choices", title: "Your choices" },
  { id: "changes", title: "Changes to this policy" },
] as const;

const s = (id: (typeof HEADINGS)[number]["id"]) => sectionOf(HEADINGS, id);

/**
 * Everything the site keeps on a visitor's device. This list has to match the
 * code: add an entry here in the same change that adds anything to storage,
 * and never add a non-essential one without gating it on hasAnalyticsConsent().
 */
const STORED = [
  {
    name: STORAGE_KEYS.theme,
    type: "Local storage",
    category: "Essential (preference)",
    purpose: "Remembers whether you chose light or dark mode, so the page opens the way you left it.",
    duration: "Until you clear it or switch modes",
  },
  {
    name: STORAGE_KEYS.cookieConsent,
    type: "Local storage",
    category: "Essential",
    purpose: "Records your answer to the cookie banner and when you gave it, so we do not ask on every visit.",
    duration: "12 months, then we ask again",
  },
] as const;

const BROWSER_LINKS = [
  { label: "Chrome", href: "https://support.google.com/chrome/answer/95647" },
  { label: "Safari", href: "https://support.apple.com/guide/safari/manage-cookies-sfri11471/mac" },
  { label: "Firefox", href: "https://support.mozilla.org/en-US/kb/clear-cookies-and-site-data-firefox" },
  {
    label: "Edge",
    href: "https://support.microsoft.com/en-us/microsoft-edge/delete-cookies-in-microsoft-edge-63947406-40ac-c3b8-57b9-2a946a29ae09",
  },
] as const;

export default function CookiesPage() {
  const { name, legalEmail } = siteConfig;

  return (
    <SiteShell>
      <LegalPage
        title="Cookie Policy"
        summary={`What the ${name} website stores on your device, why, and how you stay in control of it. The short version: only what the site needs to work, unless you say otherwise.`}
        headings={HEADINGS}
        current="/cookies"
      >
        <LegalSection {...s("what")}>
          <p>
            Cookies are small text files a website saves in your browser. Local storage is a similar browser
            feature that lets a site keep small pieces of information on your device between visits. This policy
            covers both, and we call them &ldquo;cookies&rdquo; for short.
          </p>
          <p>
            <strong>Essential</strong> cookies are needed for the site to work the way you asked, and do not
            require consent. <strong>Non-essential</strong> cookies, such as analytics or advertising, are only
            used with your consent.
          </p>
        </LegalSection>

        <LegalSection {...s("use")}>
          <p>The website currently sets no cookies. It keeps two small items in local storage:</p>
          <ul className="!mt-6 !list-none !space-y-4 !pl-0">
            {STORED.map((item) => (
              <li
                key={item.name}
                className="!pl-0 rounded-[var(--r-card)] border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-6"
              >
                <p className="!mt-0 break-all font-mono text-[13.5px] font-semibold !text-[var(--foreground)]">
                  {item.name}
                </p>
                <dl className="mt-4 grid gap-x-6 gap-y-3 text-[14.5px] sm:grid-cols-[8rem_minmax(0,1fr)]">
                  <dt className="font-semibold text-[var(--muted-foreground)]">Purpose</dt>
                  <dd className="text-[var(--body)]">{item.purpose}</dd>
                  <dt className="font-semibold text-[var(--muted-foreground)]">Category</dt>
                  <dd className="text-[var(--body)]">{item.category}</dd>
                  <dt className="font-semibold text-[var(--muted-foreground)]">Type</dt>
                  <dd className="text-[var(--body)]">{item.type}</dd>
                  <dt className="font-semibold text-[var(--muted-foreground)]">Kept for</dt>
                  <dd className="text-[var(--body)]">{item.duration}</dd>
                </dl>
              </li>
            ))}
          </ul>
          <p>
            Neither item identifies you, and neither is sent to us or anyone else. They stay in your browser.
          </p>
        </LegalSection>

        <LegalSection {...s("not")}>
          <p>The website does not currently use:</p>
          <ul>
            <li>analytics or measurement cookies;</li>
            <li>advertising, retargeting or social media tracking pixels; or</li>
            <li>session replay or fingerprinting tools.</li>
          </ul>
          <p>
            If we add analytics in future, it will load only after you choose &ldquo;Accept all&rdquo;, and we
            will list it on this page before it goes live.
          </p>
        </LegalSection>

        <LegalSection {...s("third-parties")}>
          <ul>
            <li>
              <strong>Meeting booking.</strong> &ldquo;Book a meeting&rdquo; takes you to Cal.com, our scheduling
              provider, in a new tab. Cal.com may set its own cookies there, under its own policies. Nothing from
              Cal.com loads on our site until you click.
            </li>
            <li>
              <strong>Fonts and media.</strong> Our fonts are served from our own domain, and our images and
              video from our own Google Cloud Storage bucket. Neither sets cookies.
            </li>
          </ul>
        </LegalSection>

        <LegalSection {...s("assistant")}>
          <p>
            When the {name} assistant runs on an institution&apos;s website, that website&apos;s own cookie
            banner and cookie policy apply, because the institution controls the site and decides what runs on
            it. Anything the assistant stores in the browser there is covered by that institution&apos;s cookie
            policy.
          </p>
        </LegalSection>

        <LegalSection {...s("choices")}>
          <ul>
            <li>
              <strong>The banner.</strong> On your first visit you can choose &ldquo;Essential only&rdquo; or
              &ldquo;Accept all&rdquo;. Both work equally well; essential storage applies either way.
            </li>
            <li>
              <strong>Changing your mind.</strong> Use &ldquo;Cookie preferences&rdquo; in the site footer at any
              time to reopen the banner and choose again.
            </li>
            <li>
              <strong>Your browser.</strong> You can block or delete cookies and site data in your browser
              settings. If you clear local storage, the site will forget your theme and ask about cookies again.
            </li>
          </ul>
          <p>Browser guides:</p>
          <ul className="!mt-3 !flex !list-none !flex-wrap !gap-2 !space-y-0 !pl-0">
            {BROWSER_LINKS.map((link) => (
              <li key={link.label} className="!pl-0">
                <a
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex rounded-full border border-[var(--border-strong)] px-3.5 py-1.5 text-[13.5px] !no-underline"
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </LegalSection>

        <LegalSection {...s("changes")}>
          <p>
            We will update this page whenever what the website stores changes, and change the &ldquo;last
            updated&rdquo; date above. Questions can be sent to{" "}
            <a href={`mailto:${legalEmail}`}>{legalEmail}</a>, and our <a href="/privacy">Privacy Policy</a>{" "}
            explains how we handle personal information more broadly.
          </p>
        </LegalSection>
      </LegalPage>
    </SiteShell>
  );
}
