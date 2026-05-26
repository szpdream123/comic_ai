import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, extname, join, resolve } from "node:path";

export interface UploadStoreSaveInput {
  category: string;
  fileName: string;
  bytes: Uint8Array;
  mimeType?: string | null;
}

export interface UploadStoreSaveResult {
  provider: "local";
  storageObjectKey: string;
  publicUrl: string;
  mimeType: string;
  byteSize: number;
  originalFileName: string;
}

export interface UploadStore {
  save(input: UploadStoreSaveInput): Promise<UploadStoreSaveResult>;
}

export function createLocalUploadStore(input: {
  rootDir: string;
  publicBasePath?: string;
}): UploadStore {
  const rootDir = resolve(input.rootDir);
  const publicBasePath = normalizePublicBasePath(input.publicBasePath ?? "/uploads");

  return {
    async save(file) {
      const category = sanitizeSegment(file.category || "misc");
      const extension = inferExtension(file.fileName, file.mimeType);
      const fileName = `${randomUUID()}${extension}`;
      const relativePath = join(category, fileName).replaceAll("\\", "/");
      const absolutePath = resolve(rootDir, relativePath);
      ensureWithinRoot(rootDir, absolutePath);
      await mkdir(dirname(absolutePath), { recursive: true });
      await writeFile(absolutePath, file.bytes);

      return {
        provider: "local",
        storageObjectKey: relativePath,
        publicUrl: `${publicBasePath}/${relativePath}`,
        mimeType: normalizeMimeType(file.mimeType, extension),
        byteSize: file.bytes.byteLength,
        originalFileName: file.fileName,
      };
    },
  };
}

function normalizePublicBasePath(value: string) {
  const normalized = `/${String(value).replace(/^\/+|\/+$/g, "")}`;
  return normalized === "/" ? "/uploads" : normalized;
}

function sanitizeSegment(value: string) {
  const normalized = String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9/_-]+/g, "-")
    .replace(/\/{2,}/g, "/")
    .replace(/^\/+|\/+$/g, "");
  return normalized || "misc";
}

function inferExtension(fileName: string, mimeType?: string | null) {
  const directExtension = extname(fileName).trim();
  if (directExtension) {
    return directExtension.toLowerCase();
  }

  const byMimeType: Record<string, string> = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/webp": ".webp",
    "image/gif": ".gif",
    "video/mp4": ".mp4",
    "video/webm": ".webm",
    "video/quicktime": ".mov",
    "audio/mpeg": ".mp3",
    "audio/wav": ".wav",
  };

  return byMimeType[String(mimeType ?? "").toLowerCase()] ?? "";
}

function normalizeMimeType(mimeType: string | null | undefined, extension: string) {
  const normalized = String(mimeType ?? "").trim().toLowerCase();
  if (normalized) {
    return normalized;
  }

  const byExtension: Record<string, string> = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".gif": "image/gif",
    ".mp4": "video/mp4",
    ".webm": "video/webm",
    ".mov": "video/quicktime",
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
  };

  return byExtension[extension.toLowerCase()] ?? "application/octet-stream";
}

function ensureWithinRoot(rootDir: string, absolutePath: string) {
  const normalizedRoot = rootDir.endsWith("\\") || rootDir.endsWith("/")
    ? rootDir
    : `${rootDir}\\`;
  if (!absolutePath.startsWith(normalizedRoot) && absolutePath !== rootDir) {
    throw new Error("upload_path_outside_root");
  }
}
