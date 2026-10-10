import type { Metadata } from "next";
import { LegalPage, LegalSection, sectionOf } from "@/components/v6/legal";
import { SiteShell } from "@/components/v6/shell";
import { siteConfig } from "@/lib/site";

export const metadata: Metadata = {
  title: `Privacy Policy | ${siteConfig.name}`,
  description: `How ${siteConfig.company} collects, uses and protects personal information for ${siteConfig.name}.`,
  alternates: { canonical: `${siteConfig.url}/privacy` },
};

const HEADINGS = [
  { id: "scope", title: "Who we are and what this covers" },
  { id: "roles", title: "Our two roles" },
  { id: "collect", title: "Information we collect" },
  { id: "use", title: "How we use it, and why" },
  { id: "assistant", title: "Conversations with an institution's assistant" },
  { id: "ai", title: "AI and automated processing" },
  { id: "sharing", title: "Who we share it with" },
  { id: "transfers", title: "International transfers" },
  { id: "retention", title: "How long we keep it" },
  { id: "security", title: "How we protect it" },
  { id: "rights", title: "Your rights" },
  { id: "regional", title: "Region-specific information" },
  { id: "children", title: "Children and young people" },
  { id: "changes", title: "Changes to this policy" },
] as const;

const s = (id: (typeof HEADINGS)[number]["id"]) => sectionOf(HEADINGS, id);

export default function PrivacyPage() {
  const { company, name, legalEmail } = siteConfig;
  const mail = <a href={`mailto:${legalEmail}`}>{legalEmail}</a>;

  return (
    <SiteShell>
      <LegalPage
        title="Privacy Policy"
        summary={`How ${company} collects, uses, shares and protects personal information when you visit the ${name} website, talk to us, or use an institution's ${name} assistant.`}
        headings={HEADINGS}
        current="/privacy"
      >
        <LegalSection {...s("scope")}>
          <p>
            {name} is a product of {company} (&ldquo;we&rdquo;, &ldquo;us&rdquo; or &ldquo;our&rdquo;). This
            policy explains how we handle personal information about:
          </p>
          <ul>
            <li>people who visit our website;</li>
            <li>people who contact us, book a meeting, or evaluate {name} on behalf of an institution;</li>
            <li>the authorized users of our customers&apos; workspaces; and</li>
            <li>
              prospective students, parents and others who talk to the {name} assistant on an institution&apos;s
              website, to the extent described in <a href="#assistant">section 5</a>.
            </li>
          </ul>
          <p>
            Questions and requests about this policy can be sent to {mail}.
          </p>
        </LegalSection>

        <LegalSection {...s("roles")}>
          <p>
            <strong>As a controller.</strong> For our website, our sales and support conversations, and our
            customers&apos; account details, we decide how and why personal information is used. This policy is
            our notice to you for that information.
          </p>
          <p>
            <strong>As a processor.</strong> When an institution puts the {name} assistant on its website, the
            institution decides what the assistant is for and what happens to the conversations. The institution
            is the controller of that information and we process it on its behalf, under a data processing
            addendum. The institution&apos;s own privacy notice is the main notice for those conversations.
          </p>
        </LegalSection>

        <LegalSection {...s("collect")}>
          <h3>Information you give us</h3>
          <ul>
            <li>
              <strong>Contact and meeting details:</strong> your name, email address, institution, role, and
              anything you tell us when you email us or book a meeting.
            </li>
            <li>
              <strong>Customer account details:</strong> the names, work email addresses and roles of the people
              an institution invites to its workspace, and billing contacts.
            </li>
            <li>
              <strong>Communications:</strong> the content of emails, meeting notes and support requests.
            </li>
          </ul>

          <h3>Information collected automatically</h3>
          <ul>
            <li>
              <strong>Technical logs:</strong> when you load the website, our hosting infrastructure records
              standard request information such as IP address, browser and device type, the page requested, the
              referring page and the time. We use these logs to run, secure and troubleshoot the site.
            </li>
            <li>
              <strong>Stored on your device:</strong> the website remembers your light or dark mode choice and
              your cookie choice in your browser&apos;s local storage. It does not currently set analytics or
              advertising cookies. See our <a href="/cookies">Cookie Policy</a>.
            </li>
          </ul>

          <h3>Information from others</h3>
          <ul>
            <li>
              <strong>Scheduling:</strong> when you book a meeting, our scheduling provider passes us the details
              you entered in the booking form.
            </li>
            <li>
              <strong>Your colleagues:</strong> an institution may give us your work contact details so that you
              can be invited to its workspace.
            </li>
          </ul>
        </LegalSection>

        <LegalSection {...s("use")}>
          <p>We use personal information for the purposes below, relying on the legal basis shown:</p>
          <ul>
            <li>
              <strong>Responding to you and arranging meetings</strong>, and providing a demonstration or pilot:
              to take steps at your request before entering a contract, and our legitimate interest in replying
              to people who contact us.
            </li>
            <li>
              <strong>Providing, supporting and billing for the Service</strong>: to perform our contract with
              the institution.
            </li>
            <li>
              <strong>Running and securing the website and the Service</strong>, including detecting abuse and
              fixing faults: our legitimate interest in keeping them working and safe.
            </li>
            <li>
              <strong>Measuring how the website is used</strong>, if we introduce this: only with your consent,
              given through the cookie banner.
            </li>
            <li>
              <strong>Sending product updates to customer contacts</strong>: our legitimate interest, with an
              unsubscribe option in every message. We do not send marketing to anyone who has opted out.
            </li>
            <li>
              <strong>Meeting legal obligations</strong>, such as tax records, and establishing or defending legal
              claims.
            </li>
          </ul>
          <p>We do not sell personal information, and we do not use it for targeted advertising.</p>
        </LegalSection>

        <LegalSection {...s("assistant")}>
          <p>
            When you talk to the {name} assistant on an institution&apos;s website, the conversation and any
            details you share, such as your name, email address, country, intended program or study history,
            are processed on behalf of that institution. In particular:
          </p>
          <ul>
            <li>
              The institution owns the conversation. It receives a summary of your inquiry so its admissions team
              can follow up, and it can export the transcript.
            </li>
            <li>
              The institution sets how long conversations are kept. We delete them when it asks us to, or when
              its subscription ends, as set out in our agreement with it.
            </li>
            <li>
              We do not use conversations to train foundation models, and we do not sell them or use them for
              advertising.
            </li>
            <li>
              Each institution&apos;s assistant and data are kept in a separate workspace, and one institution
              cannot see another&apos;s conversations.
            </li>
          </ul>
          <p>
            To access, correct or delete what you shared in a conversation, contact the institution. If you
            contact us instead, we will pass your request to the institution and help it respond.
          </p>
        </LegalSection>

        <LegalSection {...s("ai")}>
          <p>
            The assistant uses AI models to understand questions and compose answers from the content the
            institution has approved. It may ask follow-up questions to work out which programs fit what you
            have told it, and it may mark an inquiry as a likely match for the institution&apos;s criteria so
            that its team can prioritize follow-up.
          </p>
          <p>
            The assistant does not make admissions, scholarship, visa or other decisions with legal or similarly
            significant effects on you. Those decisions stay with people at the institution.
          </p>
        </LegalSection>

        <LegalSection {...s("sharing")}>
          <p>We share personal information only with:</p>
          <ul>
            <li>
              <strong>Service providers</strong> who help us operate, under contracts that limit their use of it
              to providing services to us: cloud hosting and storage (such as Google Cloud), email, meeting
              scheduling (Cal.com), and AI model providers, which process conversation content to generate
              answers and are not permitted to train their models on it.
            </li>
            <li>
              <strong>The institution concerned</strong>, for conversations with its assistant and for the
              details of its own workspace users.
            </li>
            <li>
              <strong>Professional advisers</strong>, such as lawyers, accountants and auditors, under a duty of
              confidentiality.
            </li>
            <li>
              <strong>Authorities</strong>, where the law requires it, or where it is necessary to protect
              someone&apos;s safety, prevent fraud, or establish or defend legal claims.
            </li>
            <li>
              <strong>A successor business</strong>, if {company} is involved in a merger, acquisition or sale of
              assets, in which case this policy will continue to apply to your information.
            </li>
          </ul>
        </LegalSection>

        <LegalSection {...s("transfers")}>
          <p>
            We and our service providers operate in several countries, so your information may be processed
            outside the country where you live, including in Australia and the United States. Where information
            from the European Economic Area, the United Kingdom or Switzerland is transferred to a country
            without an adequacy decision, we rely on appropriate safeguards such as the European
            Commission&apos;s Standard Contractual Clauses and the UK addendum to them. For Australian personal
            information, we take reasonable steps to ensure overseas recipients handle it consistently with the
            Australian Privacy Principles.
          </p>
        </LegalSection>

        <LegalSection {...s("retention")}>
          <ul>
            <li>
              <strong>Enquiries and meeting details</strong> are kept for as long as we are in discussion with
              you, and then for up to two years unless you ask us to delete them sooner.
            </li>
            <li>
              <strong>Customer account and billing records</strong> are kept for the life of the subscription,
              and billing records for as long as tax and accounting law requires, generally seven years.
            </li>
            <li>
              <strong>Technical logs</strong> are kept only as long as needed to secure and troubleshoot the
              website and the Service.
            </li>
            <li>
              <strong>Assistant conversations</strong> are kept for the period the institution sets, as described
              in <a href="#assistant">section 5</a>.
            </li>
          </ul>
          <p>When information is no longer needed, we delete it or make it anonymous.</p>
        </LegalSection>

        <LegalSection {...s("security")}>
          <p>
            We protect personal information with measures appropriate to its sensitivity, including encryption in
            transit, access limited to people who need it, separation of each institution&apos;s workspace, and
            monitoring for misuse. No system is completely secure, so we cannot guarantee that information will
            never be accessed without authorization. If a breach affects your information and is likely to cause
            you serious harm, we will tell you and the relevant regulator as the law requires, and, where we act
            as a processor, tell the institution without undue delay.
          </p>
        </LegalSection>

        <LegalSection {...s("rights")}>
          <p>Depending on where you live, you may have the right to:</p>
          <ul>
            <li>ask for a copy of the personal information we hold about you;</li>
            <li>ask us to correct information that is inaccurate or incomplete;</li>
            <li>ask us to delete your information;</li>
            <li>object to, or ask us to restrict, how we use it;</li>
            <li>receive your information in a portable format; and</li>
            <li>withdraw consent at any time, where we rely on it, without affecting earlier processing.</li>
          </ul>
          <p>
            To make a request, email {mail}. We may need to verify your identity before acting on it, and we will
            respond within the time the law allows, usually one month. We will not treat you differently for
            exercising your rights. You can change your cookie choice at any time through
            &ldquo;Cookie preferences&rdquo; in the site footer.
          </p>
        </LegalSection>

        <LegalSection {...s("regional")}>
          <h3>Australia</h3>
          <p>
            We handle personal information in line with the Privacy Act 1988 (Cth) and the Australian Privacy
            Principles. If you are not satisfied with our response to a complaint, you can contact the Office of
            the Australian Information Commissioner at{" "}
            <a href="https://www.oaic.gov.au" target="_blank" rel="noopener noreferrer">
              oaic.gov.au
            </a>
            .
          </p>

          <h3>European Economic Area, United Kingdom and Switzerland</h3>
          <p>
            The legal bases for our processing are set out in <a href="#use">section 4</a>. You have the right to
            complain to the data protection authority where you live or work, although we would appreciate the
            chance to address your concern first.
          </p>

          <h3>California and other US states</h3>
          <p>
            In the past 12 months we have collected the categories of information described in{" "}
            <a href="#collect">section 3</a> (identifiers, professional information, and internet activity) for
            the purposes in <a href="#use">section 4</a>. We do not sell or share personal information for
            cross-context behavioral advertising, and we do not use sensitive personal information to infer
            characteristics about you. You may use an authorized agent to make a request on your behalf.
          </p>
        </LegalSection>

        <LegalSection {...s("children")}>
          <p>
            Our website is intended for institutions and the professionals who work with them, and is not
            directed at children. Prospective students under 18 may use an institution&apos;s assistant; in that
            case the institution, as controller, is responsible for meeting the requirements that apply to young
            people, including any parental consent. If you believe a child has given us personal information
            directly, contact {mail} and we will delete it.
          </p>
        </LegalSection>

        <LegalSection {...s("changes")}>
          <p>
            We may update this policy as the website, the Service or the law changes. We will post the new
            version here with a new &ldquo;last updated&rdquo; date, and where a change is significant we will
            give customers notice by email before it takes effect.
          </p>
        </LegalSection>
      </LegalPage>
    </SiteShell>
  );
}
