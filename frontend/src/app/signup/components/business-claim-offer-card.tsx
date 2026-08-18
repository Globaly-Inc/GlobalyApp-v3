import { Building2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export function BusinessClaimOfferCard({
  message,
  claimRequestSent,
  loading,
  onYes,
  onNo,
}: Readonly<{
  message: string;
  claimRequestSent: boolean;
  loading: boolean;
  onYes: () => void;
  onNo: () => void;
}>) {
  return (
    <div className="space-y-5">
      <div className="flex justify-center">
        <Building2 className="h-10 w-10 text-primary" />
      </div>
      {!claimRequestSent ? (
        <>
          <p className="text-sm text-center text-muted-foreground">{message}</p>
          <div className="flex gap-2">
            <Button type="button" className="h-10 flex-1 cursor-pointer" onClick={onYes} disabled={loading}>
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Yes, claim it
            </Button>
            <Button type="button" variant="outline" className="h-10 flex-1 cursor-pointer" onClick={onNo}>
              No, use another email
            </Button>
          </div>
        </>
      ) : (
        <p className="text-sm text-center text-muted-foreground">
          Click the link in that email to claim the business and sign in.
        </p>
      )}
    </div>
  );
}
