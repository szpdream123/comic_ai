import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { it } from "node:test";

import {
  createUserPasswordHash,
  defaultPasswordFromPhone,
} from "../../modules/identity/team-account-credentials.service.ts";
import { createMigratedTestDb } from "../../modules/shared/db/test-db.ts";
import { createPhoneAuthDevServer } from "../phone-auth-dev-server.ts";

it("returns the authenticated user's personal media summary and page", async () => {
  const db = await createMigratedTestDb();
  const server = createPhoneAuthDevServer({
    db,
    env: {
      NODE_ENV: "test",
      AUTH_SESSION_REDIS_CACHE_ENABLED: "false",
    },
    repairScheduler: { enabled: false },
  });
  const userId = randomUUID();
  const storageObjectId = randomUUID();
  const audioStorageObjectId = randomUUID();
  const pendingAudioStorageObjectId = randomUUID();
  const failedImageStorageObjectId = randomUUID();
  const deleteFailedVideoStorageObjectId = randomUUID();
  const phone = "13900000019";

  try {
    await db.query(
      `
        INSERT INTO users (id, phone_e164, password_hash, status)
        VALUES ($1, $2, $3, 'active')
      `,
      [userId, phone, await createUserPasswordHash(defaultPasswordFromPhone(phone))],
    );
    await db.query(
      `
        INSERT INTO storage_objects (
          id, bucket, object_key, content_type, size_bytes,
          created_by_user_id, provider, status
        )
        VALUES ($1, 'creator-test', 'personal/example.png', 'image/png', 2048, $2, 'creator-dev', 'available')
      `,
      [storageObjectId, userId],
    );
    await db.query(
      `
        INSERT INTO project_upload_records (
          id, storage_object_id, actor_user_id, actor_display_name, actor_phone_e164,
          page_key, source_action, file_name, object_key, bucket, provider,
          content_type, size_bytes, public_url, status, completed_at
        )
        VALUES (
          $1, $2, $3, 'Media User', $4,
          'new-canvas', 'upload-image', 'example.png', 'personal/example.png',
          'creator-test', 'creator-dev', 'image/png', 2048,
          '/uploads/storage/creator-test/personal/example.png', 'uploaded', now()
        )
      `,
      [randomUUID(), storageObjectId, userId, `+86${phone}`],
    );
    await db.query(
      `
        INSERT INTO storage_objects (
          id, bucket, object_key, content_type, size_bytes,
          created_by_user_id, provider, status
        )
        VALUES ($1, 'creator-test', 'personal/voice.mp3', 'audio/mpeg', 4096, $2, 'creator-dev', 'available')
      `,
      [audioStorageObjectId, userId],
    );
    await db.query(
      `
        INSERT INTO project_upload_records (
          id, storage_object_id, actor_user_id, actor_display_name, actor_phone_e164,
          page_key, source_action, file_name, object_key, bucket, provider,
          content_type, size_bytes, public_url, status, completed_at
        )
        VALUES (
          $1, $2, $3, 'Media User', $4,
          'new-canvas', 'new-canvas/audio-import', 'voice.mp3', 'personal/voice.mp3',
          'creator-test', 'creator-dev', 'audio/mpeg', 4096,
          '/uploads/storage/creator-test/personal/voice.mp3', 'uploaded', now()
        )
      `,
      [randomUUID(), audioStorageObjectId, userId, `+86${phone}`],
    );
    await db.query(
      `
        INSERT INTO storage_objects (
          id, bucket, object_key, content_type, size_bytes,
          created_by_user_id, provider, status
        )
        VALUES
          ($1, 'creator-test', 'personal/pending.mp3', 'audio/mpeg', 8192, $4, 'creator-dev', 'pending_upload'),
          ($2, 'creator-test', 'personal/failed.png', 'image/png', 16384, $4, 'creator-dev', 'failed'),
          ($3, 'creator-test', 'personal/delete-failed.mp4', 'video/mp4', 32768, $4, 'creator-dev', 'delete_failed')
      `,
      [pendingAudioStorageObjectId, failedImageStorageObjectId, deleteFailedVideoStorageObjectId, userId],
    );

    await server.listen(0);
    const loginResponse = await fetch(`${server.origin}/api/auth/password/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        account: phone,
        password: defaultPasswordFromPhone(phone),
      }),
    });
    assert.equal(loginResponse.status, 200);
    const cookie = loginResponse.headers.get("set-cookie") ?? "";

    const [summaryResponse, audioSummaryResponse, listResponse, audioListResponse] = await Promise.all([
      fetch(`${server.origin}/api/creator/media-library/summary?media=all&range=all`, {
        headers: { cookie },
      }),
      fetch(`${server.origin}/api/creator/media-library/summary?media=audio&range=all`, {
        headers: { cookie },
      }),
      fetch(`${server.origin}/api/creator/media-library?media=all&range=all&page=1&pageSize=12`, {
        headers: { cookie },
      }),
      fetch(`${server.origin}/api/creator/media-library?media=audio&range=all&page=1&pageSize=12`, {
        headers: { cookie },
      }),
    ]);
    const summary = await summaryResponse.json();
    const audioSummary = await audioSummaryResponse.json();
    const list = await listResponse.json();
    const audioList = await audioListResponse.json();

    assert.equal(summaryResponse.status, 200);
    assert.deepEqual(summary, {
      total: 2,
      imageCount: 1,
      videoCount: 0,
      audioCount: 1,
      imageBytes: 2048,
      videoBytes: 0,
      audioBytes: 4096,
    });
    assert.equal(audioSummaryResponse.status, 200);
    assert.deepEqual(audioSummary, {
      total: 1,
      imageCount: 0,
      videoCount: 0,
      audioCount: 1,
      imageBytes: 0,
      videoBytes: 0,
      audioBytes: 4096,
    });
    assert.equal(listResponse.status, 200);
    assert.equal(list.meta.total, 2);
    assert.equal(list.data.length, 2);
    assert.equal(list.data.some((item: { id: string }) => item.id === pendingAudioStorageObjectId), false);
    assert.equal(list.data.some((item: { id: string }) => item.id === failedImageStorageObjectId), false);
    assert.equal(list.data.some((item: { id: string }) => item.id === deleteFailedVideoStorageObjectId), false);
    const image = list.data.find((item: { id: string }) => item.id === storageObjectId);
    const audio = list.data.find((item: { id: string }) => item.id === audioStorageObjectId);
    assert.equal(image?.mediaKind, "image");
    assert.equal(image?.storageObjectId, storageObjectId);
    assert.equal(image?.previewUrl, "/uploads/storage/creator-test/personal/example.png");
    assert.equal(audio?.mediaKind, "audio");
    assert.equal(audio?.storageObjectId, audioStorageObjectId);
    assert.equal(audio?.contentType, "audio/mpeg");
    assert.equal(audio?.previewUrl, "/uploads/storage/creator-test/personal/voice.mp3");
    assert.equal(audioListResponse.status, 200);
    assert.equal(audioList.meta.total, 1);
    assert.equal(audioList.data.length, 1);
    assert.equal(audioList.data[0].id, audioStorageObjectId);
    assert.equal(audioList.data[0].storageObjectId, audioStorageObjectId);
    assert.equal(audioList.data[0].mediaKind, "audio");
    assert.equal(audioList.data.some((item: { id: string }) => item.id === pendingAudioStorageObjectId), false);
  } finally {
    await server.close();
  }
});
