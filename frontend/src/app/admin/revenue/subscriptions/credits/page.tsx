import { AdminPlaceholderView } from "../../../components/admin-placeholder-view";

const COLUMNS = [
  { key: "business", label: "Business" },
  { key: "type", label: "Type" },
  { key: "amount", label: "Amount" },
  { key: "balance", label: "Balance after" },
];

const ROWS = [
  { id: 1, business: "Global Study Institute", type: "Purchase", amount: "+500", balance: "1,240" },
  { id: 2, business: "Prime Education Group", type: "Manual adjustment", amount: "-50", balance: "310" },
];

export default function AdminCreditLedgerPage() {
  return (
    <AdminPlaceholderView
      title="Credit Ledger"
      description="Credit transaction ledger with manual adjustment history."
      columns={COLUMNS}
      rows={ROWS}
    />
  );
}
