import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function FeatureUsagePanel() {
  return (
    <Card className="mt-4">
      <CardHeader>
        <CardTitle className="text-base">Feature usage</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          Week-over-week usage trends will appear here once the analytics endpoint is wired up.
        </p>
      </CardContent>
    </Card>
  );
}
