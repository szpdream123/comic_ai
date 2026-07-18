import { beforeEach, expect, it, vi } from "vitest";

const { createDirectorDeskRecord, saveLegacyDirectorDeskSceneIfEmpty } = vi.hoisted(() => ({
  createDirectorDeskRecord: vi.fn(),
  saveLegacyDirectorDeskSceneIfEmpty: vi.fn(),
}));

vi.mock("./directorDeskRegistry", () => ({
  createDirectorDeskRecord,
}));

vi.mock("../io/directorDeskApi", () => ({
  saveLegacyDirectorDeskSceneIfEmpty,
}));

import { migrateLegacyDirectorDesks } from "./legacyDirectorDeskMigration";

beforeEach(() => {
  localStorage.clear();
  createDirectorDeskRecord.mockReset().mockResolvedValue(undefined);
  saveLegacyDirectorDeskSceneIfEmpty.mockReset().mockResolvedValue(true);
});

it("migrates legacy desk records and scenes without recreating existing desks", async () => {
  localStorage.setItem("lingxi-3d-director-desk-registry-v1", JSON.stringify([
    { id: "desk_1", name: "导演台 1 号" },
    { id: "desk_3", name: "旧导演台 3 号" },
  ]));
  localStorage.setItem("standalone-3d-director-desk-registry-v1", JSON.stringify([
    { id: "desk_2", name: "导演台 2 号" },
  ]));
  localStorage.setItem("storyai-3d-director-desk-demo:desk_1", JSON.stringify({ project: { version: 1 } }));
  localStorage.setItem("storyai-3d-director-desk-demo:desk_2", JSON.stringify({ viewMode: "camera" }));
  localStorage.setItem("storyai-3d-director-desk-demo:desk_3", JSON.stringify({ selectedObjectId: "role_3" }));

  const migrated = await migrateLegacyDirectorDesks([{
    id: "desk_1",
    name: "数据库新名称",
    createdAt: "2026-07-18T00:00:00.000Z",
    updatedAt: "2026-07-18T00:00:00.000Z",
  }]);

  expect(migrated).toBe(true);
  expect(createDirectorDeskRecord).toHaveBeenCalledTimes(2);
  expect(createDirectorDeskRecord).toHaveBeenCalledWith("旧导演台 3 号", "desk_3");
  expect(createDirectorDeskRecord).toHaveBeenCalledWith("导演台 2 号", "desk_2");
  expect(createDirectorDeskRecord).not.toHaveBeenCalledWith(expect.anything(), "desk_1");
  expect(saveLegacyDirectorDeskSceneIfEmpty).toHaveBeenCalledTimes(3);
  expect(saveLegacyDirectorDeskSceneIfEmpty).toHaveBeenCalledWith("desk_1", { project: { version: 1 } });
  expect(localStorage.getItem("lingxi-3d-director-desk-postgres-migration-v1")).toBe("complete");
  expect(localStorage.getItem("storyai-3d-director-desk-demo:desk_1")).not.toBeNull();

  createDirectorDeskRecord.mockClear();
  saveLegacyDirectorDeskSceneIfEmpty.mockClear();
  expect(await migrateLegacyDirectorDesks([])).toBe(false);
  expect(createDirectorDeskRecord).not.toHaveBeenCalled();
  expect(saveLegacyDirectorDeskSceneIfEmpty).not.toHaveBeenCalled();
});

it("keeps migration retryable when a backend write fails", async () => {
  localStorage.setItem("lingxi-3d-director-desk-registry-v1", JSON.stringify([
    { id: "desk_1", name: "导演台 1 号" },
  ]));
  localStorage.setItem("storyai-3d-director-desk-demo:desk_1", JSON.stringify({ project: { version: 1 } }));
  saveLegacyDirectorDeskSceneIfEmpty.mockRejectedValueOnce(new Error("network failed"));

  await expect(migrateLegacyDirectorDesks([])).rejects.toThrow("network failed");
  expect(localStorage.getItem("lingxi-3d-director-desk-postgres-migration-v1")).toBeNull();

  await expect(migrateLegacyDirectorDesks([])).resolves.toBe(true);
  expect(localStorage.getItem("lingxi-3d-director-desk-postgres-migration-v1")).toBe("complete");
});
