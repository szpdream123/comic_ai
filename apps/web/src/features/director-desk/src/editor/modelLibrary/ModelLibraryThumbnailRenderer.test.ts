import { afterEach, expect, it, vi } from "vitest";
import { getCachedModelLibraryThumbnail } from "./ModelLibraryThumbnailRenderer";

afterEach(() => {
  vi.unstubAllGlobals();
});

it("reads a generated thumbnail from the versioned browser cache", () => {
  const itemId = "builtin:test-cached-thumbnail.fbx";
  const thumbnailUrl = "data:image/webp;base64,preview";
  const storage = new Map([[`director:model-library-thumbnail:v1:${itemId}`, thumbnailUrl]]);
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
  });

  expect(getCachedModelLibraryThumbnail(itemId)).toBe(thumbnailUrl);
});
