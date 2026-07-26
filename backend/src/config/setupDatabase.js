import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { env } from "./env.js";

const schemaPath = fileURLToPath(new URL("../../Schema.sql", import.meta.url));
const seedPath = fileURLToPath(new URL("../../Seed.sql", import.meta.url));

async function ensureDatabaseExists() {
  // Kita terhubung ke database bawaan "postgres" terlebih dahulu.
  const maintenanceClient = new pg.Client({
    host: env.database.host,
    port: env.database.port,
    user: env.database.user,
    password: env.database.password,
    database: "postgres",
    ssl: env.database.ssl,
  });

  await maintenanceClient.connect();

  try {
    const result = await maintenanceClient.query(
      "SELECT 1 FROM pg_database WHERE datname = $1",
      [env.database.database],
    );

    if (result.rowCount === 0) {
      // DB_NAME sudah divalidasi di env.js.
      const databaseName = '"' + env.database.database + '"';
      await maintenanceClient.query("CREATE DATABASE " + databaseName);
      console.log("Database " + env.database.database + " berhasil dibuat.");
    }
  } finally {
    await maintenanceClient.end();
  }
}

export async function setupDatabase(includeDummyData) {
  // Jika tidak ada argument, data dummy ikut dimasukkan.
  if (includeDummyData === undefined) {
    includeDummyData = true;
  }

  await ensureDatabaseExists();

  const schemaSql = await readFile(schemaPath, "utf8");
  let seedSql = "";

  if (includeDummyData) {
    seedSql = await readFile(seedPath, "utf8");
  }

  const databaseClient = new pg.Client({
    host: env.database.host,
    port: env.database.port,
    user: env.database.user,
    password: env.database.password,
    database: env.database.database,
    ssl: env.database.ssl,
  });

  await databaseClient.connect();

  try {
    await databaseClient.query("BEGIN");
    await databaseClient.query(schemaSql);

    if (seedSql) {
      await databaseClient.query(seedSql);
    }

    await databaseClient.query("COMMIT");
  } catch (error) {
    await databaseClient.query("ROLLBACK");
    throw error;
  } finally {
    await databaseClient.end();
  }
}

const currentFilePath = fileURLToPath(import.meta.url);
const isRunDirectly = process.argv[1] === currentFilePath;

if (isRunDirectly) {
  const includeDummyData = process.argv.indexOf("--no-seed") === -1;

  try {
    await setupDatabase(includeDummyData);
    console.log("Schema dan data PostgreSQL berhasil disiapkan.");
  } catch (error) {
    console.error("Gagal menyiapkan database:", error.message);
    process.exitCode = 1;
  }
}
