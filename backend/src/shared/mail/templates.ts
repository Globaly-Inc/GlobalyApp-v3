// One card layout for every transactional mail, so OTP, invitations and booking notices read as one
// family. Table-based with inline styles only — Outlook and Gmail strip <style> blocks, flexbox and
// most modern CSS, so the "nicer" markup is the one that renders everywhere.
//
// The logo is served from the public web app (`frontend/public/globaly-icon.png`) because an email
// client can only load an asset over http(s); there is no bundling step for mail.

import { config } from "../../config.js";

const BRAND = {
  primary: "#811d1d", // --primary  hsl(0 63% 31%)
  gold: "#811d1d", // --gold     hsl(0 63% 31%)
  ink: "#111827",
  body: "#374151",
  muted: "#6b7280",
  faint: "#9ca3af",
  line: "#e5e7eb",
  page: "#f3f4f6",
} as const;

const FONT = `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif`;

const logoUrl = () => `https://storage.googleapis.com/globalyapp-public-images/logos/globalyapp-logo.jpeg`;

/**
 * Escape values that came from a user before they go into mail HTML. The recipient of an invitation
 * is not the person who typed the name on it, so an unescaped name is markup injection into someone
 * else's inbox.
 */
export function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

type LayoutOptions = {
  /** Card headline. Pre-escaped by the caller if it carries user text. */
  heading: string;
  /** Inner HTML — paragraphs, lists, or an OTP block. Trusted markup. */
  body: string;
  cta?: { label: string; href: string };
  /** Small print above the divider. */
  footnote?: string;
};

export function emailLayout({ heading, body, cta, footnote }: LayoutOptions): string {
  const button = cta
    ? `<tr><td align="center" style="padding-top:8px">
         <a href="${cta.href}" style="display:inline-block;background:${BRAND.primary};color:#ffffff;font-size:15px;font-weight:600;padding:12px 26px;border-radius:9999px;text-decoration:none">${cta.label}</a>
       </td></tr>`
    : "";

  const small = footnote
    ? `<tr><td align="center" style="padding-top:24px"><p style="margin:0;color:${BRAND.faint};font-size:13px;line-height:20px">${footnote}</p></td></tr>`
    : "";

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${heading}</title>
</head>
<body style="margin:0;padding:0;background-color:${BRAND.page};font-family:${FONT}">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background-color:${BRAND.page};padding:40px 20px">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="max-width:480px;background-color:#ffffff;border-radius:16px;overflow:hidden">
          <!-- Brand bar: the one flash of colour, and it survives clients that drop background
               images because it is a solid-colour cell. -->
          <tr><td style="height:4px;background-color:${BRAND.gold};line-height:4px;font-size:0">&nbsp;</td></tr>
          <tr>
            <td style="padding:36px 40px 40px">
              <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
                <tr>
                  <td align="center" style="padding-bottom:20px">
                    <img src="${logoUrl()}" alt="Globaly" width="56" height="56" style="display:block;border-radius:14px" />
                  </td>
                </tr>
                <tr>
                  <td align="center" style="padding-bottom:20px">
                    <h1 style="margin:0;color:${BRAND.ink};font-size:22px;line-height:30px;font-weight:700">${heading}</h1>
                  </td>
                </tr>
                <tr>
                  <td align="center" style="color:${BRAND.body};font-size:15px;line-height:23px">${body}</td>
                </tr>
                ${button}
                ${small}
                <tr>
                  <td align="center" style="border-top:1px solid ${BRAND.line};padding-top:20px;margin-top:8px">
                    <p style="margin:0;color:${BRAND.faint};font-size:12px;line-height:18px">
                      © ${new Date().getFullYear()} GlobalyHub — World #1 AI Integrated Education Ecosystem
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * A label/value block for mails that carry facts rather than prose. Left-aligned inside the
 * card, whose body cell is centred — a two-word value centred under a centred label reads as
 * a poster, not a record.
 *
 * Rows with no value are dropped rather than rendered empty: "Intake: —" is noise.
 */
function detailBlock(rows: { label: string; value: string | null | undefined }[]): string {
  const cells = rows
    .filter((r) => r.value)
    .map(
      (r, i) => `<tr><td style="padding:${i === 0 ? "14px" : "12px"} 18px 12px;${
        i === 0 ? "" : `border-top:1px solid ${BRAND.line};`
      }text-align:left">
        <p style="margin:0;color:${BRAND.muted};font-size:11px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase">${r.label}</p>
        <p style="margin:3px 0 0;color:${BRAND.ink};font-size:15px;line-height:22px;font-weight:600">${esc(r.value as string)}</p>
      </td></tr>`,
    )
    .join("");

  if (!cells) return "";
  return `<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="border:1px solid ${BRAND.line};border-radius:14px;background-color:#fafafa">${cells}</table>`;
}

/**
 * The lead notification a matched business gets the moment an enquiry is distributed to it.
 *
 * Carries no student contact detail by design — the whole point of the distribution is that
 * those details are behind the unlock, and an email is the easiest thing in the product to
 * forward on to someone who never paid for it.
 */
export function enquiryDistributedEmail(options: {
  courseName?: string | null;
  institutionName?: string | null;
  intake?: string | null;
  businessName?: string | null;
}): { subject: string; html: string; text: string } {
  const { courseName, institutionName, intake, businessName } = options;
  const href = `${config.APP_URL}/business/enquiries`;

  const textLines = [
    "You have received a new student enquiry.",
    "",
    courseName ? `Course: ${courseName}` : null,
    institutionName ? `Institution: ${institutionName}` : null,
    intake ? `Preferred intake: ${intake}` : null,
    "",
    "Unlock it in your inbox to see the student's details and reply.",
    "",
    `View enquiries → ${href}`,
  ].filter((l) => l !== null);

  return {
    subject: courseName ? `New student enquiry — ${courseName}` : "New student enquiry available",
    text: textLines.join("\n"),
    html: emailLayout({
      heading: "New student enquiry",
      body: `<p style="margin:0 0 18px">A student is asking about a course you represent.</p>
             ${detailBlock([
               { label: "Course", value: courseName },
               { label: "Institution", value: institutionName },
               { label: "Preferred intake", value: intake },
             ])}
             <p style="margin:18px 0 0;color:${BRAND.muted};font-size:14px;line-height:21px">
               Unlock the enquiry in your inbox to see the student's details and start the conversation.
             </p>`,
      cta: { label: "View enquiry", href },
      footnote: businessName
        ? `Sent to ${esc(businessName)} because it matches this enquiry.`
        : "You're receiving this because your business matches this enquiry.",
    }),
  };
}

/**
 * The fallback notice an institution gets when an enquiry about its own course matched no agent.
 *
 * Two audiences in one mail, split on whether the account has been claimed. A claimed institution
 * is sent to its inbox; an unclaimed one — promoted from an extraction, with an address on file and
 * nobody signed in — is asked to claim the account first, since it has no way in otherwise.
 *
 * Carries no student contact: the institution unlocks the lead in the portal like any other
 * recipient, and the mail must not be the way around that.
 */
export function enquiryInstitutionFallbackEmail(options: {
  institutionName?: string | null;
  courseName?: string | null;
  intake?: string | null;
  isClaimed: boolean;
  claimUrl?: string | null;
}): { subject: string; html: string; text: string } {
  const { institutionName, courseName, intake, isClaimed, claimUrl } = options;
  const portalUrl = `${config.APP_URL}/business/enquiries`;
  const cta = isClaimed
    ? { label: "View enquiry", href: portalUrl }
    : { label: "Claim your account", href: claimUrl || portalUrl };

  const ask = isClaimed
    ? "Unlock the enquiry in your inbox to see the student's details and start the conversation."
    : "Claim your institution account to read the enquiry and reply to the student directly.";

  return {
    subject: courseName
      ? `A student is asking about ${courseName}`
      : "A student is asking about one of your courses",
    text: [
      "A student has enquired about one of your courses, and no agent representing it was available.",
      "",
      courseName ? `Course: ${courseName}` : null,
      institutionName ? `Institution: ${institutionName}` : null,
      intake ? `Preferred intake: ${intake}` : null,
      "",
      ask,
      "",
      `${cta.label} → ${cta.href}`,
    ]
      .filter((l) => l !== null)
      .join("\n"),
    html: emailLayout({
      heading: "A student is asking about your course",
      body: `<p style="margin:0 0 18px">This enquiry came to you directly — no agent representing this course was available to take it.</p>
             ${detailBlock([
               { label: "Course", value: courseName },
               { label: "Institution", value: institutionName },
               { label: "Preferred intake", value: intake },
             ])}
             <p style="margin:18px 0 0;color:${BRAND.muted};font-size:14px;line-height:21px">${ask}</p>`,
      cta,
      footnote: isClaimed
        ? "You're receiving this because the enquiry is about a course listed under your institution."
        : "Your institution is listed on Globaly. Claiming the account is free and takes a minute.",
    }),
  };
}

/** The sign-in / verification code mail. Returns the subject too so both call sites stay in step. */
export function otpEmail(otp: string): { subject: string; html: string; text: string } {
  const digits = otp
    .split("")
    .map(
      (d) =>
        `<span style="display:inline-block;color:${BRAND.primary};font-size:30px;font-weight:700;font-family:'SFMono-Regular',Consolas,monospace;padding:0 6px">${d}</span>`,
    )
    .join("");

  return {
    subject: `Your Globaly sign-in code: ${otp}`,
    text: `Your Globaly sign-in code is ${otp}. It expires in 10 minutes. If you didn't request it, ignore this email.`,
    html: emailLayout({
      heading: "Sign in to Globaly",
      body: `<p style="margin:0 0 18px">Use this 6-digit code to sign in:</p>
             <div style="background-color:#fdf6ec;border:1px solid #f6e2bd;border-radius:14px;padding:18px 10px">${digits}</div>
             <p style="margin:18px 0 0;color:${BRAND.muted};font-size:14px">This code expires in <strong>10 minutes</strong>.</p>`,
      footnote: "If you didn't request this code, you can safely ignore this email.",
    }),
  };
}

const REGISTRANT_TYPE_LABELS: Record<string, string> = {
  student: "Student",
  institution: "Institution",
  service_provider: "Service Provider",
  other: "Other",
  newsletter: "Newsletter Subscriber",
};

// Keep in sync with the frontend's LAUNCH_MS (frontend/src/app/coming-soon/const/index.ts)
// — this is a marketing date, not something either side reads from the other at runtime.
const LAUNCH_DATE_LABEL = new Date("2026-09-01T00:00:00+10:00").toLocaleDateString("en-US", {
  month: "long",
  day: "numeric",
  year: "numeric",
  timeZone: "Australia/Sydney",
});

/** The "you're on the list" mail sent right after a new coming-soon waitlist sign-up. */
export function waitlistConfirmationEmail(
  name: string,
  registrantType: string,
): { subject: string; html: string; text: string } {
  const trimmedName = name.trim();
  const firstName = trimmedName ? esc(trimmedName.split(/\s+/)[0]) : "";
  const typeLabel = REGISTRANT_TYPE_LABELS[registrantType] ?? "Other";

  // When name is empty (newsletter signup), omit the personalized greeting
  const greeting = firstName
    ? `<p style="margin:0 0 12px">Thanks for registering your interest, ${firstName}.</p>`
    : "";

  return {
    subject: "You're on the Globaly waitlist ✨",
    text: trimmedName
      ? `You're on the list, ${trimmedName}. Thanks for registering your interest in Globaly's AI Education Discovery agents. We launch ${LAUNCH_DATE_LABEL} — we'll email you the moment it's ready to explore. Registered as: ${typeLabel}.`
      : `Thanks for subscribing to our newsletter. We launch ${LAUNCH_DATE_LABEL} — we'll email you the moment it's ready to explore.`,
    html: emailLayout({
      heading: "You're on the list",
      body: `${greeting}
             <p style="margin:0 0 12px">We're building something new to help you find the right courses,
             institutions and pathways — and we'll email you the moment it's ready to explore.</p>
             <p style="margin:0 0 12px;color:${BRAND.muted}">Launching <strong>${LAUNCH_DATE_LABEL}</strong>.</p>
             ${trimmedName ? `<p style="margin:0;color:${BRAND.muted}">Registered as: <strong>${esc(typeLabel)}</strong></p>` : ""}`,
      footnote: "You'll only hear from us about the launch.",
    }),
  };
}

/** The "claim your pre-seeded business account" mail, sent by an admin from the businesses list. */
export function claimBusinessEmail(options: {
  ownerName: string;
  businessName: string;
  claimUrl: string;
}): { subject: string; html: string; text: string } {
  const ownerName = esc(options.ownerName);
  const businessName = esc(options.businessName);

  return {
    subject: `Claim your ${options.businessName} account on GlobalyApp`,
    text: `Hi ${options.ownerName}, an account for ${options.businessName} has been created for you on GlobalyApp. Claim it here: ${options.claimUrl} (expires in 72 hours).`,
    html: emailLayout({
      heading: "Claim your business account",
      body: `<p style="margin:0 0 12px">Hi ${ownerName},</p>
             <p style="margin:0 0 12px">An account for <strong>${businessName}</strong> has been created for you on
             <strong>GlobalyApp</strong> — the platform connecting students with verified institutions, agents, and
             education services worldwide.</p>
             <p style="margin:0">If this is you, claim your account below to manage your listing, respond to student
             enquiries, and get discovered by prospective students.</p>`,
      cta: { label: "Claim your account", href: options.claimUrl },
      footnote: "This link expires in 72 hours. If you weren't expecting this, you can safely ignore this email.",
    }),
  };
}

/** The "here's your guide" mail, sent by guide-email.worker.ts with a 7-day signed GCS link. */
export function guideDeliveryEmail(options: {
  guideTitle: string;
  downloadUrl: string;
}): { subject: string; html: string; text: string } {
  const guideTitle = esc(options.guideTitle);

  return {
    subject: `Your guide: ${options.guideTitle}`,
    text: `Here's your guide — ${options.guideTitle}. Download it here (link expires in 7 days): ${options.downloadUrl}`,
    html: emailLayout({
      heading: "Your guide is ready",
      body: `<p style="margin:0 0 12px">Thanks for your interest in <strong>${guideTitle}</strong>.</p>
             <p style="margin:0">Download it below — the link stays active for 7 days.</p>`,
      cta: { label: "Download your guide", href: options.downloadUrl },
      footnote: "This link expires in 7 days. If you didn't request this guide, you can safely ignore this email.",
    }),
  };
}
