import { AdminPlaceholderView } from "../../../components/admin-placeholder-view";

const COLUMNS = [
  { key: "name", label: "Plan" },
  { key: "price", label: "Price" },
  { key: "subscribers", label: "Subscribers" },
  { key: "status", label: "Status" },
];

const ROWS = [
  { id: 1, name: "Starter", price: "$0/mo", subscribers: "1,204", status: "Active" },
  { id: 2, name: "Growth", price: "$49/mo", subscribers: "312", status: "Active" },
  { id: 3, name: "Scale", price: "$149/mo", subscribers: "48", status: "Active" },
];

export default function AdminSubscriptionPlansPage() {
  return (
    <AdminPlaceholderView
      title="Plans & Pricing"
      description="Manage subscription plans, pricing tiers, and included features."
      columns={COLUMNS}
      rows={ROWS}
    />
  );
}
