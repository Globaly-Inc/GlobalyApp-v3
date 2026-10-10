import { SOCIAL_ICON_PATHS } from "../const/index";

export type SocialName =
  | "facebook" | "twitter" | "linkedin" | "instagram" | "youtube"
  | "tiktok" | "whatsapp" | "threads" | "messenger" | "telegram" | "line" | "viber";

const HOST_TO_SOCIAL: [RegExp, SocialName][] = [
  [/(^|\.)facebook\.com$|(^|\.)fb\.com$/, "facebook"], [/(^|\.)(twitter|x)\.com$/, "twitter"],
  [/(^|\.)linkedin\.com$/, "linkedin"], [/(^|\.)instagram\.com$/, "instagram"],
  [/(^|\.)(youtube\.com|youtu\.be)$/, "youtube"], [/(^|\.)tiktok\.com$/, "tiktok"],
  [/(^|\.)(wa\.me|whatsapp\.com)$/, "whatsapp"], [/(^|\.)threads\.(net|com)$/, "threads"],
  [/(^|\.)(m\.me|messenger\.com)$/, "messenger"], [/(^|\.)(t\.me|telegram\.(me|org))$/, "telegram"],
  [/(^|\.)line\.me$/, "line"], [/(^|\.)viber\.com$/, "viber"],
];

/** The icon for a link by its host, or null for a platform with no icon here (Weibo, Medium…). */
export function socialNameForUrl(url: string): SocialName | null {
  let host: string;
  try {
    host = new URL(url.includes("://") ? url : `https://${url}`).hostname.toLowerCase();
  } catch {
    return null;
  }
  return HOST_TO_SOCIAL.find(([re]) => re.test(host))?.[1] ?? null;
}

export function SocialIcon({ name, className }: Readonly<{ name: SocialName; className?: string }>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d={SOCIAL_ICON_PATHS[name]} />
    </svg>
  );
}
