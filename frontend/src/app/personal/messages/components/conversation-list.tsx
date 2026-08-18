"use client";

import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { ConversationSummary } from "../apis/types";

interface ConversationListProps {
  conversations: ConversationSummary[];
  activeId: number | null;
  loading: boolean;
  onSelect: (id: number) => void;
}

function preview(conversation: ConversationSummary): string {
  const last = conversation.last_message;
  if (!last) return "No messages yet";
  if (last.message_type !== "text") return "Sent an attachment";
  return last.content ?? "";
}

export function ConversationList({ conversations, activeId, loading, onSelect }: Readonly<ConversationListProps>) {
  if (loading) {
    return (
      <div className="space-y-2 p-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  }

  if (conversations.length === 0) {
    return (
      <p className="p-6 text-center text-sm text-muted-foreground">
        No conversations yet. They start when a provider replies to one of your enquiries.
      </p>
    );
  }

  return (
    <ul className="divide-y">
      {conversations.map((conversation) => (
        <li key={conversation.id}>
          <button
            type="button"
            onClick={() => onSelect(conversation.id)}
            aria-current={conversation.id === activeId}
            className={cn(
              "flex w-full flex-col gap-1 px-4 py-3 text-left transition-colors hover:bg-muted/60",
              conversation.id === activeId && "bg-muted",
            )}
          >
            <span className="flex items-center justify-between gap-2">
              <span className="truncate text-sm font-medium">{conversation.title ?? "Conversation"}</span>
              {conversation.unread_count > 0 && (
                <Badge variant="default" aria-label={`${conversation.unread_count} unread`}>
                  {conversation.unread_count}
                </Badge>
              )}
            </span>
            <span className="truncate text-xs text-muted-foreground">{preview(conversation)}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
