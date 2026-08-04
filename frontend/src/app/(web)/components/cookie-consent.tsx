"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export function CookieConsent() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (localStorage.getItem("cookie-consent")) return undefined;
    const t = setTimeout(() => setVisible(true), 500);
    return () => clearTimeout(t);
  }, []);

  const handle = (choice: "accepted" | "declined") => {
    localStorage.setItem("cookie-consent", choice);
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className="fixed bottom-0 inset-x-0 z-[60] p-4">
      <div className="mx-auto max-w-4xl rounded-lg border bg-card/95 backdrop-blur-sm shadow-lg p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center gap-4">
        <p className="text-sm text-muted-foreground flex-1">
          We use cookies to improve your experience. By continuing, you agree to our{" "}
          <Link href="/cookies" className="text-primary underline underline-offset-2 hover:text-primary/80">
            Cookie Policy
          </Link>
          .
        </p>
        <div className="flex gap-2 shrink-0">
          <Button variant="outline" className="h-9" onClick={() => handle("declined")}>
            Decline
          </Button>
          <Button className="h-9" onClick={() => handle("accepted")}>
            Accept
          </Button>
        </div>
      </div>
    </div>
  );
}
