import "dotenv/config";
import { isIP } from "node:net";

// Secret tidak boleh memiliki fallback karena nilai bawaan di source akan
// digunakan oleh setiap deployment yang lupa mengatur environment.
function readRequiredSecret(name, minimumLength = 1) {
  const value = process.env[name];
  const normalizedLength = typeof value === "string" ? value.trim().length : 0;

  if (normalizedLength < minimumLength) {
    if (minimumLength > 1) {
      throw new Error(
        `${name} wajib diisi melalui environment dengan minimal ${minimumLength} karakter.`,
      );
    }

    throw new Error(
      `${name} wajib diisi melalui environment dan tidak boleh kosong.`,
    );
  }

  return value;
}

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

function readBoundedInteger(name, defaultValue, minimum, maximum) {
  const text = process.env[name];
  if (text === undefined || text === "") return defaultValue;

  if (!/^\d+$/.test(text)) {
    throw new Error(`${name} wajib berupa integer ${minimum}-${maximum}.`);
  }

  const value = Number(text);
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} wajib berupa integer ${minimum}-${maximum}.`);
  }
  return value;
}

function readLegacyPasswordMode() {
  const value = process.env.PASSWORD_LEGACY_MODE || "disabled";
  if (value !== "disabled" && value !== "verify-plaintext") {
    throw new Error(
      "PASSWORD_LEGACY_MODE hanya boleh 'disabled' atau 'verify-plaintext'.",
    );
  }
  return value;
}

function isValidProxyAddress(value) {
  const slashIndex = value.indexOf("/");
  if (slashIndex === -1) return isIP(value) !== 0;

  const address = value.slice(0, slashIndex);
  const prefixText = value.slice(slashIndex + 1);
  const family = isIP(address);
  if (family === 0 || !/^\d+$/.test(prefixText)) return false;

  const prefix = Number(prefixText);
  return Number.isInteger(prefix) && prefix >= 0 && prefix <= (family === 4 ? 32 : 128);
}

function readTrustedProxyCidrs() {
  const text = process.env.TRUST_PROXY_CIDRS;
  if (!text) return false;

  const entries = text.split(",").map((value) => value.trim()).filter(Boolean);
  if (entries.length === 0 || !entries.every(isValidProxyAddress)) {
    throw new Error(
      "TRUST_PROXY_CIDRS wajib berupa daftar IP/CIDR exact yang dipisahkan koma.",
    );
  }
  return entries;
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
      if (origin === "*") {
        throw new Error(
          "CORS_ORIGINS wajib berupa exact allowlist dan tidak boleh memakai wildcard '*'.",
        );
      }

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

const databasePassword = readRequiredSecret("DB_PASSWORD");
const jwtSecret = readRequiredSecret("JWT_SECRET", 32);

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
    password: databasePassword,
    database: databaseName,
    ssl: sslConfig,
  },
  jwt: {
    secret: jwtSecret,
  },
  password: {
    bcryptRounds: readBoundedInteger("PASSWORD_BCRYPT_ROUNDS", 12, 10, 14),
    legacyMode: readLegacyPasswordMode(),
  },
  trustProxy: readTrustedProxyCidrs(),
  corsOrigins: readCorsOrigins(),
};
