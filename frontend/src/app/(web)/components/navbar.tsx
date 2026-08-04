"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

const NAV_LINKS = [
  { label: "For Students", href: "/for-students" },
  { label: "For Institutions", href: "/for-institutions" },
  { label: "For Agents", href: "/for-agents" },
  { label: "Blog", href: "/blog" },
];

export function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-background/95 backdrop-blur-md">
      <div className="container mx-auto flex h-16 items-center px-3 sm:px-4 gap-1">
        <Link href="/" className="flex items-center flex-shrink-0">
          <Image src="/globaly-logo.png" alt="Globaly.ai" width={753} height={157} className="h-8 w-auto" priority />
        </Link>

        <nav className="hidden items-center gap-1 lg:flex flex-1 justify-start ml-8">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "px-3 py-2 text-sm font-medium transition-colors rounded-md",
                pathname === link.href
                  ? "text-primary bg-primary/10"
                  : "text-foreground/70 hover:text-foreground hover:bg-muted",
              )}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2 flex-shrink-0 ml-auto">
          <Link
            href="/ai"
            className="hidden md:inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 h-8 text-xs font-semibold bg-primary/10 text-primary hover:bg-primary/15 transition-colors"
            aria-label="Open AI Counsellor"
          >
            <Sparkles className="h-3.5 w-3.5" />
            <span>AI Counsellor</span>
          </Link>

          <Button
            variant="ghost"
            className="hidden h-10 sm:inline-flex text-foreground/70 hover:text-foreground hover:bg-muted"
            nativeButton={false}
            render={<Link href="/auth/sign-in" />}
          >
            Sign In
          </Button>
          <Button
            className="btn-gold h-10 rounded-full px-5"
            nativeButton={false}
            render={<Link href="/auth/sign-up" />}
          >
            Get Started
          </Button>

          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger
              render={<Button variant="ghost" size="icon" className="h-10 w-10 lg:hidden text-foreground hover:bg-muted" />}
            >
              <Menu className="h-5 w-5" />
            </SheetTrigger>
            <SheetContent side="right" showCloseButton={false} className="bg-[hsl(var(--navy))] text-white border-white/10 w-72 p-6">
              <SheetTitle className="sr-only">Menu</SheetTitle>
              <div className="flex items-center justify-between mb-6">
                <Link href="/" onClick={() => setMobileOpen(false)}>
                  <Image src="/globaly-logo-white.png" alt="Globaly.ai" width={776} height={188} className="h-7 w-auto" />
                </Link>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setMobileOpen(false)}
                  className="h-10 w-10 text-white"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <nav className="flex flex-col gap-1">
                {NAV_LINKS.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setMobileOpen(false)}
                    className="px-3 py-2.5 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-colors"
                  >
                    {link.label}
                  </Link>
                ))}
                <div className="mt-4 flex flex-col gap-2">
                  <Button
                    variant="outline"
                    className="h-10 bg-transparent border-white/40 text-white hover:bg-white/10 hover:text-white"
                    nativeButton={false}
                    render={<Link href="/auth/sign-in" onClick={() => setMobileOpen(false)} />}
                  >
                    Sign In
                  </Button>
                  <Button
                    className="btn-gold h-10"
                    nativeButton={false}
                    render={<Link href="/auth/sign-up" onClick={() => setMobileOpen(false)} />}
                  >
                    Get Started
                  </Button>
                </div>
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
