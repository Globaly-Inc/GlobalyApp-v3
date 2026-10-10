// Spreadsheet institution import routes — see services/spreadsheet-import.service.ts.

import type { FastifyInstance } from "fastify";
import { SpreadsheetCheckNamesSchema, SpreadsheetImportSchema } from "../schemas/spreadsheet-import.schema.js";
import * as service from "../services/spreadsheet-import.service.js";

export async function spreadsheetImportRoutes(app: FastifyInstance) {
  const adminId = (req: any) => Number(req.auth.sub);

  // POST /spreadsheet/check-names — which of these institution names already exist
  app.post("/spreadsheet/check-names", async (req, reply) => {
    const { names } = SpreadsheetCheckNamesSchema.parse(req.body);
    return reply.send({ existing: await service.findExistingNames(names) });
  });

  // POST /spreadsheet/import — one institution (tab) per request; staged by the worker.
  // bodyLimit: a few thousand mapped rows run past Fastify's 1 MB default.
  app.post("/spreadsheet/import", { bodyLimit: 20 * 1024 * 1024 }, async (req, reply) => {
    const input = SpreadsheetImportSchema.parse(req.body);
    return reply.status(202).send(await service.startImport(input, adminId(req)));
  });
}
