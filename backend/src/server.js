import { app } from "./app.js";
import { pool, query } from "./config/database.js";
import { env } from "./config/env.js";
import { verifyRuntimeSchema } from "./config/runtimeSchema.js";

// Coba koneksi sebelum menjalankan server.
try {
  await query("SELECT 1");
  await verifyRuntimeSchema(pool);
} catch (error) {
  console.error("Database belum siap digunakan:", error.message);
  process.exit(1);
}

function showServerMessage() {
  console.log("API berjalan di http://0.0.0.0:" + env.port);
}

const server = app.listen(env.port, "0.0.0.0", showServerMessage);

async function closeServer(signal) {
  console.log(signal + " diterima, menutup server...");

  server.close(async function finishClosingServer() {
    await pool.end();
    process.exit(0);
  });
}

function handleSigint() {
  closeServer("SIGINT");
}

function handleSigterm() {
  closeServer("SIGTERM");
}

process.on("SIGINT", handleSigint);
process.on("SIGTERM", handleSigterm);
