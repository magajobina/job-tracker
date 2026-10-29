import "dotenv/config";

const redisUrlString = process.env.REDIS_URL;

if (!redisUrlString) {
  throw new Error("Переменная REDIS_URL не указана");
}

const redisUrl = new URL(redisUrlString);

const baseConnection = {
  host: redisUrl.hostname,
  port: Number(redisUrl.port || 6379),
};

export const bullMqProducerConnection = {
  ...baseConnection,
};

export const bullMqWorkerConnection = {
  ...baseConnection,

  // Worker должен продолжать переподключаться к Redis,
  // если Redis временно недоступен.
  maxRetriesPerRequest: null,
};

export const EXPORT_QUEUE_NAME = "applications-export";

export type ExportJobData = {
  exportId: string;
  originRequestId?: string;
};
