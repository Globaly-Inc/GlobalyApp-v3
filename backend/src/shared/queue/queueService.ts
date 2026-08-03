import amqp, { Channel, ChannelModel } from "amqplib";
import { createChildLogger } from "../logger.js";
import { queueConfig, QueueConfig } from "./queueConfig.js";

const logger = createChildLogger("queue-service");

interface ConsumerMetrics {
  queueSize: number;
  processingTimes: number[];
  errorCount: number;
  lastCheckTime: number;
}

interface ScalingConfig {
  prefetch?: number;
  queueSize: {
    scaleUpThreshold: number;
    scaleDownThreshold: number;
    maxWorkers: number;
  };
  processingTime: {
    threshold: number;
    windowSize: number;
  };
  errorRate: {
    threshold: number;
    windowSize: number;
  };
  systemLoad: {
    cpuThreshold: number;
    memoryThreshold: number;
  };
}

interface ConsumerWorker {
  id: number;
  channel: Channel;
  consumerTag: string;
}

class QueueService {
  private connection: ChannelModel | null = null;
  private channel: Channel | null = null;
  private config: QueueConfig;
  private isConnecting = false;
  private workers: Map<string, ConsumerWorker[]> = new Map();
  private metrics: Map<string, ConsumerMetrics> = new Map();
  private scalingIntervals: Map<string, NodeJS.Timeout> = new Map();

  constructor(config: QueueConfig) {
    this.config = config;
  }

  async connect(): Promise<void> {
    if (this.connection && this.channel) return;

    if (this.isConnecting) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      return this.connect();
    }

    this.isConnecting = true;
    try {
      this.connection = await amqp.connect(this.config.url);
      this.channel = await this.connection.createChannel();
      logger.info("Connected to LavinMQ");

      this.connection.on("error", async (err: unknown) => {
        logger.error("Connection error", { error: err });
        await this.reconnect();
      });

      this.connection.on("close", async () => {
        logger.warn("Connection closed");
        await this.reconnect();
      });
    } catch (error) {
      this.isConnecting = false;
      logger.error("Failed to connect", { url: this.config.url, error });
      throw error;
    } finally {
      this.isConnecting = false;
    }
  }

  private async reconnect(): Promise<void> {
    this.connection = null;
    this.channel = null;
    await new Promise((resolve) => setTimeout(resolve, 5000));
    logger.info("Reconnecting...");
    await this.connect();
  }

  async getChannel(): Promise<Channel> {
    if (!this.channel) {
      await this.connect();
    }
    if (!this.channel) {
      throw new Error("Queue channel not available");
    }
    return this.channel;
  }

  private async getSystemMetrics() {
    const cpuUsage = process.cpuUsage();
    const memoryUsage = process.memoryUsage();
    return {
      cpu: (cpuUsage.user + cpuUsage.system) / 1000000,
      memory: (memoryUsage.heapUsed / memoryUsage.heapTotal) * 100,
    };
  }

  private async checkAndScale(queue: string, config: ScalingConfig) {
    try {
      const currentTime = Date.now();
      const metrics = this.metrics.get(queue) || {
        queueSize: 0,
        processingTimes: [],
        errorCount: 0,
        lastCheckTime: Date.now(),
      };

      const queueSize = await this.getQueueSize(queue);
      metrics.queueSize = queueSize;
      metrics.lastCheckTime = currentTime;

      const errorRate = metrics.processingTimes.length > 0
        ? metrics.errorCount / metrics.processingTimes.length
        : 0;
      const systemMetrics = await this.getSystemMetrics();

      const shouldScaleUp =
        metrics.queueSize > config.queueSize.scaleUpThreshold ||
        metrics.processingTimes.some((time) => time > config.processingTime.threshold) ||
        errorRate > config.errorRate.threshold ||
        systemMetrics.cpu > config.systemLoad.cpuThreshold ||
        systemMetrics.memory > config.systemLoad.memoryThreshold;

      const shouldScaleDown =
        metrics.queueSize < config.queueSize.scaleDownThreshold &&
        metrics.processingTimes.every((time) => time < config.processingTime.threshold) &&
        errorRate < config.errorRate.threshold &&
        systemMetrics.cpu < config.systemLoad.cpuThreshold &&
        systemMetrics.memory < config.systemLoad.memoryThreshold;

      const currentWorkers = this.workers.get(queue) || [];

      if (shouldScaleUp && currentWorkers.length < config.queueSize.maxWorkers) {
        await this.addWorker(queue);
        logger.info(`Scaled up workers for queue ${queue}`, {
          queueSize: metrics.queueSize,
          workerCount: currentWorkers.length + 1,
        });
      } else if (shouldScaleDown && currentWorkers.length > 1) {
        await this.removeWorker(queue);
        logger.info(`Scaled down workers for queue ${queue}`, {
          queueSize: metrics.queueSize,
          workerCount: currentWorkers.length - 1,
        });
      }

      // Reset metrics hourly
      if (currentTime - metrics.lastCheckTime > 3600000) {
        metrics.processingTimes = [];
        metrics.errorCount = 0;
      }

      this.metrics.set(queue, metrics);
    } catch (error) {
      logger.error(`Error in scaling check for queue ${queue}`, { error });
    }
  }

  async startScaling(queue: string, config: ScalingConfig, initialWorkers: number = 3) {
    try {
      this.metrics.set(queue, {
        queueSize: 0,
        processingTimes: [],
        errorCount: 0,
        lastCheckTime: Date.now(),
      });

      if (config.prefetch !== undefined) {
        const channel = await this.getChannel();
        await channel.prefetch(config.prefetch);
        logger.info(`Set prefetch to ${config.prefetch} for queue ${queue}`);
      }

      for (let i = 0; i < initialWorkers; i++) {
        await this.addWorker(queue);
      }

      const interval = setInterval(() => this.checkAndScale(queue, config), 60000);
      this.scalingIntervals.set(queue, interval);

      logger.info(`Started auto-scaling for queue ${queue} with ${initialWorkers} initial workers`);
    } catch (error) {
      logger.error(`Error starting auto-scaling for queue ${queue}`, { error });
      throw error;
    }
  }

  async stopScaling(queue: string) {
    try {
      const interval = this.scalingIntervals.get(queue);
      if (interval) {
        clearInterval(interval);
        this.scalingIntervals.delete(queue);
      }

      const workers = this.workers.get(queue) || [];
      await Promise.all(workers.map(() => this.removeWorker(queue)));
      this.workers.delete(queue);
      this.metrics.delete(queue);

      logger.info(`Stopped auto-scaling for queue ${queue}`);
    } catch (error) {
      logger.error(`Error stopping auto-scaling for queue ${queue}`, { error });
      throw error;
    }
  }

  private async addWorker(queue: string) {
    const channel = await this.getChannel();
    const workerId = (this.workers.get(queue)?.length || 0) + 1;
    const consumerTag = `worker_${workerId}`;

    const worker: ConsumerWorker = {
      id: workerId,
      channel,
      consumerTag,
    };

    if (!this.workers.has(queue)) {
      this.workers.set(queue, []);
    }
    this.workers.get(queue)?.push(worker);

    logger.info(`Added worker ${workerId} for queue ${queue}`);
  }

  private async removeWorker(queue: string) {
    const workers = this.workers.get(queue);
    if (workers && workers.length > 0) {
      const worker = workers.pop();
      if (worker) {
        await worker.channel.cancel(worker.consumerTag);
        logger.info(`Removed worker ${worker.id} from queue ${queue}`);
      }
    }
  }

  async getQueueSize(queue: string): Promise<number> {
    const channel = await this.getChannel();
    const queueInfo = await channel.checkQueue(queue);
    return queueInfo.messageCount;
  }

  async publish(queue: string, message: unknown, options: amqp.Options.Publish = { persistent: true }): Promise<void> {
    const channel = await this.getChannel();
    await channel.assertQueue(queue, { durable: true });

    const buffer = Buffer.from(JSON.stringify(message));
    const sent = channel.sendToQueue(queue, buffer, options);
    if (!sent) {
      throw new Error(`Failed to publish message to queue: ${queue}`);
    }

    logger.info(`Message published to ${queue}`);
  }

  async consume(queue: string, callback: (msg: amqp.ConsumeMessage | null) => Promise<void>, options: amqp.Options.Consume = { noAck: false }): Promise<void> {
    const channel = await this.getChannel();
    await channel.assertQueue(queue, { durable: true });

    await channel.consume(queue, async (msg: amqp.ConsumeMessage | null) => {
      if (msg) {
        const startTime = Date.now();
        try {
          await callback(msg);
          channel.ack(msg);

          const metrics = this.metrics.get(queue);
          if (metrics) {
            const processingTime = Date.now() - startTime;
            metrics.processingTimes.push(processingTime);
            if (metrics.processingTimes.length > 100) {
              metrics.processingTimes.shift();
            }
            this.metrics.set(queue, metrics);
          }
        } catch (error) {
          logger.error(`Error processing message on queue ${queue}`, { error });
          channel.nack(msg, false, false);

          const metrics = this.metrics.get(queue);
          if (metrics) {
            metrics.errorCount++;
            this.metrics.set(queue, metrics);
          }
        }
      }
    }, options);

    logger.info(`Started consuming from ${queue}`);
  }

  async close(): Promise<void> {
    for (const [queue] of this.scalingIntervals) {
      await this.stopScaling(queue);
    }

    if (this.channel) {
      await this.channel.close();
      this.channel = null;
    }
    if (this.connection) {
      await this.connection.close();
      this.connection = null;
    }
    logger.info("Connection closed");
  }
}

export const queueService = new QueueService(queueConfig);

export default queueService;
