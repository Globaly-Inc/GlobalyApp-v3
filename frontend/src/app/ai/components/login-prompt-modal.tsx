"use client";

import { useRouter } from "next/navigation";
import { BookOpen, History, Sparkles, Map } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

const BENEFITS = [
  { icon: History, text: "Save and revisit your chat history" },
  { icon: Sparkles, text: "Get personalised counselling" },
  { icon: Map, text: "Explore and compare courses" },
  { icon: BookOpen, text: "Continue this conversation" },
];

export function LoginPromptModal({
  open,
  onOpenChange,
}: Readonly<{ open: boolean; onOpenChange: (open: boolean) => void }>) {
  const router = useRouter();

  const go = (path: string) => {
    onOpenChange(false);
    router.push(path);
  };

  // After auth, land in the full authenticated AI experience (with session history).
  const REDIRECT = "/personal/ai";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Keep the conversation going</DialogTitle>
          <DialogDescription>
            Create a free account to unlock everything.
          </DialogDescription>
        </DialogHeader>

        <ul className="flex flex-col gap-3 py-2">
          {BENEFITS.map(({ icon: Icon, text }) => (
            <li key={text} className="flex items-center gap-3 text-sm">
              <Icon className="h-4 w-4 shrink-0 text-primary" />
              <span>{text}</span>
            </li>
          ))}
        </ul>

        <DialogFooter className="flex-col gap-2 sm:flex-row">
          <Button variant="outline" className="h-10 w-full cursor-pointer" onClick={() => onOpenChange(false)}>
            Maybe later
          </Button>
          <Button variant="outline" className="h-10 w-full cursor-pointer" onClick={() => go(`/auth/sign-in?redirect=${encodeURIComponent(REDIRECT)}`)}>
            Log in
          </Button>
          <Button className="h-10 w-full cursor-pointer" onClick={() => go(`/auth/sign-up?redirect=${encodeURIComponent(REDIRECT)}`)}>
            Sign up free
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
