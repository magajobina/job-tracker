import { redisClient } from "../redis.js";

const JOBS_CACHE_VERSION_KEY = "jt:cache:jobs:version";
const JOBS_CACHE_TTL_SECONDS = 30;

export type JobsCacheParams = {
  page: number;
  limit: number;
  q: string;
  company: string;
  sort: string;
};

export async function createJobsCacheKey(params: JobsCacheParams) {
  // Создаст версию 0, только если ключа ещё нет.
  await redisClient.set(JOBS_CACHE_VERSION_KEY, "0", {
    condition: "NX",
  });

  const version = await redisClient.get(JOBS_CACHE_VERSION_KEY);

  if (version === null) {
    throw new Error("Не удалось получить версию кеша вакансий");
  }

  const query = new URLSearchParams({
    page: String(params.page),
    limit: String(params.limit),
    q: params.q,
    company: params.company,
    sort: params.sort,
  });

  return `jt:cache:jobs:v${version}:${query.toString()}`;
}

export async function readJobsCache(cacheKey: string) {
  return redisClient.get(cacheKey);
}

export async function writeJobsCache(cacheKey: string, response: unknown) {
  await redisClient.set(cacheKey, JSON.stringify(response), {
    EX: JOBS_CACHE_TTL_SECONDS,
  });
}

export async function invalidateJobsCache() {
  try {
    const newVersion = await redisClient.incr(JOBS_CACHE_VERSION_KEY);

    console.log("jobs_cache_invalidated", {
      version: newVersion,
    });
  } catch (error) {
    console.error("Failed to invalidate jobs cache:", error);
  }
}
