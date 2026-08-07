import { AdminPlaceholderView } from "../../components/admin-placeholder-view";

const COLUMNS = [
  { key: "campaign", label: "Campaign" },
  { key: "business", label: "Business" },
  { key: "budget", label: "Budget" },
  { key: "status", label: "Status" },
];

const ROWS = [
  { id: 1, campaign: "Spring Intake Push", business: "Global Study Institute", budget: "$1,200", status: "Active" },
  { id: 2, campaign: "New Agent Launch", business: "Prime Education Group", budget: "$400", status: "Pending" },
];

export default function AdminAdsPage() {
  return (
    <AdminPlaceholderView
      title="Ads"
      description="Ad campaigns across businesses — pending review and active spend."
      columns={COLUMNS}
      rows={ROWS}
    />
  );
}
