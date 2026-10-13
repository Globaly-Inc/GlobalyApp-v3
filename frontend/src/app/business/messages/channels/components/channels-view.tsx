"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { WIDGET_SETTINGS_HREF } from "@/app/business/ai-widget/const";
import { ArrowLeft, Globe, Loader2, ShieldCheck, TriangleAlert } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { ZernioIcon } from "../../components/brand-icons";
import { WidgetSwitch } from "../../components/widget-switch";
import { CHANNELS_HREF } from "../../const";
import type { ChannelConnection, ChannelKey } from "../apis/types";
import { CHANNEL_CARDS } from "../const";
import { confirmChannel, fetchChannels } from "../store/channels-slice";
import { AiConfigDialog } from "./ai-config-dialog";
import { ChannelCard } from "./channel-card";
import { ConnectDialog, type ConnectStep } from "./connect-dialog";
import { DisconnectDialog } from "./disconnect-dialog";

function SectionLabel({ children }: Readonly<{ children: React.ReactNode }>) {
  return <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{children}</h2>;
}

const isChannel = (v: string | null): v is ChannelKey => v === "whatsapp" || v === "instagram" || v === "facebook";

/**
 * Where messages reach the Inbox from, laid out like GlobalyOS's Channels page: the website's AI
 * chat widget, then WhatsApp, Instagram and Facebook, connected through Zernio.
 *
 * Connecting leaves the app (Meta's login, hosted by Zernio) and comes back here with
 * ?zernio_channel=… plus Zernio's success or error params, which this page finishes.
 */
export function ChannelsView() {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const params = useSearchParams();
  const { connections, configured, loaded } = useAppSelector((s) => s.inboxChannels);
  // Back from Zernio: read once, on the first render. An error is shown straight away; a success
  // is confirmed with our server below.
  const [returned] = useState(() => {
    const channel = params.get("zernio_channel");
    if (!isChannel(channel)) return null;
    return { channel, error: params.get("error") ? params.get("error_message") ?? "Meta didn't grant access. Nothing was changed — try again and accept every permission." : null, accountId: params.get("accountId") ?? undefined };
  });
  const [step, setStep] = useState<ConnectStep | null>(() => (returned?.error ? { kind: "error", channel: returned.channel, message: returned.error } : null));
  const [configuring, setConfiguring] = useState<ChannelConnection | null>(null);
  const [disconnecting, setDisconnecting] = useState<ChannelConnection | null>(null);
  const [confirming, setConfirming] = useState(() => !!returned && !returned.error);

  const fetchedRef = useRef(false);
  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    dispatch(fetchChannels());
  }, [dispatch]);

  // Handled once, then the params are dropped so a reload doesn't repeat it.
  const returnedRef = useRef(false);
  useEffect(() => {
    if (returnedRef.current || !returned) return;
    returnedRef.current = true;
    router.replace(CHANNELS_HREF);
    if (returned.error) return;
    const { channel } = returned;
    // The server checks this account belongs to our organisation before saving anything.
    dispatch(confirmChannel({ channel, accountId: returned.accountId })).then((result) => {
      setConfirming(false);
      if ("error" in result) setStep({ kind: "error", channel, message: result.error.message ?? "Something went wrong saving the connection." });
      else if (result.payload[0]) setStep({ kind: "success", channel, connection: result.payload[0] });
      else setStep({ kind: "error", channel, message: "No account came back from Meta. Try again and pick the account to connect." });
    });
  }, [returned, router, dispatch]);

  // ponytail: one account per channel for now — Zernio bills per connected account, so there's no
  // "Add another". Any extra account that already exists still gets its own card to manage.
  const live = (key: ChannelKey) => (loaded ? connections.filter((c) => c.channel === key && c.status !== "disconnected") : []);

  return (
    // /business/messages is full-bleed in the shell, so this page brings its own gutter.
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-8 sm:px-6">
      <div className="flex flex-col gap-3">
        <Link href="/business/messages" className="flex w-fit items-center gap-1.5 text-sm text-primary hover:underline">
          <ArrowLeft className="size-3.5" aria-hidden />
          Back to Inbox
        </Link>
        <PageHeader title="Channels" subtitle="Connect messaging platforms to your Inbox." />
      </div>

      <section className="flex flex-col gap-3">
        <SectionLabel>Web widget</SectionLabel>
        <div className="flex max-w-3xl flex-wrap items-center gap-4 rounded-lg border border-border bg-card p-4 shadow-sm">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary-light text-primary">
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
        {!configured && (
          <p className="flex items-center gap-2 rounded-lg bg-warning/10 px-3 py-2 text-sm text-warning">
            <TriangleAlert className="size-4 shrink-0" aria-hidden />
            WhatsApp, Instagram and Facebook aren&apos;t switched on for this server yet.
          </p>
        )}
        {confirming && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" aria-hidden />Finishing the connection…</p>
        )}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {CHANNEL_CARDS.flatMap((card) => {
            const accounts = live(card.key);
            const props = {
              channel: card.key,
              description: card.description,
              disabled: !configured || !loaded,
              onConnect: () => setStep({ kind: "intro", channel: card.key }),
              onReconnect: (c: ChannelConnection) => setStep({ kind: "intro", channel: c.channel, reconnect: c }),
              onConfigure: setConfiguring,
              onDisconnect: setDisconnecting,
            };
            return accounts.length
              ? accounts.map((c) => <ChannelCard key={c.id} {...props} connection={c} />)
              : [<ChannelCard key={card.key} {...props} connection={undefined} />];
          })}
        </div>
        <div className="flex max-w-3xl items-center gap-3 rounded-xl border border-border bg-muted/40 px-4 py-3">
          <ZernioIcon className="size-8 shrink-0 rounded-md" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground">Powered by Zernio</p>
            <p className="text-xs text-muted-foreground">
              Our messaging partner connects WhatsApp, Instagram and Facebook. You log in on Meta&apos;s own page, and we never see your password.
            </p>
          </div>
          <span className="hidden shrink-0 items-center gap-1 text-xs text-muted-foreground sm:flex">
            <ShieldCheck className="size-3.5" aria-hidden />
            Disconnect any time
          </span>
        </div>
      </section>

      <ConnectDialog
        step={step}
        onClose={() => setStep(null)}
        onConfigure={(c) => { setStep(null); setConfiguring(c); }}
        onRetry={(channel) => setStep({ kind: "intro", channel })}
      />
      <AiConfigDialog connection={configuring} onClose={() => setConfiguring(null)} />
      <DisconnectDialog connection={disconnecting} onClose={() => setDisconnecting(null)} />
    </div>
  );
}
