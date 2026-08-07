import { AdminPlaceholderView } from "../../../components/admin-placeholder-view";

const COLUMNS = [
  { key: "business", label: "Business" },
  { key: "plan", label: "Plan" },
  { key: "renews", label: "Renews" },
  { key: "status", label: "Status" },
];

const ROWS = [
  { id: 1, business: "Global Study Institute", plan: "Growth", renews: "2026-09-01", status: "Active" },
  { id: 2, business: "Prime Education Group", plan: "Scale", renews: "2026-08-20", status: "Trialing" },
];

export default function AdminSubscribersPage() {
  return (
    <AdminPlaceholderView
      title="Subscribers"
      description="Manage subscription grants, trials, and renewals per business."
      columns={COLUMNS}
      rows={ROWS}
    />
  );
}
