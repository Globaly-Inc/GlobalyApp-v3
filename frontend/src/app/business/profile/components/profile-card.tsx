import type { LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * The business portal's section card — same props as the public site's ProfileSection (so a card
 * can swap one for the other), drawn on the standard `Card` (mockup C3): inline icon + title, count
 * pill and the Public/Hidden badge, the edit action in `CardAction`. ProfileSection stays as is
 * because ~20 public pages use it.
 *
 * `Card` carries `group/card` for callers that key header actions off it.
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
    <Card id={id} className="scroll-mt-24">
      <CardHeader>
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <CardTitle role="heading" aria-level={2} className="flex items-center gap-2">
            <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            {title}
          </CardTitle>
          {count != null && <Badge variant="secondary" className="tabular-nums">{count}</Badge>}
          {badge}
        </div>
        {action && <CardAction className="flex items-center gap-1.5">{action}</CardAction>}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}
