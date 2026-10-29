import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";

import type { RequestHandler } from "express";
import type { Logger } from "pino";

const routes = new Set([
  "/health",
  "/health/live",
  "/health/ready",

  "/auth/csrf",
  "/auth/register",
  "/auth/login",
  "/auth/logout",
  "/auth/me",

  "/jobs",
  "/jobs/:id",

  "/applications",
  "/applications/:id",

  "/exports",
  "/exports/:id",
  "/exports/:id/file",
]);

const methods = new Set([
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "OPTIONS",
  "HEAD",
]);

export function safeRoute(value: unknown): string {
  return typeof value === "string" && routes.has(value) ? value : "unmatched";
}

export function markRoute(template: string): RequestHandler {
  const route = safeRoute(template);

  return (_req, res, next) => {
    res.locals.routeName = route;
    next();
  };
}

export interface HttpObservation {
  method: string;
  route: string;
  status: string;
  outcome: "completed" | "aborted";
  durationSeconds: number;
}

export function makeRequestLog(
  logger: Logger,
  onComplete: (value: HttpObservation) => void = () => {},
): RequestHandler {
  return (req, res, next) => {
    const requestId = randomUUID();
    const requestLogger = logger.child({ requestId });

    const started = performance.now();

    let recorded = false;

    res.locals.requestId = requestId;
    res.locals.log = requestLogger;

    res.setHeader("X-Request-Id", requestId);

    function complete(outcome: HttpObservation["outcome"]) {
      if (recorded) return;

      recorded = true;

      const observation: HttpObservation = {
        method: methods.has(req.method) ? req.method : "OTHER",
        route: safeRoute(res.locals.routeName),

        status: outcome === "completed" ? String(res.statusCode) : "aborted",

        outcome,

        durationSeconds: (performance.now() - started) / 1000,
      };

      requestLogger.info(
        {
          event: "http.finished",
          ...observation,
        },
        "request finished",
      );

      try {
        onComplete(observation);
      } catch {
        requestLogger.warn(
          {
            event: "telemetry.record_failed",
          },
          "measurement failed",
        );
      }
    }

    res.once("finish", () => {
      complete("completed");
    });

    res.once("close", () => {
      if (!res.writableFinished) {
        complete("aborted");
      }
    });

    next();
  };
}
