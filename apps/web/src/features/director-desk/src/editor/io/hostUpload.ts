export interface DirectorDeskPanoramaUploadResult {
  url: string;
}

type DirectorDeskPanoramaUploadHandler = (
  file: File
) => Promise<DirectorDeskPanoramaUploadResult>;

let panoramaUploadHandler: DirectorDeskPanoramaUploadHandler | null = null;

export function setDirectorDeskPanoramaUploadHandler(handler?: DirectorDeskPanoramaUploadHandler) {
  panoramaUploadHandler = handler ?? null;
}

export function clearDirectorDeskPanoramaUploadHandler() {
  panoramaUploadHandler = null;
}

export async function uploadDirectorDeskPanorama(file: File) {
  if (!panoramaUploadHandler) {
    throw new Error("全景图云存储上传不可用");
  }

  const result = await panoramaUploadHandler(file);
  const url = typeof result?.url === "string" ? result.url.trim() : "";
  if (!url) {
    throw new Error("全景图云存储未返回可用地址");
  }

  return { url };
}
