import { app } from "./app.js";
import { pool, query } from "./config/database.js";
import { env } from "./config/env.js";
import { verifyRuntimeSchema } from "./config/runtimeSchema.js";
import { closeAllSseClients } from "./services/realtimeService.js";

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
let shutdownStarted = false;
let shutdownFinalized = false;

async function finalizeShutdown(exitCode, forceTimer) {
  if (shutdownFinalized) return;
  shutdownFinalized = true;
  clearTimeout(forceTimer);

  try {
    await pool.end();
  } catch (error) {
    console.error("Gagal menutup pool database:", error.message);
    exitCode = 1;
  }
  process.exitCode = exitCode;
}

function closeServer(signal) {
  if (shutdownStarted) return;
  shutdownStarted = true;
  console.log(signal + " diterima, menutup server...");

  closeAllSseClients();
  server.closeIdleConnections?.();

  const forceTimer = setTimeout(() => {
    console.error("Graceful shutdown melewati batas 10 detik; koneksi tersisa ditutup paksa.");
    server.closeAllConnections?.();
    void finalizeShutdown(1, forceTimer);
  }, 10_000);
  forceTimer.unref?.();

  server.close(function finishClosingServer(error) {
    if (error) console.error("Gagal menutup HTTP server:", error.message);
    void finalizeShutdown(error ? 1 : 0, forceTimer);
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
