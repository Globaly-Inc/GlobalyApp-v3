import { CreditCard, Inbox, Package, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { StatCard } from "@/components/ui/stat-card";
import { formatNumber } from "@/lib/utils";

type SocialStatsProps = {
  enquiriesCount: number;
  servicesCount: number;
  creditBalance: number;
};

/** The business's headline numbers beside the feed: credit balance up top, then a 2×2 of counts. */
export function SocialStats({ enquiriesCount, servicesCount, creditBalance }: Readonly<SocialStatsProps>) {
  const stats = [
    { icon: Inbox, label: "Enquiries", value: enquiriesCount },
    { icon: Package, label: "Services", value: servicesCount },
    { icon: CreditCard, label: "Credits", value: creditBalance },
    { icon: TrendingUp, label: "Views", value: 0 },
  ];

  return (
    <div className="flex flex-col gap-4">
      <StatCard
        label="Credit balance"
        icon={CreditCard}
        value={formatNumber(creditBalance)}
        hint={creditBalance < 20 && <Badge variant="warning">Low</Badge>}
      />
      <div className="grid grid-cols-2 gap-4">
        {stats.map((s) => (
          <StatCard key={s.label} label={s.label} icon={s.icon} value={formatNumber(s.value)} />
        ))}
      </div>
    </div>
  );
}
