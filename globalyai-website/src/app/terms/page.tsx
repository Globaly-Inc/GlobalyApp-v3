import type { Metadata } from "next";
import { LegalPage, LegalSection, sectionOf } from "@/components/v6/legal";
import { SiteShell } from "@/components/v6/shell";
import { CAL_BOOKING_URL, siteConfig } from "@/lib/site";

export const metadata: Metadata = {
  title: `Terms of Service | ${siteConfig.name}`,
  description: `The terms that govern use of the ${siteConfig.name} website and service.`,
  alternates: { canonical: `${siteConfig.url}/terms` },
};

const HEADINGS = [
  { id: "about", title: "About these Terms" },
  { id: "definitions", title: "Definitions" },
  { id: "website", title: "Using the website" },
  { id: "service", title: "The Service" },
  { id: "accounts", title: "Accounts and authorized users" },
  { id: "customer-content", title: "Your content" },
  { id: "ai-output", title: "AI-generated answers" },
  { id: "end-users", title: "Your visitors and students" },
  { id: "acceptable-use", title: "Acceptable use" },
  { id: "data-protection", title: "Data protection" },
  { id: "fees", title: "Fees and payment" },
  { id: "ip", title: "Intellectual property" },
  { id: "confidentiality", title: "Confidentiality" },
  { id: "third-parties", title: "Third-party services" },
  { id: "availability", title: "Availability, support and changes" },
  { id: "warranties", title: "Warranties and disclaimers" },
  { id: "liability", title: "Limitation of liability" },
  { id: "indemnities", title: "Indemnities" },
  { id: "term", title: "Term, suspension and termination" },
  { id: "disputes", title: "Governing law and disputes" },
  { id: "general", title: "General" },
  { id: "changes", title: "Changes to these Terms" },
] as const;

const s = (id: (typeof HEADINGS)[number]["id"]) => sectionOf(HEADINGS, id);

export default function TermsPage() {
  const { company, name, url, legalEmail, jurisdiction } = siteConfig;

  return (
    <SiteShell>
      <LegalPage
        title="Terms of Service"
        summary={`These terms govern your use of the ${name} website and, for institutions that subscribe, the ${name} service. Please read them before using either.`}
        headings={HEADINGS}
        current="/terms"
      >
        <LegalSection {...s("about")}>
          <p>
            {name} is a product of {company} (&ldquo;{company}&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo; or
            &ldquo;our&rdquo;). These Terms of Service (&ldquo;Terms&rdquo;) apply to anyone who visits{" "}
            <a href={url}>{url.replace("https://", "")}</a> and to any organization that uses the {name}{" "}
            service.
          </p>
          <p>
            By using the website or the Service you agree to these Terms. If you accept them on behalf of an
            institution or other organization, you confirm that you have authority to bind it, and
            &ldquo;you&rdquo; means that organization.
          </p>
          <p>
            Where you have signed an order form, master agreement or data processing addendum with us, that
            document governs if it conflicts with these Terms.
          </p>
        </LegalSection>

        <LegalSection {...s("definitions")}>
          <ul>
            <li>
              <strong>Service</strong> means the {name} assistant, its administration workspace, and any related
              setup, configuration and support we provide.
            </li>
            <li>
              <strong>Customer</strong> means the institution or organization that subscribes to the Service.
            </li>
            <li>
              <strong>Customer Content</strong> means the material a Customer provides or points the Service at,
              such as program pages, entry requirements, fees, policies, documents and FAQs.
            </li>
            <li>
              <strong>End User</strong> means a person who interacts with the assistant on a Customer&apos;s
              website, such as a prospective student or parent.
            </li>
            <li>
              <strong>Conversation Data</strong> means the messages, inquiries, contact details and transcripts
              generated when End Users use the assistant.
            </li>
            <li>
              <strong>Order Form</strong> means a signed order, proposal or agreement setting out the plan, fees
              and term of a Customer&apos;s subscription.
            </li>
          </ul>
        </LegalSection>

        <LegalSection {...s("website")}>
          <p>
            You may use the website to learn about {name} and to contact us or book a meeting. You agree not to:
          </p>
          <ul>
            <li>use the website for any unlawful purpose or in breach of these Terms;</li>
            <li>
              attempt to gain unauthorized access to the website, its servers or any connected system, or probe,
              scan or test their vulnerability without our written permission;
            </li>
            <li>
              interfere with the website&apos;s operation, including by overloading it or introducing malicious
              code;
            </li>
            <li>
              scrape, copy or republish the website&apos;s content for commercial purposes without our written
              permission; or
            </li>
            <li>misrepresent your identity or your affiliation with any person or organization.</li>
          </ul>
          <p>
            The product demonstrations on the website are illustrations. Programs, wording and branding shown in
            them are examples and do not describe any real institution.
          </p>
        </LegalSection>

        <LegalSection {...s("service")}>
          <p>
            Subject to these Terms and the Order Form, we grant the Customer a non-exclusive, non-transferable
            right during the subscription term to use the Service, and to embed the assistant on the websites and
            pages it chooses, for its own admissions, recruitment and student-engagement purposes.
          </p>
          <p>
            Pilots, trials and evaluation access are provided for evaluation only, for the period we agree, and
            may be ended by either party at any time unless the Order Form says otherwise.
          </p>
          <p>
            We will provide the Service with reasonable skill and care, and in accordance with the Order Form
            and our data processing commitments.
          </p>
        </LegalSection>

        <LegalSection {...s("accounts")}>
          <ul>
            <li>
              The Customer is responsible for the people it invites into its workspace (&ldquo;authorized
              users&rdquo;) and for everything done under their accounts.
            </li>
            <li>
              Keep login credentials confidential, and tell us promptly at{" "}
              <a href={`mailto:${legalEmail}`}>{legalEmail}</a> if you suspect unauthorized access.
            </li>
            <li>
              Account information must be accurate and kept up to date. Accounts are for named individuals and
              must not be shared.
            </li>
          </ul>
        </LegalSection>

        <LegalSection {...s("customer-content")}>
          <p>
            The Customer keeps all rights in its Customer Content. It grants us a limited licence to host, copy,
            process and display Customer Content only as needed to provide, secure and support the Service for
            that Customer.
          </p>
          <p>The Customer confirms that:</p>
          <ul>
            <li>it has the rights and permissions needed to provide Customer Content to us for this purpose;</li>
            <li>
              Customer Content is accurate and kept current, since the assistant answers from it; and
            </li>
            <li>
              Customer Content does not infringe anyone&apos;s rights or contain unlawful material.
            </li>
          </ul>
          <p>
            We do not use Customer Content or Conversation Data to train foundation models, and we do not sell it
            or use it for advertising.
          </p>
        </LegalSection>

        <LegalSection {...s("ai-output")}>
          <p>
            The assistant uses artificial intelligence to understand questions and compose answers from Customer
            Content. It is designed to answer only from the content it has been given, to say when it does not
            know, and to hand a question to a person when it falls outside that content. Even so:
          </p>
          <ul>
            <li>
              AI-generated answers can be incomplete or wrong, particularly where Customer Content is out of
              date, ambiguous or contradictory.
            </li>
            <li>
              The assistant does not assess applications or make admissions, scholarship, visa or financial
              decisions. Those remain with the Customer.
            </li>
            <li>
              The Customer is responsible for reviewing the assistant&apos;s configuration before it goes live,
              for the pages and content it is allowed to use, and for telling End Users that they are talking to
              an AI assistant.
            </li>
          </ul>
          <p>
            End Users should confirm anything important, such as fees, deadlines and entry requirements, with
            the institution directly.
          </p>
        </LegalSection>

        <LegalSection {...s("end-users")}>
          <p>
            The Customer controls how the assistant is presented on its website and is responsible for its
            relationship with its End Users, including:
          </p>
          <ul>
            <li>
              providing End Users with a privacy notice that describes the assistant and any contact details it
              collects;
            </li>
            <li>
              obtaining any consent the law requires, including consent wording carried by the assistant and any
              cookie consent on the Customer&apos;s own website; and
            </li>
            <li>
              meeting any additional obligations that apply to End Users under the age of 18, where the Customer
              engages with them.
            </li>
          </ul>
        </LegalSection>

        <LegalSection {...s("acceptable-use")}>
          <p>The Customer and its authorized users must not use the Service to:</p>
          <ul>
            <li>break any law, or infringe anyone&apos;s privacy, intellectual property or other rights;</li>
            <li>send spam or unsolicited marketing, or collect personal information without a lawful basis;</li>
            <li>
              generate or distribute content that is misleading, discriminatory, defamatory, harassing or
              otherwise harmful;
            </li>
            <li>
              attempt to reverse engineer, copy or resell the Service, or build a competing product using it;
            </li>
            <li>
              circumvent usage limits or security controls, or attempt to extract model instructions or other
              customers&apos; data; or
            </li>
            <li>
              make decisions with legal or similarly significant effects on a person based solely on the
              assistant&apos;s output.
            </li>
          </ul>
        </LegalSection>

        <LegalSection {...s("data-protection")}>
          <p>
            For Conversation Data and any personal information in Customer Content, the Customer is the
            controller and we act as its processor (or service provider). We process that information only on
            the Customer&apos;s documented instructions, as set out in the data processing addendum agreed before
            launch.
          </p>
          <p>
            For information about people who visit our website or contact us, we are the controller. Our{" "}
            <a href="/privacy">Privacy Policy</a> explains how we handle it, and our{" "}
            <a href="/cookies">Cookie Policy</a> explains what the website stores on your device.
          </p>
        </LegalSection>

        <LegalSection {...s("fees")}>
          <ul>
            <li>Fees, billing frequency and payment terms are set out in the Order Form.</li>
            <li>
              Unless the Order Form says otherwise, invoices are payable within 30 days, and fees are exclusive
              of GST, VAT and other taxes, which the Customer pays in addition.
            </li>
            <li>
              If an undisputed invoice is more than 30 days overdue, we may suspend the Service after giving at
              least 14 days&apos; written notice.
            </li>
            <li>Fees are non-refundable except where these Terms, the Order Form or the law says otherwise.</li>
          </ul>
        </LegalSection>

        <LegalSection {...s("ip")}>
          <p>
            We own the Service, the website and all related software, designs, documentation and know-how,
            including improvements to them. Nothing in these Terms transfers those rights to you.
          </p>
          <p>
            The Customer owns its Customer Content and its Conversation Data, and can export Conversation Data at
            any time during the subscription.
          </p>
          <p>
            If you send us feedback or suggestions, we may use them without restriction or obligation to you.
          </p>
        </LegalSection>

        <LegalSection {...s("confidentiality")}>
          <p>
            Each party will keep the other&apos;s confidential information confidential, use it only for the
            purposes of this relationship, and share it only with people who need to know it and are bound by
            similar obligations. This does not apply to information that is public, already known, independently
            developed, or that must be disclosed by law, in which case the disclosing party will give notice
            where lawful.
          </p>
        </LegalSection>

        <LegalSection {...s("third-parties")}>
          <p>
            The Service relies on third-party infrastructure, including cloud hosting and AI model providers,
            which we engage as sub-processors under written terms. The website also links to services we do not
            operate, such as our meeting scheduler at <a href={CAL_BOOKING_URL}>Cal.com</a>. Your use of a
            third-party service is governed by that provider&apos;s own terms and privacy policy.
          </p>
        </LegalSection>

        <LegalSection {...s("availability")}>
          <ul>
            <li>
              We aim to keep the Service available at all times, but it may be interrupted for maintenance,
              updates or events outside our control. Where we can, we give advance notice of planned maintenance.
            </li>
            <li>Support is provided by email, and any service levels are set out in the Order Form.</li>
            <li>
              We may improve and change the Service over time. We will not make a change that materially reduces
              its core functionality during a paid term without notice.
            </li>
          </ul>
        </LegalSection>

        <LegalSection {...s("warranties")}>
          <p>
            Each party warrants that it has the authority to enter into these Terms. Except as expressly set out
            in these Terms or the Order Form, the website and the Service are provided &ldquo;as is&rdquo; and
            &ldquo;as available&rdquo;, and to the extent permitted by law we exclude all other warranties,
            express or implied, including warranties of merchantability, fitness for a particular purpose and
            uninterrupted or error-free operation.
          </p>
          <p>
            <strong>Australian Consumer Law.</strong> Nothing in these Terms excludes, restricts or modifies any
            guarantee, right or remedy you have under the Australian Consumer Law or any other law that cannot
            lawfully be excluded. Where our liability for breach of such a guarantee can be limited, it is
            limited, at our option, to supplying the services again or paying the cost of having them supplied
            again.
          </p>
        </LegalSection>

        <LegalSection {...s("liability")}>
          <p>To the maximum extent permitted by law:</p>
          <ul>
            <li>
              neither party is liable for any indirect or consequential loss, or for loss of profit, revenue,
              enrolments, goodwill or data, however caused; and
            </li>
            <li>
              each party&apos;s total liability arising out of or in connection with the Service is limited to the
              fees paid or payable by the Customer in the 12 months before the event giving rise to the claim.
            </li>
          </ul>
          <p>
            These limits do not apply to a party&apos;s liability for breach of confidentiality, its indemnity
            obligations, the Customer&apos;s obligation to pay fees, or liability that cannot be limited by law,
            such as for fraud. For visitors who use only the website free of charge, our total liability is
            limited to AUD 100.
          </p>
        </LegalSection>

        <LegalSection {...s("indemnities")}>
          <ul>
            <li>
              We will defend the Customer against a third-party claim that the Service, as we provide it,
              infringes that party&apos;s intellectual property rights, and pay the resulting damages and costs
              finally awarded or agreed in settlement.
            </li>
            <li>
              The Customer will defend us against a third-party claim arising from Customer Content, or from its
              use of the Service in breach of these Terms or the law, and pay the resulting damages and costs
              finally awarded or agreed in settlement.
            </li>
            <li>
              The party seeking protection must notify the other promptly, give it control of the defence, and
              cooperate reasonably.
            </li>
          </ul>
        </LegalSection>

        <LegalSection {...s("term")}>
          <ul>
            <li>
              A subscription runs for the term in the Order Form and renews as the Order Form specifies.
            </li>
            <li>
              Either party may terminate if the other materially breaches these Terms and does not fix the breach
              within 30 days of written notice, or if the other becomes insolvent.
            </li>
            <li>
              We may suspend access immediately where it is reasonably necessary to prevent harm to the Service,
              other customers or End Users, or to comply with the law. We will tell you why and restore access
              once the issue is resolved.
            </li>
            <li>
              On termination, the Customer may export its Conversation Data for 30 days, after which we delete it
              from the Service in line with the data processing addendum, except where the law requires us to
              keep it.
            </li>
            <li>
              Sections that by their nature should survive termination, including confidentiality, liability,
              indemnities and disputes, continue to apply.
            </li>
          </ul>
        </LegalSection>

        <LegalSection {...s("disputes")}>
          <p>
            These Terms are governed by the laws of {jurisdiction}. If a dispute arises, the parties will first
            try to resolve it in good faith: either party may give written notice of the dispute, and senior
            representatives will meet within 30 days to try to settle it. If it is not settled within 60 days of
            that notice, either party may refer it to mediation before starting court proceedings.
          </p>
          <p>
            Subject to that process, each party submits to the non-exclusive jurisdiction of the courts of{" "}
            {jurisdiction}. Nothing in this section prevents a party from seeking urgent injunctive relief.
          </p>
        </LegalSection>

        <LegalSection {...s("general")}>
          <ul>
            <li>
              <strong>Entire agreement.</strong> These Terms, the Order Form and the data processing addendum
              are the whole agreement between the parties about the Service.
            </li>
            <li>
              <strong>Assignment.</strong> Neither party may assign its rights without the other&apos;s consent,
              except to a successor in a merger or sale of substantially all of its business.
            </li>
            <li>
              <strong>Force majeure.</strong> Neither party is liable for delay or failure caused by events beyond
              its reasonable control, other than an obligation to pay.
            </li>
            <li>
              <strong>Severability and waiver.</strong> If a provision is unenforceable, the rest continues in
              effect. A failure to enforce a right is not a waiver of it.
            </li>
            <li>
              <strong>Notices.</strong> Notices to us must be sent to{" "}
              <a href={`mailto:${legalEmail}`}>{legalEmail}</a>. Notices to a Customer go to the contact in its
              Order Form.
            </li>
            <li>
              <strong>Relationship.</strong> The parties are independent contractors. Nothing in these Terms
              creates a partnership, agency or employment relationship.
            </li>
          </ul>
        </LegalSection>

        <LegalSection {...s("changes")}>
          <p>
            We may update these Terms from time to time. We will post the new version here with a new
            &ldquo;last updated&rdquo; date, and give Customers at least 30 days&apos; notice of material changes.
            Changes do not apply to a paid term already in progress unless the Customer agrees. Continuing to use
            the website or the Service after changes take effect means you accept them.
          </p>
        </LegalSection>
      </LegalPage>
    </SiteShell>
  );
}
