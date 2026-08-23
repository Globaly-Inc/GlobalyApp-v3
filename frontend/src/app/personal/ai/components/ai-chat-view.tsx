"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import {
  fetchSessions,
  fetchMessages,
  sendMessage,
  setActiveSession,
  addOptimisticUserMessage,
} from "../store/ai-chat-slice";
import { ChatSidebar } from "./chat-sidebar";
import { ChatMessages } from "./chat-messages";
import { ChatInput } from "./chat-input";
import { SuggestedStarters } from "./suggested-starters";
import { CreditBanner } from "./credit-banner";
import { ProfileCompletionBanner } from "./profile-completion-banner";
import { CompareTray } from "@/app/(web)/search/components/compare-tray";

export function AiChatView() {
  const dispatch = useAppDispatch();
  const activeSessionId = useAppSelector((s) => s.aiChat.activeSessionId);
  const messages = useAppSelector((s) => (activeSessionId ? s.aiChat.messages[activeSessionId] ?? [] : []));
  const sendStatus = useAppSelector((s) => s.aiChat.sendStatus);
  const error = useAppSelector((s) => s.aiChat.error);
  // PersonalShell already fetches this — the hero just greets with whatever's in the store.
  const profile = useAppSelector((s) => s.profile.profile);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [draft, setDraft] = useState("");

  // Guard against double-fetch in React Strict Mode
  const fetchedRef = useRef(false);
  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    dispatch(fetchSessions());
  }, [dispatch]);

  const handleSend = useCallback(
    (content: string, files?: File[]) => {
      if (activeSessionId) {
        dispatch(addOptimisticUserMessage({
          sessionId: activeSessionId,
          content,
          attachments: files?.map((f) => f.name),
        }));
      }
      dispatch(sendMessage({ sessionId: activeSessionId, content, files }));
      setDraft("");
    },
    [dispatch, activeSessionId],
  );

  const handleNewChat = useCallback(() => {
    dispatch(setActiveSession(null));
    setSidebarOpen(false);
  }, [dispatch]);

  // Suggestions (starters and follow-up chips) fill the box instead of sending straight away, so
  // the user can tweak the wording before committing to it.
  const handleSuggestion = useCallback((text: string) => setDraft(text), []);

  const isChatting = messages.length > 0 || sendStatus === "loading";

  const sidebar = <ChatSidebar onNewChat={handleNewChat} />;

  // Same composer in both slots — only its chrome differs (docked to the bottom vs floating in the hero).
  const composer = (bare: boolean) => (
    <ChatInput
      value={draft}
      onChange={setDraft}
      onSend={handleSend}
      disabled={sendStatus === "loading"}
      allowAttachments
      bare={bare}
    />
  );

  return (
    // Full-bleed under the shell header (PersonalShell drops its content column for this route),
    // so the only chrome left to subtract is that 4rem header plus, on mobile, the fixed bottom
    // nav. dvh so collapsing mobile browser chrome doesn't reintroduce a gap.
    <div className="flex h-[calc(100dvh-8rem)] overflow-hidden bg-background md:h-[calc(100dvh-4rem)]">
      {/* Desktop sidebar */}
      <div className="hidden w-64 shrink-0 bg-muted/40 md:block">{sidebar}</div>

      {/* Chat area */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile header with sheet trigger */}
        <div className="flex items-center gap-2 border-b p-2 md:hidden">
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
          <span className="text-sm font-medium">AI Counsellor</span>
        </div>

        <CreditBanner />
        <ProfileCompletionBanner />

        {/* Messages, or the empty-state hero. The composer only docks to the bottom once a
            conversation exists — before that it sits inside the hero, under the greeting. */}
        {isChatting ? (
          <ChatMessages onChipClick={handleSuggestion} />
        ) : (
          <div className="flex-1 overflow-y-auto">
            <SuggestedStarters onSelect={handleSuggestion} name={profile?.first_name}>
              {composer(true)}
            </SuggestedStarters>
          </div>
        )}

        <CompareTray />
        {/* A failed send used to be invisible — the page just sat there. Surface it. */}
        {error && sendStatus === "failed" && (
          <p className="border-t bg-destructive/10 px-4 py-2 text-center text-sm text-destructive">
            {error}
          </p>
        )}
        {isChatting && composer(false)}
      </div>
    </div>
  );
}
