import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import { createDevDb } from "../dev-db.ts";

describe("createDevDb", () => {
  it("uses persistent local storage when DATABASE_URL is not configured", async () => {
    const previousDatabaseUrl = process.env.DATABASE_URL;
    const previousLocalDatabaseDir = process.env.LOCAL_DATABASE_DIR;
    const localDatabaseDir = await mkdtemp(join(tmpdir(), "comic-ai-local-db-"));

    try {
      delete process.env.DATABASE_URL;
      process.env.LOCAL_DATABASE_DIR = localDatabaseDir;

      const db = await createDevDb();
      await db.query("INSERT INTO organizations (id, name, status) VALUES ($1, $2, 'active')", [
        "10000000-0000-4000-8000-000000000999",
        "Local persistence",
      ]);
      await db.close();

      const reopenedDb = await createDevDb();
      const result = await reopenedDb.query<{ name: string }>(
        "SELECT name FROM organizations WHERE id = $1",
        ["10000000-0000-4000-8000-000000000999"],
      );
      await reopenedDb.close();

      assert.equal(result.rows[0]?.name, "Local persistence");
    } finally {
      restoreEnv("DATABASE_URL", previousDatabaseUrl);
      restoreEnv("LOCAL_DATABASE_DIR", previousLocalDatabaseDir);
    }
  });

  it("falls back to local storage when DATABASE_URL is configured but unavailable", async () => {
    const previousDatabaseUrl = process.env.DATABASE_URL;
    const previousLocalDatabaseDir = process.env.LOCAL_DATABASE_DIR;
    const localDatabaseDir = await mkdtemp(join(tmpdir(), "comic-ai-local-db-"));

    try {
      process.env.DATABASE_URL = "postgres://postgres:postgres@127.0.0.1:1/comic_ai_unavailable";
      process.env.LOCAL_DATABASE_DIR = localDatabaseDir;

      const db = await createDevDb();
      const result = await db.query<{ exists: boolean }>(
        `
          SELECT EXISTS (
            SELECT 1
            FROM information_schema.tables
            WHERE table_schema = 'public'
              AND table_name = 'users'
          ) AS exists
        `,
      );
      await db.close();

      assert.equal(result.rows[0]?.exists, true);
    } finally {
      restoreEnv("DATABASE_URL", previousDatabaseUrl);
      restoreEnv("LOCAL_DATABASE_DIR", previousLocalDatabaseDir);
    }
  });
});

function restoreEnv(key: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[key];
    return;
  }
  process.env[key] = value;
}
