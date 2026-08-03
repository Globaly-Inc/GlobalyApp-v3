import { config } from "../../config.js";

export interface ScalingDefaults {
  scaleUpThreshold: number;
  scaleDownThreshold: number;
  maxWorkers: number;
  processingTimeThreshold: number;
  errorRateThreshold: number;
  cpuThreshold: number;
  memoryThreshold: number;
}

export interface QueueConfig {
  url: string;
  scaling: ScalingDefaults;
}

export const queueConfig: QueueConfig = {
  url: config.LAVINMQ_URL,
  scaling: {
    scaleUpThreshold: 10,
    scaleDownThreshold: 2,
    maxWorkers: 10,
    processingTimeThreshold: 5000,
    errorRateThreshold: 0.1,
    cpuThreshold: 70,
    memoryThreshold: 80,
  },
};
