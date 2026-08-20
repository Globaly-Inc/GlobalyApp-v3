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

const logoUrl = () => `${config.WEB_APP_URL.replace(/\/$/, "")}/globaly-icon.png`;

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
  const firstName = esc(name.trim().split(/\s+/)[0] || name);
  const typeLabel = REGISTRANT_TYPE_LABELS[registrantType] ?? "Other";

  return {
    subject: "You're on the Globaly waitlist ✨",
    text: `You're on the list, ${name}. Thanks for registering your interest in Globaly's AI Education Discovery agents. We launch ${LAUNCH_DATE_LABEL} — we'll email you the moment it's ready to explore. Registered as: ${typeLabel}.`,
    html: emailLayout({
      heading: "You're on the list",
      body: `<p style="margin:0 0 12px">Thanks for registering your interest, ${firstName}.</p>
             <p style="margin:0 0 12px">We're building something new to help you find the right courses,
             institutions and pathways — and we'll email you the moment it's ready to explore.</p>
             <p style="margin:0 0 12px;color:${BRAND.muted}">Launching <strong>${LAUNCH_DATE_LABEL}</strong>.</p>
             <p style="margin:0;color:${BRAND.muted}">Registered as: <strong>${esc(typeLabel)}</strong></p>`,
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
