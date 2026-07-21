import { afterEach, expect, it, vi } from "vitest";
import {
  clearDirectorDeskPanoramaUploadHandler,
  setDirectorDeskPanoramaUploadHandler,
  uploadDirectorDeskPanorama,
} from "./hostUpload";

afterEach(() => {
  clearDirectorDeskPanoramaUploadHandler();
});

it("returns the cloud URL provided by the host uploader", async () => {
  const file = new File(["panorama"], "studio.jpg", { type: "image/jpeg" });
  const handler = vi.fn(async () => ({ url: "https://cdn.example.com/director/studio.jpg" }));
  setDirectorDeskPanoramaUploadHandler(handler);

  await expect(uploadDirectorDeskPanorama(file)).resolves.toEqual({
    url: "https://cdn.example.com/director/studio.jpg",
  });
  expect(handler).toHaveBeenCalledWith(file);
});

it("rejects missing cloud upload handlers and empty URLs", async () => {
  const file = new File(["panorama"], "studio.jpg", { type: "image/jpeg" });
  await expect(uploadDirectorDeskPanorama(file)).rejects.toThrow("全景图云存储上传不可用");

  setDirectorDeskPanoramaUploadHandler(async () => ({ url: "" }));
  await expect(uploadDirectorDeskPanorama(file)).rejects.toThrow("全景图云存储未返回可用地址");
});
