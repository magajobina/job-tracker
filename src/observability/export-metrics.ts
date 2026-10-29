import { Gauge, type Registry } from "prom-client";

import { AppDataSource } from "../data-source.js";
import { logger } from "./logger.js";

type ExportMetricsRow = {
  queuedCount: string;
  oldestSeconds: number;
};

async function readExportMetrics() {
  const queryRunner = AppDataSource.createQueryRunner();

  await queryRunner.connect();
  await queryRunner.startTransaction();

  try {
    await queryRunner.query("SET TRANSACTION READ ONLY");

    await queryRunner.query("SET LOCAL statement_timeout = '1500ms'");

    const rows = (await queryRunner.query(`
      SELECT
        count(*)::text AS "queuedCount",

        COALESCE(
          EXTRACT(
            EPOCH FROM (
              clock_timestamp() - min(created_at)
            )
          ),
          0
        )::double precision AS "oldestSeconds"

      FROM public.exports
      WHERE status = 'queued'
    `)) as ExportMetricsRow[];

    const row = rows[0];

    if (!row) {
      throw new Error("Export metrics query returned no rows");
    }

    const queued = Number(row.queuedCount);
    const oldestSeconds = Number(row.oldestSeconds);

    if (!Number.isSafeInteger(queued) || queued < 0) {
      throw new Error("Invalid queued exports count");
    }

    if (!Number.isFinite(oldestSeconds) || oldestSeconds < 0) {
      throw new Error("Invalid oldest export age");
    }

    await queryRunner.commitTransaction();

    return {
      queued,
      oldestSeconds,
    };
  } catch (error) {
    if (queryRunner.isTransactionActive) {
      await queryRunner.rollbackTransaction();
    }

    throw error;
  } finally {
    await queryRunner.release();
  }
}

export function createExportMetrics(registry: Registry) {
  const queued = new Gauge({
    name: "exports_queued",
    help: "Business exports currently queued",
    registers: [registry],
  });

  const oldestQueuedAge = new Gauge({
    name: "exports_oldest_queued_age_seconds",
    help: "Age of the oldest queued export",
    registers: [registry],
  });

  const collectionSuccess = new Gauge({
    name: "exports_metrics_collection_success",
    help: "Whether the latest collection succeeded",
    registers: [registry],
  });

  const lastSuccessTimestamp = new Gauge({
    name: "exports_metrics_last_success_timestamp_seconds",
    help: "Unix timestamp of the latest successful collection",
    registers: [registry],
  });

  queued.set(Number.NaN);
  oldestQueuedAge.set(Number.NaN);
  collectionSuccess.set(0);
  lastSuccessTimestamp.set(0);

  let currentRefresh: Promise<void> | null = null;

  async function collect() {
    try {
      const snapshot = await readExportMetrics();

      queued.set(snapshot.queued);

      oldestQueuedAge.set(snapshot.oldestSeconds);

      collectionSuccess.set(1);

      lastSuccessTimestamp.set(Date.now() / 1000);
    } catch {
      queued.set(Number.NaN);
      oldestQueuedAge.set(Number.NaN);
      collectionSuccess.set(0);

      logger.warn(
        {
          event: "exports.metrics_collection_failed",
          errorCode: "EXPORT_METRICS_COLLECTION_FAILED",
        },
        "failed to collect export metrics",
      );
    }
  }

  function refresh() {
    if (currentRefresh) {
      return currentRefresh;
    }

    currentRefresh = collect().finally(() => {
      currentRefresh = null;
    });

    return currentRefresh;
  }

  return {
    refresh,
  };
}
