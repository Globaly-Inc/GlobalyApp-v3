"use client";

import { ThumbsUp, ThumbsDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppDispatch } from "@/lib/hooks";
import { setFeedback } from "../store/ai-chat-slice";

type FeedbackButtonsProps = {
  messageId: number;
  feedback: "up" | "down" | null;
};

export function FeedbackButtons({ messageId, feedback }: FeedbackButtonsProps) {
  const dispatch = useAppDispatch();

  const toggle = (value: "up" | "down") => {
    dispatch(setFeedback({ messageId, feedback: feedback === value ? null : value }));
  };

  return (
    <div className="flex items-center gap-0.5">
      <Button
        variant="ghost"
        size="icon-xs"
        onClick={() => toggle("up")}
        aria-label="Thumbs up"
      >
        <ThumbsUp className={feedback === "up" ? "fill-current" : ""} />
      </Button>
      <Button
        variant="ghost"
        size="icon-xs"
        onClick={() => toggle("down")}
        aria-label="Thumbs down"
      >
        <ThumbsDown className={feedback === "down" ? "fill-current" : ""} />
      </Button>
    </div>
  );
}
