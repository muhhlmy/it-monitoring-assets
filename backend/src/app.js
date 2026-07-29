import cors from "cors";
import express from "express";
import { env } from "./config/env.js";
import { router } from "./routes/index.js";

export const app = express();

app.disable("x-powered-by");

function checkCorsOrigin(origin, callback) {
  // Request tanpa origin biasanya berasal dari Postman atau aplikasi backend.
  if (!origin) {
    callback(null, true);
    return;
  }

  const allowsAllOrigins = env.corsOrigins.indexOf("*") !== -1;
  const originIsAllowed = env.corsOrigins.indexOf(origin) !== -1;

  // Izinkan localhost, 127.0.0.1, serta semua IP Private Network (192.168.x.x, 10.x.x.x, 172.x.x.x)
  const isLocalNetwork = /^http:\/\/(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)(:\d+)?$/.test(origin);

  if (allowsAllOrigins || originIsAllowed || isLocalNetwork) {
    callback(null, true);
    return;
  }

  const error = new Error("Origin tidak diizinkan oleh konfigurasi CORS.");
  error.statusCode = 403;
  callback(error);
}

app.use(cors({ origin: checkCorsOrigin }));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ limit: "10mb", extended: true }));
app.use(router);

function handleNotFound(req, res) {
  res.status(404).json({ message: "Endpoint tidak ditemukan." });
}

function handleError(err, req, res, next) {
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
