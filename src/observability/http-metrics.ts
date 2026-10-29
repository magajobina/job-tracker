import { Counter, Histogram, Registry } from "prom-client";

import type { HttpObservation } from "./request-log.js";

export function createHttpMetrics() {
  const registry = new Registry();

  const requests = new Counter({
    name: "http_requests_total",
    help: "Completed application HTTP responses",

    labelNames: ["method", "route", "status"],

    registers: [registry],
  });

  const aborted = new Counter({
    name: "http_requests_aborted_total",
    help: "Application HTTP responses closed before completion",

    labelNames: ["method", "route"],

    registers: [registry],
  });

  const duration = new Histogram({
    name: "http_request_duration_seconds",
    help: "Server duration of completed application HTTP responses",

    labelNames: ["method", "route", "status"],

    buckets: [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10],

    registers: [registry],
  });

  function recordHttp(value: HttpObservation) {
    if (value.route.startsWith("/health")) {
      return;
    }

    if (value.outcome === "aborted") {
      aborted.inc({
        method: value.method,
        route: value.route,
      });

      return;
    }

    const labels = {
      method: value.method,
      route: value.route,
      status: value.status,
    };

    requests.inc(labels);

    duration.observe(labels, value.durationSeconds);
  }

  return {
    registry,
    recordHttp,
  };
}
