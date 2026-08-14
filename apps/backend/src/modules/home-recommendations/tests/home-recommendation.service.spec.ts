import assert from "node:assert/strict";
import test from "node:test";

import { PGlite } from "@electric-sql/pglite";

import { createHomeRecommendationService } from "../home-recommendation.service.ts";

test("home recommendation service manages categories and videos and filters inactive records", async () => {
  const db = new PGlite();
  await db.exec(`
    CREATE TABLE home_recommendation_categories (
      id uuid PRIMARY KEY, code text UNIQUE NOT NULL, name text NOT NULL,
      status text NOT NULL, sort_order integer NOT NULL,
      created_by_admin_id uuid, updated_by_admin_id uuid,
      created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL
    );
    CREATE TABLE home_recommendation_videos (
      id uuid PRIMARY KEY, category_id uuid NOT NULL REFERENCES home_recommendation_categories(id),
      title text NOT NULL, subtitle text NOT NULL, cover_url text NOT NULL, video_url text NOT NULL,
      duration_label text NOT NULL, cover_alt text NOT NULL, status text NOT NULL, sort_order integer NOT NULL,
      created_by_admin_id uuid, updated_by_admin_id uuid,
      created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL
    );
    CREATE TABLE home_background_settings (
      id text PRIMARY KEY, video_url text NOT NULL, poster_url text NOT NULL,
      status text NOT NULL, updated_by_admin_id uuid,
      created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL
    );
    INSERT INTO home_background_settings (id, video_url, poster_url, status, created_at, updated_at)
    VALUES ('homepage', '', '', 'inactive', now(), now());
  `);
  const service = createHomeRecommendationService({ db });
  const categoryResult = await service.saveCategory({ code: "featured", name: "精选", sortOrder: 10, status: "active" });
  assert.equal(categoryResult.status, 200);
  const category = (categoryResult.body as { category: { id: string } }).category;
  const videoResult = await service.saveVideo({ categoryId: category.id, title: "作品一", subtitle: "AI 短片", coverUrl: "/cover.png", videoUrl: "https://example.com/video.mp4", durationLabel: "00:30", status: "active" });
  assert.equal(videoResult.status, 200);
  const publicResult = await service.listPublicRecommendations();
  assert.equal(publicResult.data.categories[0]?.name, "精选");
  assert.equal(publicResult.data.categories[0]?.videos[0]?.title, "作品一");
  assert.deepEqual(publicResult.data.background, { videoUrl: "", posterUrl: "", status: "inactive" });
  assert.equal((await service.saveBackground({ videoUrl: "https://example.com/home.mp4", posterUrl: "/home.jpg", status: "active" })).status, 200);
  assert.equal((await service.listPublicRecommendations()).data.background.videoUrl, "https://example.com/home.mp4");
  await service.saveCategory({ id: category.id, code: "featured", name: "精选", sortOrder: 10, status: "inactive" });
  assert.deepEqual((await service.listPublicRecommendations()).data.categories, []);
  assert.equal((await service.deleteCategory({ id: category.id })).status, 409);
  await db.close();
});

test("home recommendation service rejects unsafe media urls", async () => {
  const db = { query: async () => ({ rows: [{ id: "10000000-0000-4000-8000-000000000001" }] }) };
  const result = await createHomeRecommendationService({ db }).saveVideo({
    categoryId: "10000000-0000-4000-8000-000000000001",
    title: "作品",
    coverUrl: "javascript:alert(1)",
  });
  assert.equal(result.status, 400);
  assert.deepEqual(result.body, { error: { code: "home_recommendation_cover_url_invalid", message: "封面地址必须是站内路径或 HTTP(S) 地址" } });
});

test("home recommendation service validates the homepage background video", async () => {
  const db = { query: async () => ({ rows: [] }) };
  const service = createHomeRecommendationService({ db });
  assert.equal((await service.saveBackground({ videoUrl: "javascript:alert(1)", status: "active" })).status, 400);
  assert.deepEqual(await service.saveBackground({ videoUrl: "", status: "active" }), {
    status: 400,
    body: { error: { code: "home_background_video_url_required", message: "启用背景视频时必须填写视频地址" } },
  });
});
