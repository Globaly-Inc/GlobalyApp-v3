import { SOCIAL_ICON_PATHS } from "../const/index";

export type SocialName = "facebook" | "twitter" | "linkedin" | "instagram" | "youtube";

export function SocialIcon({ name, className }: Readonly<{ name: SocialName; className?: string }>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d={SOCIAL_ICON_PATHS[name]} />
    </svg>
  );
}
