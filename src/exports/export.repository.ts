import { AppDataSource } from "../data-source.js";
import { Application } from "../entities/application.entity.js";
import {
  ExportRecord,
  type ExportFormat,
  type ExportStatus,
} from "../entities/export.entity.js";

type ReserveExportInput = {
  userId: string;
  operation: string;
  format: ExportFormat;
  idempotencyKey: string;
  requestFingerprint: string;
};

type ExportRow = {
  id: string;
  status: ExportStatus;
  requestFingerprint: string;
};

export async function reserveExport(input: ReserveExportInput) {
  return AppDataSource.transaction(async (manager) => {
    const insertedRows = await manager.query<ExportRow[]>(
      `
        INSERT INTO public.exports (
          user_id,
          operation,
          format,
          status,
          idempotency_key,
          request_fingerprint
        )
        VALUES ($1, $2, $3, 'queued', $4, $5)
        ON CONFLICT (
          user_id,
          operation,
          idempotency_key
        )
        DO NOTHING
        RETURNING
          id,
          status,
          request_fingerprint AS "requestFingerprint"
      `,
      [
        input.userId,
        input.operation,
        input.format,
        input.idempotencyKey,
        input.requestFingerprint,
      ],
    );

    const insertedExport = insertedRows[0];

    if (insertedExport) {
      return {
        exportRecord: insertedExport,
        created: true,
      };
    }

    const existingRows = await manager.query<ExportRow[]>(
      `
        SELECT
          id,
          status,
          request_fingerprint AS "requestFingerprint"
        FROM public.exports
        WHERE user_id = $1
          AND operation = $2
          AND idempotency_key = $3
      `,
      [input.userId, input.operation, input.idempotencyKey],
    );

    const existingExport = existingRows[0];

    if (!existingExport) {
      throw new Error("Экспорт не создался и не был найден после конфликта");
    }

    return {
      exportRecord: existingExport,
      created: false,
    };
  });
}

export async function findExportByIdForUser(exportId: string, userId: string) {
  const exportsRepository = AppDataSource.getRepository(ExportRecord);

  return exportsRepository.findOne({
    where: {
      id: exportId,
      user: {
        id: userId,
      },
    },
  });
}

export async function markExportProcessing(exportId: string) {
  const rows = await AppDataSource.query<
    Array<{
      id: string;
      userId: string;
    }>
  >(
    `
      UPDATE public.exports
      SET
        status = 'processing',
        error_message = NULL
      WHERE id = $1
        AND status = 'queued'
      RETURNING
        id,
        user_id AS "userId"
    `,
    [exportId],
  );

  return rows[0] ?? null;
}

export async function findApplicationsForExport(userId: string) {
  const applicationsRepository = AppDataSource.getRepository(Application);

  return applicationsRepository.find({
    where: {
      user: {
        id: userId,
      },
    },
    relations: {
      job: true,
    },
    order: {
      id: "ASC",
    },
  });
}

export async function markExportCompleted(exportId: string, filePath: string) {
  const result = await AppDataSource.query<{ id: string }[]>(
    `
      UPDATE public.exports
      SET
        status = 'completed',
        file_path = $2,
        error_message = NULL
      WHERE id = $1
        AND status = 'processing'
      RETURNING id
    `,
    [exportId, filePath],
  );

  if (!result[0]) {
    throw new Error(`Не удалось завершить export ${exportId}`);
  }
}

export async function markExportQueuedForRetry(exportId: string) {
  await AppDataSource.query(
    `
      UPDATE public.exports
      SET
        status = 'queued',
        error_message = NULL
      WHERE id = $1
        AND status = 'processing'
    `,
    [exportId],
  );
}

export async function markExportFailed(exportId: string, safeMessage: string) {
  await AppDataSource.query(
    `
      UPDATE public.exports
      SET
        status = 'failed',
        file_path = NULL,
        error_message = $2
      WHERE id = $1
    `,
    [exportId, safeMessage],
  );
}

export async function requeueInterruptedExports() {
  await AppDataSource.query(`
    UPDATE public.exports
    SET status = 'queued'
    WHERE status = 'processing'
  `);
}
