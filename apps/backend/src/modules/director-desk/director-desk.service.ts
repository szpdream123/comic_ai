export type DirectorDeskStatus = "active" | "archived";

export interface DirectorDeskRecord {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  lastOpenedAt: string | null;
}

export interface DirectorDeskStore {
  list(input: { userId: string }): Promise<DirectorDeskRecord[]>;
  create(input: {
    userId: string;
    createdByMemberId: string | null;
    deskKey: string | null;
    name: string | null;
    now: Date;
  }): Promise<DirectorDeskRecord>;
  update(input: {
    userId: string;
    deskKey: string;
    name?: string;
    status?: DirectorDeskStatus;
    sortOrder?: number;
    now: Date;
  }): Promise<DirectorDeskRecord | undefined>;
  delete(input: { userId: string; deskKey: string }): Promise<boolean>;
  readScene(input: { userId: string; deskKey: string }): Promise<Record<string, unknown> | undefined>;
  writeScene(input: {
    userId: string;
    deskKey: string;
    scene: Record<string, unknown>;
    now: Date;
  }): Promise<boolean>;
  writeSceneIfEmpty(input: {
    userId: string;
    deskKey: string;
    scene: Record<string, unknown>;
    now: Date;
  }): Promise<boolean | undefined>;
  markOpened(input: {
    userId: string;
    deskKey: string;
    now: Date;
  }): Promise<DirectorDeskRecord | undefined>;
}

export class DirectorDeskValidationError extends Error {
  constructor(
    readonly code: string,
    readonly fieldErrors: Record<string, string>,
  ) {
    super(code);
  }
}

export class DirectorDeskService {
  constructor(private readonly store: DirectorDeskStore) {}

  async list(userId: string) {
    return this.store.list({ userId });
  }

  async create(input: {
    userId: string;
    createdByMemberId?: string | null;
    deskKey?: unknown;
    name?: unknown;
    now?: Date;
  }) {
    const name = optionalName(input.name);
    const deskKey = optionalDeskKey(input.deskKey);
    return this.store.create({
      userId: input.userId,
      createdByMemberId: input.createdByMemberId ?? null,
      deskKey,
      name,
      now: input.now ?? new Date(),
    });
  }

  async update(input: {
    userId: string;
    deskKey: string;
    name?: unknown;
    status?: unknown;
    sortOrder?: unknown;
    now?: Date;
  }) {
    const deskKey = requiredDeskKey(input.deskKey);
    const patch: {
      name?: string;
      status?: DirectorDeskStatus;
      sortOrder?: number;
    } = {};
    if (input.name !== undefined) patch.name = requiredName(input.name);
    if (input.status !== undefined) patch.status = requiredStatus(input.status);
    if (input.sortOrder !== undefined) patch.sortOrder = requiredSortOrder(input.sortOrder);
    if (!Object.keys(patch).length) {
      throw new DirectorDeskValidationError("director_desk_patch_required", {
        body: "at_least_one_field_required",
      });
    }
    return this.store.update({
      userId: input.userId,
      deskKey,
      ...patch,
      now: input.now ?? new Date(),
    });
  }

  async delete(input: { userId: string; deskKey: string }) {
    return this.store.delete({
      userId: input.userId,
      deskKey: requiredDeskKey(input.deskKey),
    });
  }

  async readScene(input: { userId: string; deskKey: string }) {
    return this.store.readScene({
      userId: input.userId,
      deskKey: requiredDeskKey(input.deskKey),
    });
  }

  async writeScene(input: {
    userId: string;
    deskKey: string;
    scene: unknown;
    now?: Date;
  }) {
    if (!isJsonObject(input.scene)) {
      throw new DirectorDeskValidationError("director_desk_scene_invalid", {
        scene: "object_required",
      });
    }
    return this.store.writeScene({
      userId: input.userId,
      deskKey: requiredDeskKey(input.deskKey),
      scene: input.scene,
      now: input.now ?? new Date(),
    });
  }

  async writeSceneIfEmpty(input: {
    userId: string;
    deskKey: string;
    scene: unknown;
    now?: Date;
  }) {
    if (!isJsonObject(input.scene)) {
      throw new DirectorDeskValidationError("director_desk_scene_invalid", {
        scene: "object_required",
      });
    }
    return this.store.writeSceneIfEmpty({
      userId: input.userId,
      deskKey: requiredDeskKey(input.deskKey),
      scene: input.scene,
      now: input.now ?? new Date(),
    });
  }

  async markOpened(input: { userId: string; deskKey: string; now?: Date }) {
    return this.store.markOpened({
      userId: input.userId,
      deskKey: requiredDeskKey(input.deskKey),
      now: input.now ?? new Date(),
    });
  }
}

function optionalName(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  return requiredName(value);
}

function requiredName(value: unknown): string {
  if (typeof value !== "string" || !value.trim() || value.trim().length > 100) {
    throw new DirectorDeskValidationError("director_desk_name_invalid", {
      name: "name_length",
    });
  }
  return normalizeName(value.trim());
}

function normalizeName(name: string) {
  const match = name.match(/^导演台\s*(\d+)\s*号$/);
  return match ? `导演台 ${Number(match[1])} 号` : name;
}

function requiredDeskKey(value: unknown) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > 100) {
    throw new DirectorDeskValidationError("director_desk_key_invalid", {
      deskKey: "desk_key_length",
    });
  }
  return value.trim();
}

function optionalDeskKey(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  return requiredDeskKey(value);
}

function requiredStatus(value: unknown): DirectorDeskStatus {
  if (value !== "active" && value !== "archived") {
    throw new DirectorDeskValidationError("director_desk_status_invalid", {
      status: "status_unsupported",
    });
  }
  return value;
}

function requiredSortOrder(value: unknown) {
  if (!Number.isInteger(value) || Number(value) < 0) {
    throw new DirectorDeskValidationError("director_desk_sort_order_invalid", {
      sortOrder: "non_negative_integer_required",
    });
  }
  return Number(value);
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
