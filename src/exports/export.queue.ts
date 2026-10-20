import { Queue } from "bullmq";

import {
  bullMqProducerConnection,
  EXPORT_QUEUE_NAME,
  type ExportJobData,
} from "./export.queue-config.js";

export const exportQueue = new Queue<ExportJobData>(EXPORT_QUEUE_NAME, {
  connection: bullMqProducerConnection,

  defaultJobOptions: {
    attempts: 3,

    backoff: {
      type: "exponential",
      delay: 1_000,
    },

    removeOnComplete: 100,
    removeOnFail: 100,
  },
});

exportQueue.on("error", (error) => {
  console.error("Export queue error:", error);
});
