import type { ErrorRequestHandler } from "express";
import { QueryFailedError } from "typeorm";

import { AppError } from "../errors/app-error.js";

export const errorHandler: ErrorRequestHandler = (error, _req, res, next) => {
  if (res.headersSent) {
    next(error);
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

  console.error(error);

  res.status(500).json({
    success: false,
    message: "Внутренняя ошибка сервера",
  });
};
