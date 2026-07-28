import { extname } from "node:path";

const mimeExtensions: Record<string, readonly string[]> = {
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/webp": [".webp"],
  "image/avif": [".avif"],
  "video/mp4": [".mp4"],
  "video/webm": [".webm"],
  "video/quicktime": [".mov"],
  "audio/mpeg": [".mp3"],
  "audio/wav": [".wav"],
  "audio/mp4": [".m4a"],
  "audio/x-m4a": [".m4a"],
  "text/plain": [".txt"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
  "font/ttf": [".ttf"],
  "font/otf": [".otf"],
  "font/woff": [".woff"],
  "font/woff2": [".woff2"],
  "application/font-sfnt": [".ttf", ".otf"],
  "application/vnd.ms-fontobject": [".eot"],
};

export function validateUploadContentBoundary(input: {
  fileName: string;
  contentType: string;
  bytes: Uint8Array;
}) {
  const contentType = input.contentType.split(";")[0]!.trim().toLowerCase();
  const extension = extname(input.fileName.trim()).toLowerCase();
  if (!input.bytes.byteLength) return mismatch();
  const allowedExtensions = mimeExtensions[contentType];
  if (allowedExtensions && !allowedExtensions.includes(extension)) return mismatch();
  if (!matchesContent(contentType, extension, input.bytes)) return mismatch();
  return { ok: true as const };
}

function matchesContent(contentType: string, extension: string, bytes: Uint8Array) {
  if (contentType === "image/jpeg") return startsWith(bytes, [0xff, 0xd8, 0xff]);
  if (contentType === "image/png") return startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (contentType === "image/webp") return ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP";
  if (contentType === "image/avif") return isIsoBaseMedia(bytes) && /(?:avif|avis|mif1|msf1)/.test(ascii(bytes, 8, 24));
  if (contentType === "video/webm") return startsWith(bytes, [0x1a, 0x45, 0xdf, 0xa3]);
  if (contentType === "video/mp4" || contentType === "video/quicktime") return isIsoBaseMedia(bytes);
  if (contentType === "audio/wav") return ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WAVE";
  if (contentType === "audio/mpeg") {
    return ascii(bytes, 0, 3) === "ID3" || (bytes[0] === 0xff && ((bytes[1] ?? 0) & 0xe0) === 0xe0);
  }
  if (contentType === "audio/mp4" || contentType === "audio/x-m4a") return isIsoBaseMedia(bytes);
  if (contentType === "text/plain") return isPlainText(bytes);
  if (contentType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    return startsWith(bytes, [0x50, 0x4b, 0x03, 0x04]) || startsWith(bytes, [0x50, 0x4b, 0x05, 0x06]);
  }
  if (["font/ttf", "application/font-sfnt"].includes(contentType) && extension === ".ttf") {
    return startsWith(bytes, [0x00, 0x01, 0x00, 0x00]) || ascii(bytes, 0, 4) === "true";
  }
  if (["font/otf", "application/font-sfnt"].includes(contentType) && extension === ".otf") return ascii(bytes, 0, 4) === "OTTO";
  if (contentType === "font/woff") return ascii(bytes, 0, 4) === "wOFF";
  if (contentType === "font/woff2") return ascii(bytes, 0, 4) === "wOF2";
  if (contentType === "application/vnd.ms-fontobject") return bytes.byteLength >= 82;
  if (contentType === "application/octet-stream") {
    if (extension === ".docx") return startsWith(bytes, [0x50, 0x4b, 0x03, 0x04]);
    if (extension === ".ttf") return startsWith(bytes, [0x00, 0x01, 0x00, 0x00]) || ascii(bytes, 0, 4) === "true";
    if (extension === ".otf") return ascii(bytes, 0, 4) === "OTTO";
    if (extension === ".woff") return ascii(bytes, 0, 4) === "wOFF";
    if (extension === ".woff2") return ascii(bytes, 0, 4) === "wOF2";
  }
  return false;
}

function startsWith(bytes: Uint8Array, signature: readonly number[]) {
  return signature.every((value, index) => bytes[index] === value);
}

function ascii(bytes: Uint8Array, offset: number, length: number) {
  return Buffer.from(bytes.subarray(offset, offset + length)).toString("ascii");
}

function isIsoBaseMedia(bytes: Uint8Array) {
  return bytes.byteLength >= 12 && ascii(bytes, 4, 4) === "ftyp";
}

function isPlainText(bytes: Uint8Array) {
  if (bytes.includes(0)) return false;
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return true;
  } catch {
    return false;
  }
}

function mismatch() {
  return {
    ok: false as const,
    errorCode: "upload_content_mismatch" as const,
    message: "文件内容与声明的格式不一致。",
  };
}
