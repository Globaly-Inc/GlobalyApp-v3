"use client";

import Link from "next/link";
import { WIDGET_SETTINGS_HREF } from "@/app/business/ai-widget/const";
import { ArrowLeft, Globe } from "lucide-react";
import { WidgetSwitch } from "../../components/widget-switch";
import { UPCOMING_CHANNELS } from "../const";

function SectionLabel({ children }: Readonly<{ children: React.ReactNode }>) {
  return <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{children}</h2>;
}

/**
 * Where messages reach the Inbox from, laid out like GlobalyOS's Channels page: the website's AI
 * chat widget (the one live channel, switchable here as it is above the Inbox), then the
 * channels still to come.
 */
export function ChannelsView() {
  return (
    // /business/messages is full-bleed in the shell, so this page brings its own gutter.
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-8 sm:px-6">
      <div className="flex flex-col gap-3">
        <Link href="/business/messages" className="flex w-fit items-center gap-1.5 text-sm text-primary hover:underline">
          <ArrowLeft className="size-3.5" aria-hidden />
          Back to Inbox
        </Link>
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Channels</h1>
          <p className="text-sm text-muted-foreground">Connect messaging platforms to your Inbox.</p>
        </div>
      </div>

      <section className="flex flex-col gap-3">
        <SectionLabel>Web widget</SectionLabel>
        <div className="flex max-w-3xl flex-wrap items-center gap-4 rounded-xl border border-border bg-card p-4">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Globe className="size-5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-medium text-foreground">AI chat widget</p>
            <p className="text-sm text-muted-foreground">
              Live AI chat on your website. Your team can take over any conversation from the Inbox.
            </p>
            <Link href={WIDGET_SETTINGS_HREF} className="text-xs font-medium text-primary hover:underline">
              Widget settings →
            </Link>
          </div>
          <WidgetSwitch showLabel={false} />
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <SectionLabel>Available channels</SectionLabel>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {UPCOMING_CHANNELS.map((channel) => (
            <div key={channel.key} className="flex items-start gap-3 rounded-xl border border-dashed border-border bg-card p-4">
              <span className={`flex size-10 shrink-0 items-center justify-center rounded-lg ${channel.tint}`}>
                <channel.icon className="size-5" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-medium text-foreground">{channel.name}</p>
                <p className="text-sm text-muted-foreground">{channel.description}</p>
              </div>
              <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                Coming soon
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
