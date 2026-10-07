import type { Request, Response } from "express";
import { z } from "zod";

import { createJob } from "./jobs.service.js";

const CreateJobSchema = z
  .object({
    title: z.string().trim().min(1),
    company: z.string().trim().min(1),
    salary: z.number().int().positive().nullish(),
  })
  .strict();

export async function createJobController(req: Request, res: Response) {
  const result = CreateJobSchema.safeParse(req.body);

  if (!result.success) {
    res.status(400).json({
      success: false,
      message: "Ошибка валидации данных",
      error: z.flattenError(result.error),
    });
    return;
  }
  const job = await createJob(result.data);

  res.status(201).json({
    job,
  });
}
