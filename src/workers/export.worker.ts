import "dotenv/config";

import { randomUUID } from "node:crypto";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { Worker } from "bullmq";

import { AppDataSource } from "../data-source.js";
import {
  bullMqWorkerConnection,
  EXPORT_QUEUE_NAME,
  type ExportJobData,
} from "../exports/export.queue-config.js";
import {
  findApplicationsForExport,
  markExportCompleted,
  markExportFailed,
  markExportProcessing,
  markExportQueuedForRetry,
  requeueInterruptedExports,
} from "../exports/export.repository.js";
import {
  getExportFileLocation,
  getTemporaryExportPath,
} from "../exports/export-files.js";
import { logger } from "../observability/logger.js";

function toCsvCell(value: unknown) {
  let text = String(value ?? "");

  // Защита от формул при открытии CSV в Excel.
  if (/^[=+\-@]/.test(text.trimStart())) {
    text = `'${text}`;
  }

  // В CSV кавычка внутри значения удваивается.
  return `"${text.replaceAll('"', '""')}"`;
}

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function safeRequestId(value: unknown) {
  return typeof value === "string" && uuidPattern.test(value)
    ? value
    : undefined;
}

function createCsv(
  applications: Awaited<ReturnType<typeof findApplicationsForExport>>,
) {
  const header = [
    "application_id",
    "job_title",
    "company",
    "status",
    "created_at",
  ];

  const rows = applications.map((application) => [
    application.id,
    application.job.title,
    application.job.company,
    application.status,
    application.createdAt.toISOString(),
  ]);

  return [header, ...rows]
    .map((row) => row.map(toCsvCell).join(","))
    .join("\n");
}

await AppDataSource.initialize();
await requeueInterruptedExports();

const exportsDirectory = resolve(process.cwd(), "var", "exports");

await mkdir(exportsDirectory, {
  recursive: true,
});

const worker = new Worker<ExportJobData>(
  EXPORT_QUEUE_NAME,
  async (job) => {
    const exportId = job.data.exportId;

    const originRequestId = safeRequestId(job.data.originRequestId);

    const jobLogger = logger.child({
      originRequestId,
      exportId,
      queueJobId: job.id,
    });

    jobLogger.info(
      {
        event: "export.started",
        attempt: job.attemptsMade + 1,
      },
      "export started",
    );

    const claimedExport = await markExportProcessing(exportId);

    if (!claimedExport) {
      jobLogger.warn(
        {
          event: "export.skipped",
          reason: "not_queued",
        },
        "export skipped",
      );

      return;
    }

    if (!claimedExport) {
      console.log("export_skipped", {
        exportId,
        reason: "not_queued",
      });

      return;
    }

    const { fileKey, absolutePath: finalPath } =
      getExportFileLocation(exportId);

    const temporaryPath = getTemporaryExportPath(exportId, randomUUID());

    try {
      const applications = await findApplicationsForExport(
        claimedExport.userId,
      );

      const csv = createCsv(applications);

      // BOM помогает Excel правильно распознавать UTF-8.
      await writeFile(temporaryPath, `\uFEFF${csv}`, "utf8");

      // Сначала полностью создаём временный файл,
      // затем публикуем его под окончательным именем.
      await rename(temporaryPath, finalPath);

      await markExportCompleted(exportId, fileKey);

      jobLogger.info(
        {
          event: "export.completed",
          fileKey,
        },
        "export completed",
      );
    } catch (error) {
      console.error("Export processing failed:", {
        exportId,
        error,
      });

      const maximumAttempts = job.opts.attempts ?? 1;

      const currentAttempt = job.attemptsMade + 1;

      const isFinalAttempt = currentAttempt >= maximumAttempts;

      jobLogger.error(
        {
          event: isFinalAttempt ? "export.failed" : "export.retry_scheduled",

          errorCode: "EXPORT_PROCESSING_FAILED",
          attempt: currentAttempt,
          maximumAttempts,
        },
        "export processing failed",
      );

      if (isFinalAttempt) {
        await markExportFailed(exportId, "Не удалось сформировать CSV");
      } else {
        await markExportQueuedForRetry(exportId);
      }

      throw error;
    } finally {
      await rm(temporaryPath, {
        force: true,
      });
    }
  },

  {
    connection: bullMqWorkerConnection,
    concurrency: 2,
  },
);

worker.on("error", (error) => {
  console.error("Export worker error:", error);
});

async function shutdown() {
  console.log("Stopping export worker");

  await worker.close();

  if (AppDataSource.isInitialized) {
    await AppDataSource.destroy();
  }
}

process.on("SIGINT", async () => {
  await shutdown();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  await shutdown();
  process.exit(0);
});

console.log("Export worker started");
