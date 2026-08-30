"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import {
  fetchSessions,
  sendMessage,
  sendGuestMessage,
  migrateGuestSession,
  setActiveSession,
  addOptimisticUserMessage,
  GUEST_SESSION_ID,
} from "../store/ai-chat-slice";
import { ChatSidebar } from "./chat-sidebar";
import { ChatMessages } from "./chat-messages";
import { ChatInput } from "./chat-input";
import { SuggestedStarters } from "./suggested-starters";
import { CreditBanner } from "./credit-banner";
import { ProfileCompletionBanner } from "./profile-completion-banner";
import { CompareTray } from "@/app/(web)/search/components/compare-tray";
import { useAuthState } from "@/app/auth/store/auth-slice";
import { LoginPromptModal } from "./login-prompt-modal";

export function AiChatView({ initialQuery, redirectIfAuthenticated = false, fp }: Readonly<{ initialQuery?: string; redirectIfAuthenticated?: boolean; fp?: string }> = {}) {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const activeSessionId = useAppSelector((s) => s.aiChat.activeSessionId);
  const messages = useAppSelector((s) => (activeSessionId ? s.aiChat.messages[activeSessionId] ?? [] : []));
  const sendStatus = useAppSelector((s) => s.aiChat.sendStatus);
  const error = useAppSelector((s) => s.aiChat.error);
  const guestFingerprintHash = useAppSelector((s) => s.aiChat.guestFingerprintHash);
  const profile = useAppSelector((s) => s.profile.profile);
  const { user, initializing } = useAuthState();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [loginPromptDismissed, setLoginPromptDismissed] = useState(false);
  const [draft, setDraft] = useState(initialQuery ?? "");

  const guestFingerprint = useRef<string | null>(null);

  // Logged-in users on the public /ai page belong in the personal portal.
  useEffect(() => {
    if (redirectIfAuthenticated && !initializing && user) router.replace("/personal/ai");
  }, [redirectIfAuthenticated, initializing, user, router]);

  // Guard against double-fetch in React Strict Mode; skip for guests (no auth → 401).
  const fetchedRef = useRef(false);
  useEffect(() => {
    if (initializing || !user) return;
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    dispatch(fetchSessions());
    // Post-auth migration: if the URL carries a guest fingerprint hash, migrate the
    // transcript into the now-authenticated user's session history and open it.
    if (fp) {
      dispatch(migrateGuestSession(fp)).then((action) => {
        const sessionId = (action.payload as number | null);
        if (sessionId) dispatch(setActiveSession(sessionId));
      });
    }
  }, [dispatch, user, initializing, fp]);

  const handleSend = useCallback(
    (content: string, files?: File[]) => {
      const trimmed = content.trim();
      if (!trimmed || sendStatus === "loading") return;
      if (!user) {
        guestFingerprint.current ??= crypto.randomUUID();
        dispatch(sendGuestMessage({ content: trimmed, fingerprint: guestFingerprint.current }));
        setDraft("");
        return;
      }
      if (activeSessionId && activeSessionId !== GUEST_SESSION_ID) {
        dispatch(addOptimisticUserMessage({
          sessionId: activeSessionId,
          content: trimmed,
          attachments: files?.map((f) => f.name),
        }));
      }
      dispatch(sendMessage({ sessionId: activeSessionId, content: trimmed, files }));
      setDraft("");
    },
    [dispatch, activeSessionId, user, sendStatus],
  );

  const handleNewChat = useCallback(() => {
    dispatch(setActiveSession(null));
    setSidebarOpen(false);
  }, [dispatch]);

  const isChatting = messages.length > 0 || sendStatus === "loading";

  const hasCompletedAiResponse =
    sendStatus === "idle" && messages.some((m) => m.role === "assistant");
  // ponytail: guestBlocked is the single gate — disables input + drives modal visibility
  const guestBlocked = !initializing && !user && hasCompletedAiResponse;
  const showLoginPrompt = guestBlocked && !loginPromptDismissed;

  const sidebar = <ChatSidebar onNewChat={handleNewChat} />;

  const composer = (bare: boolean) => (
    <ChatInput
      value={draft}
      onChange={setDraft}
      onSend={handleSend}
      disabled={sendStatus === "loading" || guestBlocked}
      allowAttachments
      bare={bare}
    />
  );

  return (
    <div className={cn("flex h-[calc(100dvh-4rem)] overflow-hidden bg-background")}>
      {/* Sidebar — hidden only once we know for certain the visitor is a guest */}
      {(user || initializing) && <div className="hidden w-64 shrink-0 bg-muted/40 md:block">{sidebar}</div>}

      {/* Chat area */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile header — hamburger only for authenticated (or still-loading) users */}
        <div className="flex items-center gap-2 border-b p-2 md:hidden">
          {(user || initializing) && (
            <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
              <SheetTrigger>
                <Button variant="ghost" size="icon-sm" render={<span />}>
                  <Menu />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-72 p-0">
                <SheetTitle className="sr-only">Chat history</SheetTitle>
                {sidebar}
              </SheetContent>
            </Sheet>
          )}
          <span className="text-sm font-medium">AI Counsellor</span>
        </div>

        <CreditBanner />
        <ProfileCompletionBanner />

        {isChatting ? (
          <ChatMessages onChipClick={handleSend} />
        ) : (
          <div className="flex-1 overflow-y-auto">
            <SuggestedStarters onSelect={handleSend} name={profile?.first_name}>
              {composer(true)}
            </SuggestedStarters>
          </div>
        )}

        <CompareTray />
        {guestBlocked && loginPromptDismissed && (
          <button
            type="button"
            className="w-full border-t bg-primary/5 px-4 py-2 text-center text-sm text-primary hover:bg-primary/10"
            onClick={() => setLoginPromptDismissed(false)}
          >
            Sign in or create a free account to continue chatting →
          </button>
        )}
        {error && sendStatus === "failed" && (
          <p className="border-t bg-destructive/10 px-4 py-2 text-center text-sm text-destructive">
            {error}
          </p>
        )}
        {isChatting && composer(false)}
      </div>

      <LoginPromptModal
        open={showLoginPrompt}
        onOpenChange={(open) => { if (!open) setLoginPromptDismissed(true); }}
        fingerprintHash={guestFingerprintHash}
      />
    </div>
  );
}
