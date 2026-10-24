const port = process.env.PORT ?? "3000";

try {
  const response = await fetch(`http://127.0.0.1:${port}/health/ready`, {
    signal: AbortSignal.timeout(1500),
  });

  process.exitCode = response.ok ? 0 : 1;
} catch {
  process.exitCode = 1;
}

export {};
