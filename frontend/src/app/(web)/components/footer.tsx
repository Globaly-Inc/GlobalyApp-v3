import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SocialIcon } from "./social-icon";
import { FOOTER_LINKS, SOCIALS } from "../const/index";

export function Footer() {
  return (
    <footer className="bg-[hsl(var(--navy))] text-[hsl(var(--navy-foreground))]">
      <div className="container mx-auto px-4 py-12">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-8 mb-12">
          <div className="col-span-2 md:col-span-3 lg:col-span-1">
            <Link href="/" className="flex items-center mb-4">
              <Image src="/globaly-logo-white.png" alt="Globaly" width={776} height={188} className="h-8 w-auto" />
            </Link>
            <p className="text-sm text-white/60 mb-4 max-w-xs">
              Connecting Students with Domestic and International Education Providers, Education
              Agents and Service Providers
            </p>
            <div className="flex gap-3">
              {SOCIALS.map(({ name, href, label }) => (
                <a
                  key={label}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={label}
                  className="h-8 w-8 rounded-full bg-white/10 flex items-center justify-center hover:bg-primary transition-colors"
                >
                  <SocialIcon name={name} className="h-4 w-4 text-white/70" />
                </a>
              ))}
            </div>
          </div>

          {Object.entries(FOOTER_LINKS).map(([section, links]) => (
            <div key={section}>
              <h4 className="font-semibold text-white text-sm mb-3">{section}</h4>
              <ul className="space-y-2">
                {links.map((link) => (
                  <li key={link.label}>
                    <Link href={link.href} className="text-sm text-white/60 hover:text-white transition-colors">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="border-t border-white/10 pt-8 mb-8">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div>
              <h4 className="font-semibold text-white mb-1">Subscribe to our newsletter</h4>
              <p className="text-sm text-white/60">Stay updated with the latest in global education.</p>
            </div>
            <div className="flex gap-2 w-full md:w-auto">
              <Input
                placeholder="Enter your email"
                className="h-10 bg-white/10 border-white/20 text-white placeholder:text-white/40 md:w-64"
              />
              <Button className="btn-gold h-10 whitespace-nowrap">Subscribe</Button>
            </div>
          </div>
        </div>

        <div className="border-t border-white/10 pt-6 flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-white/50">
          <p>© 2026 Globaly Inc., All rights reserved.</p>
          <div className="flex gap-4">
            <Link href="/privacy" className="hover:text-white transition-colors">
              Privacy Policy
            </Link>
            <Link href="/terms" className="hover:text-white transition-colors">
              Terms of Service
            </Link>
            <Link href="/cookies" className="hover:text-white transition-colors">
              Cookie Policy
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
