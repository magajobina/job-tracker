import "reflect-metadata";
import "dotenv/config";
import { AppDataSource } from "../data-source.js";

const rawUrl = process.env.DATABASE_URL;

if (!rawUrl) {
  throw new Error("DATABASE_URL is required");
}

const endpoint = new URL(rawUrl);
const databaseName = decodeURIComponent(endpoint.pathname.slice(1));

const localHosts = new Set(["127.0.0.1", "localhost", "[::1]"]);

if (
  !localHosts.has(endpoint.hostname) ||
  !/^job_tracker_lab_[a-z0-9_]+$/.test(databaseName)
) {
  throw new Error("Expected an explicitly selected local lab database");
}

if (
  AppDataSource.options.synchronize ||
  AppDataSource.options.migrationsRun ||
  AppDataSource.options.dropSchema
) {
  throw new Error("Automatic schema changes must be disabled");
}

await AppDataSource.initialize();

try {
  const [identity] = await AppDataSource.query(
    "SELECT current_database() AS name",
  );

  const tables = await AppDataSource.query(
    `SELECT tablename
     FROM pg_tables
     WHERE schemaname = 'public'
     ORDER BY tablename`,
  );

  console.log({
    database: identity.name,
    tables: tables.map((row: { tablename: string }) => row.tablename),
  });

  if (process.argv.includes("--empty") && tables.length !== 0) {
    throw new Error("Expected a database with no public tables");
  }
} finally {
  await AppDataSource.destroy();
}
