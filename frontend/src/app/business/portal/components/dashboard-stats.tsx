"use client";

import Link from "next/link";
import { Coins, Inbox, Package } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { BusinessDashboard } from "../apis/types";
import { formatCount, isCreditBalanceLow } from "../utils";

interface StatProps {
  icon: LucideIcon;
  label: string;
  value: number;
  hint: string;
  href: string;
  badge?: string;
}

function Stat({ icon: Icon, label, value, hint, href, badge }: StatProps) {
  return (
    <Link
      href={href}
      className="flex flex-col gap-2 rounded-xl border border-border bg-background p-4 transition-colors hover:bg-muted/50"
    >
      <div className="flex items-center justify-between">
        <Icon className="size-4 text-muted-foreground" />
        {badge ? <Badge variant="outline">{badge}</Badge> : null}
      </div>
      <p className="text-2xl font-semibold leading-tight">{formatCount(value)}</p>
      <div>
        <p className="text-sm font-medium">{label}</p>
        {/* Always rendered, so a zero always says what it means. */}
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
    </Link>
  );
}

export function DashboardStats({ data }: { data: BusinessDashboard }) {
  const { credits, enquiries, services } = data;

  return (
    // V1 showed a fourth "Views: 0" card with a hardcoded zero. There is no
    // profile-view counter in V3, so the card is omitted rather than faked.
    <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <Stat
        icon={Coins}
        label="Credits"
        value={credits.balance}
        hint={credits.balance === 0 ? "No credits — top up to unlock leads" : "Spendable balance"}
        href="/business/enquiries"
        badge={isCreditBalanceLow(credits.balance) ? "Low" : undefined}
      />
      <Stat
        icon={Inbox}
        label="Enquiries"
        value={enquiries.total}
        hint={
          enquiries.total === 0
            ? "No enquiries yet"
            : `${formatCount(enquiries.locked)} still locked`
        }
        href="/business/enquiries"
      />
      <Stat
        icon={Package}
        label="Services"
        value={services.total}
        hint={
          services.total === 0
            ? "No services yet"
            : `${formatCount(services.published)} published`
        }
        href="/business/profile"
      />
    </section>
  );
}
