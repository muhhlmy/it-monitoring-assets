import cors from "cors";
import express from "express";
import { env } from "./config/env.js";
import { requireJsonRequest } from "./middleware/jsonRequestMiddleware.js";
import { setSecurityHeaders } from "./middleware/securityHeaders.js";
import { router } from "./routes/index.js";
import { isCorsOriginAllowed } from "./security/corsPolicy.js";

export const app = express();

app.set("trust proxy", env.trustProxy);
app.disable("x-powered-by");
app.use(setSecurityHeaders);

function checkCorsOrigin(origin, callback) {
  // Request tanpa origin biasanya berasal dari Postman atau aplikasi backend.
  if (!origin) {
    callback(null, true);
    return;
  }

  if (isCorsOriginAllowed(origin, env.corsOrigins)) {
    callback(null, true);
    return;
  }

  console.warn(`[CORS Blocked] Origin: "${origin}". Allowed origins:`, env.corsOrigins);
  const error = new Error("Origin tidak diizinkan oleh konfigurasi CORS.");
  error.statusCode = 403;
  callback(error);
}

app.use(
  cors({
    origin: checkCorsOrigin,
    exposedHeaders: [
      "X-Total-Count",
      "X-Page",
      "X-Page-Size",
      "RateLimit-Limit",
      "RateLimit-Remaining",
      "RateLimit-Reset",
      "Retry-After",
    ],
  }),
);
app.use(requireJsonRequest);
app.use(express.json({ limit: "8mb" }));
app.use(router);

function handleNotFound(req, res) {
  res.status(404).json({ message: "Endpoint tidak ditemukan." });
}

function handleError(err, req, res, next) {
  if (err.status === 413 || err.statusCode === 413) {
    res.status(413).json({ message: "Payload melebihi batas yang diizinkan." });
    return;
  }

  // Error ini terjadi jika body request bukan JSON yang valid.
  if (err instanceof SyntaxError && err.status === 400 && "body" in err) {
    res.status(400).json({ message: "Format JSON tidak valid." });
    return;
  }

  // Kode 23505 dari PostgreSQL berarti nilai unique sudah digunakan.
  if (err.code === "23505") {
    let field = "Data";
    const constraint = String(err.constraint || "").toLowerCase();
    const detail = String(err.detail || "").toLowerCase();

    if (constraint.includes("email") || detail.includes("email")) {
      field = "Email";
    } else if (constraint.includes("nik") || detail.includes("nik")) {
      field = "NIK";
    } else if (constraint.includes("nomor_seri") || detail.includes("nomor_seri")) {
      field = "Nomor seri";
    } else if (constraint.includes("label") || detail.includes("label")) {
      field = "Label aset";
    } else if (constraint.includes("kode") || detail.includes("kode")) {
      field = "Kode unit";
    }

    res.status(409).json({ message: `${field} sudah digunakan.` });
    return;
  }

  // Kode 23514 dari PostgreSQL berarti check constraint terlanggar.
  if (err.code === "23514") {
    res.status(400).json({ message: "Data tidak memenuhi validasi aturan sistem (check constraint)." });
    return;
  }

  // Error dari trigger DB yang melarang hard-delete
  if (err.message && err.message.includes("Hard delete is prohibited")) {
    res.status(400).json({ message: "Penghapusan data secara permanen (hard delete) dilarang oleh sistem. Gunakan metode soft-delete." });
    return;
  }

  if (err.statusCode) {
    res.status(err.statusCode).json({ message: err.message });
    return;
  }

  console.error(err);
  res.status(500).json({ message: "Terjadi kesalahan pada server." });
}

// Kedua handler ini harus diletakkan paling bawah.
app.use(handleNotFound);
app.use(handleError);
