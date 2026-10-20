import "dotenv/config";
import express from "express";
import { db } from "./db.js";
import { AppDataSource } from "./data-source.js";
import { Job } from "./entities/job.entity.js";
import { User } from "./entities/user.entity.js";
import { FindOptionsWhere, ILike, QueryFailedError } from "typeorm";
import z from "zod";
import { createJobController } from "./jobs/jobs.controller.js";
import { errorHandler } from "./middleware/error-handler.js";
import { AppError } from "./errors/app-error.js";
import { sessionMiddleware } from "./middleware/session.js";
import { connectRedis, redisClient } from "./redis.js";
import {
  csrfSynchronisedProtection,
  generateToken,
} from "./middleware/csrf.js";
import {
  authMeController,
  loginController,
  logoutController,
  registerController,
} from "./auth/auth.controller.js";
import { originProtection } from "./middleware/origin-protection.js";
import { requireAuth } from "./middleware/requireAuth.js";
import {
  Application,
  APPLICATION_STATUSES,
} from "./entities/application.entity.js";
import { loginRateLimiter } from "./middleware/login-rate-limiter.js";
import {
  createJobsCacheKey,
  readJobsCache,
  writeJobsCache,
  invalidateJobsCache,
} from "./jobs/jobs.cache.js";
import {
  createExportController,
  downloadExportController,
  getExportStatusController,
} from "./exports/export.controller.js";
import { exportQueue } from "./exports/export.queue.js";
import { requeueInterruptedExports } from "./exports/export.repository.js";

await AppDataSource.initialize();
await connectRedis();
const jobsRepository = AppDataSource.getRepository(Job);
const usersRepository = AppDataSource.getRepository(User);
const applicationsRepository = AppDataSource.getRepository(Application);

const app = express();
const port = Number(process.env.PORT ?? 3000);

const JobBodySchema = z.object({
  title: z.string().trim().min(1),
  company: z.string().trim().min(1),
  salary: z.number().int().positive().nullish(),
});
const ApplicationsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(10),
  status: z.enum(APPLICATION_STATUSES).optional(),
});
const CreateApplicationSchema = z
  .object({
    jobId: z.string().regex(/^\d+$/, "Некорректный jobId"),
  })
  .strict();
const UpdateApplicationSchema = z
  .object({
    status: z.enum(APPLICATION_STATUSES),
  })
  .strict();

app.use(express.json());
app.use(sessionMiddleware);

app.get("/auth/csrf", (req, res) => {
  const csrfToken = generateToken(req);

  res.set("Cache-Control", "no-store");
  res.json({ csrfToken });
});

app.use(originProtection);
app.use(csrfSynchronisedProtection);

app.post("/auth/register", registerController);
app.post("/auth/login", loginRateLimiter, loginController);
app.get("/auth/me", authMeController);
app.post("/auth/logout", logoutController);

app.post("/exports", requireAuth, createExportController);
app.get("/exports/:id/file", requireAuth, downloadExportController);
app.get("/exports/:id", requireAuth, getExportStatusController);

app.get("/applications", requireAuth, async (req, res) => {
  const parsedQuery = ApplicationsQuerySchema.safeParse(req.query);

  if (!parsedQuery.success) {
    res.status(400).json({
      success: false,
      message: "Некорректные параметры запроса",
      error: z.treeifyError(parsedQuery.error),
    });
    return;
  }

  const userId = req.session.userId;

  if (!userId) {
    throw new AppError(401, "Необходима авторизация");
  }

  const { page, limit, status } = parsedQuery.data;
  const [applications, total] = await applicationsRepository.findAndCount({
    where: {
      user: { id: userId },
      ...(status ? { status } : {}),
    },
    relations: {
      job: true,
    },
    take: limit,
    skip: (page - 1) * limit,
    order: {
      createdAt: "DESC",
      id: "DESC",
    },
  });

  const items = applications.map((application) => ({
    id: application.id,
    job: {
      id: application.job.id,
      title: application.job.title,
      company: application.job.company,
    },
    status: application.status,
    createdAt: application.createdAt,
  }));

  res.json({ items, total, page, limit });
});

app.post("/applications", requireAuth, async (req, res) => {
  const parsedBody = CreateApplicationSchema.safeParse(req.body);

  if (!parsedBody.success) {
    res.status(400).json({
      success: false,
      message: "Ошибка валидации данных",
      error: z.treeifyError(parsedBody.error),
    });
    return;
  }

  const userId = req.session.userId;

  if (!userId) {
    throw new AppError(401, "Необходима авторизация");
  }

  const job = await jobsRepository.findOneBy({
    id: parsedBody.data.jobId,
  });

  if (!job) {
    throw new AppError(404, "Вакансия не найдена");
  }

  const application = applicationsRepository.create({
    user: { id: userId },
    job,
    status: "new",
  });

  try {
    const savedApplication = await applicationsRepository.save(application);

    res.status(201).json({
      application: {
        id: savedApplication.id,
        job: {
          id: job.id,
          title: job.title,
          company: job.company,
        },
        status: savedApplication.status,
        createdAt: savedApplication.createdAt,
      },
    });
  } catch (error) {
    const isUniqueViolation =
      error instanceof QueryFailedError &&
      (error.driverError as { code?: string }).code === "23505";

    if (isUniqueViolation) {
      throw new AppError(409, "Вы уже откликнулись на эту вакансию");
    }

    throw error;
  }
});

app.patch("/applications/:id", requireAuth, async (req, res) => {
  const applicationId = String(req.params.id);
  const userId = req.session.userId;

  if (!/^\d+$/.test(applicationId)) {
    throw new AppError(400, "Некорректный id отклика");
  }

  if (!userId) {
    throw new AppError(401, "Необходима авторизация");
  }

  const parsedBody = UpdateApplicationSchema.safeParse(req.body);

  if (!parsedBody.success) {
    res.status(400).json({
      success: false,
      message: "Ошибка валидации данных",
      error: z.treeifyError(parsedBody.error),
    });
    return;
  }

  const application = await applicationsRepository.findOne({
    where: {
      id: applicationId,
      user: {
        id: userId,
      },
    },
    relations: {
      job: true,
    },
  });

  if (!application) {
    throw new AppError(404, "Отклик не найден");
  }

  application.status = parsedBody.data.status;

  const savedApplication = await applicationsRepository.save(application);

  res.json({
    application: {
      id: savedApplication.id,
      job: {
        id: application.job.id,
        title: application.job.title,
        company: application.job.company,
      },
      status: savedApplication.status,
      createdAt: savedApplication.createdAt,
    },
  });
});

app.delete("/applications/:id", requireAuth, async (req, res) => {
  const applicationId = String(req.params.id);
  const userId = req.session.userId;

  if (!/^\d+$/.test(applicationId)) {
    throw new AppError(400, "Некорректный id отклика");
  }

  if (!userId) {
    throw new AppError(401, "Необходима авторизация");
  }

  const deletedRows = await applicationsRepository.sql<{ id: string }[]>`
    DELETE FROM public.applications
    WHERE id = ${applicationId}
      AND user_id = ${userId}
    RETURNING id
  `;

  if (deletedRows.length === 0) {
    throw new AppError(404, "Отклик не найден");
  }

  res.status(204).end();
});

app.get("/test", async (_req, res) => {
  res.json({
    status: "ok",
    databaseTime: Date.now(),
  });
});

app.get("/health", async (_req, res) => {
  const result = await db.query("SELECT now() AS database_time");
  res.json({
    status: "ok",
    databaseTime: result.rows[0].database_time,
  });
});

app.delete("/jobs/:id", requireAuth, async (req, res) => {
  const jobId = String(req.params.id);
  const userId = req.session.userId;

  if (!/^\d+$/.test(jobId)) {
    res.status(400).json({
      success: false,
      message: "Некорректный id",
    });
    return;
  }

  if (!userId) {
    throw new AppError(401, "Необходима авторизация");
  }

  const deleteResult = await jobsRepository.sql`
    DELETE FROM public.jobs
    WHERE id = ${jobId}
    AND created_by = ${userId}
    RETURNING id
  `;

  if (deleteResult.length === 0) {
    throw new AppError(404, "Вакансия не найдена");
  }

  await invalidateJobsCache();

  res.status(204).end();
});

app.patch("/jobs/:id", requireAuth, async (req, res) => {
  const UpdatedJobSchema = JobBodySchema.partial().strict();
  const jobId = String(req.params.id);
  const userId = req.session.userId;

  if (!/^\d+$/.test(jobId)) {
    res.status(400).json({
      success: false,
      message: "Некорректный id",
    });
    return;
  }

  if (!userId) {
    throw new AppError(401, "Необходима авторизация");
  }

  const oldJob = await jobsRepository.findOne({
    where: {
      id: jobId,
      createdBy: {
        id: userId,
      },
    },
  });

  if (!oldJob) {
    res.status(404).json({
      success: false,
      message: `Job с id ${jobId} не найдена у текущего юзера`,
    });
    return;
  }

  const oldJobSnapshot = { ...oldJob };

  const {
    data: zParsedJob,
    success,
    error,
  } = UpdatedJobSchema.safeParse(req.body);

  if (!success) {
    res.status(400).json({
      success,
      message: "Ошибка валидации данных",
      error: z.treeifyError(error),
    });
    return;
  }

  if (Object.keys(zParsedJob).length === 0) {
    res
      .status(400)
      .json({ success: false, message: "Вы передали пустой объект пепе" });
    return;
  }

  const mergedJob = jobsRepository.merge(oldJob, zParsedJob);

  const savedJob = await jobsRepository.save(mergedJob);

  await invalidateJobsCache();

  res.status(200).json({
    job: {
      id: savedJob.id,
      title: savedJob.title,
      company: savedJob.company,
      salary: savedJob.salary,
      createdAt: savedJob.createdAt,
    },
  });
});

app.post("/jobs", requireAuth, createJobController);

// Клиент отправляет GET /jobs?page=1&limit=10&q=Backend&company=Acme&sort=created_at_desc.
// q ищет подстроку в названии без учёта регистра; company — точное совпадение.
// Оба фильтра необязательны. sort допускает только created_at_desc и created_at_asc.
app.get("/jobs", async (req, res) => {
  const page = Number(req.query.page ?? 1);
  const limit = Number(req.query.limit ?? 10);
  const sort = req.query.sort ?? "created_at_desc";
  let sortOrder: "DESC" | "ASC" = "DESC";
  const where: FindOptionsWhere<Job> = {};

  const company =
    typeof req.query.company === "string"
      ? req.query.company.trim().toLowerCase()
      : "";

  const q =
    typeof req.query.q === "string" ? req.query.q.trim().toLowerCase() : "";

  if (!Number.isInteger(page) || page <= 0) {
    res.status(400).json({
      message: "query запрос page должен быть положительным целым числом",
    });
    return;
  }

  if (!Number.isInteger(limit) || limit <= 0) {
    res.status(400).json({
      message: "query запрос limit должен быть положительным целым числом",
    });
    return;
  }

  if (limit > 100) {
    res.status(400).json({
      message:
        "query запрос limit должен быть положительным целым числом меньше 100",
    });
    return;
  }

  const skip = (page - 1) * limit;

  if (company) {
    where.company = ILike(company);
  }

  if (q) {
    where.title = ILike(`%${q}%`);
  }

  if (
    typeof sort !== "string" ||
    !["created_at_desc", "created_at_asc"].includes(sort)
  ) {
    res.status(400).json({
      message: "Недопустимое значение sort",
    });
    return;
  }

  sortOrder = sort === "created_at_asc" ? "ASC" : "DESC";

  // КЕШ РЕДИСА НАЧАЛО------
  let cacheKey: string | null = null;

  try {
    cacheKey = await createJobsCacheKey({
      page,
      limit,
      q,
      company,
      sort,
    });

    const cachedResponse = await readJobsCache(cacheKey);

    if (cachedResponse !== null) {
      console.log("cache_hit");

      res.json(JSON.parse(cachedResponse));
      return;
    }

    console.log("cache_miss");
  } catch (error) {
    console.error("Jobs cache unavailable:", error);

    // Продолжаем выполнение и читаем PostgreSQL.
    cacheKey = null;
  }
  // КЕШ РЕДИСА КОНЕЦ------

  const [items, total] = await jobsRepository.findAndCount({
    take: limit,
    skip,
    where,
    order: {
      createdAt: sortOrder,
      id: sortOrder,
    },
  });

  const publicItems = items.map((job) => ({
    id: job.id,
    title: job.title,
    company: job.company,
    createdAt: job.createdAt,
  }));

  const response = {
    items: publicItems,
    total,
    page,
    limit,
  };

  // КЕШ РЕДИСА НАЧАЛО----
  if (cacheKey !== null) {
    try {
      await writeJobsCache(cacheKey, response);
    } catch (error) {
      console.error("Не удалось записать jobs cache:", error);
    }
  }
  // КЕШ РЕДИСА КОНЕЦ----

  res.json(response);
});

// app.get("/make-some-job", async (_req, res) => {
//   const [user] = await usersRepository.find({
//     take: 1,
//     order: {
//       id: "DESC",
//     },
//   });

//   if (!user) {
//     res.status(404).json({
//       message: "В базе нет пользователей",
//     });
//     return;
//   }

//   const job = jobsRepository.create({
//     title: "Опа TypeORM в деле сучара",
//     company: "Компанейская компания",
//     createdBy: user,
//   });

//   await jobsRepository.save(job);
//   res.json(job);
// });

// app.get("/jobs/n-plus-1", async (req, res) => {
//   const jobs = await jobsRepository.find({
//     take: 20,
//     order: {
//       id: "DESC",
//     },
//   });

//   const authors = await Promise.all(
//     jobs.map((job) => usersRepository.findOneBy({ id: job.createdById })),
//   );

//   res.json(authors);
// });

// app.get("/jobs/n-plus-1", async (req, res) => {
//   const jobs = await jobsRepository.find({
//     take: 20,
//     order: {
//       id: "DESC",
//     },
//     relations: {
//       createdBy: true,
//     },
//   });
//   // const jobs = await jobsRepository.sql`
//   // SELECT
//   //   j.id,
//   //   j.title,
//   //   j.company,
//   //   j.created_at,
//   //   json_build_object(
//   //     'id', u.id,
//   //     'email', u.email,
//   //     'name', u.name
//   //   ) AS "createdBy"
//   // FROM public.jobs AS j
//   // JOIN public.users AS u ON u.id = j.created_by
//   // ORDER BY j.id
//   // LIMIT 20;
//   // `;

//   res.json(jobs);
// });

app.get("/jobs/:id", async (req, res) => {
  const result = await db.query("SELECT * FROM jobs WHERE id = $1", [
    req.params.id,
  ]);

  res.json(result.rows[0]);
});

app.use(errorHandler);

const server = app.listen(port, () => {
  console.log(`API started on http://localhost:${port}`);
});

let isShuttingDown = false;

function closeHttpServer() {
  return new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

async function shutdown(signal: string) {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log(`Получен ${signal}. Завершаем работу...`);

  try {
    await closeHttpServer();

    await exportQueue.close();

    if (redisClient.isOpen) {
      await redisClient.quit();
    }

    if (AppDataSource.isInitialized) {
      await AppDataSource.destroy();
    }

    await db.end();

    console.log("Приложение корректно остановлено");
    process.exit(0);
  } catch (error) {
    console.error("Ошибка при остановке приложения:", error);
    process.exit(1);
  }
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
