import { createServer } from "node:http";
import type { Registry } from "prom-client";

export async function startMetricsServer(
  registry: Registry,
  refresh: () => Promise<void>,
  port = 9464,
  host = "0.0.0.0",
) {
  const server = createServer((req, res) => {
    if (req.method !== "GET" || req.url !== "/metrics") {
      res.writeHead(404).end();
      return;
    }

    async function sendMetrics() {
      try {
        // Обновляем метрики очереди экспортов из PostgreSQL.
        await refresh();

        const metrics = await registry.metrics();

        res.writeHead(200, {
          "Content-Type": registry.contentType,
        });

        res.end(metrics);
      } catch {
        if (res.headersSent) {
          res.destroy();
        } else {
          res.writeHead(503).end("metrics unavailable");
        }
      }
    }

    void sendMetrics();
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);

    server.listen(port, host, () => {
      server.off("error", reject);
      resolve();
    });
  });

  return server;
}
