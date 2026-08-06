# Shared Queue Service

AMQP message queue via [LavinMQ](https://lavinmq.com/) (amqplib). Supports publish/consume with auto-scaling workers based on queue depth and system load.

## Location

```
backend/src/shared/queue/
  queueConfig.ts   — reads LavinMQ env vars + scaling defaults
  queueService.ts  — QueueService class + singleton export
```

## Environment Variables

| Variable          | Required | Default     | Description          |
| ----------------- | -------- | ----------- | -------------------- |
| `LAVINMQ_HOST`    | No       | `localhost` | LavinMQ host         |
| `LAVINMQ_PORT`    | No       | `5672`      | AMQP port            |
| `LAVINMQ_USERNAME`| No       | `guest`     | Auth username        |
| `LAVINMQ_PASSWORD`| No       | `guest`     | Auth password        |

Composed into `LAVINMQ_URL`: `amqp://<user>:<pass>@<host>:<port>` in `backend/src/config.ts` (line 65).

## API

### `queueService.publish(queue, message, options?)`

Publish a JSON-serialisable message to a durable queue.

```ts
import queueService from "../shared/queue/queueService.js";

await queueService.publish("email-queue", {
  to: "user@example.com",
  template: "welcome",
});
```

Messages are persistent by default (`{ persistent: true }`).

### `queueService.consume(queue, callback, options?)`

Register a consumer on a queue. Messages are acked on success, nacked (no requeue) on error.

```ts
await queueService.consume("email-queue", async (msg) => {
  const data = JSON.parse(msg.content.toString());
  await processEmail(data);
});
```

### `queueService.connect()` / `queueService.close()`

Manage the AMQP connection lifecycle. Auto-reconnects on connection errors with a 5-second backoff.

### `queueService.getQueueSize(queue)`

Returns current message count in the queue.

## Auto-Scaling

### `queueService.startScaling(queue, config, initialWorkers?)`

Starts auto-scaling for a queue's consumers. Checks every 60 seconds and adjusts worker count based on:

| Signal          | Scale Up When        | Scale Down When      |
| --------------- | -------------------- | -------------------- |
| Queue depth     | > `scaleUpThreshold` | < `scaleDownThreshold` |
| CPU usage       | < `cpuThreshold` (has headroom) | —          |
| Memory usage    | < `memoryThreshold` (has headroom) | —        |

### Scaling Defaults

| Parameter                | Default |
| ------------------------ | ------- |
| `scaleUpThreshold`       | 10      |
| `scaleDownThreshold`     | 2       |
| `maxWorkers`             | 10      |
| `processingTimeThreshold`| 5000 ms |
| `errorRateThreshold`     | 0.1     |
| `cpuThreshold`           | 70%     |
| `memoryThreshold`        | 80%     |

### `queueService.stopScaling(queue)`

Stops the scaling interval and removes all workers for a queue.

## Connection Management

- Auto-reconnect on connection error or close (5s delay)
- Guard against concurrent `connect()` calls via `isConnecting` flag
- All queues are durable (survive broker restarts)
- Consumer metrics (processing times, error counts) tracked per queue
