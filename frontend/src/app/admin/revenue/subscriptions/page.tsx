import { CreditCard } from "lucide-react";
import { PageBody } from "@/components/ui/page-body";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";

const STATS = [
  { label: "Active subscriptions", value: "—" },
  { label: "MRR", value: "—" },
  { label: "Trials in progress", value: "—" },
  { label: "Churned (30d)", value: "—" },
];

export default function AdminSubscriptionsOverviewPage() {
  return (
    <PageBody>
      <PageHeader title={<><CreditCard /> Subscriptions</>} subtitle="Revenue overview across plans, credits, and referrals." />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {STATS.map((stat) => (
          <StatCard key={stat.label} label={stat.label} value={stat.value} />
        ))}
      </div>
    </PageBody>
  );
}
