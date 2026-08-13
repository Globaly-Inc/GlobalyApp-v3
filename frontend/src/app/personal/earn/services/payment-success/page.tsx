import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import { PaymentSuccessView } from "../components/payment-success-view";

// useSearchParams needs a Suspense boundary during prerender.
export default function PaymentSuccessPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[50vh] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      }
    >
      <PaymentSuccessView />
    </Suspense>
  );
}
