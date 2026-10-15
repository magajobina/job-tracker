import { findUserById } from "../auth/auth.repository.js";
import { AppError } from "../errors/app-error.js";
import { saveJob } from "./jobs.repository.js";

export type CreateJobInput = {
  title: string;
  company: string;
  salary?: number | null;
};

export async function createJob(input: CreateJobInput, userId: string) {
  const user = await findUserById(userId);

  if (!user) {
    throw new AppError(401, "Необходима авторизация");
  }

  const savedJob = await saveJob({
    title: input.title,
    company: input.company,
    salary: input.salary ?? null,
    createdBy: user,
  });

  return {
    id: savedJob.id,
    title: savedJob.title,
    company: savedJob.company,
    salary: savedJob.salary,
    createdAt: savedJob.createdAt,
  };
}
