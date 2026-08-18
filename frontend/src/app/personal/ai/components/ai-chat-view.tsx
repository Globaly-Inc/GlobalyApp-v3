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
import { CompareTray } from "./compare-tray";

export function AiChatView() {
  const dispatch = useAppDispatch();
  const activeSessionId = useAppSelector((s) => s.aiChat.activeSessionId);
  const messages = useAppSelector((s) => (activeSessionId ? s.aiChat.messages[activeSessionId] ?? [] : []));
  const sendStatus = useAppSelector((s) => s.aiChat.sendStatus);
  const error = useAppSelector((s) => s.aiChat.error);
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

  const hasMessages = messages.length > 0;

  const sidebar = <ChatSidebar onNewChat={handleNewChat} />;

  return (
    <div className="flex h-[calc(100vh-4rem)] overflow-hidden rounded-2xl border bg-card shadow-sm">
      {/* Desktop sidebar */}
      <div className="hidden w-64 shrink-0 border-r bg-muted/30 md:block">{sidebar}</div>

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

        {/* Messages or starters */}
        {hasMessages || sendStatus === "loading" ? (
          <ChatMessages onChipClick={handleSuggestion} />
        ) : (
          <div className="flex-1 overflow-y-auto">
            <SuggestedStarters onSelect={handleSuggestion} />
          </div>
        )}

        <CompareTray />
        {/* A failed send used to be invisible — the page just sat there. Surface it. */}
        {error && sendStatus === "failed" && (
          <p className="border-t bg-destructive/10 px-4 py-2 text-center text-sm text-destructive">
            {error}
          </p>
        )}
        <ChatInput
          value={draft}
          onChange={setDraft}
          onSend={handleSend}
          disabled={sendStatus === "loading"}
          allowAttachments
        />
      </div>
    </div>
  );
}
