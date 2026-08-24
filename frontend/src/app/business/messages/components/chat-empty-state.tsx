"use client";

import { useSyncExternalStore } from "react";
import Image from "next/image";
import { MessageSquare } from "lucide-react";
import { useAppSelector } from "@/lib/hooks";

/**
 * "Have we hydrated yet?" — the documented `useSyncExternalStore` idiom: `false` on the
 * server and on the first client render (so the two agree), `true` afterwards.
 *
 * Needed because the greeting reads the profile out of Redux, which is EMPTY during SSR
 * and populated by the time the client renders — rendering the name straight away is a
 * genuine hydration mismatch. `@/app/personal/personal-shell` solves the same problem
 * with a `useEffect(() => setMounted(true))`, but that trips `react-hooks/set-state-in-effect`;
 * this shape needs no effect at all.
 *
 * The three callbacks are module-scope constants because `useSyncExternalStore`
 * re-subscribes whenever the subscribe function's identity changes.
 */
const subscribeNever = () => () => {};
const hydratedSnapshot = () => true;
const serverSnapshot = () => false;

/** The capability chips at the bottom of V2's empty state, mapped to what exists here. */
const CAPABILITIES = ["Search", "Unread", "Drafts", "Starred", "Favorites"];

/**
 * The welcome panel shown with nothing selected — GlobalyOS V2's `ChatEmptyState`: the
 * logo tile with the message-bubble overlay, a personalised greeting, a subtitle, and the
 * capability chips.
 *
 * V2's six action cards are deliberately NOT reproduced: five of them create things that
 * do not exist here, and search already lives in the sidebar. What replaces them is the
 * one sentence that answers "why is this empty" — on this side, a conversation appears
 * once THIS business unlocks a lead, which is the opposite direction from the student's.
 *
 * Greeted by business name rather than first name: the business shell identifies the
 * viewer by their org (business_name/logo_url), and carries no agent first name.
 */
export function ChatEmptyState({ threadCount }: Readonly<{ threadCount: number }>) {
  const hydrated = useSyncExternalStore(subscribeNever, hydratedSnapshot, serverSnapshot);
  const businessName = useAppSelector((s) => s.businessOnboarding.profile?.business_name);
  // Withheld until hydrated so the first client render matches the server's HTML.
  const name = hydrated ? businessName : undefined;

  return (
    <div className="flex h-full flex-col items-center justify-center px-4 py-8">
      <div className="relative mb-6">
        <div className="flex size-20 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/20 via-primary/10 to-primary/5 shadow-lg">
          <Image src="/globaly-red-icon.png" alt="Globaly" width={283} height={283} className="size-12 rounded-lg" />
        </div>
        <div className="absolute -bottom-2 -right-2 flex size-8 items-center justify-center rounded-full bg-primary/20">
          <MessageSquare className="size-4 text-primary" aria-hidden />
        </div>
      </div>

      <h1 className="mb-2 text-center text-2xl font-bold">
        {name ? `${name} — Messages` : "Messages"}
      </h1>
      <p className="text-center text-muted-foreground">Your conversations with students who enquired</p>

      <div className="mt-8 flex flex-wrap justify-center gap-2">
        {CAPABILITIES.map((capability) => (
          <span key={capability} className="rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">
            {capability}
          </span>
        ))}
      </div>

      <p className="mt-6 max-w-md text-center text-xs text-muted-foreground">
        {threadCount > 0
          ? "Pick a conversation from the list to get started."
          : "A conversation opens as soon as you unlock an enquiry. Unlock one from the Enquiries inbox and it appears here."}
      </p>
    </div>
  );
}
