import type { RequestHandler } from "express";

import { AppError } from "../errors/app-error.js";

const allowedOrigin = process.env.LAB_ORIGIN;

if (!allowedOrigin) {
  throw new Error("Переменная LAB_ORIGIN не указана");
}

const protectedMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export const originProtection: RequestHandler = (req, _res, next) => {
  if (!protectedMethods.has(req.method)) {
    next();
    return;
  }

  const requestOrigin = req.get("origin");

  if (requestOrigin !== allowedOrigin) {
    next(new AppError(403, "Недопустимый Origin"));
    return;
  }

  next();
};
