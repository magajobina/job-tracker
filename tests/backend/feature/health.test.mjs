import "dotenv/config";
import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";
import { randomUUID } from "node:crypto";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required");
}

const databaseName = new URL(databaseUrl).pathname.slice(1);

if (!databaseName.startsWith("job_tracker_lab_")) {
  throw new Error("Feature tests require a separate lab database");
}

async function waitForReadiness(url, apiProcess) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (apiProcess.exitCode !== null) {
      throw new Error(`API завершился с кодом ${apiProcess.exitCode}`);
    }

    try {
      const response = await fetch(url);

      if (response.ok) {
        return response;
      }
    } catch {
      // API пока запускается
    }

    await delay(250);
  }

  throw new Error("API не стал готовым за 10 секунд");
}

async function getCsrf(baseUrl, cookie) {
  const response = await fetch(`${baseUrl}/auth/csrf`, {
    headers: cookie ? { cookie } : {},
  });

  assert.equal(response.status, 200);

  const { csrfToken } = await response.json();
  const newSetCookie = response.headers.getSetCookie()[0];

  return {
    csrfToken,
    cookie: newSetCookie?.split(";")[0] ?? cookie,
  };
}

async function waitForExport(baseUrl, exportId, cookie) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const response = await fetch(`${baseUrl}/exports/${exportId}`, {
      headers: {
        cookie,
      },
    });

    assert.equal(response.status, 200);

    const result = await response.json();

    if (result.export.status === "completed") {
      return result.export;
    }

    if (result.export.status === "failed") {
      throw new Error(`Экспорт ${exportId} завершился ошибкой`);
    }

    await delay(250);
  }

  throw new Error(`Экспорт ${exportId} не завершился за 20 секунд`);
}

test("API подключается к PostgreSQL и Redis", async () => {
  const port = 3101;

  const apiProcess = spawn(process.execPath, ["dist/src/main.js"], {
    env: {
      ...process.env,
      PORT: String(port),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let logs = "";
  let workerProcess;

  apiProcess.stdout.on("data", (chunk) => {
    logs += chunk.toString();
  });

  apiProcess.stderr.on("data", (chunk) => {
    logs += chunk.toString();
  });

  try {
    const response = await waitForReadiness(
      `http://127.0.0.1:${port}/health/ready`,
      apiProcess,
    );

    const baseUrl = `http://127.0.0.1:${port}`;
    const origin = process.env.LAB_ORIGIN;

    assert.ok(origin, "LAB_ORIGIN is required");

    // Получаем CSRF и первую сессионную cookie
    const csrfResponse = await fetch(`${baseUrl}/auth/csrf`);

    assert.equal(csrfResponse.status, 200);

    const { csrfToken } = await csrfResponse.json();
    const initialSetCookie = csrfResponse.headers.getSetCookie()[0];

    assert.ok(initialSetCookie, "Сервер не выдал session cookie");

    const initialCookie = initialSetCookie.split(";")[0];

    const email = `feature-${randomUUID()}@example.com`;

    const registrationBody = {
      name: "Feature Test",
      email,
      password: "strong-password-123",
    };

    const wrongOriginResponse = await fetch(`${baseUrl}/auth/register`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "https://evil.example",
        cookie: initialCookie,
        "x-csrf-token": csrfToken,
      },
      body: JSON.stringify(registrationBody),
    });

    assert.equal(wrongOriginResponse.status, 403);

    const wrongOriginResult = await wrongOriginResponse.json();

    assert.equal(wrongOriginResult.message, "Недопустимый Origin");

    // Проверяем, что изменяющий запрос без CSRF запрещён
    const withoutCsrfResponse = await fetch(`${baseUrl}/auth/register`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin,
        cookie: initialCookie,
      },
      body: JSON.stringify(registrationBody),
    });

    assert.equal(withoutCsrfResponse.status, 403);

    // Проверяем, что изменяющий запрос с неверным CSRF запрещён
    const wrongCsrfResponse = await fetch(`${baseUrl}/auth/register`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin,
        cookie: initialCookie,
        "x-csrf-token": "incorrect-token",
      },
      body: JSON.stringify(registrationBody),
    });

    assert.equal(wrongCsrfResponse.status, 403);

    const wrongCsrfResult = await wrongCsrfResponse.json();

    assert.equal(wrongCsrfResult.message, "Некорректный CSRF-токен");

    const invalidBodyResponse = await fetch(`${baseUrl}/auth/register`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin,
        cookie: initialCookie,
        "x-csrf-token": csrfToken,
      },
      body: JSON.stringify({
        name: "",
        email: "not-an-email",
        password: "123",
      }),
    });

    assert.equal(invalidBodyResponse.status, 400);

    const invalidBodyResult = await invalidBodyResponse.json();

    assert.equal(invalidBodyResult.message, "Ошибка валидации данных");

    // Теперь отправляем правильный запрос
    const registrationResponse = await fetch(`${baseUrl}/auth/register`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin,
        cookie: initialCookie,
        "x-csrf-token": csrfToken,
      },
      body: JSON.stringify(registrationBody),
    });

    assert.equal(registrationResponse.status, 201);

    const registrationResult = await registrationResponse.json();

    assert.equal(registrationResult.user.email, email);

    // После регистрации сервер заменяет идентификатор сессии
    const authenticatedSetCookie =
      registrationResponse.headers.getSetCookie()[0];

    assert.ok(
      authenticatedSetCookie,
      "Сервер не выдал новую cookie после регистрации",
    );

    const authenticatedCookie = authenticatedSetCookie.split(";")[0];

    // Проверяем, что новая сессия действительно авторизована
    const meResponse = await fetch(`${baseUrl}/auth/me`, {
      headers: {
        cookie: authenticatedCookie,
      },
    });

    assert.equal(meResponse.status, 200);

    const meResult = await meResponse.json();

    assert.equal(meResult.user.id, registrationResult.user.id);
    assert.equal(meResult.user.email, email);

    // Получаем новый CSRF для авторизованной сессии первого пользователя
    const firstSession = await getCsrf(baseUrl, authenticatedCookie);

    // Первый пользователь создаёт вакансию
    const createJobResponse = await fetch(`${baseUrl}/jobs`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin,
        cookie: firstSession.cookie,
        "x-csrf-token": firstSession.csrfToken,
      },
      body: JSON.stringify({
        title: "Feature Test Job",
        company: "Feature Company",
        salary: 100000,
      }),
    });

    assert.equal(createJobResponse.status, 201);

    const { job } = await createJobResponse.json();

    assert.ok(job.id);

    // Создаём отдельную сессию для второго пользователя
    const secondInitialSession = await getCsrf(baseUrl);

    const secondEmail = `feature-second-${randomUUID()}@example.com`;

    const secondRegistrationResponse = await fetch(`${baseUrl}/auth/register`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin,
        cookie: secondInitialSession.cookie,
        "x-csrf-token": secondInitialSession.csrfToken,
      },
      body: JSON.stringify({
        name: "Second Feature User",
        email: secondEmail,
        password: "strong-password-123",
      }),
    });

    assert.equal(secondRegistrationResponse.status, 201);

    const secondAuthenticatedCookie = secondRegistrationResponse.headers
      .getSetCookie()[0]
      ?.split(";")[0];

    assert.ok(secondAuthenticatedCookie);

    const secondSession = await getCsrf(baseUrl, secondAuthenticatedCookie);

    // Второй пользователь пытается изменить чужую вакансию
    const foreignPatchResponse = await fetch(`${baseUrl}/jobs/${job.id}`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        origin,
        cookie: secondSession.cookie,
        "x-csrf-token": secondSession.csrfToken,
      },
      body: JSON.stringify({
        title: "Украденная вакансия",
      }),
    });

    assert.equal(foreignPatchResponse.status, 404);

    // Настоящий владелец изменяет вакансию
    const ownerPatchResponse = await fetch(`${baseUrl}/jobs/${job.id}`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        origin,
        cookie: firstSession.cookie,
        "x-csrf-token": firstSession.csrfToken,
      },
      body: JSON.stringify({
        title: "Обновлённая владельцем вакансия",
      }),
    });

    assert.equal(ownerPatchResponse.status, 200);

    const ownerPatchResult = await ownerPatchResponse.json();

    assert.equal(ownerPatchResult.job.title, "Обновлённая владельцем вакансия");

    const createApplicationBody = {
      jobId: job.id,
    };

    // Второй пользователь впервые откликается
    const firstApplicationResponse = await fetch(`${baseUrl}/applications`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin,
        cookie: secondSession.cookie,
        "x-csrf-token": secondSession.csrfToken,
      },
      body: JSON.stringify(createApplicationBody),
    });

    assert.equal(firstApplicationResponse.status, 201);

    const firstApplicationResult = await firstApplicationResponse.json();

    assert.equal(firstApplicationResult.application.job.id, job.id);
    assert.equal(firstApplicationResult.application.status, "new");

    // Тот же пользователь повторяет отклик
    const duplicateApplicationResponse = await fetch(
      `${baseUrl}/applications`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin,
          cookie: secondSession.cookie,
          "x-csrf-token": secondSession.csrfToken,
        },
        body: JSON.stringify(createApplicationBody),
      },
    );

    assert.equal(duplicateApplicationResponse.status, 409);

    const duplicateApplicationResult =
      await duplicateApplicationResponse.json();

    assert.equal(
      duplicateApplicationResult.message,
      "Вы уже откликнулись на эту вакансию",
    );

    workerProcess = spawn(
      process.execPath,
      ["dist/src/workers/export.worker.js"],
      {
        env: process.env,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );

    workerProcess.stdout.on("data", (chunk) => {
      logs += chunk.toString();
    });

    workerProcess.stderr.on("data", (chunk) => {
      logs += chunk.toString();
    });

    const idempotencyKey = `feature-export-${randomUUID()}`;

    function requestExport() {
      return fetch(`${baseUrl}/exports`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin,
          cookie: secondSession.cookie,
          "x-csrf-token": secondSession.csrfToken,
          "idempotency-key": idempotencyKey,
        },
        body: JSON.stringify({
          format: "csv",
        }),
      });
    }

    const [firstExportResponse, secondExportResponse] = await Promise.all([
      requestExport(),
      requestExport(),
    ]);

    assert.equal(firstExportResponse.status, 202);
    assert.equal(secondExportResponse.status, 202);

    const firstExportResult = await firstExportResponse.json();
    const secondExportResult = await secondExportResponse.json();

    assert.equal(firstExportResult.export.id, secondExportResult.export.id);

    const exportId = firstExportResult.export.id;

    await waitForExport(baseUrl, exportId, secondSession.cookie);

    const foreignDownloadResponse = await fetch(
      `${baseUrl}/exports/${exportId}/file`,
      {
        headers: {
          cookie: firstSession.cookie,
        },
      },
    );

    assert.equal(foreignDownloadResponse.status, 404);

    const ownerDownloadResponse = await fetch(
      `${baseUrl}/exports/${exportId}/file`,
      {
        headers: {
          cookie: secondSession.cookie,
        },
      },
    );

    assert.equal(ownerDownloadResponse.status, 200);

    const csv = await ownerDownloadResponse.text();

    assert.match(csv, /application_id/);
    assert.ok(
      csv.includes(firstApplicationResult.application.id),
      "CSV не содержит созданный отклик",
    );

    const deleteApplicationResponse = await fetch(
      `${baseUrl}/applications/${firstApplicationResult.application.id}`,
      {
        method: "DELETE",
        headers: {
          origin,
          cookie: secondSession.cookie,
          "x-csrf-token": secondSession.csrfToken,
        },
      },
    );

    assert.equal(deleteApplicationResponse.status, 204);

    const deleteJobResponse = await fetch(`${baseUrl}/jobs/${job.id}`, {
      method: "DELETE",
      headers: {
        origin,
        cookie: firstSession.cookie,
        "x-csrf-token": firstSession.csrfToken,
      },
    });

    assert.equal(deleteJobResponse.status, 204);

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      status: "ready",
    });
  } catch (error) {
    console.error(logs);
    throw error;
  } finally {
    if (workerProcess?.exitCode === null) {
      workerProcess.kill("SIGTERM");
      await once(workerProcess, "exit");
    }

    if (apiProcess.exitCode === null) {
      apiProcess.kill("SIGTERM");
      await once(apiProcess, "exit");
    }
  }
});
