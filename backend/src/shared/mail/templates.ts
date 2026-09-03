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
 * Where the RECIPIENT's browser goes. Not `config.APP_URL` — that is this API's own origin,
 * and a link to it lands on the API, not the app. Every other module already reads
 * WEB_APP_URL; the enquiry mails were the ones that didn't.
 */
const web = (path: string) => `${config.WEB_APP_URL.replace(/\/$/, "")}${path}`;

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
  /**
   * "wide" (600px) for mails carrying a list; the default 480px suits a short notice but
   * squeezes a stack of cards into a column too narrow to scan.
   *
   * 600px is the width every major client has handled for twenty years — going past it starts
   * to clip in Outlook's reading pane, so this is a deliberate two-step, not a free dial.
   */
  size?: "default" | "wide";
  /**
   * Body alignment. Centred reads well for one short paragraph and an OTP code; a list of
   * cards must be left-aligned or every row's text floats away from its own left edge.
   */
  align?: "center" | "left";
};

export function emailLayout({ heading, body, cta, footnote, size = "default", align = "center" }: LayoutOptions): string {
  const wide = size === "wide";
  const maxWidth = wide ? 600 : 480;
  // Narrower side padding on the wide layout: it already has the room, and on a 375px phone
  // 40px gutters plus the page's own 20px leave the content squeezed into ~315px.
  const pad = wide ? "32px 28px 36px" : "36px 40px 40px";
  const button = cta
    ? `<tr><td align="center" style="padding-top:${wide ? "28px" : "8px"}">
         <a href="${cta.href}" style="display:inline-block;background:${BRAND.primary};color:#ffffff;font-size:15px;font-weight:600;padding:13px 30px;border-radius:9999px;text-decoration:none">${cta.label}</a>
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
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="width:100%;max-width:${maxWidth}px;background-color:#ffffff;border-radius:16px;overflow:hidden">
          <!-- Brand bar: the one flash of colour, and it survives clients that drop background
               images because it is a solid-colour cell. -->
          <tr><td style="height:4px;background-color:${BRAND.gold};line-height:4px;font-size:0">&nbsp;</td></tr>
          <tr>
            <td style="padding:${pad}">
              <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
                <tr>
                  <td align="center" style="padding-bottom:20px">
                    <img src="${logoUrl()}" alt="Globaly" width="56" height="56" style="display:block;border-radius:14px" />
                  </td>
                </tr>
                <tr>
                  <td align="center" style="padding-bottom:${wide ? "10px" : "20px"}">
                    <h1 style="margin:0;color:${BRAND.ink};font-size:${wide ? "24px" : "22px"};line-height:32px;font-weight:700">${heading}</h1>
                  </td>
                </tr>
                <tr>
                  <td align="${align}" style="color:${BRAND.body};font-size:15px;line-height:23px">${body}</td>
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

export interface DigestItem {
  /** Pre-unlock only. The surname, email and phone are what the unlock is charged for. */
  studentFirstName?: string | null;
  courseName?: string | null;
  institutionName?: string | null;
  intake?: string | null;
}

/** How many enquiries a summary actually lists; the rest are counted, not printed. */
const DIGEST_PREVIEW = 5;

const REDACT_BG = "#d7dbe0";
/** Rough rendered width of one &nbsp; at the 12px these bars use — the unit the bars are built from. */
const NBSP_PX = 2.6;

/**
 * A redaction bar, matching the `<Redacted />` placeholder on the inbox card (`w-20` for a
 * surname, `w-28` for an address).
 *
 * Width is carried by non-breaking spaces rather than a CSS width: Outlook's Word engine
 * ignores width on an inline span, and a bar that collapses in one client is worse than one
 * that is a few pixels off everywhere. The text colour is set to the background so the spaces
 * stay invisible even where the background paints and the radius does not. Nothing here
 * derives from real data — there is no hidden value to reveal.
 */
const redacted = (px: number) =>
  `<span style="border-radius:3px;background-color:${REDACT_BG};color:${REDACT_BG};font-size:12px">${"&nbsp;".repeat(
    Math.round(px / NBSP_PX),
  )}</span>`;

/**
 * How wide one student's bar should be.
 *
 * Constant-width bars down a list read as a template placeholder rather than as withheld
 * information — real surnames and addresses are not all the same length. Seeded off the first
 * name so a given student's bar is stable across mails, and so the two bars on one card do not
 * come out identical.
 */
function redactionWidth(seed: string | null | undefined, base: number, salt = 0): number {
  // Position-weighted, and salted per bar: a plain character sum makes the two bars on one
  // card move together, which is its own kind of obviously-generated.
  const sum = [...(seed ?? "?")].reduce((acc, ch, i) => acc + ch.charCodeAt(0) * (i + 1), salt);
  return base + (sum % 7) * 6;
}

/**
 * One enquiry, rendered the way the business already sees it in the inbox
 * (`enquiry-inbox-card.tsx`): avatar initial, real first name beside a redacted surname, a
 * redacted address, then the course and institution.
 *
 * The mail is deliberately a copy of the card and not a richer view — the recipient should
 * recognise the row when they open the inbox, and everything past this point is what the
 * unlock is charged for. The `@gmail.com` is a fixed placeholder exactly as on the card, not
 * the student's real provider: it conveys the shape of an address without implying anything
 * about the student.
 */
/**
 * The one card shape every enquiry mail uses: an avatar tile, a two-line identity, then what
 * the enquiry is about. Shared so the summary, the single notice and the unlock notice cannot
 * drift into three dialects of the same object.
 *
 * Everything sits in the column beside the avatar. An earlier version put the course in a
 * full-width block under a hairline separator, which cost a rule plus two margins — about a
 * third of the card's height — to say something the type sizes already say.
 */
function infoCard(opts: {
  initial: string;
  /** Trusted markup: callers escape their own text, and the enquiry card passes redaction bars. */
  titleHtml: string;
  subtitleHtml?: string | null;
  title: string;
  metaParts?: (string | null | undefined)[];
}): string {
  const meta = (opts.metaParts ?? []).filter(Boolean) as string[];
  return `<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="width:100%;border:1px solid #e8eaed;border-radius:10px;background-color:#fcfcfd">
    <tr>
      <td style="padding:12px 14px">
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
          <tr>
            <td width="46" valign="top" style="width:46px;padding-right:12px">
              <table cellpadding="0" cellspacing="0" role="presentation" style="border-radius:9px;background-color:#f4eaea">
                <tr><td align="center" valign="middle" style="width:34px;height:34px;color:${BRAND.primary};font-family:${FONT};font-size:14px;font-weight:700">${opts.initial}</td></tr>
              </table>
            </td>
            <td valign="top">
              <p style="margin:0;color:${BRAND.ink};font-size:14px;line-height:19px;font-weight:600">${opts.titleHtml}</p>
              ${
                opts.subtitleHtml
                  ? `<p style="margin:2px 0 0;color:${BRAND.faint};font-size:12px;line-height:16px">${opts.subtitleHtml}</p>`
                  : ""
              }
              <p style="margin:8px 0 0;color:${BRAND.ink};font-size:15px;line-height:20px;font-weight:600">${esc(
                opts.title,
              )}</p>
              ${
                meta.length
                  ? `<p style="margin:2px 0 0;color:${BRAND.muted};font-size:12px;line-height:17px">${meta
                      .map((m) => esc(m))
                      .join(" &nbsp;&middot;&nbsp; ")}</p>`
                  : ""
              }
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>`;
}

/** One enquiry, as the recipient business sees it before paying to unlock. */
function enquiryCard(item: DigestItem): string {
  const first = item.studentFirstName?.trim();
  return infoCard({
    initial: first ? esc(first[0].toUpperCase()) : "&#8226;",
    titleHtml: `${first ? `${esc(first)} ` : ""}${redacted(redactionWidth(first, 62))}`,
    subtitleHtml: `${redacted(redactionWidth(first, 94, 37))}@gmail.com`,
    title: item.courseName ?? "Course enquiry",
    // Institution and intake share one muted line: two facts, one row, rather than two thin
    // lines that make every card taller than the thing it describes.
    metaParts: [item.institutionName, item.intake && `Intake ${item.intake}`],
  });
}

/**
 * The stack of enquiry cards.
 *
 * Separate bordered cards with real gaps between them, not one table split by hairlines: at
 * six enquiries the hairline version read as a single dense block, which is what made the
 * first Gmail render feel cramped.
 *
 * No per-card link. One enquiry is not an errand — the single CTA at the foot of the mail
 * opens the inbox, where the same cards are actionable.
 *
 * A card with no course still renders — dropping it would silently lose an enquiry from a
 * summary whose whole promise is that nothing is missed.
 */
function listBlock(items: DigestItem[]): string {
  if (items.length === 0) return "";
  const rows = items
    .map(
      (item, i) =>
        `<tr><td style="padding-top:${i === 0 ? 0 : 8}px">${enquiryCard(item)}</td></tr>`,
    )
    .join("");
  return `<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="width:100%">${rows}</table>`;
}

/**
 * The 5-minute summary: every enquiry that reached one recipient inside the window, as one mail.
 *
 * Exists because the per-enquiry mail does not survive volume — a business matched by 100
 * enquiries in a minute got 100 messages, and the provider rejected most of them. One message
 * per recipient per window is both readable and within any sane sending rate.
 *
 * Only rendered for two or more enquiries; a window holding exactly one still sends
 * `enquiryDistributedEmail`, which reads better for the single case.
 *
 * `items` is the FULL set the mail accounts for — the count in the heading comes from its
 * length. Only the first five are printed; a hundred rows would make an unreadable mail and a
 * count plus an inbox link is the more useful thing at that size. The unlisted ones are not
 * pending anything: they are already in the recipient's inbox, which is what the CTA opens.
 */
export function enquiryDigestEmail(options: {
  items: DigestItem[];
  businessName?: string | null;
  /** Length of the collection window, so the mail can say over what period these arrived. */
  windowMinutes?: number;
  /** Institution-fallback digests: an unclaimed institution has no inbox to open yet. */
  claimUrl?: string | null;
}): { subject: string; html: string; text: string } {
  const { items, businessName, windowMinutes = 5, claimUrl } = options;
  const total = items.length;
  const cta = claimUrl
    ? { label: "Claim your account", href: claimUrl }
    : { label: "Open your inbox", href: web("/business/enquiries") };

  const shown = items.slice(0, DIGEST_PREVIEW);
  const hidden = total - shown.length;
  const period = windowMinutes === 1 ? "minute" : `${windowMinutes} minutes`;

  // States the count AND the period: "6 new enquiries" alone leaves the recipient wondering
  // whether that is today's total or a backlog they have been ignoring.
  const lead = claimUrl
    ? `${total} students enquired about your courses in the last ${period}, and no agent representing them was available.`
    : `${total} students enquired about courses you represent in the last ${period}.`;

  const more =
    hidden > 0
      ? `Showing the ${shown.length} most recent. ${hidden} more ${hidden === 1 ? "is" : "are"} waiting in your inbox.`
      : null;

  const textLines = [
    lead,
    "",
    ...shown.map((item) =>
      [
        `• ${item.courseName ?? "Course enquiry"}`,
        [item.studentFirstName, item.institutionName, item.intake && `Intake ${item.intake}`]
          .filter(Boolean)
          .join(" · ") || null,
      ]
        .filter((l) => l !== null)
        .join("\n  "),
    ),
    "",
    more,
    more ? "" : null,
    `${cta.label} → ${cta.href}`,
  ].filter((l) => l !== null);

  return {
    subject: `${total} new student enquiries`,
    text: textLines.join("\n"),
    html: emailLayout({
      size: "wide",
      align: "left",
      heading: `${total} new student enquiries`,
      body: `<p style="margin:0 0 20px;color:${BRAND.muted};font-size:15px;line-height:23px">${esc(lead)}</p>
             ${listBlock(shown)}
             ${
               more
                 ? `<p style="margin:16px 0 0;color:${BRAND.muted};font-size:14px;line-height:21px">${esc(more)}</p>`
                 : ""
             }
             <p style="margin:20px 0 0;color:${BRAND.faint};font-size:13px;line-height:20px">
               ${
                 claimUrl
                   ? "Claim your institution account to read these enquiries and reply to the students directly."
                   : "Unlock an enquiry to see the student's full details and start the conversation."
               }
             </p>`,
      cta,
      footnote: businessName
        ? `Sent to ${esc(businessName)} because it matches these enquiries.`
        : "You're receiving this because these enquiries match courses you represent.",
    }),
  };
}

/**
 * Sent to the STUDENT the moment a business unlocks their enquiry — the only notification in this
 * module that goes to the person who sent the enquiry rather than to a recipient of it.
 *
 * The point is reassurance and consent transparency: something happened, here is who, and here is
 * what they can now see. `sharedContact` reflects the choice the student made at submission back to
 * them, because "a business can now see your details" reads very differently depending on whether
 * their phone number was part of that.
 */
export function enquiryUnlockedEmail(options: {
  businessName?: string | null;
  courseName?: string | null;
  institutionName?: string | null;
  enquiryId?: string | null;
  sharedContact?: boolean;
}): { subject: string; html: string; text: string } {
  const { businessName, courseName, institutionName, enquiryId, sharedContact } = options;
  const who = businessName ?? "A business";
  // Straight to the enquiry when we know which one, so the reply is one tap away.
  const href = enquiryId ? web(`/personal/enquiries/${enquiryId}`) : web("/personal/enquiries");

  const contactLine = sharedContact
    ? "They can see your profile, email address and phone number, as you agreed when you sent this enquiry."
    : "They can see your profile and email address. Your phone number stays private — you chose not to share it.";

  const textLines = [
    `${who} unlocked your enquiry and has started a conversation with you.`,
    "",
    courseName ? `Course: ${courseName}` : null,
    institutionName ? `Institution: ${institutionName}` : null,
    "",
    contactLine,
    "",
    `Read their message → ${href}`,
  ].filter((l) => l !== null);

  return {
    subject: courseName ? `${who} replied about ${courseName}` : `${who} unlocked your enquiry`,
    text: textLines.join("\n"),
    html: emailLayout({
      // Same shell and same card as the notices that go the other way. This mail is the
      // student's side of the identical event, and it read like a different product.
      size: "wide",
      align: "left",
      heading: "Your enquiry was unlocked",
      body: `<p style="margin:0 0 20px;color:${BRAND.muted};font-size:15px;line-height:23px"><strong style="color:${
        BRAND.ink
      }">${esc(who)}</strong> unlocked your enquiry and has sent you a message.</p>
             ${infoCard({
               // The business is the identity here, and nothing is redacted: the student knows
               // their own details, and who the business is was never the paid-for part.
               initial: businessName ? esc(businessName.trim()[0].toUpperCase()) : "&#8226;",
               titleHtml: esc(who),
               subtitleHtml: "Unlocked your enquiry",
               title: courseName ?? "Your enquiry",
               metaParts: [institutionName],
             })}
             <p style="margin:16px 0 0;color:${BRAND.muted};font-size:13px;line-height:20px">
               ${esc(contactLine)}
             </p>`,
      cta: { label: "Read their message", href },
      footnote: "You're receiving this because you sent this enquiry on GlobalyApp.",
    }),
  };
}

/**
 * The lead notification a matched business gets for a single enquiry — what a 5-minute
 * digest window containing exactly one enquiry still renders as, since a one-item list
 * reads as bureaucracy where this reads as news.
 *
 * Carries no student contact detail by design — the whole point of the distribution is that
 * those details are behind the unlock, and an email is the easiest thing in the product to
 * forward on to someone who never paid for it. `studentFirstName` is the one exception, and
 * only because the inbox card already shows it before unlocking.
 */
export function enquiryDistributedEmail(options: {
  courseName?: string | null;
  institutionName?: string | null;
  intake?: string | null;
  businessName?: string | null;
  studentFirstName?: string | null;
  distributionId?: string | null;
}): { subject: string; html: string; text: string } {
  const { courseName, institutionName, intake, businessName, studentFirstName, distributionId } = options;
  // Straight to the enquiry when we know which one — "open and review it" should be one tap,
  // not a hunt through the inbox. Older queued rows have no distribution_id and fall back.
  const href = distributionId ? web(`/business/enquiries/${distributionId}/student`) : web("/business/enquiries");

  const textLines = [
    "You have received a new student enquiry.",
    "",
    studentFirstName ? `Student: ${studentFirstName}` : null,
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
      // Same shell as the summary, so a business that gets one enquiry and a business that
      // gets nine are looking at the same email, not two different products.
      size: "wide",
      align: "left",
      heading: "New student enquiry",
      body: `<p style="margin:0 0 20px;color:${BRAND.muted};font-size:15px;line-height:23px">A student is asking about a course you represent.</p>
             ${listBlock([{ studentFirstName, courseName, institutionName, intake }])}
             <p style="margin:20px 0 0;color:${BRAND.faint};font-size:13px;line-height:20px">
               Unlock the enquiry to see the student's details and start the conversation.
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
  studentFirstName?: string | null;
  isClaimed: boolean;
  claimUrl?: string | null;
}): { subject: string; html: string; text: string } {
  const { institutionName, courseName, intake, studentFirstName, isClaimed, claimUrl } = options;
  const portalUrl = web("/business/enquiries");
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
      // Matches the business notice and the summary: this is the same enquiry, arriving at an
      // institution instead of an agent, and its two-or-more form already renders these cards.
      size: "wide",
      align: "left",
      heading: "A student is asking about your course",
      body: `<p style="margin:0 0 20px;color:${BRAND.muted};font-size:15px;line-height:23px">This enquiry came to you directly — no agent representing this course was available to take it.</p>
             ${listBlock([{ studentFirstName, courseName, institutionName, intake }])}
             <p style="margin:20px 0 0;color:${BRAND.faint};font-size:13px;line-height:20px">${ask}</p>`,
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
