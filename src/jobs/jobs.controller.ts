import type { Request, Response } from "express";
import { z } from "zod";

import { createJob } from "./jobs.service.js";
import { AppError } from "../errors/app-error.js";

const CreateJobSchema = z
  .object({
    title: z.string().trim().min(1),
    company: z.string().trim().min(1),
    salary: z.number().int().positive().nullish(),
  })
  .strict();

export async function createJobController(req: Request, res: Response) {
  const result = CreateJobSchema.safeParse(req.body);
  const userId = req.session.userId;

  if (!result.success) {
    res.status(400).json({
      success: false,
      message: "Ошибка валидации данных",
      error: z.flattenError(result.error),
    });
    return;
  }

  if (!userId) {
    throw new AppError(401, "Необходима авторизация");
  }

  const job = await createJob(result.data, userId);

  res.status(201).json({
    job,
  });
}
