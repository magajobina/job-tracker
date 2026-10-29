import type { NextFunction, Request, Response } from "express";
import { z } from "zod";

import { AppError } from "../errors/app-error.js";
import {
  createExport,
  getExportFile,
  getExportStatus,
} from "./export.service.js";
import { logger } from "../observability/logger.js";
import { parsePositiveBigIntId } from "../validation/positive-bigint-id.js";

const CreateExportSchema = z
  .object({
    format: z.literal("csv"),
  })
  .strict();

const IdempotencyKeySchema = z.string().trim().min(1).max(128);

export async function createExportController(req: Request, res: Response) {
  const parsedBody = CreateExportSchema.safeParse(req.body);

  if (!parsedBody.success) {
    res.status(400).json({
      success: false,
      message: "Поддерживается только формат csv",
      error: z.flattenError(parsedBody.error),
    });
    return;
  }

  const parsedIdempotencyKey = IdempotencyKeySchema.safeParse(
    req.get("Idempotency-Key"),
  );

  if (!parsedIdempotencyKey.success) {
    res.status(400).json({
      success: false,
      message:
        "Заголовок Idempotency-Key обязателен и должен содержать не больше 128 символов",
    });
    return;
  }

  const userId = req.session.userId;

  if (!userId) {
    throw new AppError(401, "Необходима авторизация");
  }

  const originRequestId =
    typeof res.locals.requestId === "string" ? res.locals.requestId : undefined;

  const exportRecord = await createExport({
    userId,
    format: parsedBody.data.format,
    idempotencyKey: parsedIdempotencyKey.data,
    originRequestId,
  });

  const requestLogger = res.locals.log ?? logger;

  requestLogger.info(
    {
      event: "export.accepted",
      exportId: exportRecord.id,
      exportStatus: exportRecord.status,
      reused: !exportRecord.created,
    },
    "export accepted",
  );

  res.status(202).json({
    export: {
      id: exportRecord.id,
      status: exportRecord.status,
    },
  });
}

export async function getExportStatusController(req: Request, res: Response) {
  const exportId = parsePositiveBigIntId(req.params.id);
  const userId = req.session.userId;

  if (exportId === null) {
    throw new AppError(400, "Некорректный id экспорта");
  }

  if (!userId) {
    throw new AppError(401, "Необходима авторизация");
  }

  const exportRecord = await getExportStatus(exportId, userId);

  const requestLogger = res.locals.log ?? logger;

  requestLogger.info(
    {
      event: "export.status_read",
      exportId: exportRecord.id,
      exportStatus: exportRecord.status,
    },
    "export status read",
  );

  res.json({
    export: exportRecord,
  });
}

export async function downloadExportController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const exportId = parsePositiveBigIntId(req.params.id);
  const userId = req.session.userId;

  if (exportId === null) {
    throw new AppError(400, "Некорректный id экспорта");
  }

  if (!userId) {
    throw new AppError(401, "Необходима авторизация");
  }

  const exportFile = await getExportFile(exportId, userId);

  res.setHeader("Content-Type", "text/csv; charset=utf-8");

  res.setHeader(
    "Content-Disposition",
    `attachment; filename="applications-${exportFile.id}.csv"`,
  );

  res.sendFile(exportFile.filePath, (error) => {
    if (error) {
      next(error);
      return;
    }
    
    const requestLogger = res.locals.log ?? logger;

    requestLogger.info(
      {
        event: "export.file_sent",
        exportId: exportFile.id,
      },
      "export file sent",
    );
  });
}
