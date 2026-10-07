import { AppError } from "../errors/app-error.js";
import { findLatestUser, saveJob } from "./jobs.repository.js";

export type CreateJobInput = {
  title: string;
  company: string;
  salary?: number | null;
};

export async function createJob(input: CreateJobInput) {
  const user = await findLatestUser();

  if (!user) {
    throw new AppError(404, "Пользователь не найден");
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
