"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { siteConfig } from "@/config/site";
import { defaultThemeSettings, type ThemeSettings } from "@/lib/theme-settings";
import { useThemeSettings } from "@/lib/use-theme-settings";

export function Logo({
  className,
  showText = true,
  initialSettings,
}: Readonly<{
  className?: string;
  showText?: boolean;
  initialSettings?: ThemeSettings;
}>) {
  const [fallback] = useState(() => initialSettings ?? defaultThemeSettings(siteConfig.name));
  const settings = useThemeSettings(fallback);

  return (
    <div className={cn("flex items-center gap-2", className)}>
      {settings.logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={settings.logoUrl}
          alt=""
          className="size-7 shrink-0 rounded-md object-cover"
        />
      ) : (
        <svg
          width="28"
          height="28"
          viewBox="0 0 283 283"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
          className="shrink-0"
        >
          <rect width="283" height="283" rx="41" fill="#6820E4" />
          <path
            d="M138.518 179.415C112.546 179.415 91.4154 158.285 91.4154 132.313C91.4154 106.34 112.546 85.2097 138.518 85.2097C164.491 85.2097 185.621 106.34 185.621 132.313C185.621 158.285 164.491 179.415 138.518 179.415ZM138.518 111.002C126.767 111.002 117.208 120.562 117.208 132.313C117.208 144.064 126.767 153.623 138.518 153.623C150.269 153.623 159.829 144.064 159.829 132.313C159.829 120.562 150.269 111.002 138.518 111.002Z"
            fill="#F1F5F9"
          />
          <path
            d="M137.722 220.443C119.278 220.443 101.884 212.342 90 198.217L109.736 181.613C116.707 189.899 126.908 194.651 137.722 194.651C149.492 194.651 160.615 188.925 167.476 179.335L188.454 194.343C176.761 210.686 157.796 220.443 137.722 220.443Z"
            fill="#F1F5F9"
          />
          <g opacity="0.4">
            <path
              d="M176.745 90.3623C184.423 90.3623 190.648 84.1378 190.648 76.4595C190.648 68.7812 184.423 62.5568 176.745 62.5568C169.067 62.5568 162.842 68.7812 162.842 76.4595C162.842 84.1378 169.067 90.3623 176.745 90.3623Z"
              fill="#F8FAFC"
            />
          </g>
        </svg>
      )}
      {showText && (
        <span className="font-heading text-lg font-semibold tracking-tight">
          {settings.companyName}
        </span>
      )}
    </div>
  );
}
