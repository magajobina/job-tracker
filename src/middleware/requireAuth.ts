import type { RequestHandler } from "express";

import { AppError } from "../errors/app-error.js";

export const requireAuth: RequestHandler = (req, res, next) => {
  if (!req.session.userId) {
    next(new AppError(401, "Необходима авторизация"));
    return;
  }

  next();
};
