import type { LucideIcon } from "lucide-react";

export function EmptyTabPlaceholder({
  icon: Icon,
  title,
  subtitle,
}: Readonly<{ icon: LucideIcon; title: string; subtitle: string }>) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
      <Icon className="h-8 w-8 text-muted-foreground/50" />
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="text-sm text-muted-foreground">{subtitle}</p>
    </div>
  );
}
