export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Comma, semicolon, space or newline — people paste addresses out of whatever they copied them
 *  from, and a pasted "a@x.com, b@x.com" should not be read as one broken address.
 *  Deduped and lower-cased, matching what the backend stores. */
export function parseEmails(raw: string): { valid: string[]; invalid: string[] } {
  const seen = new Set<string>();
  const valid: string[] = [];
  const invalid: string[] = [];
  for (const part of raw.split(/[,;\s]+/)) {
    const email = part.trim().toLowerCase();
    if (!email || seen.has(email)) continue;
    seen.add(email);
    (EMAIL_RE.test(email) ? valid : invalid).push(email);
  }
  return { valid, invalid };
}

/** "4 minutes ago" for the crawl header. A crawl runs in minutes, so minutes and hours cover it. */
export function startedAgo(iso: string): string {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  return Math.abs(minutes) < 60 ? rtf.format(-minutes, "minute") : rtf.format(-Math.round(minutes / 60), "hour");
}
