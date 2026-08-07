import { AdminPlaceholderView } from "../../../components/admin-placeholder-view";

const COLUMNS = [
  { key: "referrer", label: "Referrer" },
  { key: "referred", label: "Referred" },
  { key: "reward", label: "Reward" },
  { key: "status", label: "Status" },
];

const ROWS = [
  { id: 1, referrer: "Global Study Institute", referred: "Sheridan College", reward: "$100 credit", status: "Paid" },
  { id: 2, referrer: "Prime Education Group", referred: "Torrens University", reward: "$100 credit", status: "Pending" },
];

export default function AdminReferralsPage() {
  return (
    <AdminPlaceholderView
      title="Referrals"
      description="Referral rewards — void or reverse rewards when needed."
      columns={COLUMNS}
      rows={ROWS}
    />
  );
}
