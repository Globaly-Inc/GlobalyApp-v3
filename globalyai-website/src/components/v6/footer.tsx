"use client";

import Image from "next/image";
import { cn } from "@/lib/utils";
import { FOOTER_LINKS, siteConfig } from "@/lib/site";
import { useThemeValue } from "./theme";

export function Footer() {
  const dark = useThemeValue() === "dark";
  const year = new Date().getFullYear();

  return (
    <footer className="px-3 pb-6 sm:px-5">
      {/* Variation 1 closes on .panel-soft, and so does this: the footer is
          the second tinted container on the page, which brackets it. */}
      <div className="v6-glass v6-soft mx-auto max-w-[1300px] px-7 py-12 sm:px-10">
        <div className="grid gap-10 md:grid-cols-[1.6fr_1fr] md:gap-16">
          <div className="max-w-sm">
            <Image
              src="/globalyai-logo.png"
              alt={siteConfig.name}
              width={1240}
              height={313}
              className={cn("h-[22px] w-auto transition-[filter] duration-300", dark && "brightness-0 invert")}
            />
            <p className="mt-5 text-[14.5px] leading-[1.7] text-[var(--body)]">{siteConfig.tagline}</p>
          </div>

          <nav aria-label="Footer">
            <ul className="grid grid-cols-2 gap-x-6 gap-y-3">
              {FOOTER_LINKS.map((link) => {
                const external = link.href.startsWith("http");
                return (
                  <li key={link.label}>
                    <a
                      href={link.href}
                      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                      className="text-[14.5px] text-[var(--body)] transition-colors hover:text-[var(--foreground)]"
                    >
                      {link.label}
                    </a>
                  </li>
                );
              })}
            </ul>
          </nav>
        </div>

        <div className="mt-10 flex flex-col gap-3 border-t border-[var(--border)] pt-6 text-[13.5px] text-[var(--muted-foreground)] sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {year} {siteConfig.company}
          </p>
          <a
            href={`mailto:${siteConfig.founder.email}`}
            className="transition-colors hover:text-[var(--foreground)]"
          >
            {siteConfig.founder.email}
          </a>
        </div>
      </div>
    </footer>
  );
}
