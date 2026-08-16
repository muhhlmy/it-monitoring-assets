import { app } from "./app.js";
import { pool, query } from "./config/database.js";
import { env } from "./config/env.js";
import { verifyRuntimeSchema } from "./config/runtimeSchema.js";
import { closeAllSseClients } from "./services/realtimeService.js";
import fs from 'fs';

const LOG_FILE = './server_error.log';
function logError(msg) {
  const timestamp = new Date().toISOString();
  fs.appendFileSync(LOG_FILE, `[${timestamp}] ${msg}\n`);
}

// Global error handlers
process.on('uncaughtException', (error) => {
  console.error('UNCAUGHT EXCEPTION:', error.message);
  logError(`UNCAUGHT EXCEPTION: ${error.message}\n${error.stack || ''}`);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('UNHANDLED REJECTION at:', promise, 'Reason:', reason);
  logError(`UNHANDLED REJECTION: ${reason}\nPromise: ${promise}`);
});

async function handleShutdown(signal) {
  console.log(signal + " diterima, menutup server...");
  
  try {
    await pool.end();
  } catch (error) {
    console.error("Gagal menutup pool database:", error.message);
  }
  
  process.exit(0);
}

process.on('SIGINT', () => handleShutdown('SIGINT'));
process.on('SIGTERM', () => handleShutdown('SIGTERM'));

try {
  // Coba koneksi sebelum menjalankan server
  await query("SELECT 1");
  await verifyRuntimeSchema(pool);
} catch (error) {
  console.error("Database belum siap digunakan:", error.message);
  process.exit(1);
}

console.log("API berjalan di http://0.0.0.0:" + env.port);
const server = app.listen(env.port, "0.0.0.0");
