import { MousePointerClick, Eye } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Combobox } from "@/components/combobox";
import { CAMPAIGN_STATUS_BADGE_VARIANT, CAMPAIGN_STATUS_LABEL, formatBudgetMinor } from "../const";
import type { Campaign, CampaignStatus } from "../apis/types";

const STATUS_OPTIONS = (["draft", "active", "paused", "completed"] as CampaignStatus[]).map((s) => ({
  value: s,
  label: CAMPAIGN_STATUS_LABEL[s],
}));

export function CampaignCard({
  campaign,
  onStatusChange,
  onDelete,
}: {
  campaign: Campaign;
  onStatusChange: (status: CampaignStatus) => void;
  onDelete: () => void;
}) {
  const ctr = campaign.impressions > 0 ? ((campaign.clicks / campaign.impressions) * 100).toFixed(2) : "0.00";

  return (
    <Card className="flex flex-col gap-3 p-5">
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-base font-semibold">{campaign.title}</h3>
        <Badge variant={CAMPAIGN_STATUS_BADGE_VARIANT[campaign.status]}>{CAMPAIGN_STATUS_LABEL[campaign.status]}</Badge>
      </div>

      {campaign.description && <p className="text-sm text-muted-foreground">{campaign.description}</p>}

      <p className="text-sm">
        <span className="font-medium">Budget:</span> {formatBudgetMinor(campaign.budget_minor, campaign.currency)}
      </p>

      <div className="flex gap-4 text-sm text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <Eye className="h-4 w-4" />
          {campaign.impressions.toLocaleString()} impressions
        </span>
        <span className="flex items-center gap-1.5">
          <MousePointerClick className="h-4 w-4" />
          {campaign.clicks.toLocaleString()} clicks · {ctr}% CTR
        </span>
      </div>

      <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
        <Combobox className="w-36" options={STATUS_OPTIONS} value={campaign.status} onChange={(v) => onStatusChange(v as CampaignStatus)} placeholder="Status" />
        <Button variant="outline" size="sm" onClick={onDelete}>
          Delete
        </Button>
      </div>
    </Card>
  );
}
