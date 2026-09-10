const widths = [640, 960, 1440];
const maximumSourceBytes = 20 * 1024 * 1024;

export function geoImageWidth(value: string | null) {
  const width = Number(value);
  return widths.includes(width) ? width : null;
}

export function geoImageSources(source: string) {
  if (!/^\/geo-assets\/[0-9a-f-]{36}$/i.test(source)) return "";
  // Media selection avoids claiming an intrinsic width when a small original is not enlarged.
  return `<source media="(max-width: 720px) and (max-resolution: 2dppx)" srcset="${source}?width=640"><source media="(max-width: 720px)" srcset="${source}?width=960"><source media="(max-resolution: 1.5dppx)" srcset="${source}?width=960"><source srcset="${source}?width=1440">`;
}

export async function readGeoImageSource(response: Response) {
  if (!response.ok || !response.body) {
    await response.body?.cancel().catch(() => undefined);
    throw new Error("geo_image_source_unavailable");
  }
  const length = Number(response.headers.get("content-length"));
  if (length > maximumSourceBytes) {
    await response.body.cancel();
    throw new Error("geo_image_source_too_large");
  }
  const reader = response.body.getReader(), chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maximumSourceBytes) throw new Error("geo_image_source_too_large");
      chunks.push(value);
    }
  } finally { await reader.cancel().catch(() => undefined); }
  return Buffer.concat(chunks, total);
}

// Bounded per-process cache. Callers must authorize every request before accessing it.
export function createGeoImageVariantCache() {
  const cache = new Map<string, { bytes: Buffer; expires: number }>();
  const running = new Map<string, Promise<Buffer>>();
  const maxBytes = 24 * 1024 * 1024;
  let total = 0;
  return async function variant(key: string, generate: () => Promise<Buffer>) {
    const existing = cache.get(key);
    if (existing && existing.expires > Date.now()) return existing.bytes;
    if (existing) { total -= existing.bytes.length; cache.delete(key); }
    if (running.has(key)) return running.get(key)!;
    if (running.size >= 2) throw new Error("geo_image_variant_busy");
    const job = Promise.resolve().then(generate).then((bytes) => {
      if (bytes.length <= maxBytes) {
        while (cache.size && (total + bytes.length > maxBytes || cache.size >= 48)) {
          const oldest = cache.keys().next().value!;
          total -= cache.get(oldest)!.bytes.length; cache.delete(oldest);
        }
        cache.set(key, { bytes, expires: Date.now() + 300_000 }); total += bytes.length;
      }
      return bytes;
    }).finally(() => { running.delete(key); });
    running.set(key, job);
    return job;
  };
}
