import { Suspense } from "react";
import { ChannelsView } from "./components/channels-view";

// useSearchParams (the return from Zernio's connect flow) needs a Suspense boundary.
export default function BusinessChannelsPage() {
  return (
    <Suspense fallback={null}>
      <ChannelsView />
    </Suspense>
  );
}
