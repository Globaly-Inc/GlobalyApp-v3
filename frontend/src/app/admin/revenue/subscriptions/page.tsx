import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const STATS = [
  { label: "Active subscriptions", value: "—" },
  { label: "MRR", value: "—" },
  { label: "Trials in progress", value: "—" },
  { label: "Churned (30d)", value: "—" },
];

export default function AdminSubscriptionsOverviewPage() {
  return (
    <div>
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-foreground">Subscriptions</h1>
        <p className="text-muted-foreground mt-1">Revenue overview across plans, credits, and referrals.</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {STATS.map((stat) => (
          <Card key={stat.label}>
            <CardHeader className="pb-1">
              <CardTitle className="text-sm font-medium text-muted-foreground">{stat.label}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-foreground">{stat.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
