import cors from "cors";
import express from "express";
import { env } from "./config/env.js";
import { requireJsonRequest } from "./middleware/jsonRequestMiddleware.js";
import { setSecurityHeaders } from "./middleware/securityHeaders.js";
import { router } from "./routes/index.js";
import { isCorsOriginAllowed } from "./security/corsPolicy.js";

export const app = express();

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

  const error = new Error("Origin tidak diizinkan oleh konfigurasi CORS.");
  error.statusCode = 403;
  callback(error);
}

app.use(cors({ origin: checkCorsOrigin }));
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
    let field = "Label aset";

    if (err.constraint && err.constraint.indexOf("nomor_seri") !== -1) {
      field = "Nomor seri";
    }

    res.status(409).json({ message: field + " sudah digunakan." });
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
