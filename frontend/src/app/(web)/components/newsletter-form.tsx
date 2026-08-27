"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { httpPost } from "@/lib/api/http";

export function NewsletterForm() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      toast.error("Please enter an email");
      return;
    }

    setLoading(true);
    try {
      await httpPost("/api/v3/waitlist", { email, type: "newsletter", name: "" });
      toast.success("Subscribed!", { description: "Check your inbox for confirmation." });
      setEmail("");
    } catch (error: unknown) {
      const err = error as { response?: { status: number } };
      if (err.response?.status === 409) {
        toast.success("Already subscribed!", { description: "You're already on our newsletter list." });
      } else {
        toast.error("Something went wrong", { description: "Please try again." });
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex gap-2 w-full md:w-auto">
      <Input
        type="email"
        placeholder="Enter your email"
        className="h-10 bg-white/10 border-white/20 text-white placeholder:text-white/40 md:w-64"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        disabled={loading}
        required
      />
      <Button className="btn-gold h-10 whitespace-nowrap" disabled={loading}>
        {loading ? "Subscribing..." : "Subscribe"}
      </Button>
    </form>
  );
}
