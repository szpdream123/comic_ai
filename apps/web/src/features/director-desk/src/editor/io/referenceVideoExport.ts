export type ReferenceVideoExportQuality = "720p" | "1080p" | "2k" | "4k";
export type ReferenceVideoExportFormat = "mp4" | "webm" | "ogg";

export interface ReferenceVideoExportFormatOption {
  format: ReferenceVideoExportFormat;
  label: string;
  extension: string;
  mimeType: string;
}

export interface ReferenceVideoExportOptions {
  fps: number;
  quality: ReferenceVideoExportQuality;
  format: ReferenceVideoExportFormat;
}

export interface ReferenceVideoExportRequest extends ReferenceVideoExportOptions {
  fileName: string;
}

type ReferenceVideoExportHandler = (request: ReferenceVideoExportRequest) => Promise<void>;

let exportHandler: ReferenceVideoExportHandler | null = null;

export function setReferenceVideoExportHandler(handler: ReferenceVideoExportHandler) {
  exportHandler = handler;
}

export function clearReferenceVideoExportHandler() {
  exportHandler = null;
}

export async function requestReferenceVideoExport(request: ReferenceVideoExportRequest) {
  if (!exportHandler) throw new Error("参考视频导出器尚未准备好");
  await exportHandler(request);
}

const REFERENCE_VIDEO_FORMAT_CANDIDATES: Array<{
  format: ReferenceVideoExportFormat;
  label: string;
  extension: string;
  mimeTypes: string[];
}> = [
  {
    format: "mp4",
    label: "MP4",
    extension: "mp4",
    mimeTypes: ["video/mp4;codecs=avc1.42E01E", "video/mp4"],
  },
  {
    format: "webm",
    label: "WebM",
    extension: "webm",
    mimeTypes: ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"],
  },
  {
    format: "ogg",
    label: "OGG",
    extension: "ogv",
    mimeTypes: ["video/ogg;codecs=theora", "video/ogg"],
  },
];

function supportsMimeType(mimeType: string) {
  if (typeof MediaRecorder === "undefined" || typeof MediaRecorder.isTypeSupported !== "function") return false;
  try {
    return MediaRecorder.isTypeSupported(mimeType);
  } catch {
    return false;
  }
}

export function getSupportedReferenceVideoFormats(): ReferenceVideoExportFormatOption[] {
  return REFERENCE_VIDEO_FORMAT_CANDIDATES.flatMap((candidate) => {
    const mimeType = candidate.mimeTypes.find(supportsMimeType);
    return mimeType ? [{ ...candidate, mimeType }] : [];
  });
}

export function getReferenceVideoFormatLabel(format: ReferenceVideoExportFormat) {
  return REFERENCE_VIDEO_FORMAT_CANDIDATES.find((candidate) => candidate.format === format)?.label ?? format.toUpperCase();
}

export function getSupportedReferenceVideoMimeType(format?: ReferenceVideoExportFormat) {
  const formats = getSupportedReferenceVideoFormats();
  return (format ? formats.find((candidate) => candidate.format === format) : formats[0])?.mimeType ?? null;
}
