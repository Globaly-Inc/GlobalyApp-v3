// One card layout for every transactional mail, so OTP, invitations and booking notices read as one
// family. Table-based with inline styles only — Outlook and Gmail strip <style> blocks, flexbox and
// most modern CSS, so the "nicer" markup is the one that renders everywhere.
//
// The logo is a public GCS asset (see logoUrl) because an email client can only load an asset
// over http(s); there is no bundling step for mail, and WEB_APP_URL is localhost in dev.

import { config } from "../../config.js";

/**
 * Mirrors the app's tokens in `frontend/src/app/globals.css`. Hex rather than hsl()/var():
 * Outlook's Word engine understands neither, and mail has no cascade to inherit from.
 *
 * Recoloured from the original maroon to the navy brand. `gold` keeps its name because the
 * ported markup reads it, but the value is the aqua that replaced the gold — the design system
 * makes the same note. It is an accent for solid fills only: at 55% lightness it is far too
 * light to carry text on white.
 */
const BRAND = {
  primary: "#012E8A", // --primary
  gold: "#23DDF6", // --gold             hsl(187 92% 55%)
  ink: "#0F1729", // --foreground        hsl(222 47% 11%)
  body: "#3F4B60",
  muted: "#65758B", // --muted-foreground hsl(215 16% 47%)
  faint: "#8D9AAD",
  line: "#E1E5EA", // --border           hsl(215 16% 90%)
  page: "#F2F4F8", // --secondary        hsl(220 30% 96%)
} as const;

/**
 * Headings are Fraunces in the app. No mail client will load it, so the family the whole
 * editorial system is built on degrades to the serif every client already has — which still
 * reads as the same voice beside a sans body, where a sans heading does not.
 */
const HEADING_FONT = `Georgia,'Times New Roman',serif`;

const FONT = `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif`;

/**
 * The navy "g" mark, the same asset the app header loads. Absolute and public because a mail
 * client can only fetch over http(s) — there is no bundling step for mail, and WEB_APP_URL is
 * localhost in dev, which would render broken in any real inbox.
 *
 * The previous file at .../globalyapp-logo.jpeg is the RETIRED MAROON mark. Verified 2026-09-10
 * by fetching both: that one is the old red logo, this one is the navy rounded tile.
 */
const logoUrl = () =>
  `https://storage.googleapis.com/globalyapp-public-images/logos/GlobalyOS%20White%20BG%20Icon.png`;

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
                    <img src="${logoUrl()}" alt="Globaly" width="56" height="56" style="display:block" />
                  </td>
                </tr>
                <tr>
                  <td align="center" style="padding-bottom:${wide ? "10px" : "20px"}">
                    <h1 style="margin:0;color:${BRAND.ink};font-family:${HEADING_FONT};font-size:${wide ? "25px" : "23px"};line-height:32px;font-weight:700">${heading}</h1>
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
              <table cellpadding="0" cellspacing="0" role="presentation" style="border-radius:9px;background-color:#DDE7FA">
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

/**
 * Sent to the STUDENT the moment a business or institution unlocks their enquiry — the only
 * notification in this module that goes to the person who sent the enquiry rather than to a
 * recipient of it.
 *
 * Shares `mailShell` with the two recipient-facing mails, so the student sees the same product
 * the agency does. The body is its own: what the student needs is the message that is waiting,
 * proof a real person is on the other end, and a clear statement of what that person can now
 * see about them.
 *
 * `messagePreview` is the first line of the actual thread — today always the templated unlock
 * greeting, which is still honest ("here is the message waiting for you") and makes the mail
 * concrete rather than abstract. Truncated, because the point is to get them into the app.
 *
 * The headline names the UNLOCKER, never `institutionName`. An agency that represents Cornell
 * is not Cornell, and "Cornell University wants to talk to you" over a message from an agency
 * would be a lie the student acts on.
 */
export function enquiryUnlockedEmail(options: {
  businessName?: string | null;
  courseName?: string | null;
  institutionName?: string | null;
  enquiryId?: string | null;
  sharedContact?: boolean;
  /** First message in the thread, untruncated; this trims it. */
  messagePreview?: string | null;
}): { subject: string; html: string; text: string } {
  const { businessName, courseName, institutionName, enquiryId, sharedContact, messagePreview } = options;
  // Trim before the fallback: `?? "A business"` only catches null/undefined, so a whitespace-only
  // name survived it — rendering a nameless subject and then throwing on `""[0].toUpperCase()`.
  // A throw here is not cosmetic: it fails the queue row, and after the attempt cap the student
  // is never told their details changed hands. `who` is non-empty from this point on.
  const who = businessName?.trim() || "A business";
  const href = enquiryId ? web(`/personal/enquiries/${enquiryId}`) : web("/personal/enquiries");

  const contactLine = sharedContact
    ? "They can see your profile, email address and phone number, as you agreed when you sent this enquiry."
    : "They can see your profile and email address. Your phone number stays private — you chose not to share it.";

  const preview = messagePreview?.trim();
  const clipped = preview && preview.length > 180 ? `${preview.slice(0, 180).trimEnd()}…` : preview;

  const aboutHtml = courseName
    ? ` about <strong style="color:${MK.ink}">${esc(courseName)}</strong>`
    : "";
  const introHtml = `<strong style="color:${MK.ink}">${esc(
    who,
  )}</strong> unlocked your enquiry${aboutHtml} and sent you a message. That means a real person on the admissions side is reading about you right now.`;

  // Three reasons to open it now. Product claims, not measured statistics.
  const reasons: [string, string][] = [
    ["Today", "Replies land fastest while your enquiry is still fresh"],
    ["1 chat", "Fees, scholarships and intake dates without another form"],
    ["3 min", "All it takes to reply before the intake fills up"],
  ];

  const reasonCells = reasons
    .map(
      ([big, small], i) => `${i > 0 ? `<td class="stack-gap" width="14" style="width:14px;font-size:0;line-height:0">&nbsp;</td>` : ""}
          <td class="stack" width="32%" valign="top">
            <div style="font-family:${HEADING_FONT};font-size:24px;line-height:28px;font-weight:bold;color:${MK.primary};letter-spacing:-0.4px">${esc(
              big,
            )}</div>
            <div style="padding-top:5px;font-size:13px;line-height:20px;color:${MK.muted}">${esc(small)}</div>
          </td>`,
    )
    .join("");

  const bodyRows = `${shellOpening("New message", `${who} wants to talk to you`, introHtml, "accent")}

        <tr><td class="px" align="left" style="padding:24px 40px 0 40px">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${MK.tile};border-radius:12px;border:1px solid ${MK.cardEdge}">
            <tr><td style="padding:18px 20px;font-family:${MK_FONT}">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td width="46" valign="top" style="width:46px">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td width="36" height="36" align="center" valign="middle" style="width:36px;height:36px;background-color:${MK.avatar};border-radius:100px;font-size:15px;line-height:15px;font-weight:bold;color:${MK.primary}">${esc(
                      who[0].toUpperCase(),
                    )}</td></tr></table>
                  </td>
                  <td valign="top">
                    <div style="font-size:15px;line-height:21px;font-weight:bold;color:${MK.ink}">${esc(who)}</div>
                    <div style="padding-top:2px;font-size:13px;line-height:19px;color:${MK.muted}">${
                      institutionName ? `Unlocked your enquiry &middot; ${esc(institutionName)}` : "Unlocked your enquiry"
                    }</div>
                  </td>
                </tr>
                ${
                  clipped
                    ? `<tr><td colspan="2" style="padding-top:14px;font-size:15px;line-height:25px;color:${MK.body}">&ldquo;${esc(
                        clipped,
                      )}&rdquo;</td></tr>`
                    : ""
                }
              </table>
            </td></tr>
          </table>
        </td></tr>

${shellButton("Read & reply", href).replace("padding:26px 40px 0 40px", "padding:24px 40px 0 40px")}
${shellTrustLine("Free · Reply in the app · No forms to fill again")}
${shellRule}

        <tr><td class="px" align="left" style="padding:28px 40px 0 40px;font-family:${MK_FONT}">
          <div style="font-size:15px;line-height:22px;font-weight:bold;color:${MK.ink}">Why it pays to reply today</div>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="stack-table" style="margin-top:18px">
            <tr class="stack-tr">${reasonCells}</tr>
          </table>
        </td></tr>

        <tr><td class="px" align="left" style="padding:28px 40px 0 40px">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${MK.primarySoft};border-radius:12px"><tr>
            <td width="46" valign="top" style="width:46px;padding:16px 0 16px 18px">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td width="24" height="24" align="center" valign="middle" style="width:24px;height:24px;background-color:${MK.avatar};border-radius:100px;font-family:${MK_FONT};font-size:12px;line-height:12px;font-weight:bold;color:${MK.primary}">&#10003;</td></tr></table>
            </td>
            <td valign="top" style="padding:16px 18px 16px 10px;font-family:${MK_FONT};font-size:14px;line-height:22px;color:${MK.primaryInk}">
              <strong style="color:${MK.ink}">You stay in control.</strong> ${esc(contactLine)}
            </td>
          </tr></table>
        </td></tr>

${shellRule.replace("padding:32px", "padding:30px")}

        <tr><td class="px" align="left" style="padding:26px 40px 38px 40px;font-family:${MK_FONT}">
          <div style="font-size:15px;line-height:22px;font-weight:bold;color:${MK.ink}">Want more universities reaching out?</div>
          <div style="padding-top:6px;font-size:15px;line-height:24px;color:${MK.body}">
            Students who send three or four enquiries hear back from more institutions &mdash; and get to compare fees and scholarships side by side.
          </div>
          <div style="padding-top:14px;font-size:15px;line-height:22px">
            <a href="${web("/personal/explore")}" style="color:${MK.primary};font-weight:bold;text-decoration:underline">Explore more programmes &rarr;</a>
          </div>
        </td></tr>`;

  const textLines = [
    `${who} wants to talk to you`,
    "",
    `${who} unlocked your enquiry${courseName ? ` about ${courseName}` : ""} and sent you a message.`,
    institutionName ? `Institution: ${institutionName}` : null,
    "",
    clipped ? `"${clipped}"` : null,
    clipped ? "" : null,
    `Read & reply → ${href}`,
    "",
    contactLine,
  ].filter((l) => l !== null);

  return {
    subject: courseName ? `${who} replied about ${courseName}` : `${who} unlocked your enquiry`,
    text: textLines.join("\n"),
    html: mailShell({
      title: esc(`${who} wants to talk to you`),
      preheader: `${who} unlocked your enquiry${courseName ? ` about ${courseName}` : ""} and sent you a message.`,
      eyebrow: "Your applications",
      bodyRows,
      footerReason: "You&rsquo;re receiving this because you sent this enquiry on Globaly App.",
      footerLinks: `<div style="padding-top:10px;font-size:12px;line-height:20px"><a href="${href}" style="color:${MK.primary};text-decoration:underline">Open your enquiry</a></div>`,
    }),
  };
}

/**
 * The lead notice a CLAIMED recipient gets — a business whose profile someone has taken
 * ownership of, or an institution the enquiry fell back to.
 *
 * Shares `marketingShell` with the acquisition mail, and that is the point: the two are the same
 * product speaking to the same person at two moments, and they read as one thing. What differs is
 * the ask. The acquisition mail asks for a claim; this asks them to open the inbox they already
 * have. It carries no benefits block — an evergreen "here's what you can do" list is fine once,
 * on the mail that converts, and reads as filler on the tenth send.
 *
 * Replaces three separate templates (the single business notice, the multi-enquiry summary, and
 * the institution fallback). They were three renderings of one event that had already drifted
 * apart in wording; `items.length` and `kind` cover every case they did.
 *
 * Carries no student contact detail: the unlock is what buys that, and an email is the easiest
 * thing in the product to forward to someone who never paid for it.
 */
export function enquiryLeadEmail(options: {
  kind: "business" | "institution";
  recipientName?: string | null;
  items: DigestItem[];
  /** Deep-links straight to the enquiry when the window held exactly one. */
  distributionId?: string | null;
  /** Length of the collection window, so the mail can say over what period these arrived. */
  windowMinutes?: number;
}): { subject: string; html: string; text: string } {
  const { kind, recipientName, items, distributionId, windowMinutes = 5 } = options;
  const institution = kind === "institution";
  const asked = institution ? "your programmes" : "your courses";
  const total = items.length;
  const one = total === 1;
  const shown = items.slice(0, DIGEST_PREVIEW);
  const hidden = total - shown.length;
  const who = recipientName?.trim();
  const period = windowMinutes === 1 ? "minute" : `${windowMinutes} minutes`;

  // Straight to the enquiry when the window held exactly one — opening it should be one tap,
  // not a hunt through the inbox. Older queued rows have no distribution_id and fall back.
  const deepLink = one && !!distributionId;
  const href = deepLink ? web(`/business/enquiries/${distributionId}/student`) : web("/business/enquiries");
  const ctaLabel = deepLink ? "Open this enquiry" : "Open your inbox";

  const headline = one ? "A student is waiting to hear from you" : `${total} students are waiting to hear from you`;
  const pill = one ? "1 new enquiry" : `${total} new enquiries`;
  const course = one ? shown[0]?.courseName : null;

  const intro = institution
    ? `${one ? "This enquiry" : "These enquiries"} came to you directly — no agent representing ${
        one ? "this course" : "these courses"
      } was available to take ${one ? "it" : "them"}.`
    : `They found ${who ?? "you"} on Globaly App and asked about ${asked}. Open your inbox to see who they are and reply.`;

  const introHtml =
    !institution && who
      ? `They found <strong style="color:${MK.ink}">${esc(
          who,
        )}</strong> on Globaly App and asked about ${asked}. Open your inbox to see who they are and reply.`
      : esc(intro);

  const footerReason = institution
    ? "You&rsquo;re receiving this because these enquiries are about courses listed under your institution."
    : who
      ? `Sent to ${esc(who)} because these enquiries match courses it represents on Globaly App.`
      : "You&rsquo;re receiving this because these enquiries match courses you represent on Globaly App.";

  const lockedNote = "Names and contact details unlock when you open the enquiry.";
  const urgencyNote =
    "Most students contact several providers the same day and go with whoever replies first — so it’s worth doing now.";

  const textLines = [
    headline,
    "",
    intro,
    "",
    `${ctaLabel} → ${href}`,
    "",
    "WHAT THEY ASKED ABOUT",
    lockedNote,
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
    hidden > 0 ? `\nAnd ${hidden} more ${hidden === 1 ? "enquiry" : "enquiries"} waiting for you.` : null,
    "",
    urgencyNote,
    "",
    `${ctaLabel} → ${href}`,
  ].filter((l) => l !== null);

  return {
    subject: one
      ? course
        ? `A student is asking about ${course}`
        : `A student is asking about ${asked}`
      : `${total} students are asking about ${asked}`,
    text: textLines.join("\n"),
    html: marketingShell({
      preheader: `${pill} about ${asked}. Open your inbox to see who is asking.`,
      pill,
      headline,
      introHtml,
      ctaLabel,
      href,
      trustLine: `In the last ${period} · Contact details unlock when you open an enquiry`,
      lockedNote,
      cards: shown.map(shellCard).join(""),
      hidden,
      urgencyNote,
      footerReason,
    }),
  };
}

/**
 * The acquisition mail: what an UNCLAIMED business or institution gets instead of a lead notice.
 *
 * A lead notice is the wrong mail for this recipient. Its CTA opens an inbox they cannot sign
 * into, so the one thing it asks for is the one thing they cannot do. This inverts the ask: the
 * enquiries are the evidence, claiming the profile is the action.
 *
 * DOES NOT USE `emailLayout`. Every other mail here is transactional and shares that shell; this
 * one is cold outreach to someone who has no account, and it needs what marketing mail needs and
 * transactional mail does not — a preheader, an above-the-fold CTA repeated at the foot, proof,
 * objection handling, and a footer that says why this arrived. Forcing it through the shared
 * shell is what produced the version that read as another system notification.
 *
 * One function for both recipient kinds: the mail is the same, differing in the noun and the CTA
 * label. Keeping them together is what stops the two drifting into different designs.
 *
 * Pre-unlock boundary is unchanged: first name plus a dotted mask, never a surname, address or
 * phone. Claiming is what buys the details; reading the email must not be a way around that.
 *
 * `items.length` IS the count in the headline — the caller passes every enquiry the mail
 * accounts for, and only the first five are printed.
 */
export function enquiryClaimEmail(options: {
  kind: "business" | "institution";
  /** The listing's own name, for the sentence that says why this arrived. */
  recipientName?: string | null;
  items: DigestItem[];
  /** Minted per send by the caller; falls back to the portal so a missing token is not a dead button. */
  claimUrl?: string | null;
  /** Length of the collection window. Unused in the copy for now — kept so the caller's contract
   *  does not change if the mail starts saying "this week" vs "in the last 5 minutes". */
  windowMinutes?: number;
}): { subject: string; html: string; text: string } {
  const { kind, recipientName, items, claimUrl } = options;
  const noun = kind === "institution" ? "institution" : "business";
  const asked = kind === "institution" ? "your programmes" : "your courses";
  const total = items.length;
  const one = total === 1;

  const shown = items.slice(0, DIGEST_PREVIEW);
  const hidden = total - shown.length;
  const who = recipientName?.trim();

  const href = claimUrl || web("/business/enquiries");
  const ctaLabel = `Claim your ${noun}`;

  const headline = one
    ? "1 student is waiting to hear from you"
    : `${total} students are waiting to hear from you`;
  const pill = one ? "1 new enquiry" : `${total} new enquiries`;

  const intro = `They found ${who ?? `your ${noun}`} on Globaly App and asked about ${asked}. Your profile isn't claimed yet, so you can't reply to them.`;

  const benefits =
    kind === "institution"
      ? [
          "Read and reply to every enquiry in one inbox",
          "Keep your programmes, fees and intakes accurate",
          "See which programmes students are searching for",
        ]
      : [
          "Read and reply to every enquiry in one inbox",
          "Keep your courses, fees and intakes accurate",
          "See which programmes students are searching for",
        ];

  const textLines = [
    headline.toUpperCase(),
    "",
    intro,
    "",
    `${ctaLabel} → ${href}`,
    "Free · Takes under a minute · No card needed",
    "",
    "WHAT THEY ASKED ABOUT",
    "Names and contact details unlock when you claim the profile.",
    "",
    ...shown.map((item) =>
      [
        `• ${item.courseName ?? "Course enquiry"}`,
        [item.institutionName, item.intake && `Intake ${item.intake}`].filter(Boolean).join(" · ") || null,
      ]
        .filter((l) => l !== null)
        .join("\n  "),
    ),
    hidden > 0 ? `\n${hidden} more ${hidden === 1 ? "is" : "are"} waiting for you.` : null,
    "",
    "ONCE YOU CLAIM IT, YOU CAN",
    ...benefits.map((b) => `• ${b}`),
    "",
    "Most students contact several providers the same day and go with whoever replies first — so it's worth doing now.",
    "",
    `${ctaLabel} → ${href}`,
    "",
    "Not the right person? Forward this to whoever handles admissions.",
  ].filter((l) => l !== null);

  return {
    subject: one
      ? `A student is waiting to hear from ${who ?? `your ${noun}`}`
      : `${total} students are waiting to hear from ${who ?? `your ${noun}`}`,
    text: textLines.join("\n"),
    html: marketingShell({
      preheader: `${pill} about ${asked}. Claim your profile free to reply.`,
      pill,
      headline,
      introHtml: who
        ? `They found <strong style="color:${MK.ink}">${esc(who)}</strong> on Globaly App and asked about ${asked}. Your profile isn't claimed yet, so you can't reply to them.`
        : esc(intro),
      ctaLabel,
      href,
      trustLine: "Free · Takes under a minute · No card needed",
      lockedNote: "Names and contact details unlock when you claim the profile.",
      cards: shown.map(shellCard).join(""),
      hidden,
      benefits,
      urgencyNote:
        "Most students contact several providers the same day and go with whoever replies first — so it’s worth doing now.",
      footerReason: who
        ? `Sent to ${esc(who)} because students enquired about courses it offers on Globaly App.`
        : `Sent because students enquired about courses your ${noun} offers on Globaly App.`,
    }),
  };
}

/**
 * Palette for the acquisition mail only.
 *
 * Deliberately its own set rather than BRAND: this mail sits on a warm paper ground with a card
 * floating on it, where the transactional shell is a white card on cool grey. Sharing the tokens
 * would mean one mail's redesign silently restyling the OTP mail.
 */
const MK = {
  page: "#F2F4F8",
  card: "#FFFFFF",
  cardEdge: "#E1E5EA",
  rule: "#EAEEF4",
  tile: "#F7F9FC",
  primary: "#012E8A",
  /** Tinted navy for pills, the avatar tile and the closing note. */
  primarySoft: "#E8EEFB",
  /** --purple-dark hsl(220 99% 18%) — navy deep enough to read on primarySoft. */
  primaryInk: "#001F5B",
  /** The aqua accent, solid fills only. */
  accent: "#23DDF6",
  /** Tinted aqua + a deep teal that actually reads on it — the student mail's pill. */
  accentSoft: "#E4F7FB",
  accentInk: "#0A5C6B",
  avatar: "#DDE7FA",
  ink: "#0F1729",
  body: "#3F4B60",
  soft: "#556579",
  muted: "#65758B",
  faint: "#8D9AAD",
  mask: "#B9C3D1",
} as const;

const MK_FONT = `-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif`;

/** One enquiry, as the unclaimed recipient sees it: what was asked, who is masked. */
function shellCard(item: DigestItem): string {
  const first = item.courseName ?? "Course enquiry";
  const meta = [item.institutionName, item.intake && `Intake ${item.intake}`].filter(Boolean) as string[];
  const student = item.studentFirstName?.trim();
  // Dots rather than the grey bars the in-app card uses: a bar depends on a background painting,
  // and a mask that collapses to nothing in one client reads as missing data rather than withheld.
  const mask = "&bull;".repeat(8);
  return `<tr><td class="px" align="left" style="padding:10px 40px 0 40px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${MK.tile};border-radius:12px">
      <tr><td style="padding:16px 18px;font-family:${MK_FONT}">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
          <td width="42" valign="top" style="width:42px">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
              <td width="32" height="32" align="center" valign="middle" style="width:32px;height:32px;background-color:${MK.avatar};border-radius:100px;font-size:14px;line-height:14px;font-weight:bold;color:${MK.primary}">${
                student ? esc(student[0].toUpperCase()) : "&bull;"
              }</td>
            </tr></table>
          </td>
          <td valign="top">
            <div style="font-size:15px;line-height:22px;font-weight:bold;color:${MK.ink}">${esc(first)}</div>
            ${
              meta.length
                ? `<div style="padding-top:3px;font-size:14px;line-height:21px;color:${MK.soft}">${meta
                    .map((m) => esc(m))
                    .join(" &nbsp;&middot;&nbsp; ")}</div>`
                : ""
            }
            <div style="padding-top:7px;font-size:13px;line-height:19px;color:${MK.mask}">${
              student ? `${esc(student)} ${mask}` : mask
            } &nbsp;&middot;&nbsp; ${mask}@gmail.com</div>
          </td>
        </tr></table>
      </td></tr>
    </table>
  </td></tr>`;
}

/** The brand pill button, with the VML twin Outlook needs to render a rounded fill at all. */
function shellButton(label: string, href: string): string {
  return `<tr><td class="px" align="left" style="padding:26px 40px 0 40px">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" class="btn"><tr><td align="center">
      <!--[if mso]>
      <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${href}" style="height:50px;v-text-anchor:middle;width:228px;" arcsize="20%" stroke="f" fillcolor="${MK.primary}">
        <w:anchorlock/>
        <center style="color:#ffffff;font-family:Arial,sans-serif;font-size:15px;font-weight:bold;">${label} &rarr;</center>
      </v:roundrect>
      <![endif]-->
      <!--[if !mso]><!-- -->
      <a href="${href}" style="display:inline-block;background-color:${MK.primary};color:#ffffff;font-family:${MK_FONT};font-size:15px;line-height:20px;font-weight:bold;padding:15px 28px;border-radius:10px;text-align:center">${label} &nbsp;&rarr;</a>
      <!--<![endif]-->
    </td></tr></table>
  </td></tr>`;
}

const shellRule = `<tr><td class="px" style="padding:32px 40px 0 40px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td height="1" style="height:1px;line-height:1px;font-size:0;background-color:${MK.rule}">&nbsp;</td></tr></table></td></tr>`;

/**
 * The chrome every non-transactional mail shares: brand row above the card, the card with its
 * accent bar, and the footer below it. Callers supply the `<tr>` rows that go inside the card.
 *
 * Split out of marketingShell once the student's unlock mail needed the same frame around a
 * completely different body. Three bodies, one frame — which is the only reason the acquisition
 * mail, the lead notice and the unlock notice read as the same product.
 *
 * Table markup with inline styles and MSO conditionals: Gmail and Outlook strip <style> blocks,
 * so the media query is a progressive enhancement and everything load-bearing is inline.
 */
function mailShell(o: {
  /** Also the <title>; pre-escaped by the caller if it carries user text. */
  title: string;
  preheader: string;
  /** Small uppercase label opposite the wordmark — who this mail is for. */
  eyebrow: string;
  /** The card's contents, as `<tr>` rows. Trusted markup. */
  bodyRows: string;
  /** Pre-escaped: callers build it from a name they have already escaped. */
  footerReason: string;
  /** Optional anchor row under the reason line. Trusted markup. */
  footerLinks?: string;
}): string {
  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office" lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta http-equiv="X-UA-Compatible" content="IE=edge" />
<meta name="x-apple-disable-message-reformatting" />
<meta name="color-scheme" content="light" />
<meta name="supported-color-schemes" content="light" />
<title>${o.title}</title>
<!--[if mso]>
<xml><o:OfficeDocumentSettings><o:AllowPNG/><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml>
<style>* { font-family: Arial, Helvetica, sans-serif !important; }</style>
<![endif]-->
<style type="text/css">
  html, body { margin:0 !important; padding:0 !important; width:100% !important; }
  * { -ms-text-size-adjust:100%; -webkit-text-size-adjust:100%; }
  table, td { mso-table-lspace:0pt !important; mso-table-rspace:0pt !important; border-collapse:collapse !important; }
  img { -ms-interpolation-mode:bicubic; border:0; height:auto; line-height:100%; outline:none; text-decoration:none; }
  a { text-decoration:none; }
  .ExternalClass, .ExternalClass p, .ExternalClass td, .ExternalClass div, .ExternalClass span { line-height:inherit; }
  a[x-apple-data-detectors] { color:inherit !important; text-decoration:none !important; font-size:inherit !important; font-family:inherit !important; font-weight:inherit !important; line-height:inherit !important; }
  @media only screen and (max-width:620px) {
    .wrap { width:100% !important; }
    .px { padding-left:24px !important; padding-right:24px !important; }
    .h1 { font-size:26px !important; line-height:34px !important; }
    .btn a { display:block !important; }
    .hide-sm { display:none !important; }
    /* A three-across stat row is unreadable at 320px — each cell becomes its own block. */
    .stack-table, .stack-tr { display:block !important; width:100% !important; }
    .stack { display:block !important; width:100% !important; max-width:100% !important; padding-bottom:14px !important; }
    .stack-gap { display:none !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background-color:${MK.page}">
<div style="display:none;font-size:1px;color:${MK.page};line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all">${esc(
    o.preheader,
  )}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${MK.page}">
<tr><td align="center" style="padding:32px 12px 44px 12px">
  <table role="presentation" class="wrap" width="580" cellpadding="0" cellspacing="0" border="0" style="width:580px;max-width:580px">

    <tr><td style="padding:0 6px 16px 6px;font-family:${MK_FONT}">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
        <td align="left" valign="middle">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
            <td width="26" height="26" align="center" valign="middle" style="width:26px;height:26px;background-color:${MK.primary};border-radius:8px"><img src="${logoUrl()}" alt="Globaly" width="26" height="26" style="display:block;width:26px;height:26px" /></td>
            <td style="padding-left:8px;font-size:15px;line-height:20px;font-weight:bold;color:${MK.ink};letter-spacing:-0.2px">Globaly App</td>
          </tr></table>
        </td>
        <td align="right" valign="middle" class="hide-sm" style="font-size:11px;line-height:14px;letter-spacing:0.7px;text-transform:uppercase;color:${MK.muted}">${esc(
          o.eyebrow,
        )}</td>
      </tr></table>
    </td></tr>

    <tr><td style="background-color:${MK.card};border-radius:16px;border:1px solid ${MK.cardEdge}">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr><td height="4" style="height:4px;line-height:4px;font-size:0;background-color:${MK.accent};border-radius:16px 16px 0 0">&nbsp;</td></tr>
${o.bodyRows}
      </table>
    </td></tr>

    <tr><td align="center" style="padding:24px 20px 0 20px;font-family:${MK_FONT}">
      <div style="font-size:12px;line-height:20px;color:${MK.muted}">${o.footerReason}</div>
      ${o.footerLinks ?? ""}
      <div style="padding-top:12px;font-size:11px;line-height:18px;color:${MK.soft}">
        &copy; ${new Date().getFullYear()} GlobalyHub &nbsp;&middot;&nbsp; World #1 AI Integrated Education Ecosystem
      </div>
    </td></tr>

  </table>
</td></tr>
</table>
</body>
</html>`;
}

/** The pill above a headline. Navy for the recipient-facing notices, accent for the student's. */
function shellPill(text: string, tone: "brand" | "accent" = "brand"): string {
  const bg = tone === "accent" ? MK.accentSoft : MK.primarySoft;
  const fg = tone === "accent" ? MK.accentInk : MK.primary;
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
    <td style="background-color:${bg};border-radius:6px;padding:6px 11px;font-size:11px;line-height:13px;font-weight:bold;letter-spacing:0.8px;text-transform:uppercase;color:${fg}">${esc(
      text,
    )}</td>
  </tr></table>`;
}

/** Pill, headline and intro — the opening every one of these mails uses. */
function shellOpening(pill: string, headline: string, introHtml: string, tone: "brand" | "accent" = "brand"): string {
  return `<tr><td class="px" align="left" style="padding:36px 40px 0 40px;font-family:${MK_FONT}">
    ${shellPill(pill, tone)}
    <div class="h1" style="padding-top:20px;font-family:${HEADING_FONT};font-size:30px;line-height:39px;font-weight:bold;color:${MK.ink};letter-spacing:-0.5px">${esc(
      headline,
    )}</div>
    <div style="padding-top:14px;font-size:16px;line-height:26px;color:${MK.body}">${introHtml}</div>
  </td></tr>`;
}

/** The reassurance line under a CTA. */
function shellTrustLine(text: string): string {
  return `<tr><td class="px" align="left" style="padding:13px 40px 0 40px;font-family:${MK_FONT};font-size:13px;line-height:20px;color:${MK.muted}">${esc(
    text,
  )}</td></tr>`;
}

/**
 * The body shared by the two recipient-facing enquiry mails — the lead notice and the
 * acquisition mail. Composes its rows and hands them to `mailShell`.
 */
function marketingShell(o: {
  preheader: string;
  pill: string;
  headline: string;
  introHtml: string;
  ctaLabel: string;
  href: string;
  /** The reassurance line under the first CTA. Different ask, different reassurance. */
  trustLine: string;
  lockedNote: string;
  cards: string;
  hidden: number;
  /** Only the acquisition mail carries these — an evergreen list reads as filler on a
   *  notice the recipient gets every day. */
  benefits?: string[];
  urgencyNote: string;
  /** Pre-escaped: callers build it from a name they have already escaped. */
  footerReason: string;
}): string {
  const benefitRows = (o.benefits ?? [])
    .map(
      (b, i, all) => `<tr>
        <td width="30" valign="top" style="width:30px">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td width="20" height="20" align="center" valign="middle" style="width:20px;height:20px;background-color:${MK.primarySoft};border-radius:100px;font-size:11px;line-height:11px;font-weight:bold;color:${MK.primary}">&#10003;</td></tr></table>
        </td>
        <td valign="top" style="${i === all.length - 1 ? "" : "padding-bottom:12px;"}font-size:15px;line-height:23px;color:${MK.body}">${esc(b)}</td>
      </tr>`,
    )
    .join("");

  const bodyRows = `${shellOpening(o.pill, o.headline, o.introHtml)}
${shellButton(o.ctaLabel, o.href)}
${shellTrustLine(o.trustLine)}
${shellRule.replace("padding:32px", "padding:34px")}

        <tr><td class="px" align="left" style="padding:28px 40px 0 40px;font-family:${MK_FONT}">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
            <td align="left" style="font-size:15px;line-height:22px;font-weight:bold;color:${MK.ink}">What they asked about</td>
            <td align="right" class="hide-sm" style="font-size:11px;line-height:14px;letter-spacing:0.6px;text-transform:uppercase;color:${MK.muted}">Locked</td>
          </tr></table>
          <div style="padding-top:5px;font-size:14px;line-height:22px;color:${MK.muted}">${esc(o.lockedNote)}</div>
        </td></tr>

${o.cards}
${
  o.hidden > 0
    ? `        <tr><td class="px" align="left" style="padding:14px 40px 0 40px;font-family:${MK_FONT};font-size:14px;line-height:22px;color:${MK.muted}">And ${
        o.hidden
      } more ${o.hidden === 1 ? "enquiry" : "enquiries"} waiting for you.</td></tr>`
    : ""
}
${shellRule}
${
  benefitRows
    ? `        <tr><td class="px" align="left" style="padding:28px 40px 0 40px;font-family:${MK_FONT}">
          <div style="font-size:15px;line-height:22px;font-weight:bold;color:${MK.ink}">Once you claim it, you can</div>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:16px">${benefitRows}</table>
        </td></tr>`
    : ""
}
        <tr><td class="px" align="left" style="padding:30px 40px 0 40px">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${MK.primarySoft};border-radius:12px"><tr>
            <td style="padding:18px 20px;font-family:${MK_FONT};font-size:15px;line-height:24px;color:${MK.primaryInk}">${esc(
              o.urgencyNote,
            )}</td>
          </tr></table>
        </td></tr>

${shellButton(o.ctaLabel, o.href).replace("padding:26px 40px 0 40px", "padding:22px 40px 0 40px")}

        <tr><td class="px" align="left" style="padding:14px 40px 38px 40px;font-family:${MK_FONT};font-size:14px;line-height:22px;color:${MK.muted}">
          Not the right person? Forward this to whoever handles admissions.
        </td></tr>`;

  return mailShell({
    title: esc(o.headline),
    preheader: o.preheader,
    eyebrow: "For education businesses",
    bodyRows,
    footerReason: o.footerReason,
  });
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
const LAUNCH_DATE_LABEL = new Date("2026-09-18T00:00:00+10:00").toLocaleDateString("en-US", {
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
