import { Suspense } from "react";
import { ProfileView } from "./profile-view";

// useSearchParams() inside ProfileView (for ?preview=1) requires a Suspense boundary — without
// one, Next can bail the tree out of the client-render it already did and remount it, which
// resets useAuthState()'s local `mounted` flag and briefly re-trips ProfileView's
// `!profile || initializing` gate, blanking the page to a spinner for a moment.
export default function ProfilePage() {
  return (
    <Suspense fallback={null}>
      <ProfileView />
    </Suspense>
  );
}
