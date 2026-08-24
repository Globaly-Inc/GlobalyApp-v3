import { Coins } from "lucide-react";
import { ComingSoon } from "@/components/coming-soon";

export default function CreditsPage() {
  return (
    <ComingSoon
      title="Credits"
      icon={Coins}
      description="Credits power AI counselling and premium services. This is where you'll top up and track them."
      features={[
        "See your balance and usage history",
        "Top up in a few taps",
        "Earn credits through referrals",
        "Download receipts and invoices",
      ]}
    />
  );
}
