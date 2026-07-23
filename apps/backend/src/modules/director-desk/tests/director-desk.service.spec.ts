import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DirectorDeskService,
  DirectorDeskValidationError,
  type DirectorDeskRecord,
  type DirectorDeskStore,
} from "../director-desk.service.ts";

describe("director desk service", () => {
  it("normalizes create and update input before calling the store", async () => {
    const store = new FakeDirectorDeskStore();
    const service = new DirectorDeskService(store);

    const created = await service.create({
      userId: "user-1",
      createdByMemberId: "member-1",
      deskKey: " desk_7 ",
      name: "导演台7号",
      now: new Date("2026-07-18T08:00:00.000Z"),
    });
    const updated = await service.update({
      userId: "user-1",
      deskKey: " desk_7 ",
      name: " 新名字 ",
      now: new Date("2026-07-18T09:00:00.000Z"),
    });

    assert.equal(created.id, "desk_7");
    assert.equal(store.created?.createdByMemberId, "member-1");
    assert.equal(store.created?.name, "导演台 7 号");
    assert.equal(updated?.name, "新名字");
  });

  it("rejects invalid patches and non-object scene documents", async () => {
    const service = new DirectorDeskService(new FakeDirectorDeskStore());

    await assert.rejects(
      service.update({ userId: "user-1", deskKey: "desk_1" }),
      (error: unknown) => error instanceof DirectorDeskValidationError
        && error.code === "director_desk_patch_required",
    );
    await assert.rejects(
      service.writeScene({ userId: "user-1", deskKey: "desk_1", scene: [] }),
      (error: unknown) => error instanceof DirectorDeskValidationError
        && error.code === "director_desk_scene_invalid",
    );
  });

  it("normalizes panorama object URLs to the credentialed image proxy on reads and writes", async () => {
    const store = new FakeDirectorDeskStore();
    const service = new DirectorDeskService(store);
    store.scene = {
      project: {
        assets: [
          {
            kind: "panorama",
            url: "http://127.0.0.1:4310/api/storage/objects/object-1/content",
          },
          {
            kind: "prop",
            url: "/api/storage/objects/object-2/content",
          },
        ],
      },
    };

    const loaded = await service.readScene({ userId: "user-1", deskKey: "desk_1" });
    assert.equal(
      ((loaded?.project as { assets: Array<{ url: string }> }).assets[0]?.url),
      "http://127.0.0.1:4310/api/storage/objects/object-1/content?proxy=1",
    );
    assert.equal(
      ((loaded?.project as { assets: Array<{ url: string }> }).assets[1]?.url),
      "/api/storage/objects/object-2/content",
    );

    await service.writeScene({
      userId: "user-1",
      deskKey: "desk_1",
      scene: {
        project: {
          assets: [{ kind: "panorama", url: "/api/storage/objects/object-3/content" }],
        },
      },
    });
    assert.equal(
      ((store.scene.project as { assets: Array<{ url: string }> }).assets[0]?.url),
      "/api/storage/objects/object-3/content?proxy=1",
    );
  });
});

class FakeDirectorDeskStore implements DirectorDeskStore {
  created?: Parameters<DirectorDeskStore["create"]>[0];
  scene: Record<string, unknown> = {};
  private record: DirectorDeskRecord = {
    id: "desk_1",
    name: "导演台 1 号",
    createdAt: "2026-07-18T08:00:00.000Z",
    updatedAt: "2026-07-18T08:00:00.000Z",
    lastOpenedAt: null,
  };

  async list() { return [this.record]; }
  async create(input: Parameters<DirectorDeskStore["create"]>[0]) {
    this.created = input;
    this.record = {
      ...this.record,
      id: input.deskKey ?? "desk_1",
      name: input.name ?? "导演台 1 号",
    };
    return this.record;
  }
  async update(input: Parameters<DirectorDeskStore["update"]>[0]) {
    this.record = { ...this.record, name: input.name ?? this.record.name };
    return this.record;
  }
  async delete() { return true; }
  async readScene() { return this.scene; }
  async writeScene(input: Parameters<DirectorDeskStore["writeScene"]>[0]) {
    this.scene = input.scene;
    return true;
  }
  async writeSceneIfEmpty(input: Parameters<DirectorDeskStore["writeSceneIfEmpty"]>[0]) {
    this.scene = input.scene;
    return true;
  }
  async markOpened() { return this.record; }
}
