"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { Expand } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { sendMessage, addOptimisticUserMessage } from "@/app/ai/store/ai-chat-slice";
import { ChatMessages } from "@/app/ai/components/chat-messages";
import { ChatInput } from "@/app/ai/components/chat-input";
import { SuggestedStarters } from "@/app/ai/components/suggested-starters";

type AiPopoverProps = {
  onClose: () => void;
};

export function AiPopover({ onClose }: AiPopoverProps) {
  const dispatch = useAppDispatch();
  const activeSessionId = useAppSelector((s) => s.aiChat.activeSessionId);
  const messages = useAppSelector((s) => (activeSessionId ? s.aiChat.messages[activeSessionId] ?? [] : []));
  const sendStatus = useAppSelector((s) => s.aiChat.sendStatus);
  const [draft, setDraft] = useState("");

  const handleSend = useCallback(
    (content: string) => {
      if (activeSessionId) {
        dispatch(addOptimisticUserMessage({ sessionId: activeSessionId, content }));
      }
      dispatch(sendMessage({ sessionId: activeSessionId, content }));
      setDraft("");
    },
    [dispatch, activeSessionId],
  );

  const handleSuggestion = useCallback((text: string) => setDraft(text), []);

  const hasMessages = messages.length > 0;

  return (
    <div className="fixed bottom-36 right-4 z-50 flex h-[500px] w-[380px] flex-col overflow-hidden rounded-2xl border bg-card shadow-2xl md:bottom-20">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 py-2.5">
        <span className="text-sm font-semibold">AI Counsellor</span>
        <Button variant="ghost" size="icon-sm" render={<Link href="/personal/ai" onClick={onClose} />}>
          <Expand className="h-4 w-4" />
        </Button>
      </div>

      {/* Messages */}
      {hasMessages || sendStatus === "loading" ? (
        <ChatMessages onChipClick={handleSuggestion} />
      ) : (
        <div className="flex-1 overflow-y-auto">
          <SuggestedStarters onSelect={handleSuggestion} />
        </div>
      )}

      <ChatInput value={draft} onChange={setDraft} onSend={handleSend} disabled={sendStatus === "loading"} />
    </div>
  );
}
