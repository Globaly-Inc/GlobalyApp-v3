// The only file that knows Zernio's HTTP API. Everything else in modules/channels talks to it
// through these functions, so a change on Zernio's side is a change here.
//
// Reference: https://zernio.com/openapi.yaml (servers: https://zernio.com/api), and
// docs.zernio.com/multi-tenant(/inbox). Auth is `Authorization: Bearer <ZERNIO_API_KEY>`.

import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { config } from "../../../config.js";
import { AppError } from "../../../shared/errors.js";
import type { Channel } from "../consts.js";

const TIMEOUT_MS = 15_000;

export class ZernioError extends AppError {
  constructor(message: string, public readonly status: number, public readonly zernioCode?: string) {
    // 502: the failure is Zernio's (or Meta's behind it), not the caller's request.
    super(message, 502, "ZERNIO_ERROR", zernioCode ? { zernio_code: zernioCode } : undefined);
  }
}

export function isConfigured(): boolean {
  return !!config.ZERNIO_API_KEY;
}

function requireKey(): string {
  if (!config.ZERNIO_API_KEY) {
    throw new AppError("WhatsApp, Instagram and Facebook aren't set up on this server yet.", 503, "CHANNELS_NOT_CONFIGURED");
  }
  return config.ZERNIO_API_KEY;
}

async function call<T>(method: string, path: string, opts: { query?: Record<string, string | undefined>; body?: unknown; idempotencyKey?: string } = {}): Promise<T> {
  const url = new URL(`${config.ZERNIO_API_URL.replace(/\/+$/, "")}${path}`);
  for (const [k, v] of Object.entries(opts.query ?? {})) if (v !== undefined) url.searchParams.set(k, v);
  const headers: Record<string, string> = { Authorization: `Bearer ${requireKey()}`, Accept: "application/json" };
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  if (opts.idempotencyKey) headers["Idempotency-Key"] = opts.idempotencyKey;

  let res: Response;
  try {
    res = await fetch(url, { method, headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body), signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (err) {
    // Node's "fetch failed" hides the real reason (DNS, TLS, bad URL) in err.cause.
    const cause = err instanceof Error && err.cause instanceof Error ? ` (${err.cause.message})` : "";
    throw new ZernioError(`Couldn't reach Zernio: ${err instanceof Error ? err.message : String(err)}${cause}`, 0);
  }
  const text = await res.text();
  const json = text ? safeJson(text) : null;
  if (!res.ok) {
    const body = (json ?? {}) as { error?: unknown; message?: unknown; code?: unknown };
    const message = typeof body.message === "string" ? body.message : typeof body.error === "string" ? body.error : `HTTP ${res.status}`;
    throw new ZernioError(`Zernio ${method} ${path} failed: ${message}`, res.status, typeof body.code === "string" ? body.code : undefined);
  }
  return json as T;
}

function safeJson(text: string): unknown {
  try { return JSON.parse(text); } catch { return null; }
}

// ---------------------------------------------------------------- profiles & accounts

export interface ZernioAccount {
  _id: string;
  platform: string;
  profileId: string | { _id: string };
  username?: string;
  displayName?: string;
  isActive: boolean;
  needsReconnection?: boolean;
}

export async function createProfile(name: string, description: string): Promise<string> {
  const res = await call<{ profile?: { _id?: string } }>("POST", "/v1/profiles", { body: { name, description }, idempotencyKey: randomUUID() });
  const id = res.profile?._id;
  if (!id) throw new ZernioError("Zernio created a profile without an id", 200);
  return id;
}

/** Zernio hosts the Meta login and the Page/number picker, then sends the browser to redirectUrl. */
export async function connectUrl(channel: Channel, profileId: string, redirectUrl: string, reconnectAccountId?: string): Promise<string> {
  const res = await call<{ authUrl?: string }>("GET", `/v1/connect/${channel}`, {
    query: { profileId, redirect_url: redirectUrl, reconnectAccountId },
  });
  if (!res.authUrl) throw new ZernioError("Zernio returned no connect URL", 200);
  return res.authUrl;
}

export async function listAccounts(profileId: string): Promise<ZernioAccount[]> {
  const res = await call<{ accounts?: ZernioAccount[] }>("GET", "/v1/accounts", { query: { profileId } });
  return res.accounts ?? [];
}

/**
 * One account, looked up INSIDE the given profile. Zernio has no single-account GET, and scoping
 * to the profile is the point anyway: an account id from a browser redirect is only trusted if it
 * belongs to this organisation's own profile.
 */
export async function findAccountInProfile(profileId: string, accountId: string): Promise<ZernioAccount | null> {
  return (await listAccounts(profileId)).find((a) => a._id === accountId) ?? null;
}

export async function deleteAccount(accountId: string): Promise<void> {
  await call("DELETE", `/v1/accounts/${encodeURIComponent(accountId)}`);
}

export const accountProfileId = (a: ZernioAccount) => (typeof a.profileId === "string" ? a.profileId : a.profileId?._id);

// ---------------------------------------------------------------- inbox

export interface SendInput {
  conversationId: string;
  accountId: string;
  text?: string;
  attachmentUrl?: string;
  /** WhatsApp template: sent as Meta's template payload, the only thing allowed outside the 24h window. */
  template?: { name: string; language: string; components?: unknown[] };
  /** Retries with the same key replay the original send instead of delivering twice. */
  idempotencyKey: string;
}

/** Returns the platform message id — the same id later delivery webhooks carry. */
export async function sendMessage(input: SendInput): Promise<{ platformMessageId: string | null }> {
  const body: Record<string, unknown> = { accountId: input.accountId };
  if (input.text) body.message = input.text;
  if (input.attachmentUrl) body.attachmentUrl = input.attachmentUrl;
  if (input.template) body.template = { elements: [input.template] };
  const res = await call<{ data?: { messageId?: string } }>("POST", `/v1/inbox/conversations/${encodeURIComponent(input.conversationId)}/messages`, {
    body, idempotencyKey: input.idempotencyKey,
  });
  return { platformMessageId: res.data?.messageId ?? null };
}

/** "typing…" on the customer's side while AI writes. A no-op on platforms without it. */
export async function sendTyping(conversationId: string, accountId: string): Promise<void> {
  await call("POST", `/v1/inbox/conversations/${encodeURIComponent(conversationId)}/typing`, { body: { accountId } });
}

/** Meta's handover: take the thread back from Page Inbox / Meta Business Agent. */
export async function takeThreadControl(conversationId: string, accountId: string): Promise<void> {
  await call("POST", `/v1/inbox/conversations/${encodeURIComponent(conversationId)}/thread-control`, { body: { accountId, action: "take" } });
}

export interface ZernioTemplate { id?: string; name: string; language: string; status?: string; category?: string; components?: unknown[] }

export async function listWhatsAppTemplates(accountId: string): Promise<ZernioTemplate[]> {
  const res = await call<{ templates?: ZernioTemplate[]; data?: ZernioTemplate[] }>("GET", "/v1/whatsapp/templates", { query: { accountId } });
  return res.templates ?? res.data ?? [];
}

// ---------------------------------------------------------------- webhooks

/**
 * X-Zernio-Signature: hex HMAC-SHA256 of the RAW body, keyed by our endpoint's secret.
 * Without a configured secret, only a non-production server accepts the event (local dev before
 * a secret exists); production rejects it, so an unsigned endpoint can never be fed fake messages.
 */
export function verifySignature(rawBody: Buffer, signature: string | undefined): boolean {
  const secret = config.ZERNIO_WEBHOOK_SECRET;
  if (!secret) return config.NODE_ENV !== "production";
  if (!signature) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signature.trim().toLowerCase(), "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}
