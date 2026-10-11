"use client";

import type { LucideIcon } from "lucide-react";
import { EmptyState as UiEmptyState } from "@/components/ui/empty-state";
import { ListSkeleton as UiListSkeleton } from "@/components/ui/list-skeleton";

/** The knowledge tabs' loading placeholder — the shared `ListSkeleton` at their row height. */
export function ListSkeleton({ rows = 4 }: Readonly<{ rows?: number }>) {
  return <UiListSkeleton count={rows} itemClassName="h-16 rounded-lg" />;
}

/** The knowledge tabs' zero-data state — the shared `EmptyState`, keeping the tabs' `hint` prop. */
export function EmptyState({
  icon, title, hint,
}: Readonly<{ icon: LucideIcon; title: string; hint?: string }>) {
  return <UiEmptyState icon={icon} title={title} description={hint} />;
}
