import type { FastifyRequest } from "fastify";
import jwt from "jsonwebtoken";
import { config } from "../../../config.js";
import type { AuthClaims } from "../../../core/types.js";

/**
 * These public/unauthenticated institution routes should still let a logged-in institution
 * owner preview their own unpublished profile or courses (the self-service "Preview" button).
 * An Authorization header, if present, is decoded (never required) and its orgId is returned
 * as the one schema allowed to bypass is_published.
 *
 * Only accepts a dedicated preview_token (issuePreviewToken, auth.service.ts) — never the
 * caller's own session access token. A session token has no `purpose` claim and is rejected,
 * so a leaked preview link (browser history, logs, referrer) is a 10-minute, org-scoped,
 * read-bypass-only credential, not a reusable login.
 */
export function resolvePreviewSchemaName(req: FastifyRequest): string | undefined {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return undefined;
  try {
    const claims = jwt.verify(header.slice(7), config.JWT_SECRET) as AuthClaims & { purpose?: string };
    return claims.purpose === "preview" && claims.orgType === "institution" && claims.orgId ? claims.orgId : undefined;
  } catch {
    return undefined;
  }
}
