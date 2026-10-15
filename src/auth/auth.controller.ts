import type { Request, Response } from "express";
import { z } from "zod";

import { getAuthMeUser, loginUser, registerUser } from "./auth.service.js";
import { AppError } from "../errors/app-error.js";

const RegisterBodySchema = z
  .object({
    name: z.string().trim().min(1),
    email: z.string().trim().toLowerCase().pipe(z.email()),
    password: z.string().min(8).max(128),
  })
  .strict();

const LoginBodySchema = z
  .object({
    email: z.string().trim().toLowerCase().pipe(z.email()),
    password: z.string().min(1).max(128),
  })
  .strict();

function regenerateSession(req: Request) {
  return new Promise<void>((resolve, reject) => {
    req.session.regenerate((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

function saveSession(req: Request) {
  return new Promise<void>((resolve, reject) => {
    req.session.save((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

function destroySession(req: Request) {
  return new Promise<void>((resolve, reject) => {
    req.session.destroy((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

export async function registerController(req: Request, res: Response) {
  const result = RegisterBodySchema.safeParse(req.body);

  if (!result.success) {
    res.status(400).json({
      success: false,
      message: "Ошибка валидации данных",
      error: z.flattenError(result.error),
    });
    return;
  }

  const user = await registerUser(result.data);

  await regenerateSession(req);

  req.session.userId = user.id;

  await saveSession(req);

  res.set("Cache-Control", "no-store");

  res.status(201).json({
    user,
  });
}

export async function loginController(req: Request, res: Response) {
  const result = LoginBodySchema.safeParse(req.body);

  if (!result.success) {
    res.status(400).json({
      success: false,
      message: "Ошибка валидации данных",
      error: z.flattenError(result.error),
    });
    return;
  }

  const user = await loginUser(result.data);

  await regenerateSession(req);

  req.session.userId = user.id;

  await saveSession(req);

  res.set("Cache-Control", "no-store");

  console.log(req.session);

  res.status(200).json({
    user,
  });
}

export async function authMeController(req: Request, res: Response) {
  const userId = req.session.userId;

  if (!userId) {
    throw new AppError(401, "Необходима авторизация");
  }

  const user = await getAuthMeUser(userId);

  res.set("Cache-Control", "no-store");

  res.status(200).json({
    user,
  });
}

export async function logoutController(req: Request, res: Response) {
  await destroySession(req);

  res.clearCookie("job-tracker.sid", {
    httpOnly: true,
    sameSite: "lax",
    secure: false,
    path: "/",
  });

  res.set("Cache-Control", "no-store");

  res.status(204).end();
}
