import { AdminPlaceholderView } from "../../../components/admin-placeholder-view";

const COLUMNS = [
  { key: "code", label: "Code" },
  { key: "discount", label: "Discount" },
  { key: "redemptions", label: "Redemptions" },
  { key: "status", label: "Status" },
];

const ROWS = [
  { id: 1, code: "LAUNCH2026", discount: "20% off first 3 months", redemptions: "84", status: "Active" },
  { id: 2, code: "PARTNER50", discount: "$50 off", redemptions: "12", status: "Expired" },
];

export default function AdminSubscriptionCouponsPage() {
  return (
    <AdminPlaceholderView
      title="Coupons"
      description="Manage discount coupons for subscription plans."
      columns={COLUMNS}
      rows={ROWS}
    />
  );
}
