import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { it } from "node:test";

import {
  createUserPasswordHash,
  defaultPasswordFromPhone,
} from "../../modules/identity/team-account-credentials.service.ts";
import { createMigratedTestDb } from "../../modules/shared/db/test-db.ts";
import {
  createPhoneAuthDevServer,
  resolveGenerationStorageObjectReferences,
} from "../phone-auth-dev-server.ts";

it("re-signs stable canvas storage references before provider dispatch without dropping object ids", async () => {
  const imageObjectId = "51000000-0000-4000-8000-000000000001";
  const videoObjectId = "51000000-0000-4000-8000-000000000002";
  const calls: string[] = [];
  const resolve = async (storageObjectId: string) => {
    calls.push(storageObjectId);
    return `https://signed.example/${storageObjectId}`;
  };
  const imageProxy = `/api/storage/objects/${imageObjectId}/content`;
  const videoProxy = `/api/storage/objects/${videoObjectId}/content`;
  const resolved = await resolveGenerationStorageObjectReferences({
    referenceImages: [imageProxy],
    parameters: {
      referenceImages: [{ url: imageProxy, storageObjectId: imageObjectId }],
      imageReference: { storageObjectId: imageObjectId, tag: "图1" },
      referenceVideos: [{ url: "https://expired.example/video.mp4", storageObjectId: videoObjectId }],
      videoFilePaths: [videoProxy],
    },
  }, resolve) as Record<string, any>;

  assert.equal(resolved.referenceImages[0], `https://signed.example/${imageObjectId}`);
  assert.equal(resolved.parameters.referenceImages[0].url, `https://signed.example/${imageObjectId}`);
  assert.equal(resolved.parameters.referenceImages[0].storageObjectId, imageObjectId);
  assert.equal(resolved.parameters.imageReference.url, `https://signed.example/${imageObjectId}`);
  assert.equal(resolved.parameters.imageReference.storageObjectId, imageObjectId);
  assert.equal(resolved.parameters.referenceVideos[0].url, `https://signed.example/${videoObjectId}`);
  assert.equal(resolved.parameters.videoFilePaths[0], `https://signed.example/${videoObjectId}`);
  assert.deepEqual(calls.sort(), [imageObjectId, videoObjectId].sort());
});

it("re-signs historical COS URLs when an edit draft has no storage object id", async () => {
  const calls: string[] = [];
  const historicalUrl = "https://creator-test.cos.ap-shanghai.myqcloud.com/legacy/reference.png?X-Amz-Expires=60&X-Amz-Signature=expired";
  const resolved = await resolveGenerationStorageObjectReferences({
    firstFrameUrl: historicalUrl,
    parameters: { filePaths: [historicalUrl] },
  }, async (storageObjectId) => `https://signed.example/${storageObjectId}`, async (sourceUrl) => {
    calls.push(sourceUrl);
    return "https://signed.example/refreshed";
  }) as Record<string, any>;

  assert.equal(resolved.firstFrameUrl, "https://signed.example/refreshed");
  assert.equal(resolved.parameters.filePaths[0], "https://signed.example/refreshed");
  assert.deepEqual(calls, [historicalUrl, historicalUrl]);
});

it("defers stale storage proxies to an accompanying asset version", async () => {
  const staleObjectId = "51000000-0000-4000-8000-000000000099";
  const assetVersionId = "52000000-0000-4000-8000-000000000099";
  const staleProxy = `/api/storage/objects/${staleObjectId}/content`;
  const resolved = await resolveGenerationStorageObjectReferences({
    parameters: {
      quickReferences: [{ assetVersionId, storageObjectId: staleObjectId, url: staleProxy }],
    },
  }, async () => {
    throw new Error("storage_object_missing");
  }) as Record<string, any>;

  assert.deepEqual(resolved.parameters.quickReferences[0], { assetVersionId, storageObjectId: staleObjectId });
});

it("falls back to a valid COS URL when a historical storage proxy id is stale", async () => {
  const staleObjectId = "51000000-0000-4000-8000-000000000098";
  const sourceUrl = "https://creator-test.cos.ap-shanghai.myqcloud.com/legacy/reference.png";
  let sourceCalls = 0;
  const resolved = await resolveGenerationStorageObjectReferences({
    parameters: {
      quickReferences: [{ storageObjectId: staleObjectId, url: sourceUrl }],
    },
  }, async () => {
    throw new Error("storage_object_missing");
  }, async (candidate) => {
    sourceCalls += 1;
    assert.equal(candidate, sourceUrl);
    return "https://signed.example/refreshed-reference";
  }) as Record<string, any>;

  assert.equal(resolved.parameters.quickReferences[0].url, "https://signed.example/refreshed-reference");
  assert.equal(resolved.parameters.quickReferences[0].storageObjectId, staleObjectId);
  assert.equal(sourceCalls, 1);
});

it("serves an authenticated user's completed upload through the credentialed content route", async () => {
  const db = await createMigratedTestDb();
  const panoramaBytes = Buffer.from("panorama-image");
  const phone = "13900000029";
  const otherPhone = "13900000030";
  const userId = randomUUID();
  const otherUserId = randomUUID();
  const storageObjectId = randomUUID();
  const uploadSessionId = randomUUID();
  const completedStorageObjectId = randomUUID();
  const completedUploadSessionId = randomUUID();
  const incompleteStorageObjectId = randomUUID();
  const incompleteUploadSessionId = randomUUID();
  const unavailableStorageObjectId = randomUUID();
  const unavailableUploadSessionId = randomUUID();
  const upstreamRanges: Array<string | null> = [];
  const server = createPhoneAuthDevServer({
    db,
    env: {
      NODE_ENV: "test",
      AUTH_SESSION_REDIS_CACHE_ENABLED: "false",
    },
    fetchImpl: async (_url, init) => {
      const range = new Headers(init?.headers).get("range");
      upstreamRanges.push(range);
      if (range === "bytes=999-") {
        return new Response(null, {
          status: 416,
          headers: {
            "accept-ranges": "bytes",
            "content-range": `bytes */${panoramaBytes.byteLength}`,
          },
        });
      }
      return new Response(range ? panoramaBytes.subarray(0, 4) : panoramaBytes, {
        status: range ? 206 : 200,
        headers: {
          "content-type": "image/jpeg",
          "accept-ranges": "bytes",
          ...(range ? { "content-range": `bytes 0-3/${panoramaBytes.byteLength}` } : {}),
        },
      });
    },
    repairScheduler: { enabled: false },
    storageRuntime: {
      mode: "cos",
      provider: "tencent_cos",
      bucket: "creator-test",
      region: "ap-shanghai",
      adapter: {
        async createSignedReadUrl({ expiresAt }) {
          return { url: "https://storage.example.test/director/panorama.jpg", expiresAt };
        },
        async putObject() {
          return { eTag: "panorama-etag" };
        },
        async headObject() {
          return {
            exists: true,
            contentType: "image/jpeg",
            contentLength: panoramaBytes.byteLength,
            eTag: "panorama-etag",
          };
        },
      },
    },
  });

  try {
    await db.query(
      `
        INSERT INTO users (id, phone_e164, password_hash, status)
        VALUES
          ($1, $2, $3, 'active'),
          ($4, $5, $6, 'active')
      `,
      [
        userId,
        phone,
        await createUserPasswordHash(defaultPasswordFromPhone(phone)),
        otherUserId,
        otherPhone,
        await createUserPasswordHash(defaultPasswordFromPhone(otherPhone)),
      ],
    );
    await db.query(
      `
        INSERT INTO storage_objects (
          id, bucket, object_key, content_type, size_bytes,
          provider, status, etag, created_by_user_id
        )
        VALUES ($1, 'creator-test', 'director/panorama.jpg', 'image/jpeg', $2,
          'tencent_cos', 'available', 'panorama-etag', $3)
      `,
      [storageObjectId, panoramaBytes.byteLength, userId],
    );
    await db.query(
      `
        INSERT INTO storage_objects (
          id, bucket, object_key, content_type, size_bytes,
          provider, status, etag, created_by_user_id
        )
        VALUES
          ($1, 'creator-test', 'director/completed-panorama.jpg', 'image/jpeg', $4,
            'tencent_cos', 'available', 'completed-panorama-etag', $5),
          ($2, 'creator-test', 'director/incomplete-panorama.jpg', 'image/jpeg', $4,
            'tencent_cos', 'available', 'incomplete-panorama-etag', $5),
          ($3, 'creator-test', 'director/unavailable-panorama.jpg', 'image/jpeg', $4,
            'tencent_cos', 'pending_upload', 'unavailable-panorama-etag', $5)
      `,
      [
        completedStorageObjectId,
        incompleteStorageObjectId,
        unavailableStorageObjectId,
        panoramaBytes.byteLength,
        userId,
      ],
    );
    await db.query(
      `
        INSERT INTO storage_upload_sessions (
          id, storage_object_id, purpose, status, content_type,
          expected_size_bytes, original_file_name, idempotency_key,
          expires_at, completed_at, created_by_user_id
        )
        VALUES ($1, $2, 'director-panorama', 'uploaded', 'image/jpeg',
          $3, 'panorama.jpg', 'director-panorama-content-test',
          now() + interval '1 hour', now(), $4)
      `,
      [uploadSessionId, storageObjectId, panoramaBytes.byteLength, userId],
    );
    await db.query(
      `
        INSERT INTO storage_upload_sessions (
          id, storage_object_id, purpose, status, content_type,
          expected_size_bytes, original_file_name, idempotency_key,
          expires_at, completed_at, created_by_user_id
        )
        VALUES
          ($1, $4, 'director-panorama', 'failed', 'image/jpeg',
            $7, 'completed-panorama.jpg', 'director-completed-content-test',
            now() + interval '1 hour', now(), $8),
          ($2, $5, 'director-panorama', 'failed', 'image/jpeg',
            $7, 'incomplete-panorama.jpg', 'director-incomplete-content-test',
            now() + interval '1 hour', now(), $8),
          ($3, $6, 'director-panorama', 'failed', 'image/jpeg',
            $7, 'unavailable-panorama.jpg', 'director-unavailable-content-test',
            now() + interval '1 hour', now(), $8)
      `,
      [
        completedUploadSessionId,
        incompleteUploadSessionId,
        unavailableUploadSessionId,
        completedStorageObjectId,
        incompleteStorageObjectId,
        unavailableStorageObjectId,
        panoramaBytes.byteLength,
        userId,
      ],
    );
    await db.query(
      `
        INSERT INTO project_upload_records (
          id, storage_object_id, upload_session_id, actor_user_id,
          page_key, source_action, file_name, status, completed_at
        )
        VALUES
          ($1, $2, $3, $7, 'project', 'director-panorama', 'completed-panorama.jpg', 'uploaded', now()),
          ($4, $5, $6, $7, 'project', 'director-panorama', 'unavailable-panorama.jpg', 'uploaded', now())
      `,
      [
        randomUUID(),
        completedStorageObjectId,
        completedUploadSessionId,
        randomUUID(),
        unavailableStorageObjectId,
        unavailableUploadSessionId,
        userId,
      ],
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
    const otherLoginResponse = await fetch(`${server.origin}/api/auth/password/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        account: otherPhone,
        password: defaultPasswordFromPhone(otherPhone),
      }),
    });
    assert.equal(otherLoginResponse.status, 200);
    const otherCookie = otherLoginResponse.headers.get("set-cookie") ?? "";

    const contentUrl = `${server.origin}/api/storage/upload-sessions/${uploadSessionId}/content`;
    const unauthenticatedResponse = await fetch(contentUrl);
    assert.equal(unauthenticatedResponse.status, 401);
    const otherUserResponse = await fetch(contentUrl, { headers: { cookie: otherCookie } });
    assert.equal(otherUserResponse.status, 404);

    const contentResponse = await fetch(contentUrl, { headers: { cookie } });
    assert.equal(contentResponse.status, 200);
    assert.equal(contentResponse.headers.get("content-type"), "image/jpeg");
    assert.equal(contentResponse.headers.get("cache-control"), "private, max-age=300");
    assert.deepEqual(Buffer.from(await contentResponse.arrayBuffer()), panoramaBytes);
    const rangeResponse = await fetch(contentUrl, {
      headers: { cookie, range: "bytes=0-3" },
    });
    assert.equal(rangeResponse.status, 206);
    assert.equal(rangeResponse.headers.get("content-range"), `bytes 0-3/${panoramaBytes.byteLength}`);
    assert.deepEqual(Buffer.from(await rangeResponse.arrayBuffer()), panoramaBytes.subarray(0, 4));
    assert.ok(upstreamRanges.includes("bytes=0-3"));
    const unsatisfiedRangeResponse = await fetch(contentUrl, {
      headers: { cookie, range: "bytes=999-" },
    });
    assert.equal(unsatisfiedRangeResponse.status, 416);
    assert.equal(unsatisfiedRangeResponse.headers.get("accept-ranges"), "bytes");
    assert.equal(unsatisfiedRangeResponse.headers.get("content-range"), `bytes */${panoramaBytes.byteLength}`);

    const objectContentUrl = `${server.origin}/api/storage/objects/${storageObjectId}/content`;
    const unauthenticatedObjectResponse = await fetch(objectContentUrl, { redirect: "manual" });
    assert.equal(unauthenticatedObjectResponse.status, 401);
    const otherUserObjectResponse = await fetch(objectContentUrl, {
      headers: { cookie: otherCookie },
      redirect: "manual",
    });
    assert.equal(otherUserObjectResponse.status, 404);
    const objectContentResponse = await fetch(objectContentUrl, {
      headers: { cookie },
      redirect: "manual",
    });
    assert.equal(objectContentResponse.status, 307);
    assert.equal(objectContentResponse.headers.get("location"), "https://storage.example.test/director/panorama.jpg");
    assert.equal(objectContentResponse.headers.get("cache-control"), "private, no-store");
    const proxiedObjectContentResponse = await fetch(`${objectContentUrl}?proxy=1`, {
      headers: { cookie },
    });
    const proxiedObjectEtag = proxiedObjectContentResponse.headers.get("etag");
    assert.equal(proxiedObjectContentResponse.status, 200);
    assert.equal(proxiedObjectContentResponse.headers.get("content-type"), "image/jpeg");
    assert.equal(proxiedObjectContentResponse.headers.get("cache-control"), "private, max-age=3600");
    assert.ok(proxiedObjectEtag);
    assert.deepEqual(Buffer.from(await proxiedObjectContentResponse.arrayBuffer()), panoramaBytes);
    const revalidatedProxiedObjectResponse = await fetch(`${objectContentUrl}?proxy=1`, {
      headers: { cookie, "if-none-match": proxiedObjectEtag ?? "" },
    });
    assert.equal(revalidatedProxiedObjectResponse.status, 304);

    const completedResponse = await fetch(
      `${server.origin}/api/storage/upload-sessions/${completedUploadSessionId}/content`,
      { headers: { cookie } },
    );
    assert.equal(completedResponse.status, 200);
    assert.deepEqual(Buffer.from(await completedResponse.arrayBuffer()), panoramaBytes);

    const incompleteResponse = await fetch(
      `${server.origin}/api/storage/upload-sessions/${incompleteUploadSessionId}/content`,
      { headers: { cookie } },
    );
    assert.equal(incompleteResponse.status, 409);

    const unavailableResponse = await fetch(
      `${server.origin}/api/storage/upload-sessions/${unavailableUploadSessionId}/content`,
      { headers: { cookie } },
    );
    assert.equal(unavailableResponse.status, 409);
    const unavailableObjectResponse = await fetch(
      `${server.origin}/api/storage/objects/${unavailableStorageObjectId}/content`,
      { headers: { cookie }, redirect: "manual" },
    );
    assert.equal(unavailableObjectResponse.status, 409);
    const otherUserUnavailableObjectResponse = await fetch(
      `${server.origin}/api/storage/objects/${unavailableStorageObjectId}/content`,
      { headers: { cookie: otherCookie }, redirect: "manual" },
    );
    assert.equal(otherUserUnavailableObjectResponse.status, 404);
  } finally {
    await server.close();
  }
});

it("does not resolve relative storage proxy URLs from forwarded host headers or follow redirects", async () => {
  const db = await createMigratedTestDb();
  const phone = "13900000031";
  const userId = randomUUID();
  const storageObjectId = randomUUID();
  const objectKey = "private/relative-proxy.png";
  const fetchCalls: Array<{ url: string; redirect?: RequestRedirect }> = [];
  const server = createPhoneAuthDevServer({
    db,
    env: {
      NODE_ENV: "test",
      AUTH_SESSION_REDIS_CACHE_ENABLED: "false",
    },
    fetchImpl: async (url, init) => {
      fetchCalls.push({
        url: String(url),
        redirect: init?.redirect,
      });
      return new Response(Buffer.from("relative-proxy-image"), {
        status: 200,
        headers: { "content-type": "image/png" },
      });
    },
    repairScheduler: { enabled: false },
    storageRuntime: {
      mode: "cos",
      provider: "tencent_cos",
      bucket: "creator-test",
      adapter: {
        async createSignedReadUrl({ bucket, objectKey: signedObjectKey, expiresAt }) {
          return {
            url: `/uploads/storage/${encodeURIComponent(bucket)}/${encodeURIComponent(signedObjectKey)}`,
            expiresAt,
          };
        },
      },
    },
  });

  try {
    await db.query(
      "INSERT INTO users (id, phone_e164, password_hash, status) VALUES ($1, $2, $3, 'active')",
      [userId, phone, await createUserPasswordHash(defaultPasswordFromPhone(phone))],
    );
    await db.query(
      `
        INSERT INTO storage_objects (
          id, bucket, object_key, content_type, size_bytes, provider, status, created_by_user_id
        )
        VALUES ($1, 'creator-test', $2, 'image/png', 20, 'creator-dev', 'available', $3)
      `,
      [storageObjectId, objectKey, userId],
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

    const response = await fetch(
      `${server.origin}/api/storage/objects/${storageObjectId}/content?proxy=1`,
      {
        headers: {
          cookie,
          "x-forwarded-host": "attacker.example",
          "x-forwarded-proto": "https",
        },
      },
    );

    assert.equal(response.status, 200);
    assert.equal(fetchCalls.length, 1);
    assert.equal(
      fetchCalls[0]?.url,
      `${server.origin}/uploads/storage/creator-test/${encodeURIComponent(objectKey)}`,
    );
    assert.equal(fetchCalls[0]?.redirect, "manual");
  } finally {
    await server.close();
  }
});
