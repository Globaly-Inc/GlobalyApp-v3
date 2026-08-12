// Public signed read for locally-stored files.
//
// Deliberately public: a browser cannot attach an Authorization header to an <img>/<video> src, so the
// authority to read has to travel in the URL. The HMAC + expiry in the query string is exactly the role a
// GCS signed URL plays — this route is only reachable with a signature this server produced.

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import * as local from "../../../shared/storage/local-driver.js";
import * as filesRepo from "../../../shared/storage/files.repository.js";

const LocalFileQuery = z.object({
  path: z.string().min(1),
  exp: z.string().min(1),
  sig: z.string().min(1),
  download: z.string().optional(),
});

export async function fileRoutes(app: FastifyInstance) {
  app.get("/local", async (req, reply) => {
    const { path, exp, sig, download } = LocalFileQuery.parse(req.query);
    local.verifySignature(path, exp, sig);

    const buffer = await local.read(path);
    // The recorded mime type is authoritative; guessing from the extension would let an upload dictate how
    // it is later interpreted.
    const record = await filesRepo.findFileByPath(path);
    const mimeType = record?.mime_type ?? "application/octet-stream";
    const filename = record?.original_name ?? path.split("/").pop();

    return reply
      .header("Content-Type", mimeType)
      .header("Cache-Control", "private, max-age=3600")
      .header("Content-Disposition", download ? `attachment; filename="${filename}"` : "inline")
      .send(buffer);
  });
}
