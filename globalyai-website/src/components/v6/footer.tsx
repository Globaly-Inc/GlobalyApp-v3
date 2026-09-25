"use client";

import Image from "next/image";
import { cn } from "@/lib/utils";
import { LEGAL_LINKS, SOCIAL_LINKS, siteConfig } from "@/lib/site";
import { openCookiePreferences } from "./cookie-consent";
import { SocialIcon } from "./social-icons";
import { useThemeValue } from "./theme";

export function Footer() {
  const dark = useThemeValue() === "dark";
  const year = new Date().getFullYear();

  return (
    <footer className="px-3 pb-6 sm:px-5">
      {/* Variation 1 closes on .panel-soft, and so does this: the footer is
          the second tinted container on the page, which brackets it. */}
      <div className="v6-glass v6-soft mx-auto max-w-[1300px] px-7 py-12 sm:px-10">
        <div className="grid gap-8 md:grid-cols-[minmax(0,1fr)_auto] md:items-start md:gap-16">
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

          {/* Social accounts, with the address under them. Right-aligned from
              md, where the column sits beside the logo. */}
          <div className="flex flex-col gap-5 md:items-end">
            <ul aria-label="Social media" className="flex gap-2.5">
              {SOCIAL_LINKS.map((link) => (
                <li key={link.network}>
                  <a
                    href={link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`${link.label} (opens in a new tab)`}
                    className="flex h-11 w-11 items-center justify-center rounded-full border border-[var(--border-strong)] bg-[var(--surface)] text-[var(--body)] transition-colors hover:border-[var(--primary-bright)] hover:text-[var(--primary-bright)]"
                  >
                    <SocialIcon network={link.network} className="h-[18px] w-[18px]" />
                  </a>
                </li>
              ))}
            </ul>
            <address className="text-[14px] not-italic leading-[1.6] text-[var(--body)] md:text-right">
              {/* The city line never breaks, so a phone wraps after the street
                  rather than stranding the ZIP code. */}
              {siteConfig.address.street},{" "}
              <span className="whitespace-nowrap">
                {siteConfig.address.locality} {siteConfig.address.region} {siteConfig.address.postalCode}
              </span>
            </address>
          </div>
        </div>

        <div className="mt-10 flex flex-col gap-4 border-t border-[var(--border)] pt-6 text-[13.5px] text-[var(--muted-foreground)] lg:flex-row lg:items-center lg:justify-between">
          <p>
            © {year} {siteConfig.company}
          </p>
          {/* The legal row. Cookie preferences reopens the banner, because
              withdrawing consent has to be as easy as giving it. */}
          <ul aria-label="Legal" className="flex flex-wrap gap-x-5 gap-y-2 lg:justify-end">
            {LEGAL_LINKS.map((link) => (
              <li key={link.href}>
                <a href={link.href} className="transition-colors hover:text-[var(--foreground)]">
                  {link.label}
                </a>
              </li>
            ))}
            <li>
              <button
                type="button"
                onClick={openCookiePreferences}
                className="transition-colors hover:text-[var(--foreground)]"
              >
                Cookie preferences
              </button>
            </li>
          </ul>
        </div>
      </div>
    </footer>
  );
}
