import { Suspense } from "react";
import { JoinView } from "./components/join-view";

// useSearchParams needs a Suspense boundary in the App Router.
export default function JoinPage() {
  return (
    <Suspense fallback={null}>
      <JoinView />
    </Suspense>
  );
}
