// Connecting a channel. Zernio hosts the Meta login and the Page / number picker; we only start
// the flow, then confirm what came back.
//
// Nothing in the browser redirect is trusted: the account id it carries is looked up inside THIS
// organisation's own Zernio profile before anything is saved, so a crafted URL cannot attach
// another organisation's WhatsApp number (or anyone else's account) to this Inbox.

import type { Knex } from "knex";
import { config } from "../../../config.js";
import { BadRequestError, ForbiddenError, NotFoundError } from "../../../shared/errors.js";
import { createChildLogger } from "../../../shared/logger.js";
import type { Recipient } from "../../enquiries/shared/recipient.js";
import * as zernio from "../lib/zernio-client.js";
import * as zernioRepo from "../repositories/zernio.repository.js";
import * as connections from "../repositories/connections.repository.js";
import { CHANNEL_LABEL, type Channel } from "../consts.js";

const logger = createChildLogger("channels-connect");

/** The organisation's Zernio profile, created on its first connect. */
export async function ensureProfile(owner: Recipient, orgName: string): Promise<string> {
  const existing = await zernioRepo.findProfileId(owner);
  if (existing) return existing;
  // `name` is our own stable identifier, as Zernio's multi-tenant guide recommends; the
  // human-readable name goes in the description.
  const created = await zernio.createProfile(`${owner.kind}-${owner.id}`, orgName);
  return zernioRepo.saveProfile(owner, created);
}

/**
 * Where Zernio sends the browser back: a path on OUR web app only. Accepting a full URL from the
 * client would make this endpoint an open redirect.
 */
function returnUrl(returnPath: string, channel: Channel): string {
  if (!/^\/[A-Za-z0-9/_\-]*$/.test(returnPath) || returnPath.startsWith("//")) throw new BadRequestError("Invalid return path");
  const url = new URL(returnPath, config.WEB_APP_URL);
  url.searchParams.set("zernio_channel", channel);
  return url.toString();
}

export async function startConnect(opts: {
  owner: Recipient; orgName: string; channel: Channel; returnPath: string; db: Knex; reconnectId?: number;
}): Promise<string> {
  const profileId = await ensureProfile(opts.owner, opts.orgName);
  let reconnectAccountId: string | undefined;
  if (opts.reconnectId != null) {
    const conn = await connections.findById(opts.db, opts.reconnectId);
    if (!conn || conn.channel !== opts.channel) throw new NotFoundError("Connection not found");
    reconnectAccountId = conn.zernio_account_id;
  }
  return zernio.connectUrl(opts.channel, profileId, returnUrl(opts.returnPath, opts.channel), reconnectAccountId);
}

/**
 * After the redirect. With an account id, confirm that one; without (the user closed Zernio's
 * tab, or a redirect lost its params), pick up every account of this channel in our profile.
 */
export async function confirmConnect(opts: {
  owner: Recipient; db: Knex; channel: Channel; accountId?: string; userId: number;
}): Promise<connections.ConnectionRow[]> {
  const profileId = await zernioRepo.findProfileId(opts.owner);
  if (!profileId) throw new BadRequestError(`Start connecting ${CHANNEL_LABEL[opts.channel]} first`);

  const accounts = (await zernio.listAccounts(profileId)).filter((a) => a.platform === opts.channel && a.isActive !== false);
  const chosen = opts.accountId ? accounts.filter((a) => a._id === opts.accountId) : accounts;
  if (opts.accountId && !chosen.length) {
    throw new ForbiddenError(`That ${CHANNEL_LABEL[opts.channel]} account isn't connected to your organisation`);
  }

  const saved: connections.ConnectionRow[] = [];
  for (const a of chosen) {
    await zernioRepo.upsertAccount({ account_id: a._id, profile_id: profileId, owner: opts.owner, channel: opts.channel });
    saved.push(await connections.upsert(opts.db, {
      channel: opts.channel,
      zernio_account_id: a._id,
      display_name: a.displayName || a.username || CHANNEL_LABEL[opts.channel],
      handle: a.username ?? null,
      connected_by_user_id: opts.userId,
    }));
  }
  return saved;
}

/**
 * Disconnect: removed at Zernio first, then here. Past conversations stay in the Inbox. If
 * Zernio refuses, nothing changes here either, so the two never disagree about whether AI is
 * still answering on this number.
 */
export async function disconnect(owner: Recipient, db: Knex, id: number): Promise<void> {
  const conn = await connections.findById(db, id);
  if (!conn || conn.status === "disconnected") throw new NotFoundError("Connection not found");
  const account = await zernioRepo.findAccount(conn.zernio_account_id);
  if (!account || account.owner_kind !== owner.kind || account.owner_id !== owner.id) throw new NotFoundError("Connection not found");
  try {
    await zernio.deleteAccount(conn.zernio_account_id);
  } catch (err) {
    // Already gone at Zernio is fine: finish the job here.
    if (!(err instanceof zernio.ZernioError && err.status === 404)) throw err;
    logger.warn("Zernio account was already removed", { accountId: conn.zernio_account_id });
  }
  await connections.setStatus(db, conn.zernio_account_id, "disconnected");
  await zernioRepo.markAccountDisconnected(conn.zernio_account_id);
}
