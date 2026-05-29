import type { StorageAdapter } from "./storage.service.ts";

export class CreatorDevStorageAdapter implements StorageAdapter {
  constructor(private readonly basePath = "/uploads/storage") {}

  async createSignedReadUrl(input: {
    bucket: string;
    objectKey: string;
    expiresAt: Date;
  }): Promise<{ url: string; expiresAt: Date }> {
    return {
      url: `${this.basePath}/${encodeURIComponent(input.bucket)}/${encodeURIComponent(input.objectKey)}?expiresAt=${encodeURIComponent(input.expiresAt.toISOString())}`,
      expiresAt: input.expiresAt,
    };
  }
}

export function createCreatorDevStorageAdapter(): StorageAdapter {
  return new CreatorDevStorageAdapter();
}
