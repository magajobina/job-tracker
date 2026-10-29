import { z } from "zod";

export const JobBodySchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    company: z.string().trim().min(1).max(200),
    salary: z.number().int().positive().nullish(),
  })
  .strict();
