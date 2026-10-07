import "dotenv/config";
import express from "express";
import { db } from "./db.js";
import { AppDataSource } from "./data-source.js";
import { Job } from "./entities/job.entity.js";
import { User } from "./entities/user.entity.js";
import { FindOptionsWhere, ILike } from "typeorm";
import z from "zod";
import { createJobController } from "./jobs/jobs.controller.js";
import { errorHandler } from "./middleware/error-handler.js";
import { AppError } from "./errors/app-error.js";

await AppDataSource.initialize();
const jobsRepository = AppDataSource.getRepository(Job);
const usersRepository = AppDataSource.getRepository(User);

const app = express();
const port = Number(process.env.PORT ?? 3000);

app.use(express.json());

const JobBodySchema = z.object({
  title: z.string().trim().min(1),
  company: z.string().trim().min(1),
  salary: z.number().int().positive().nullish(),
});

app.get("/test", async (_req, res) => {
  async function test() {
    console.log("1");
    await Promise.resolve();
    console.log("2");
  }
  console.log("A");
  test();
  console.log("B");

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

app.delete("/jobs/:id", async (req, res) => {
  const id = String(req.params.id);

  if (!/^\d+$/.test(id)) {
    res.status(400).json({
      success: false,
      message: "Некорректный id",
    });
    return;
  }

  const deleteResult = await jobsRepository.delete({ id });

  if (deleteResult.affected === 0) {
    throw new AppError(404, "Вакансия не найдена");
  }

  res.status(204).end();
});

app.patch("/jobs/:id", async (req, res) => {
  const UpdatedJobSchema = JobBodySchema.partial().strict();
  const id = String(req.params.id);

  if (!id) {
    res.status(400).json({ success: false, message: "Нет id в параметрах" });
    return;
  }

  if (!/^\d+$/.test(id)) {
    res.status(400).json({
      success: false,
      message: "Некорректный id",
    });
    return;
  }

  const oldJob = await jobsRepository.findOneBy({ id });

  if (!oldJob) {
    res
      .status(404)
      .json({ success: false, message: `Job с id ${id} не найдена` });
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
  console.log(mergedJob);

  const savedJob = await jobsRepository.save(mergedJob);

  res.status(200).json({
    job: savedJob,
  });
});

app.post("/jobs", createJobController);

// Клиент отправляет GET /jobs?page=1&limit=10&q=Backend&company=Acme&sort=created_at_desc.
// q ищет подстроку в названии без учёта регистра; company — точное совпадение.
// Оба фильтра необязательны. sort допускает только created_at_desc и created_at_asc.
app.get("/jobs", async (req, res) => {
  const page = Number(req.query.page ?? 1);
  const limit = Number(req.query.limit ?? 10);
  const sort = req.query.sort ?? "created_at_desc";
  let sortOrder: "DESC" | "ASC" = "DESC";
  const where: FindOptionsWhere<Job> = {};

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

  if (req.query.company && typeof req.query.company === "string") {
    where.company = ILike(req.query.company.trim());
  }

  if (req.query.q && typeof req.query.q === "string") {
    where.title = ILike(`%${req.query.q.trim()}%`);
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

  res.json({
    items: publicItems,
    total,
    page,
    limit,
  });
});

app.get("/make-some-job", async (_req, res) => {
  const [user] = await usersRepository.find({
    take: 1,
    order: {
      id: "DESC",
    },
  });

  if (!user) {
    res.status(404).json({
      message: "В базе нет пользователей",
    });
    return;
  }

  const job = jobsRepository.create({
    title: "Опа TypeORM в деле сучара",
    company: "Компанейская компания",
    createdBy: user,
  });

  await jobsRepository.save(job);
  res.json(job);
});

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
app.get("/jobs/n-plus-1", async (req, res) => {
  const jobs = await jobsRepository.find({
    take: 20,
    order: {
      id: "DESC",
    },
    relations: {
      createdBy: true,
    },
  });
  // const jobs = await jobsRepository.sql`
  // SELECT
  //   j.id,
  //   j.title,
  //   j.company,
  //   j.created_at,
  //   json_build_object(
  //     'id', u.id,
  //     'email', u.email,
  //     'name', u.name
  //   ) AS "createdBy"
  // FROM public.jobs AS j
  // JOIN public.users AS u ON u.id = j.created_by
  // ORDER BY j.id
  // LIMIT 20;
  // `;

  res.json(jobs);
});

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

process.on("SIGTERM", async () => {
  server.close();
  await db.end();
});
