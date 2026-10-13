"use client";

import { useSyncExternalStore } from "react";
import Image from "next/image";
import Link from "next/link";
import { Bot, Mail, MessageSquare, RadioTower, Search, TriangleAlert, Users, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { ICON } from "@/lib/public-assets";
import { useAuthState } from "@/app/auth/store/auth-slice";
import { VISITORS_HREF, WIDGET_SETTINGS_HREF } from "@/app/business/ai-widget/const";
import type { InboxChannel, WidgetVisitor } from "@/app/business/ai-widget/apis/types";
import { CHANNELS_HREF, INBOX_CHANNEL_ORDER, INBOX_CHANNELS, type InboxView } from "../const";
import { matchesView } from "../utils";
import { ChannelGlyph } from "./channel-glyph";
import { HEALTH_DOT, type ChannelFilter, type ChannelHealth } from "./channel-picker";

// Same hydration guard as chat-empty-state: the user's name is in Redux only on the client.
const subscribeNever = () => () => {};
const hydratedSnapshot = () => true;
const serverSnapshot = () => false;

/** The id the sidebar's search box carries, so "Search conversations" can focus it. */
export const INBOX_SEARCH_ID = "inbox-search";

type Card = { icon: LucideIcon; title: string; hint: string; attn?: boolean } & ({ view: InboxView } | { href: string } | { search: true });

const CARD_CLASS =
  "flex min-w-0 items-center gap-3 rounded-xl border bg-card p-4 text-left transition hover:border-primary/30 hover:shadow-md";

/**
 * Nothing open: a welcome and six shortcut cards, laid out like GlobalyOS Team Chat's empty
 * state. Counts come from the list already loaded; every card is something the Inbox already does.
 */
export function InboxWelcome({
  visitors,
  health,
  onView,
  onChannel,
}: Readonly<{
  visitors: WidgetVisitor[];
  health: Partial<Record<InboxChannel, ChannelHealth>>;
  onView: (v: InboxView) => void;
  onChannel: (c: ChannelFilter) => void;
}>) {
  const hydrated = useSyncExternalStore(subscribeNever, hydratedSnapshot, serverSnapshot);
  const { user } = useAuthState();
  const name = hydrated ? user?.first_name : undefined;
  const n = (v: InboxView) => visitors.filter((x) => matchesView(x, v)).length;
  const [attention, unread, ai] = [n("attention"), n("unread"), n("ai")];

  const cards: Card[] = [
    { view: "attention", icon: TriangleAlert, title: "Needs attention", hint: attention ? `${attention} waiting for a person` : "All clear right now", attn: attention > 0 },
    { view: "unread", icon: Mail, title: "Unread messages", hint: unread ? `${unread} new since you last looked` : "You're all caught up" },
    { view: "ai", icon: Bot, title: "AI handling", hint: `${ai} conversation${ai === 1 ? "" : "s"}, no action needed` },
    { href: CHANNELS_HREF, icon: RadioTower, title: "Connect a channel", hint: "WhatsApp, Instagram or Facebook" },
    { href: VISITORS_HREF, icon: Users, title: "Visitors & leads", hint: "Everyone who has chatted with you" },
    { search: true, icon: Search, title: "Search conversations", hint: "People, messages or handles" },
  ];

  const body = (c: Card) => (
    <>
      <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground", c.attn && "bg-amber-100 text-amber-800")}>
        <c.icon className="size-4" aria-hidden />
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="text-sm font-medium text-foreground">{c.title}</span>
        <span className="truncate text-xs text-muted-foreground">{c.hint}</span>
      </span>
    </>
  );

  return (
    <div className="flex h-full overflow-y-auto">
      <div className="m-auto flex w-full max-w-3xl flex-col items-center px-6 py-10 text-center">
        <div className="relative mb-6">
          <div className="flex size-20 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/20 via-primary/10 to-primary/5 shadow-lg">
            <Image src={ICON.src} alt="GlobalyAI" width={ICON.width} height={ICON.height} className="size-12 rounded-lg" />
          </div>
          <div className="absolute -bottom-2 -right-2 flex size-8 items-center justify-center rounded-full bg-muted ring-2 ring-background">
            <MessageSquare className="size-4 text-muted-foreground" aria-hidden />
          </div>
        </div>
        <h1 className="text-2xl font-semibold">{name ? `Hi ${name}! Welcome to your Inbox` : "Welcome to your Inbox"}</h1>
        <p className="mt-2 text-muted-foreground">AI answers your customers first. Step in whenever you&apos;re needed.</p>
        <p className="mt-1 text-xs text-muted-foreground">Website, WhatsApp, Instagram and Facebook in one place</p>

        <div className="mt-8 grid w-full gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((c) => {
            const cls = cn(CARD_CLASS, c.attn && "border-amber-200 bg-gradient-to-b from-amber-50 to-card");
            if ("href" in c) return <Link key={c.title} href={c.href} className={cls}>{body(c)}</Link>;
            const onClick = "view" in c ? () => onView(c.view) : () => document.getElementById(INBOX_SEARCH_ID)?.focus();
            return <button key={c.title} type="button" onClick={onClick} className={cls}>{body(c)}</button>;
          })}
        </div>

        <div className="mt-8 flex flex-wrap justify-center gap-2">
          {INBOX_CHANNEL_ORDER.map((ch) => {
            const state = health[ch] ?? "off";
            const chip = (
              <>
                <ChannelGlyph channel={ch} size="xs" />
                {INBOX_CHANNELS[ch].label}
                <span className={cn("size-1.5 rounded-full", HEALTH_DOT[state].className)} title={HEALTH_DOT[state].title} />
              </>
            );
            const cls = "inline-flex items-center gap-1.5 rounded-full border bg-card py-1 pl-1 pr-2.5 text-xs text-foreground hover:border-primary/30";
            // Not connected: the chip goes where you set it up, rather than filtering to nothing.
            return state === "off" ? (
              <Link key={ch} href={ch === "ai_embed" ? WIDGET_SETTINGS_HREF : CHANNELS_HREF} className={cls}>{chip}</Link>
            ) : (
              <button key={ch} type="button" onClick={() => onChannel(ch)} className={cls}>{chip}</button>
            );
          })}
        </div>
        <p className="mt-5 max-w-md text-xs text-muted-foreground">
          {visitors.length
            ? "Pick a conversation from the list, or start from a card above. A chip filters the list by channel."
            : "When customers message you on your website, WhatsApp, Instagram or Facebook, their conversations appear here."}
        </p>
      </div>
    </div>
  );
}
