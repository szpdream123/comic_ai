import { randomBytes, randomUUID, scrypt } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { promisify } from "node:util";

import { Pool } from "pg";

const scryptAsync = promisify(scrypt);
const keyLength = 64;
const saltLength = 16;

export async function loginWithPasswordQaUser(origin, phone) {
  await ensurePasswordQaUser(phone);
  const response = await fetch(`${origin}/api/auth/password/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      account: phone,
      password: defaultPasswordFromPhone(phone),
      remember: true,
    }),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`password_login_failed:${response.status}:${body}`);
  }
  return response.headers.get("set-cookie")?.split(";")[0] ?? "";
}

async function ensurePasswordQaUser(phone) {
  loadDotEnvFile();
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) {
    throw new Error("DATABASE_URL is required for browser QA password login");
  }

  const pool = new Pool({ connectionString });
  try {
    const passwordHash = await createUserPasswordHash(defaultPasswordFromPhone(phone));
    await pool.query(
      `
        INSERT INTO users (id, phone_e164, password_hash, status)
        VALUES ($1, $2, $3, 'active')
        ON CONFLICT (phone_e164)
        DO UPDATE SET
          password_hash = COALESCE(users.password_hash, EXCLUDED.password_hash),
          status = 'active',
          updated_at = now()
      `,
      [randomUUID(), normalizeCnPhone(phone), passwordHash],
    );
  } finally {
    await pool.end();
  }
}

async function createUserPasswordHash(password) {
  const salt = randomBytes(saltLength);
  const hash = await scryptAsync(password, salt, keyLength);
  return ["scrypt:v1", salt.toString("base64url"), Buffer.from(hash).toString("base64url")].join(":");
}

function defaultPasswordFromPhone(phone) {
  return normalizeCnPhone(phone).slice(-6);
}

function normalizeCnPhone(phone) {
  const digits = String(phone).replace(/\D/g, "");
  const mainland = digits.startsWith("86") ? digits.slice(2) : digits;
  if (!/^1\d{10}$/.test(mainland)) {
    throw new Error("invalid_phone");
  }
  return mainland;
}

function loadDotEnvFile(envFilePath = ".env") {
  if (!existsSync(envFilePath)) return;
  const content = readFileSync(envFilePath, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separatorIndex = line.indexOf("=");
    if (separatorIndex <= 0) continue;
    const key = line.slice(0, separatorIndex).trim();
    if (!key || process.env[key] !== undefined) continue;
    let value = line.slice(separatorIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}
