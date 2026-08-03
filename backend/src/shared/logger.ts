import { createLogger, format, transports, Logger } from "winston";
import { trace } from "@opentelemetry/api";
import { requestStore } from "../core/plugins/request-context.plugin.js";

const env = process.env.NODE_ENV || "development";
const isDevelopment = env === "development";

const isObject = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null && !Array.isArray(value);
};

const traceFormat = format((info) => {
  const span = trace.getActiveSpan();
  if (span) {
    const spanContext = span.spanContext();
    info.trace_id = spanContext.traceId;
    info.span_id = spanContext.spanId;
  }
  const ctx = requestStore.getStore();
  if (ctx) {
    info.request_id = ctx.requestId;
  }
  return info;
})();

const logFormat = format.combine(
  format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
  traceFormat,
  format.errors({ stack: true }),
  format.metadata(),
  isDevelopment ? format.colorize() : format.uncolorize(),
  format.printf(({ timestamp, level, message, metadata, trace_id, span_id, request_id }) => {
    const meta = isObject(metadata) && Object.keys(metadata).length ? JSON.stringify(metadata) : "";
    const traceInfo = trace_id ? ` trace_id=${trace_id} span_id=${span_id}` : "";
    const reqInfo = request_id ? ` req=${request_id}` : "";
    return `${timestamp} [${level}]:${reqInfo}${traceInfo} ${message} ${meta}`;
  }),
);

const logger: Logger = createLogger({
  level: isDevelopment ? "debug" : "info",
  format: logFormat,
  transports: [
    new transports.Console({
      handleExceptions: true,
      handleRejections: true,
    }),
  ],
});

if (!isDevelopment) {
  logger.add(
    new transports.File({
      filename: "logs/error.log",
      level: "error",
      maxsize: 5242880,
      maxFiles: 5,
    }),
  );
  logger.add(
    new transports.File({
      filename: "logs/combined.log",
      maxsize: 5242880,
      maxFiles: 5,
    }),
  );
}

export const createChildLogger = (serviceName: string): Logger => {
  return logger.child({ service: serviceName });
};

export default logger;
