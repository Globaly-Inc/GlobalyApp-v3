import { AdminPlaceholderView } from "../../../components/admin-placeholder-view";

const COLUMNS = [
  { key: "student", label: "Student" },
  { key: "business", label: "Business" },
  { key: "amount", label: "Amount" },
  { key: "status", label: "Status" },
];

const ROWS = [
  { id: 1, student: "Aarav Sharma", business: "Global Study Institute", amount: "$25.00", status: "Charged" },
  { id: 2, student: "Mei Lin", business: "Prime Education Group", amount: "$25.00", status: "Waived" },
];

export default function AdminApplicationChargesPage() {
  return (
    <AdminPlaceholderView
      title="Application Charges"
      description="Per-application processing charges, including waived fees."
      columns={COLUMNS}
      rows={ROWS}
    />
  );
}
