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
  /** Tinted navy, for the acquisition mail's hero count block. */
  soft: "#E8EEFB",
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

/**
 * How many enquiries a summary actually lists; the rest are counted, not printed.
 *
 * Shared by the lead notice and the acquisition mail, so the two cannot disagree about how long
 * a mail gets. Three cards plus a count reads as a prompt to open the inbox; a longer stack
 * starts to read as the inbox itself, which is the thing the CTA is for.
 */
const DIGEST_PREVIEW = 3;

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

/** The grey of a redaction bar. Cool, so it reads as a deliberate block rather than a stain. */
const REDACT_BG = "#D7DBE0";
/** Rough rendered width of one &nbsp; at the 12px these bars use — the unit the bars are built from. */
const NBSP_PX = 2.6;

/**
 * A redaction bar, matching the `<Redacted />` placeholder on the inbox card.
 *
 * Width is carried by non-breaking spaces rather than a CSS width: Outlook's Word engine ignores
 * width on an inline span, and a bar that collapses in one client is worse than one that is a few
 * pixels off everywhere. The text colour is set to the background so the spaces stay invisible
 * even where the background paints and the radius does not. Nothing here derives from real data —
 * there is no hidden value to reveal.
 */
const redacted = (px: number) =>
  `<span style="border-radius:3px;background-color:${REDACT_BG};color:${REDACT_BG};font-size:12px">${"&nbsp;".repeat(
    Math.round(px / NBSP_PX),
  )}</span>`;

/**
 * How wide one student's bar should be.
 *
 * Constant-width bars down a list read as a template placeholder rather than as withheld
 * information — real surnames and addresses are not all the same length. Seeded off the first name
 * so a given student's bar is stable across mails, and so the two bars on one card do not come out
 * identical.
 */
function redactionWidth(seed: string | null | undefined, base: number, salt = 0): number {
  // Position-weighted, and salted per bar: a plain character sum makes the two bars on one card
  // move together, which is its own kind of obviously-generated.
  const sum = [...(seed ?? "?")].reduce((acc, ch, i) => acc + ch.charCodeAt(0) * (i + 1), salt);
  return base + (sum % 7) * 6;
}

/** One enquiry, as the recipient sees it before paying to unlock. */
function enquiryCard(item: DigestItem): string {
  const first = item.studentFirstName?.trim();
  return infoCard({
    initial: first ? esc(first[0].toUpperCase()) : "&#8226;",
    titleHtml: `${first ? `${esc(first)} ` : ""}${redacted(redactionWidth(first, 62))}`,
    subtitleHtml: `${redacted(redactionWidth(first, 94, 37))}@gmail.com`,
    title: item.courseName ?? "Course enquiry",
    // Institution and intake share one muted line: two facts, one row, rather than two thin lines
    // that make every card taller than the thing it describes.
    metaParts: [item.institutionName, item.intake && `Intake ${item.intake}`],
  });
}

/**
 * The stack of enquiry cards.
 *
 * Separate bordered cards with real gaps between them, not one table split by hairlines: at six
 * enquiries the hairline version reads as a single dense block.
 *
 * A card with no course still renders — dropping it would silently lose an enquiry from a mail
 * whose whole promise is that nothing is missed.
 */
function listBlock(items: DigestItem[]): string {
  if (items.length === 0) return "";
  const rows = items
    .map((item, i) => `<tr><td style="padding-top:${i === 0 ? 0 : 8}px">${enquiryCard(item)}</td></tr>`)
    .join("");
  return `<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="width:100%">${rows}</table>`;
}

/**
 * The hero number. A count stated in a sentence gets skimmed past; the whole point of the
 * acquisition mail is that the recipient registers "there are N of these waiting" before deciding
 * whether to read on, so it gets its own block.
 *
 * Solid background rather than a gradient or an image — both are stripped or mangled by Outlook,
 * and a tinted cell renders identically everywhere.
 */
function countBlock(count: number, label: string): string {
  return `<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="width:100%;border-radius:12px;background-color:${BRAND.soft}">
    <tr>
      <td align="center" style="padding:20px 16px">
        <p style="margin:0;color:${BRAND.primary};font-family:${HEADING_FONT};font-size:36px;line-height:40px;font-weight:700">${count}</p>
        <p style="margin:6px 0 0;color:${BRAND.muted};font-size:13px;line-height:18px;text-transform:uppercase;letter-spacing:0.06em">${esc(
          label,
        )}</p>
      </td>
    </tr>
  </table>`;
}

/**
 * The "what claiming gets you" list. A table rather than a <ul>: Outlook's Word engine applies its
 * own indentation to list markup and the bullets land somewhere the padding did not put them,
 * while a two-cell row lands identically in every client.
 */
function benefitList(items: string[]): string {
  const rows = items
    .map(
      (item) =>
        `<tr>
           <td width="18" valign="top" style="width:18px;color:${BRAND.primary};font-size:14px;line-height:21px">&#10003;</td>
           <td valign="top" style="color:${BRAND.body};font-size:14px;line-height:21px;padding-bottom:6px">${esc(item)}</td>
         </tr>`,
    )
    .join("");
  return `<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="width:100%">${rows}</table>`;
}

/**
 * Sent to the STUDENT the moment a business or institution unlocks their enquiry — the only
 * notification in this module that goes to the person who sent the enquiry rather than to a
 * recipient of it.
 *
 * On the same centred `emailLayout` card as the lead notice and the acquisition mail, and using
 * the same `infoCard` the enquiry lists use. All three enquiry mails are one design; this is the
 * student's side of the identical event and had been reading like a different product.
 *
 * `messagePreview` is the first line of the actual thread — today always the templated unlock
 * greeting, which is still honest ("here is the message waiting for you") and makes the mail
 * concrete rather than abstract. Truncated, because the point is to get them into the app.
 *
 * The headline names the UNLOCKER, never `institutionName`. An agency that represents Cornell is
 * not Cornell, and "Cornell University wants to talk to you" over a message from an agency would
 * be a lie the student acts on.
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

  const lead = `${who} unlocked your enquiry${
    courseName ? ` about ${courseName}` : ""
  } and sent you a message. That means a real person on the admissions side is reading about you right now.`;

  const textLines = [
    lead,
    "",
    clipped ? `"${clipped}"` : null,
    clipped ? "" : null,
    contactLine,
    "",
    `Read & reply → ${href}`,
  ].filter((l) => l !== null);

  return {
    subject: courseName ? `${who} replied about ${courseName}` : `${who} unlocked your enquiry`,
    text: textLines.join("\n"),
    html: emailLayout({
      size: "wide",
      align: "left",
      heading: `${esc(who)} wants to talk to you`,
      body: `<p style="margin:0 0 18px;color:${BRAND.muted};font-size:15px;line-height:23px">
               <strong style="color:${BRAND.ink}">${esc(who)}</strong> unlocked your enquiry${
                 courseName ? ` about <strong style="color:${BRAND.ink}">${esc(courseName)}</strong>` : ""
               } and sent you a message. That means a real person on the admissions side is reading about you right now.
             </p>
             <p style="margin:22px 0 10px;color:${BRAND.ink};font-size:14px;line-height:20px;font-weight:600">The message waiting for you</p>
             ${infoCard({
               // The unlocker is the identity here, and nothing is redacted: the student knows
               // their own details, and who unlocked it was never the paid-for part.
               initial: esc(who[0].toUpperCase()),
               titleHtml: esc(who),
               subtitleHtml: institutionName
                 ? `Unlocked your enquiry &nbsp;&middot;&nbsp; ${esc(institutionName)}`
                 : "Unlocked your enquiry",
               title: courseName ?? "Your enquiry",
             })}
             ${
               clipped
                 ? `<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="width:100%;margin-top:8px">
                      <tr><td style="border-left:3px solid ${BRAND.line};padding:2px 0 2px 14px;color:${BRAND.body};font-size:15px;line-height:24px">&ldquo;${esc(
                        clipped,
                      )}&rdquo;</td></tr>
                    </table>`
                 : ""
             }
             <p style="margin:22px 0 0;color:${BRAND.muted};font-size:14px;line-height:21px">${esc(contactLine)}</p>`,
      cta: { label: "Read & reply", href },
      footnote: "You're receiving this because you sent this enquiry on Globaly.",
    }),
  };
}

/**
 * The lead notice a CLAIMED recipient gets — a business whose profile someone has taken
 * ownership of, or an institution the enquiry fell back to.
 *
 * Same shape as `enquiryClaimEmail` beside it, on the same centred `emailLayout` card: the hero
 * count, the enquiry cards, the single CTA. The two mails are one product speaking to the same
 * person at two moments and they read as one thing.
 *
 * What differs is the ask and the tail. The acquisition mail asks for a claim and spends its
 * closing block explaining what claiming gets them; this asks them to open the inbox they already
 * have, so its tail is one line about the unlock. An evergreen benefits list is right on the mail
 * that converts once and reads as filler on the tenth daily send.
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
  const enquiryWord = one ? "enquiry" : "enquiries";
  const period = windowMinutes === 1 ? "minute" : `${windowMinutes} minutes`;

  const shown = items.slice(0, DIGEST_PREVIEW);
  const hidden = total - shown.length;
  const who = recipientName?.trim();
  const course = one ? shown[0]?.courseName : null;

  // Straight to the enquiry when the window held exactly one — opening it should be one tap,
  // not a hunt through the inbox. Older queued rows have no distribution_id and fall back.
  const deepLink = one && !!distributionId;
  const cta = {
    label: deepLink ? "Open this enquiry" : "Open your inbox",
    href: deepLink ? web(`/business/enquiries/${distributionId}/student`) : web("/business/enquiries"),
  };

  const heading = institution
    ? "Students are looking for your institution 🎓"
    : "Your business is getting noticed 🎓";

  const lead = institution
    ? `We received ${total} student ${enquiryWord} in the last ${period} about programs offered by your institution, and no agent representing ${
        one ? "it" : "them"
      } was available.`
    : `We received ${total} student ${enquiryWord} in the last ${period} about courses your business represents.`;

  const more =
    hidden > 0
      ? `Showing the ${shown.length} most recent. ${hidden} more ${hidden === 1 ? "is" : "are"} waiting for you.`
      : null;

  const closing = `Unlock ${one ? "the enquiry" : "an enquiry"} to see the student's full details and start the conversation.`;

  const textLines = [
    lead,
    "",
    `${total} new student ${enquiryWord}`,
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
    closing,
    "",
    `${cta.label} → ${cta.href}`,
  ].filter((l) => l !== null);

  return {
    subject: one
      ? course
        ? `A student is asking about ${course}`
        : `A student is asking about ${asked}`
      : `${total} students are asking about ${asked}`,
    text: textLines.join("\n"),
    html: emailLayout({
      size: "wide",
      align: "left",
      heading,
      body: `<p style="margin:0 0 18px;color:${BRAND.muted};font-size:15px;line-height:23px">${esc(lead)}</p>
             ${countBlock(total, `new student ${enquiryWord}`)}
             <p style="margin:22px 0 10px;color:${BRAND.ink};font-size:14px;line-height:20px;font-weight:600">What students are asking about</p>
             ${listBlock(shown)}
             ${
               more
                 ? `<p style="margin:12px 0 0;color:${BRAND.muted};font-size:14px;line-height:21px">${esc(more)}</p>`
                 : ""
             }
             <p style="margin:22px 0 0;color:${BRAND.muted};font-size:14px;line-height:21px">${esc(closing)}</p>`,
      cta,
      footnote: institution
        ? who
          ? `Sent to ${esc(who)} because these enquiries are about courses listed under it.`
          : "You're receiving this because these enquiries are about courses listed under your institution."
        : who
          ? `Sent to ${esc(who)} because these enquiries match courses it represents.`
          : "You're receiving this because these enquiries match courses you represent.",
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
 * On the same centred `emailLayout` card as the lead notice and the student's unlock mail. All
 * three enquiry mails are one design; what separates them is the ask, not the frame.
 *
 * One function for both recipient kinds: the mail is the same, differing in the noun and the CTA
 * label. Keeping them together is what stops the two drifting into different designs.
 *
 * Pre-unlock boundary is unchanged: a first name and a redaction bar, never a surname, address or
 * phone. Claiming is what buys the details; reading the email must not be a way around that.
 *
 * `items.length` IS the count in the hero block — the caller passes every enquiry the mail
 * accounts for, and only the first DIGEST_PREVIEW are printed.
 */
export function enquiryClaimEmail(options: {
  kind: "business" | "institution";
  /** The listing's own name, for the sentence that says why this arrived. */
  recipientName?: string | null;
  items: DigestItem[];
  /** Minted per send by the caller; falls back to the portal so a missing token is not a dead button. */
  claimUrl?: string | null;
  /** Length of the collection window, so the mail can say over what period these arrived. */
  windowMinutes?: number;
}): { subject: string; html: string; text: string } {
  const { kind, recipientName, items, claimUrl, windowMinutes = 5 } = options;
  const noun = kind === "institution" ? "institution" : "business";
  const total = items.length;
  const one = total === 1;
  const plural = one ? "student is" : "students are";
  const enquiryWord = one ? "enquiry" : "enquiries";
  const period = windowMinutes === 1 ? "minute" : `${windowMinutes} minutes`;

  const shown = items.slice(0, DIGEST_PREVIEW);
  const hidden = total - shown.length;
  const who = recipientName?.trim();

  const heading =
    kind === "institution" ? "Students are looking for your institution 🎓" : "Your business is getting noticed 🎓";

  const lead =
    kind === "institution"
      ? `We received ${total} student ${enquiryWord} in the last ${period} about programs offered by your institution.`
      : `We received ${total} student ${enquiryWord} in the last ${period} about courses your business represents.`;

  // Named benefits, not "manage your account": the recipient has no account yet, so the mail has
  // to say what claiming actually gets them.
  const benefits = [
    "View and manage every enquiry in one inbox",
    "Connect directly with students who are already interested",
    `Keep your ${noun} details, courses and contact information up to date`,
  ];

  const cta = {
    label: kind === "institution" ? "Claim your institution" : "Claim your business",
    href: claimUrl || web("/business/enquiries"),
  };

  const more =
    hidden > 0
      ? `Showing the ${shown.length} most recent. ${hidden} more ${hidden === 1 ? "is" : "are"} waiting for you.`
      : null;

  const textLines = [
    lead,
    "",
    `${total} new student ${enquiryWord}`,
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
    `Your ${noun} profile on Globaly is currently unclaimed. Claim it to:`,
    ...benefits.map((b) => `• ${b}`),
    "",
    `${cta.label} → ${cta.href}`,
  ].filter((l) => l !== null);

  return {
    subject: `${total} ${plural} interested in your ${noun} — claim your profile`,
    text: textLines.join("\n"),
    html: emailLayout({
      size: "wide",
      align: "left",
      heading,
      body: `<p style="margin:0 0 18px;color:${BRAND.muted};font-size:15px;line-height:23px">${esc(lead)}</p>
             ${countBlock(total, `new student ${enquiryWord}`)}
             <p style="margin:22px 0 10px;color:${BRAND.ink};font-size:14px;line-height:20px;font-weight:600">What students are asking about</p>
             ${listBlock(shown)}
             ${
               more
                 ? `<p style="margin:12px 0 0;color:${BRAND.muted};font-size:14px;line-height:21px">${esc(more)}</p>`
                 : ""
             }
             <p style="margin:22px 0 10px;color:${BRAND.ink};font-size:14px;line-height:20px;font-weight:600">Your ${noun} profile is not claimed yet</p>
             <p style="margin:0 0 12px;color:${BRAND.muted};font-size:14px;line-height:21px">Claim it — it is free and takes a minute — to:</p>
             ${benefitList(benefits)}`,
      cta,
      footnote: who
        ? `Sent to ${esc(who)} because these students enquired about courses it offers.`
        : `You're receiving this because students enquired about courses your ${noun} offers on Globaly.`,
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
