import { Suspense } from "react";
import { MessagesView } from "./components/messages-view";

// useSearchParams (the ?thread= deep link) needs a Suspense boundary in the App Router.
export default function BusinessMessagesPage() {
  return (
    <Suspense fallback={null}>
      <MessagesView />
    </Suspense>
  );
}
