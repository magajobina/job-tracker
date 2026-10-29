import type { ErrorRequestHandler } from "express";
import { QueryFailedError } from "typeorm";

import { AppError } from "../errors/app-error.js";
import { logger } from "../observability/logger.js";

function isCsrfError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "EBADCSRFTOKEN"
  );
}

function hasErrorType(error: unknown, expectedType: string) {
  return (
    typeof error === "object" &&
    error !== null &&
    "type" in error &&
    error.type === expectedType
  );
}

export const errorHandler: ErrorRequestHandler = (error, _req, res, next) => {
  if (res.headersSent) {
    next(error);
    return;
  }

  if (isCsrfError(error)) {
    res.status(403).json({
      success: false,
      message: "Некорректный CSRF-токен",
    });
    return;
  }

  if (hasErrorType(error, "entity.too.large")) {
    res.status(413).json({
      success: false,
      message: "Тело запроса слишком большое",
    });
    return;
  }

  if (hasErrorType(error, "entity.parse.failed")) {
    res.status(400).json({
      success: false,
      message: "Некорректный JSON",
    });
    return;
  }

  if (error instanceof AppError) {
    res.status(error.statusCode).json({
      success: false,
      message: error.message,
    });
    return;
  }

  const isForeignKeyError =
    error instanceof QueryFailedError &&
    (error.driverError as { code?: string }).code === "23503";

  if (isForeignKeyError) {
    res.status(409).json({
      success: false,
      message: "Операция запрещена связанными данными",
    });
    return;
  }

  const requestLogger = res.locals.log ?? logger;

  requestLogger.error(
    {
      event: "http.error",
      errorCode: "INTERNAL_ERROR",
      stage: "error_handler",
    },
    "unexpected request error",
  );

  const requestId =
    typeof res.locals.requestId === "string" ? res.locals.requestId : undefined;

  res.status(500).json({
    error: {
      code: "INTERNAL_ERROR",
      message: "Не удалось выполнить запрос",
    },
    requestId,
  });
};
