import {
  createHmac,
  randomBytes,
  randomInt,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";

export const currentAuthHashVersion = 1;

export function normalizeCnPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  const mainland = digits.startsWith("86") ? digits.slice(2) : digits;

  if (!/^1\d{10}$/.test(mainland)) {
    throw new Error("invalid_phone");
  }

  return `+86${mainland}`;
}

export function hashSecret(value: string): string {
  return hmacSha256(value);
}

export function hashRequestMetadata(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? hmacSha256(`request-metadata:${trimmed}`) : null;
}

export function hashVerificationCode(input: {
  challengeId: string;
  code: string;
}): string {
  return hmacSha256(`${input.challengeId}:${input.code}`);
}

export function secureHashEquals(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, "hex");
  const rightBuffer = Buffer.from(right, "hex");

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

export function generateSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export function generateVerificationCode(): string {
  return String(randomInt(0, 1000000)).padStart(6, "0");
}

export function generateIdentityId(): string {
  return randomUUID();
}

export function maskCnPhone(phoneE164: string): string {
  const mainland = phoneE164.slice(3);
  return `${mainland.slice(0, 3)}****${mainland.slice(-4)}`;
}

export function shanghaiDayWindow(now: Date): { start: Date; end: Date } {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const date = formatter.format(now);
  const start = new Date(`${date}T00:00:00.000+08:00`);
  return {
    start,
    end: new Date(start.getTime() + 24 * 60 * 60 * 1000),
  };
}

function hmacSha256(value: string): string {
  return createHmac("sha256", getAuthPepper()).update(value).digest("hex");
}

function getAuthPepper(): string {
  return process.env.AUTH_SECRET_PEPPER ?? "comic-ai-local-auth-pepper";
}
