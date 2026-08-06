# Shared Logger

Structured logging via [Winston](https://github.com/winstonjs/winston) with OpenTelemetry trace correlation and per-request context.

## Location

```
backend/src/shared/logger.ts
```

## API

### Default logger

```ts
import logger from "../shared/logger.js";

logger.info("Server started", { port: 3000 });
logger.error("Something broke", { error });
```

### Child logger (preferred for services)

```ts
import { createChildLogger } from "../shared/logger.js";

const logger = createChildLogger("my-service");
logger.info("Processing item");
// → 2026-08-06 12:00:00 [info]: req=abc trace_id=xyz my-service Processing item
```

The `service` field is automatically included in every log entry from a child logger.

## Log format

Each line includes:

| Field        | Source                                     |
| ------------ | ------------------------------------------ |
| `timestamp`  | `YYYY-MM-DD HH:mm:ss`                     |
| `level`      | Winston level (debug, info, warn, error)   |
| `request_id` | From `request-context.plugin` AsyncLocalStorage |
| `trace_id`   | OpenTelemetry active span                  |
| `span_id`    | OpenTelemetry active span                  |
| `message`    | Log message                                |
| `metadata`   | JSON-stringified extra fields              |

## Transports

| Environment   | Transports                                                     |
| ------------- | -------------------------------------------------------------- |
| `development` | Console only (colorized, debug level)                          |
| `production`  | Console + `logs/error.log` (errors) + `logs/combined.log` (all) |

File transports rotate at 5 MB with 5 files max.

## Levels

Development: `debug` and above. Production: `info` and above.
