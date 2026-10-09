import type { LucideIcon } from "lucide-react";

/**
 * The business portal's section card — same props as the public site's ProfileSection (so a card
 * can swap one for the other), but with the portal's redesigned header: tinted icon tile, count
 * pill, and a soft lift on hover. ProfileSection stays as is because ~20 public pages use it.
 *
 * `group/card` is kept for callers that fade header actions in on hover.
 */
export function ProfileCard({
  icon: Icon, title, count, badge, action, children, id,
}: Readonly<{
  icon: LucideIcon;
  title: string;
  count?: number;
  /** Inline after the title/count — the Public/Hidden pill. */
  badge?: React.ReactNode;
  /** Right-aligned header controls — the edit pencil, "Add media", and the like. */
  action?: React.ReactNode;
  children: React.ReactNode;
  /** Anchor for "jump to this card" links (the publish bar's to-do chips). */
  id?: string;
}>) {
  return (
    <section
      id={id}
      className="group/card scroll-mt-24 overflow-hidden rounded-2xl border bg-card text-card-foreground transition-[box-shadow,border-color] duration-300 hover:border-primary/20 hover:shadow-[0_12px_32px_-16px_color-mix(in_oklab,var(--color-primary)_35%,transparent)]"
    >
      <div className="flex flex-wrap items-center gap-2.5 border-b px-4 py-3.5 sm:px-5">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="size-4" />
        </span>
        <h2 className="font-sans text-sm font-bold tracking-normal text-foreground">{title}</h2>
        {count != null && <span className="rounded-full bg-primary/10 px-2 py-0.5 font-mono text-[11px] tabular-nums text-primary">{count}</span>}
        {badge}
        {action && <div className="ml-auto flex shrink-0 items-center gap-1.5">{action}</div>}
      </div>
      <div className="p-4 sm:p-5">{children}</div>
    </section>
  );
}
