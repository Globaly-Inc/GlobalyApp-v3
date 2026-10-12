// The Channels page: connect, configure and disconnect WhatsApp, Instagram and Facebook.
// Tenant-scoped (req.db) and behind the business/institution context like the rest of the Inbox.

import type { FastifyInstance } from "fastify";
import { requireBusinessOrInstitutionContext } from "../../../core/plugins/auth.plugin.js";
import { BadRequestError, NotFoundError } from "../../../shared/errors.js";
import { recipientFromRequest } from "../../enquiries/shared/recipient.js";
import * as zernio from "../lib/zernio-client.js";
import * as connections from "../repositories/connections.repository.js";
import * as connectService from "../services/connect.service.js";
import { channelConfigFor } from "../services/outbound.service.js";
import { AiConfigSchema, ChannelParamSchema, ConfirmSchema, ConnectSchema, IdParamSchema } from "../schemas/channels.schema.js";
import { aiConfigOf } from "../consts.js";

const guard = { preHandler: requireBusinessOrInstitutionContext };

/** An explicit allow-list: the Zernio account id never leaves the server. */
function present(row: Pick<connections.ConnectionRow, (typeof connections.PUBLIC_COLUMNS)[number]>) {
  return {
    id: row.id, channel: row.channel, display_name: row.display_name, handle: row.handle, status: row.status,
    ai_mode: row.ai_mode, ai_config: aiConfigOf(row.ai_config), quality: row.quality, error_message: row.error_message,
    created_at: row.created_at, updated_at: row.updated_at,
  };
}

export async function channelsRoutes(app: FastifyInstance) {
  app.get("/", guard, async (req) => ({
    configured: zernio.isConfigured(),
    connections: (await connections.list(req.db)).map(present),
  }));

  app.post("/:channel/connect", guard, async (req) => {
    const { channel } = ChannelParamSchema.parse(req.params);
    const input = ConnectSchema.parse(req.body ?? {});
    const owner = recipientFromRequest(req);
    const orgName = (await channelConfigFor(owner)).display_name ?? `${owner.kind} ${owner.id}`;
    const authUrl = await connectService.startConnect({
      owner, orgName, channel, returnPath: input.return_path, db: req.db, reconnectId: input.reconnect_id,
    });
    return { auth_url: authUrl };
  });

  app.post("/:channel/confirm", guard, async (req) => {
    const { channel } = ChannelParamSchema.parse(req.params);
    const input = ConfirmSchema.parse(req.body ?? {});
    const saved = await connectService.confirmConnect({
      owner: recipientFromRequest(req), db: req.db, channel, accountId: input.account_id, userId: Number(req.auth.sub),
    });
    return { connections: saved.map(present) };
  });

  app.patch("/:id/ai", guard, async (req) => {
    const { id } = IdParamSchema.parse(req.params);
    const input = AiConfigSchema.parse(req.body ?? {});
    const row = await connections.updateAi(req.db, id, input);
    if (!row) throw new NotFoundError("Connection not found");
    return { connection: present(row) };
  });

  app.delete("/:id", guard, async (req, reply) => {
    const { id } = IdParamSchema.parse(req.params);
    await connectService.disconnect(recipientFromRequest(req), req.db, id);
    return reply.code(204).send();
  });

  // Approved WhatsApp templates, for sending outside the 24-hour window.
  app.get("/:id/templates", guard, async (req) => {
    const { id } = IdParamSchema.parse(req.params);
    const conn = await connections.findById(req.db, id);
    if (!conn || conn.status === "disconnected") throw new NotFoundError("Connection not found");
    if (conn.channel !== "whatsapp") throw new BadRequestError("Templates are WhatsApp only");
    const templates = await zernio.listWhatsAppTemplates(conn.zernio_account_id);
    return {
      templates: templates
        .filter((t) => !t.status || t.status.toUpperCase() === "APPROVED")
        .map((t) => ({ name: t.name, language: t.language, category: t.category ?? null, components: t.components ?? [] })),
    };
  });
}
