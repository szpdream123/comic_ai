import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);
const keyLength = 64;
const saltLength = 16;
const temporaryPasswordBytes = 18;

export interface TeamTemporaryCredential {
  temporaryPassword: string;
  passwordHash: string;
}

export async function createTeamTemporaryCredential(): Promise<TeamTemporaryCredential> {
  const temporaryPassword = randomBytes(temporaryPasswordBytes).toString("base64url");

  return {
    temporaryPassword,
    passwordHash: await createUserPasswordHash(temporaryPassword),
  };
}

export async function createUserPasswordHash(password: string): Promise<string> {
  const salt = randomBytes(saltLength);
  const hash = await hashPassword(password, salt);
  return encodePasswordHash(salt, hash);
}

export function defaultPasswordFromPhone(phoneE164: string): string {
  const digits = phoneE164.replace(/\D/g, "");
  return digits.slice(-6);
}

export async function verifyTeamCredential(input: {
  password: string;
  passwordHash: string;
}): Promise<boolean> {
  const parsed = parsePasswordHash(input.passwordHash);
  if (!parsed) {
    return false;
  }

  const candidate = await hashPassword(input.password, parsed.salt);
  return (
    candidate.length === parsed.hash.length &&
    timingSafeEqual(candidate, parsed.hash)
  );
}

async function hashPassword(password: string, salt: Buffer): Promise<Buffer> {
  return (await scryptAsync(password, salt, keyLength)) as Buffer;
}

function encodePasswordHash(salt: Buffer, hash: Buffer): string {
  return [
    "scrypt",
    "v1",
    salt.toString("base64url"),
    hash.toString("base64url"),
  ].join(":");
}

function parsePasswordHash(
  passwordHash: string,
): { salt: Buffer; hash: Buffer } | undefined {
  const [algorithm, version, salt, hash] = passwordHash.split(":");
  if (algorithm !== "scrypt" || version !== "v1" || !salt || !hash) {
    return undefined;
  }

  return {
    salt: Buffer.from(salt, "base64url"),
    hash: Buffer.from(hash, "base64url"),
  };
}
