import { createHash } from "node:crypto";
import { stat } from "node:fs/promises";

import { AppError } from "../errors/app-error.js";
import type { ExportFormat } from "../entities/export.entity.js";
import { exportQueue } from "./export.queue.js";
import { findExportByIdForUser, reserveExport } from "./export.repository.js";
import { resolveStoredExportPath } from "./export-files.js";

const EXPORT_OPERATION = "applications-export";

type CreateExportInput = {
  userId: string;
  format: ExportFormat;
  idempotencyKey: string;
};

export async function createExport(input: CreateExportInput) {
  const canonicalRequest = JSON.stringify({
    format: input.format,
  });

  const requestFingerprint = createHash("sha256")
    .update(canonicalRequest)
    .digest("hex");

  const result = await reserveExport({
    userId: input.userId,
    operation: EXPORT_OPERATION,
    format: input.format,
    idempotencyKey: input.idempotencyKey,
    requestFingerprint,
  });

  if (
    !result.created &&
    result.exportRecord.requestFingerprint !== requestFingerprint
  ) {
    throw new AppError(
      409,
      "Этот Idempotency-Key уже использован для другого запроса",
    );
  }

  if (result.exportRecord.status === "queued") {
    try {
      await exportQueue.add(
        "generate-applications-csv",
        {
          exportId: result.exportRecord.id,
        },
        {
          jobId: `export-${result.exportRecord.id}`,
        },
      );
    } catch (error) {
      console.error("Failed to enqueue export:", error);

      throw new AppError(503, "Не удалось поставить экспорт в очередь");
    }
  }

  return {
    id: result.exportRecord.id,
    status: result.exportRecord.status,
  };
}

export async function getExportStatus(exportId: string, userId: string) {
  const exportRecord = await findExportByIdForUser(exportId, userId);

  if (!exportRecord) {
    throw new AppError(404, "Экспорт не найден");
  }

  return {
    id: exportRecord.id,
    status: exportRecord.status,
  };
}

export async function getExportFile(exportId: string, userId: string) {
  const exportRecord = await findExportByIdForUser(exportId, userId);

  if (!exportRecord) {
    throw new AppError(404, "Экспорт не найден");
  }

  if (exportRecord.status !== "completed") {
    throw new AppError(409, "Файл экспорта ещё не готов");
  }

  if (!exportRecord.filePath) {
    throw new Error(
      `Экспорт ${exportId} завершён, но путь к файлу отсутствует`,
    );
  }

  let filePath: string;

  try {
    filePath = resolveStoredExportPath(exportRecord.id, exportRecord.filePath);

    const fileInfo = await stat(filePath);

    if (!fileInfo.isFile()) {
      throw new Error("Путь экспорта не является файлом");
    }
  } catch (error) {
    console.error("Export file is unavailable:", error);

    throw new AppError(500, "Файл экспорта недоступен");
  }

  return {
    id: exportRecord.id,
    filePath,
  };
}
