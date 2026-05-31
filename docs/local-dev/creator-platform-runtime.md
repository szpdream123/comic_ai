# Creator Platform Runtime

This repo ships a local creator workspace behind:

```bash
npm run dev:phone-auth
```

The default runtime uses the in-repo dev provider and dev signed-url adapter.

## Runtime switches

Copy `.env.example` to `.env` and change the values you need.

### Provider adapter

- `MODEL_PROVIDER_MODE=dev`
  - Uses the local creator dev provider adapter.
- `MODEL_PROVIDER_MODE=http`
  - Uses the generic HTTP provider adapter.
  - Requires `MODEL_PROVIDER_ENDPOINT`.
  - Supports optional `MODEL_PROVIDER_API_KEY`.
  - Supports optional `MODEL_PROVIDER_NAME` to control the persisted `provider_requests.provider_name`.
- `MODEL_PROVIDER_MODE=openai_images`
  - Uses the OpenAI Images adapter for **image generation only**.
  - Requires `OPENAI_API_KEY`.
  - Supports optional `OPENAI_IMAGE_MODEL`.
  - Video generation continues to use the existing dev/provider fallback path in this phase.

### Storage adapter

- `STORAGE_ADAPTER_MODE=dev`
  - Uses the local dev signed-url adapter.
- `STORAGE_ADAPTER_MODE=public_base_url`
  - Uses the public-base-url storage adapter.
  - Requires `STORAGE_PUBLIC_BASE_URL`.
  - Supports optional `STORAGE_BUCKET` override for created storage objects.
- `STORAGE_ADAPTER_MODE=cos`
  - Uses Tencent Cloud COS with browser direct upload via STS plus backend-signed read URLs.
  - Requires `STORAGE_PROVIDER=cos`, `STORAGE_BUCKET`, `STORAGE_REGION`, `STORAGE_COS_SECRET_ID`, and `STORAGE_COS_SECRET_KEY`.
  - Supports optional `STORAGE_COS_STS_DURATION_SECONDS` and `STORAGE_SIGNED_URL_EXPIRES_SECONDS`.
  - Production should keep the bucket private and rely on backend short-lived signed URLs for preview, playback, and download.
- `STORAGE_ADAPTER_MODE=s3_compatible`
  - Uses the same direct object adapter shape against an S3-compatible endpoint.
  - Requires `STORAGE_REGION`, credentials, and usually `STORAGE_ENDPOINT`.
  - Supports `STORAGE_FORCE_PATH_STYLE=true` when the endpoint requires path-style addressing.

### COS direct upload notes

- Frontend upload flow is `prepare -> COS SDK upload -> complete -> import`.
- The browser only receives temporary STS credentials scoped to a single object key.
- Local development without COS still works through the dev fallback uploader at `/api/storage/upload-sessions/:id/blob`.
- Query responses now return absolute signed URLs for assets, storyboard media, and export records; the frontend should not reconstruct `/uploads/...` paths on its own.
- Delete flows clear business records first and tombstone orphaned storage objects after remote delete attempts.

### Creator task/runtime metadata

- `CREATOR_PAYLOAD_SCHEME`
  - Prefix used in provider payload references such as `creator://projects/...`
- `CREATOR_IMAGE_WORKER_ID`
- `CREATOR_VIDEO_WORKER_ID`
- `CREATOR_EXPORT_WORKER_ID`
  - Persisted as `tasks.locked_by` and `task_attempts.locked_by`
- `CREATOR_SIGNED_URL_EXPIRES_SECONDS`
  - Signed read URL TTL in seconds for export preview
- `STORAGE_SIGNED_URL_EXPIRES_SECONDS`
  - Preferred signed read URL TTL in seconds for all storage-backed media and exports

## Example: HTTP provider + public CDN URLs

```bash
MODEL_PROVIDER_MODE=http
MODEL_PROVIDER_ENDPOINT=https://provider.example.com
MODEL_PROVIDER_NAME=openai-images
STORAGE_ADAPTER_MODE=public_base_url
STORAGE_PUBLIC_BASE_URL=https://cdn.example.com/assets
STORAGE_BUCKET=creator-prod
CREATOR_PAYLOAD_SCHEME=creator
CREATOR_IMAGE_WORKER_ID=image-http-worker
CREATOR_VIDEO_WORKER_ID=video-http-worker
CREATOR_EXPORT_WORKER_ID=export-http-worker
CREATOR_SIGNED_URL_EXPIRES_SECONDS=1200
```

With that configuration, creator image/video/export flows still use the same B-module orchestration, but the persisted platform records will reflect the configured provider, worker IDs, storage bucket, and signed URL host.

## Example: Tencent COS private bucket

```bash
MODEL_PROVIDER_MODE=dev
STORAGE_ADAPTER_MODE=cos
STORAGE_PROVIDER=cos
STORAGE_BUCKET=creator-private-1250000000
STORAGE_REGION=ap-shanghai
STORAGE_COS_SECRET_ID=AKIDxxxxxxxxxxxxxxxxxxxxxxxx
STORAGE_COS_SECRET_KEY=xxxxxxxxxxxxxxxxxxxxxxxx
STORAGE_COS_STS_DURATION_SECONDS=1800
STORAGE_SIGNED_URL_EXPIRES_SECONDS=900
STORAGE_OBJECT_ROOT_PREFIX=AIManhuaDrama
STORAGE_OBJECT_DATE_TIMEZONE=Asia/Shanghai
CREATOR_PAYLOAD_SCHEME=creator
CREATOR_IMAGE_WORKER_ID=creator-image-worker
CREATOR_VIDEO_WORKER_ID=creator-video-worker
CREATOR_EXPORT_WORKER_ID=creator-export-worker
```

Recommended COS bucket CORS:

- Allow `PUT`, `POST`, `GET`, `HEAD`, `DELETE`, `OPTIONS`
- Allow your creator web origin plus local dev origin
- Allow headers `content-type`, `x-cos-security-token`, `authorization`, `x-cos-meta-*`
- Expose headers `etag`, `x-cos-request-id`
- Cache preflight for at least 300 seconds

Object key layout defaults:

- All uploads are written directly under `AIManhuaDrama/YYYYMMDD/`
- No extra organization / project / media-type subdirectories are created under that date folder
- The stored filename is normalized to `<storageObjectId>-<originalFileName>`
- The date folder uses `Asia/Shanghai` by default
- Override with `STORAGE_OBJECT_ROOT_PREFIX` and `STORAGE_OBJECT_DATE_TIMEZONE` when needed
