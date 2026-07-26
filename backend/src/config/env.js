import "dotenv/config";

// Membaca angka dari file .env.
// Jika nilainya kosong atau tidak valid, gunakan nilai default.
function readNumber(name, defaultValue) {
  const text = process.env[name];

  if (!text) {
    return defaultValue;
  }

  const number = Number.parseInt(text, 10);

  if (!Number.isInteger(number) || number <= 0) {
    return defaultValue;
  }

  return number;
}

// CORS_ORIGINS berisi beberapa alamat yang dipisahkan dengan koma.
function readCorsOrigins() {
  let text = process.env.CORS_ORIGINS;

  if (!text) {
    text = "http://localhost:5173,http://127.0.0.1:5173";
  }

  const originParts = text.split(",");
  const origins = [];

  for (let index = 0; index < originParts.length; index += 1) {
    const origin = originParts[index].trim();

    if (origin) {
      origins.push(origin);
    }
  }

  return origins;
}

let databaseName = process.env.DB_NAME;

if (!databaseName) {
  databaseName = "assets_monitoring";
}

// Nama database dibatasi agar aman ketika dipakai oleh setupDatabase.js.
if (!/^[a-zA-Z_][a-zA-Z0-9_-]*$/.test(databaseName)) {
  throw new Error(
    "DB_NAME hanya boleh berisi huruf, angka, garis bawah, atau tanda hubung.",
  );
}

let sslConfig = false;

if (process.env.DB_SSL === "true") {
  sslConfig = {
    rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== "false",
  };
}

export const env = {
  port: readNumber("PORT", 3000),
  database: {
    host: process.env.DB_HOST || "localhost",
    port: readNumber("DB_PORT", 5432),
    user: process.env.DB_USER || "postgres",
    password: process.env.DB_PASSWORD || "Peter7711",
    database: databaseName,
    ssl: sslConfig,
  },
  corsOrigins: readCorsOrigins(),
};
