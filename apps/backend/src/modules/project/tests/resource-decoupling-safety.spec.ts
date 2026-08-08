import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

import { PGlite } from "@electric-sql/pglite";

import { loadSqlMigrations } from "../../shared/db/migrations.ts";

const projectServiceUrl = new URL("../creator-application.service.ts", import.meta.url);
const migrationDirectoryUrl = new URL("../../../../../../packages/db/migrations/", import.meta.url);

describe("resource decoupling safety", () => {
  it("detaches surviving upload records before deleting project upload sessions", async () => {
    const source = await readFile(projectServiceUrl, "utf8");
    const start = source.indexOf("async function deleteProjectRecord(");
    const end = source.indexOf("async function listDeletableProjectStorageObjects(", start);
    const deleteProjectSource = source.slice(start, end < 0 ? undefined : end);
    const detachIndex = deleteProjectSource.indexOf("UPDATE project_upload_records\n     SET upload_session_id = NULL");
    const deleteSessionIndex = deleteProjectSource.indexOf("DELETE FROM storage_upload_sessions WHERE project_id = $1");

    assert.ok(detachIndex >= 0);
    assert.ok(deleteSessionIndex > detachIndex);
  });

  it("runs shell cleanup after generation rebinding and before canvas columns are dropped", async () => {
    const names = (await loadSqlMigrations()).map((migration) => migration.name);
    const scopeIndex = names.indexOf("20260722-canvas-generation-scope.sql");
    const cleanupIndex = names.indexOf("20260722-cleanup-standalone-canvas-project-shells.sql");
    const scriptIndex = names.indexOf("20260722-decouple-scripts-from-projects.sql");
    const decoupleIndex = names.indexOf("20260722-decouple-canvases-from-projects.sql");

    assert.ok(scopeIndex >= 0);
    assert.ok(cleanupIndex > scopeIndex);
    assert.ok(decoupleIndex > cleanupIndex);
    assert.ok(scriptIndex > decoupleIndex);
  });

  it("does not modify scripts or canvas records while deleting a project", async () => {
    const source = await readFile(projectServiceUrl, "utf8");
    const start = source.indexOf("async function deleteProjectRecord(");
    const end = source.indexOf("\nasync function ", start + 1);
    const deleteProjectSource = source.slice(start, end < 0 ? undefined : end);

    assert.ok(start >= 0);
    assert.doesNotMatch(deleteProjectSource, /(?:DELETE\s+FROM|UPDATE)\s+scripts\b/i);
    assert.doesNotMatch(deleteProjectSource, /(?:DELETE\s+FROM|UPDATE)\s+script_reader_sections\b/i);
    assert.doesNotMatch(deleteProjectSource, /(?:DELETE\s+FROM|UPDATE)\s+creator_canvas_/i);
  });

  it("keeps content tables free of destructive statements in decoupling migrations", async () => {
    const migrationNames = [
      "20260722-canvas-generation-scope.sql",
      "20260722-create-project-source-documents.sql",
      "20260722-decouple-canvases-from-projects.sql",
      "20260722-decouple-scripts-from-projects.sql",
    ];
    const migrations = await Promise.all(
      migrationNames.map((name) => readFile(new URL(name, migrationDirectoryUrl), "utf8")),
    );
    const sql = migrations.join("\n");

    for (const table of [
      "scripts",
      "script_reader_sections",
      "creator_canvas_documents",
      "creator_canvas_revisions",
      "creator_canvas_nodes",
      "creator_canvas_edges",
      "creator_canvas_node_runs",
      "creator_canvas_node_artifacts",
    ]) {
      assert.doesNotMatch(sql, new RegExp(`DELETE\\s+FROM\\s+${table}\\b`, "i"));
    }
    assert.match(sql, /INSERT INTO resource_decoupling_audit[\s\S]*'script'/);
    assert.match(sql, /INSERT INTO resource_decoupling_audit[\s\S]*'script_section'/);
    assert.match(sql, /INSERT INTO resource_decoupling_audit[\s\S]*'canvas'/);
    assert.match(sql, /INSERT INTO resource_decoupling_audit[\s\S]*'canvas_node_run'/);
  });

  it("removes a strict standalone canvas shell without changing canvas content or generated artifacts", async () => {
    const db = new PGlite();
    try {
      await createCleanupTestSchema(db);
      await seedSyntheticShell(db);
      await seedResidualSyntheticShellScope(db);
      const before = await readCanvasContent(db);
      const cleanupSql = await readFile(
        new URL("20260722-cleanup-standalone-canvas-project-shells.sql", migrationDirectoryUrl),
        "utf8",
      );

      await db.exec(cleanupSql);

      const after = await readCanvasContent(db);
      const projects = await db.query("SELECT id FROM projects");
      const episodes = await db.query("SELECT id FROM episodes");
      const canvas = await db.query<{ project_id: string | null }>(
        "SELECT project_id FROM creator_canvas_projects WHERE id = '20000000-0000-4000-8000-000000000001'",
      );
      const documentLinks = await db.query<{ count: number }>(
        "SELECT count(*)::int AS count FROM creator_canvas_documents WHERE project_id IS NULL",
      );
      const assignmentLinks = await db.query<{ project_id: string | null }>(
        "SELECT project_id FROM team_member_canvases",
      );
      const audit = await db.query<{ legacy_links_json: Record<string, unknown> }>(
        "SELECT legacy_links_json FROM resource_decoupling_audit WHERE entity_type = 'standalone_canvas_project_shell'",
      );
      const reboundScope = await readReboundSyntheticShellScope(db);

      assert.deepEqual(after, before);
      assert.equal(projects.rows.length, 0);
      assert.equal(episodes.rows.length, 0);
      assert.equal(canvas.rows[0]?.project_id, null);
      assert.equal(documentLinks.rows[0]?.count, 961);
      assert.equal(assignmentLinks.rows[0]?.project_id, null);
      assert.equal(audit.rows[0]?.legacy_links_json.action, "synthetic_shell_removed");
      assert.deepEqual(reboundScope, {
        assets: 1,
        projectUploadRecords: 3,
        storageObjects: 4,
        tasks: 2,
        workflows: 2,
      });
    } finally {
      await db.close();
    }
  });

  it("aborts shell cleanup when the synthetic project no longer maps to exactly one canvas", async () => {
    const db = new PGlite();
    try {
      await createCleanupTestSchema(db);
      await seedSyntheticShell(db);
      await db.exec(`
        INSERT INTO creator_canvas_projects (id, project_id, is_standalone)
        VALUES ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', true)
      `);
      const cleanupSql = await readFile(
        new URL("20260722-cleanup-standalone-canvas-project-shells.sql", migrationDirectoryUrl),
        "utf8",
      );

      await assert.rejects(db.exec(cleanupSql), /standalone_canvas_project_shell_shape_invalid/);

      const projects = await db.query("SELECT id FROM projects");
      const canvas = await db.query<{ project_id: string | null }>(
        "SELECT project_id FROM creator_canvas_projects WHERE id = '20000000-0000-4000-8000-000000000001'",
      );
      assert.equal(projects.rows.length, 1);
      assert.equal(canvas.rows[0]?.project_id, "10000000-0000-4000-8000-000000000001");
    } finally {
      await db.close();
    }
  });

  it("rebinds a project storage object referenced only by canvas documents and revisions", async () => {
    const db = new PGlite();
    try {
      await createCanvasDocumentStorageScopeTestSchema(db);
      await seedCanvasDocumentStorageReference(db);
      const beforeDocuments = await db.query("SELECT document_json FROM creator_canvas_documents ORDER BY id");
      const beforeRevisions = await db.query("SELECT document_json FROM creator_canvas_revisions ORDER BY id");
      const scopeSql = await readFile(
        new URL("20260722-canvas-generation-scope.sql", migrationDirectoryUrl),
        "utf8",
      );

      await db.exec(extractDocumentStorageScopeSql(scopeSql));

      const storage = await db.query<{ project_id: string | null; canvas_project_id: string | null }>(
        "SELECT project_id, canvas_project_id FROM storage_objects",
      );
      const upload = await db.query<{ project_id: string | null; canvas_project_id: string | null }>(
        "SELECT project_id, canvas_project_id FROM project_upload_records",
      );
      const audit = await db.query<{ legacy_links_json: Record<string, unknown> }>(
        "SELECT legacy_links_json FROM resource_decoupling_audit WHERE entity_type = 'canvas_storage_object'",
      );
      const afterDocuments = await db.query("SELECT document_json FROM creator_canvas_documents ORDER BY id");
      const afterRevisions = await db.query("SELECT document_json FROM creator_canvas_revisions ORDER BY id");

      assert.deepEqual(storage.rows, [{ project_id: null, canvas_project_id: "71000000-0000-4000-8000-000000000001" }]);
      assert.deepEqual(upload.rows, [{ project_id: null, canvas_project_id: "71000000-0000-4000-8000-000000000001" }]);
      assert.equal(audit.rows[0]?.legacy_links_json.projectId, "70000000-0000-4000-8000-000000000001");
      assert.deepEqual(afterDocuments.rows, beforeDocuments.rows);
      assert.deepEqual(afterRevisions.rows, beforeRevisions.rows);
    } finally {
      await db.close();
    }
  });

  it("rejects a document storage object referenced by more than one canvas", async () => {
    const db = new PGlite();
    try {
      await createCanvasDocumentStorageScopeTestSchema(db);
      await seedCanvasDocumentStorageReference(db);
      await db.exec(`
        INSERT INTO creator_canvas_projects (id)
        VALUES ('71000000-0000-4000-8000-000000000002');
        INSERT INTO creator_canvas_documents (id, canvas_project_id, document_json)
        VALUES (
          '73000000-0000-4000-8000-000000000002',
          '71000000-0000-4000-8000-000000000002',
          '{"nested":{"storageObjectId":"72000000-0000-4000-8000-000000000001"}}'::jsonb
        );
      `);
      const scopeSql = await readFile(
        new URL("20260722-canvas-generation-scope.sql", migrationDirectoryUrl),
        "utf8",
      );

      await assert.rejects(
        db.exec(extractDocumentStorageScopeSql(scopeSql)),
        /ambiguous_canvas_document_storage_scope/,
      );

      const storage = await db.query<{ project_id: string | null; canvas_project_id: string | null }>(
        "SELECT project_id, canvas_project_id FROM storage_objects",
      );
      assert.deepEqual(storage.rows, [{
        project_id: "70000000-0000-4000-8000-000000000001",
        canvas_project_id: null,
      }]);
    } finally {
      await db.close();
    }
  });

  it("removes nested script links while preserving canvas node semantics and order", async () => {
    const db = new PGlite();
    try {
      await db.exec(`
        CREATE TABLE resource_decoupling_audit (
          entity_type text NOT NULL,
          entity_id uuid NOT NULL,
          legacy_links_json jsonb NOT NULL,
          recorded_at timestamptz DEFAULT now() NOT NULL,
          PRIMARY KEY (entity_type, entity_id)
        );
        CREATE TABLE creator_canvas_documents (id uuid PRIMARY KEY, document_json jsonb NOT NULL);
        CREATE TABLE creator_canvas_revisions (id uuid PRIMARY KEY, document_json jsonb NOT NULL);
      `);
      const original = {
        title: "画布正文",
        nodes: [
          {
            id: "node-a",
            type: "text",
            data: {
              title: "第一章",
              text: "正文必须保留",
              textHtml: "<p>正文必须保留</p>",
              source: "project_script",
              sourceScriptId: "script-a",
              extra: { untouched: true },
            },
          },
          {
            id: "node-b",
            type: "text",
            data: {
              title: "第二章",
              text: "章节正文",
              source: "project_script_episode",
              sourceScriptId: "script-a",
              sourceEpisodeId: "episode-b",
            },
          },
          {
            id: "node-c",
            type: "image",
            data: {
              title: "图片",
              source: "upload",
              sourceScriptId: "stale-script-link",
              url: "https://cdn.example.test/image.png",
            },
          },
        ],
        edges: [{ id: "edge-a-b", sourceNodeId: "node-a", targetNodeId: "node-b" }],
      };
      await db.query(
        "INSERT INTO creator_canvas_documents (id, document_json) VALUES ($1, $2::jsonb)",
        ["81000000-0000-4000-8000-000000000001", JSON.stringify(original)],
      );
      await db.query(
        "INSERT INTO creator_canvas_revisions (id, document_json) VALUES ($1, $2::jsonb)",
        ["82000000-0000-4000-8000-000000000001", JSON.stringify(original)],
      );
      const migrationSql = await readFile(
        new URL("20260722-decouple-canvases-from-projects.sql", migrationDirectoryUrl),
        "utf8",
      );

      await db.exec(extractNestedScriptLinkCleanupSql(migrationSql));

      const document = await db.query<{ document_json: Record<string, unknown> }>(
        "SELECT document_json FROM creator_canvas_documents",
      );
      const revision = await db.query<{ document_json: Record<string, unknown> }>(
        "SELECT document_json FROM creator_canvas_revisions",
      );
      const audit = await db.query<{ entity_type: string; legacy_links_json: Record<string, unknown> }>(
        "SELECT entity_type, legacy_links_json FROM resource_decoupling_audit ORDER BY entity_type",
      );
      const expected = removeNestedScriptLinks(original);

      assert.equal(semanticHash(document.rows[0]?.document_json), semanticHash(expected));
      assert.equal(semanticHash(revision.rows[0]?.document_json), semanticHash(expected));
      assert.deepEqual(
        (document.rows[0]?.document_json.nodes as Array<{ id: string }>).map((node) => node.id),
        ["node-a", "node-b", "node-c"],
      );
      assert.deepEqual(audit.rows.map((row) => row.entity_type), [
        "canvas_document_script_links",
        "canvas_revision_script_links",
      ]);
      for (const row of audit.rows) {
        assert.deepEqual(row.legacy_links_json.sourceScriptIds, ["script-a", "stale-script-link"]);
        assert.deepEqual(row.legacy_links_json.sourceEpisodeIds, ["episode-b"]);
      }
    } finally {
      await db.close();
    }
  });

  it("removes an imported-script project shell while preserving the script and every section", async () => {
    const db = new PGlite();
    try {
      await createImportedScriptCleanupTestSchema(db);
      await seedImportedScriptShell(db);
      await captureImportedScriptShellBeforeCanvasDecoupling(db);
      const before = await readScriptContent(db);
      const beforeUploads = await readImportedScriptUploadContent(db);
      const migrationSql = await readFile(
        new URL("20260722-decouple-scripts-from-projects.sql", migrationDirectoryUrl),
        "utf8",
      );

      await db.exec(migrationSql);

      const after = await readScriptContent(db);
      const afterUploads = await readImportedScriptUploadContent(db);
      const projects = await db.query("SELECT id FROM projects");
      const audit = await db.query<{ legacy_links_json: Record<string, unknown> }>(
        "SELECT legacy_links_json FROM resource_decoupling_audit WHERE entity_type = 'imported_script_project_shell'",
      );
      const removedColumns = await db.query<{ count: number }>(`
        SELECT count(*)::int AS count
        FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND (
            (table_name = 'scripts' AND column_name = 'project_id')
            OR (table_name = 'script_reader_sections' AND column_name IN ('project_id', 'episode_id'))
          )
      `);
      const directAssignments = await db.query<{ count: number }>(
        "SELECT count(*)::int AS count FROM team_member_scripts",
      );
      const projectAssignments = await db.query<{ count: number }>(
        "SELECT count(*)::int AS count FROM team_member_projects",
      );
      const detachedUploadLinks = await db.query<{ count: number }>(`
        SELECT
          (SELECT count(*) FROM storage_objects WHERE project_id IS NULL)
          + (SELECT count(*) FROM storage_upload_sessions WHERE project_id IS NULL)
          + (SELECT count(*) FROM project_upload_records WHERE project_id IS NULL)
          AS count
      `);

      assert.deepEqual(after, before);
      assert.deepEqual(afterUploads, beforeUploads);
      assert.equal(projects.rows.length, 0);
      assert.equal(removedColumns.rows[0]?.count, 0);
      assert.equal(audit.rows[0]?.legacy_links_json.scriptId, "61000000-0000-4000-8000-000000000001");
      assert.equal(directAssignments.rows[0]?.count, 8);
      assert.equal(projectAssignments.rows[0]?.count, 0);
      assert.equal(detachedUploadLinks.rows[0]?.count, 21);
    } finally {
      await db.close();
    }
  });

  it("rolls back imported-script shell cleanup when an unknown project dependency exists", async () => {
    const db = new PGlite();
    try {
      await createImportedScriptCleanupTestSchema(db);
      await seedImportedScriptShell(db);
      await captureImportedScriptShellBeforeCanvasDecoupling(db);
      await db.exec(`
        CREATE TABLE unexpected_project_content (
          id uuid PRIMARY KEY,
          project_id uuid NOT NULL REFERENCES projects(id)
        );
        INSERT INTO unexpected_project_content (id, project_id)
        VALUES ('64000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000001');
      `);
      const migrationSql = await readFile(
        new URL("20260722-decouple-scripts-from-projects.sql", migrationDirectoryUrl),
        "utf8",
      );

      await assert.rejects(
        db.exec(migrationSql),
        /imported_script_project_shell_contains_business_content:unexpected_project_content/,
      );

      const projects = await db.query("SELECT id FROM projects");
      const scriptProjectColumn = await db.query<{ count: number }>(`
        SELECT count(*)::int AS count
        FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'scripts'
          AND column_name = 'project_id'
      `);
      assert.equal(projects.rows.length, 1);
      assert.equal(scriptProjectColumn.rows[0]?.count, 1);
    } finally {
      await db.close();
    }
  });
});

async function createCleanupTestSchema(db: PGlite) {
  await db.exec(`
    CREATE TABLE projects (
      id uuid PRIMARY KEY,
      name text NOT NULL,
      phase text NOT NULL,
      cover_storage_object_id uuid
    );
    CREATE TABLE creator_canvas_projects (
      id uuid PRIMARY KEY,
      project_id uuid REFERENCES projects(id),
      is_standalone boolean NOT NULL
    );
    CREATE TABLE episodes (
      id uuid PRIMARY KEY,
      project_id uuid NOT NULL REFERENCES projects(id),
      title text NOT NULL
    );
    CREATE TABLE creator_canvas_documents (
      id uuid PRIMARY KEY,
      canvas_project_id uuid NOT NULL REFERENCES creator_canvas_projects(id),
      project_id uuid REFERENCES projects(id),
      document_json jsonb NOT NULL
    );
    CREATE TABLE creator_canvas_revisions (
      id uuid PRIMARY KEY,
      canvas_project_id uuid NOT NULL REFERENCES creator_canvas_projects(id),
      document_json jsonb NOT NULL
    );
    CREATE TABLE creator_canvas_node_runs (
      id uuid PRIMARY KEY,
      canvas_project_id uuid NOT NULL REFERENCES creator_canvas_projects(id),
      input_snapshot_json jsonb NOT NULL,
      output_snapshot_json jsonb NOT NULL
    );
    CREATE TABLE creator_canvas_node_artifacts (
      id uuid PRIMARY KEY,
      canvas_project_id uuid NOT NULL REFERENCES creator_canvas_projects(id),
      metadata_json jsonb NOT NULL
    );
    CREATE TABLE audit_events (id uuid PRIMARY KEY, project_id uuid REFERENCES projects(id));
    CREATE TABLE team_member_project_records (id uuid PRIMARY KEY, project_id uuid REFERENCES projects(id));
    CREATE TABLE team_member_projects (id uuid PRIMARY KEY, project_id uuid REFERENCES projects(id));
    CREATE TABLE team_member_canvases (
      id uuid PRIMARY KEY,
      canvas_id uuid NOT NULL REFERENCES creator_canvas_projects(id),
      project_id uuid REFERENCES projects(id)
    );
    CREATE TABLE workflows (
      id uuid PRIMARY KEY,
      project_id uuid REFERENCES projects(id),
      canvas_project_id uuid REFERENCES creator_canvas_projects(id),
      input_snapshot_json jsonb NOT NULL DEFAULT '{}'::jsonb
    );
    CREATE TABLE tasks (
      id uuid PRIMARY KEY,
      project_id uuid REFERENCES projects(id),
      canvas_project_id uuid REFERENCES creator_canvas_projects(id),
      input_snapshot_json jsonb NOT NULL DEFAULT '{}'::jsonb,
      target_entity_type text,
      target_entity_id uuid
    );
    CREATE TABLE task_attempts (id uuid PRIMARY KEY, project_id uuid REFERENCES projects(id), canvas_project_id uuid REFERENCES creator_canvas_projects(id));
    CREATE TABLE ai_generation_task_snapshots (
      id uuid PRIMARY KEY,
      project_id uuid REFERENCES projects(id),
      canvas_project_id uuid REFERENCES creator_canvas_projects(id),
      episode_id uuid REFERENCES episodes(id),
      target_type text,
      target_id uuid,
      request_summary_json jsonb NOT NULL DEFAULT '{}'::jsonb
    );
    CREATE TABLE provider_requests (id uuid PRIMARY KEY, project_id uuid REFERENCES projects(id), canvas_project_id uuid REFERENCES creator_canvas_projects(id));
    CREATE TABLE storage_objects (id uuid PRIMARY KEY, project_id uuid REFERENCES projects(id), canvas_project_id uuid REFERENCES creator_canvas_projects(id));
    CREATE TABLE assets (id uuid PRIMARY KEY, project_id uuid REFERENCES projects(id), canvas_project_id uuid REFERENCES creator_canvas_projects(id));
    CREATE TABLE credit_reservations (id uuid PRIMARY KEY, project_id uuid REFERENCES projects(id), canvas_project_id uuid REFERENCES creator_canvas_projects(id));
    CREATE TABLE project_upload_records (id uuid PRIMARY KEY, project_id uuid REFERENCES projects(id), canvas_project_id uuid REFERENCES creator_canvas_projects(id));
    CREATE TABLE user_model_request_logs (id uuid PRIMARY KEY, project_id uuid REFERENCES projects(id), canvas_project_id uuid REFERENCES creator_canvas_projects(id));
  `);
}

async function seedSyntheticShell(db: PGlite) {
  await db.exec(`
    INSERT INTO projects (id, name, phase)
    VALUES ('10000000-0000-4000-8000-000000000001', '画布生成 - 初始标题', 'shot_generation');
    INSERT INTO creator_canvas_projects (id, project_id, is_standalone)
    VALUES ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', false);
    INSERT INTO episodes (id, project_id, title)
    VALUES ('30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '画布生成');
    INSERT INTO creator_canvas_documents (id, canvas_project_id, project_id, document_json)
    SELECT
      md5(sequence::text)::uuid,
      '20000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000001',
      jsonb_build_object('sequence', sequence, 'nodes', jsonb_build_array(jsonb_build_object('id', 'image')))
    FROM generate_series(1, 961) sequence;
    INSERT INTO creator_canvas_revisions (id, canvas_project_id, document_json)
    VALUES ('50000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001', '{"revision":1}'::jsonb);
    INSERT INTO creator_canvas_node_runs (id, canvas_project_id, input_snapshot_json, output_snapshot_json)
    VALUES (
      '50000000-0000-4000-8000-000000000003',
      '20000000-0000-4000-8000-000000000001',
      '{"projectId":"10000000-0000-4000-8000-000000000001","episodeId":"30000000-0000-4000-8000-000000000001","prompt":"keep"}'::jsonb,
      '{"projectId":"10000000-0000-4000-8000-000000000001","episodeId":"30000000-0000-4000-8000-000000000001","url":"result.png"}'::jsonb
    );
    INSERT INTO creator_canvas_node_artifacts (id, canvas_project_id, metadata_json)
    VALUES ('50000000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-000000000001', '{"storageObjectId":"kept"}'::jsonb);
    INSERT INTO team_member_canvases (id, canvas_id, project_id)
    VALUES ('50000000-0000-4000-8000-000000000005', '20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001');
  `);
}

async function seedResidualSyntheticShellScope(db: PGlite) {
  await db.exec(`
    INSERT INTO workflows (id, project_id, input_snapshot_json)
    SELECT
      md5(('workflow-' || sequence)::text)::uuid,
      '10000000-0000-4000-8000-000000000001',
      jsonb_build_object('projectId', '10000000-0000-4000-8000-000000000001', 'episodeId', '30000000-0000-4000-8000-000000000001', 'keep', sequence)
    FROM generate_series(1, 2) sequence;
    INSERT INTO tasks (id, project_id, input_snapshot_json, target_entity_type, target_entity_id)
    SELECT
      md5(('task-' || sequence)::text)::uuid,
      '10000000-0000-4000-8000-000000000001',
      jsonb_build_object('projectId', '10000000-0000-4000-8000-000000000001', 'episodeId', '30000000-0000-4000-8000-000000000001', 'keep', sequence),
      'episode',
      '30000000-0000-4000-8000-000000000001'
    FROM generate_series(1, 2) sequence;
    INSERT INTO storage_objects (id, project_id)
    SELECT md5(('storage-' || sequence)::text)::uuid, '10000000-0000-4000-8000-000000000001'
    FROM generate_series(1, 4) sequence;
    INSERT INTO assets (id, project_id)
    VALUES (md5('asset-1')::uuid, '10000000-0000-4000-8000-000000000001');
    INSERT INTO project_upload_records (id, project_id)
    SELECT md5(('upload-' || sequence)::text)::uuid, '10000000-0000-4000-8000-000000000001'
    FROM generate_series(1, 3) sequence;
    INSERT INTO ai_generation_task_snapshots (
      id, project_id, episode_id, target_type, target_id, request_summary_json
    ) VALUES (
      '40000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000001',
      'episode',
      '30000000-0000-4000-8000-000000000001',
      '{"projectId":"10000000-0000-4000-8000-000000000001","episodeId":"30000000-0000-4000-8000-000000000001","prompt":"keep"}'::jsonb
    );
  `);
}

async function readReboundSyntheticShellScope(db: PGlite) {
  const canvasProjectId = "20000000-0000-4000-8000-000000000001";
  const count = async (tableName: string) => {
    const result = await db.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM ${tableName} WHERE project_id IS NULL AND canvas_project_id = $1`,
      [canvasProjectId],
    );
    return result.rows[0]?.count ?? 0;
  };
  const [workflows, tasks, storageObjects, assets, projectUploadRecords] = await Promise.all([
    count("workflows"),
    count("tasks"),
    count("storage_objects"),
    count("assets"),
    count("project_upload_records"),
  ]);
  const taskTargets = await db.query<{ count: number }>(
    `SELECT count(*)::int AS count
     FROM tasks
     WHERE target_entity_type = 'canvas'
       AND target_entity_id = $1`,
    [canvasProjectId],
  );
  assert.equal(taskTargets.rows[0]?.count, 2);
  for (const tableName of ["workflows", "tasks"]) {
    const jsonRows = await db.query<{ input_snapshot_json: Record<string, unknown> }>(
      `SELECT input_snapshot_json FROM ${tableName}`,
    );
    for (const row of jsonRows.rows) {
      assert.equal(row.input_snapshot_json.projectId, undefined);
      assert.equal(row.input_snapshot_json.episodeId, undefined);
      assert.equal(row.input_snapshot_json.canvasProjectId, canvasProjectId);
      assert.ok(row.input_snapshot_json.keep);
    }
  }
  const runJson = await db.query<{
    input_snapshot_json: Record<string, unknown>;
    output_snapshot_json: Record<string, unknown>;
  }>("SELECT input_snapshot_json, output_snapshot_json FROM creator_canvas_node_runs");
  assert.equal(runJson.rows[0]?.input_snapshot_json.projectId, undefined);
  assert.equal(runJson.rows[0]?.input_snapshot_json.episodeId, undefined);
  assert.equal(runJson.rows[0]?.input_snapshot_json.canvasProjectId, canvasProjectId);
  assert.equal(runJson.rows[0]?.input_snapshot_json.prompt, "keep");
  assert.equal(runJson.rows[0]?.output_snapshot_json.projectId, undefined);
  assert.equal(runJson.rows[0]?.output_snapshot_json.episodeId, undefined);
  assert.equal(runJson.rows[0]?.output_snapshot_json.canvasProjectId, canvasProjectId);
  assert.equal(runJson.rows[0]?.output_snapshot_json.url, "result.png");
  const snapshotJson = await db.query<{
    episode_id: string | null;
    target_type: string;
    target_id: string;
    request_summary_json: Record<string, unknown>;
  }>("SELECT episode_id, target_type, target_id, request_summary_json FROM ai_generation_task_snapshots");
  assert.equal(snapshotJson.rows[0]?.episode_id, null);
  assert.equal(snapshotJson.rows[0]?.target_type, "canvas");
  assert.equal(snapshotJson.rows[0]?.target_id, canvasProjectId);
  assert.equal(snapshotJson.rows[0]?.request_summary_json.projectId, undefined);
  assert.equal(snapshotJson.rows[0]?.request_summary_json.episodeId, undefined);
  assert.equal(snapshotJson.rows[0]?.request_summary_json.canvasProjectId, canvasProjectId);
  assert.equal(snapshotJson.rows[0]?.request_summary_json.prompt, "keep");
  return { assets, projectUploadRecords, storageObjects, tasks, workflows };
}

async function readCanvasContent(db: PGlite) {
  const [documents, revisions, runs, artifacts] = await Promise.all([
    db.query("SELECT id, canvas_project_id, document_json FROM creator_canvas_documents ORDER BY id"),
    db.query("SELECT * FROM creator_canvas_revisions ORDER BY id"),
    db.query(`
      SELECT
        id,
        canvas_project_id,
        input_snapshot_json - 'projectId' - 'episodeId' - 'canvasProjectId' AS input_snapshot_json,
        output_snapshot_json - 'projectId' - 'episodeId' - 'canvasProjectId' AS output_snapshot_json
      FROM creator_canvas_node_runs
      ORDER BY id
    `),
    db.query("SELECT * FROM creator_canvas_node_artifacts ORDER BY id"),
  ]);
  return {
    documents: documents.rows,
    revisions: revisions.rows,
    runs: runs.rows,
    artifacts: artifacts.rows,
  };
}

async function createImportedScriptCleanupTestSchema(db: PGlite) {
  await db.exec(`
    CREATE TABLE users (id uuid PRIMARY KEY);
    CREATE TABLE projects (
      id uuid PRIMARY KEY,
      name text NOT NULL,
      phase text NOT NULL,
      cover_image_url text,
      cover_storage_object_id uuid,
      owner_user_id uuid NOT NULL REFERENCES users(id)
    );
    CREATE TABLE scripts (
      id uuid PRIMARY KEY,
      project_id uuid REFERENCES projects(id),
      owner_user_id uuid,
      status text NOT NULL,
      input_text text NOT NULL,
      created_by_user_id uuid REFERENCES users(id),
      created_at timestamptz NOT NULL,
      updated_at timestamptz NOT NULL,
      title text,
      cover_image_url text,
      cover_storage_object_id uuid,
      deleted_at timestamptz
    );
    CREATE TABLE episodes (id uuid PRIMARY KEY, project_id uuid NOT NULL REFERENCES projects(id));
    CREATE TABLE script_reader_sections (
      id uuid PRIMARY KEY,
      project_id uuid REFERENCES projects(id),
      episode_id uuid REFERENCES episodes(id),
      script_id uuid REFERENCES scripts(id),
      title text NOT NULL,
      body text NOT NULL,
      sequence integer NOT NULL,
      status text NOT NULL,
      created_by_user_id uuid,
      created_at timestamptz NOT NULL,
      updated_at timestamptz NOT NULL
    );
    CREATE TABLE team_member_scripts (
      id uuid PRIMARY KEY,
      member_id uuid NOT NULL,
      user_id uuid NOT NULL,
      project_id uuid REFERENCES projects(id),
      script_id uuid NOT NULL REFERENCES scripts(id),
      created_at timestamptz DEFAULT now() NOT NULL,
      UNIQUE (member_id, script_id)
    );
    CREATE TABLE creator_canvas_projects (id uuid PRIMARY KEY, project_id uuid REFERENCES projects(id));
    CREATE TABLE shots (id uuid PRIMARY KEY, project_id uuid REFERENCES projects(id));
    CREATE TABLE assets (id uuid PRIMARY KEY, project_id uuid REFERENCES projects(id));
    CREATE TABLE workflows (id uuid PRIMARY KEY, project_id uuid REFERENCES projects(id));
    CREATE TABLE audit_events (id uuid PRIMARY KEY, project_id uuid REFERENCES projects(id));
    CREATE TABLE team_member_project_records (id uuid PRIMARY KEY, project_id uuid REFERENCES projects(id));
    CREATE TABLE team_member_projects (
      id uuid PRIMARY KEY,
      member_id uuid NOT NULL,
      user_id uuid NOT NULL,
      project_id uuid REFERENCES projects(id),
      created_at timestamptz DEFAULT now() NOT NULL
    );
    CREATE TABLE storage_objects (
      id uuid PRIMARY KEY,
      project_id uuid REFERENCES projects(id),
      object_key text NOT NULL
    );
    CREATE TABLE storage_upload_sessions (
      id uuid PRIMARY KEY,
      project_id uuid REFERENCES projects(id),
      storage_object_id uuid NOT NULL REFERENCES storage_objects(id),
      status text NOT NULL
    );
    CREATE TABLE project_upload_records (
      id uuid PRIMARY KEY,
      project_id uuid REFERENCES projects(id),
      storage_object_id uuid REFERENCES storage_objects(id),
      page_key text NOT NULL,
      file_name text NOT NULL
    );
  `);
}

async function createCanvasDocumentStorageScopeTestSchema(db: PGlite) {
  await db.exec(`
    CREATE TABLE resource_decoupling_audit (
      entity_type text NOT NULL,
      entity_id uuid NOT NULL,
      legacy_links_json jsonb NOT NULL,
      recorded_at timestamptz DEFAULT now() NOT NULL,
      PRIMARY KEY (entity_type, entity_id)
    );
    CREATE TABLE projects (id uuid PRIMARY KEY);
    CREATE TABLE creator_canvas_projects (id uuid PRIMARY KEY);
    CREATE TABLE creator_canvas_documents (
      id uuid PRIMARY KEY,
      canvas_project_id uuid NOT NULL REFERENCES creator_canvas_projects(id),
      document_json jsonb NOT NULL
    );
    CREATE TABLE creator_canvas_revisions (
      id uuid PRIMARY KEY,
      canvas_project_id uuid NOT NULL REFERENCES creator_canvas_projects(id),
      document_json jsonb NOT NULL
    );
    CREATE TABLE storage_objects (
      id uuid PRIMARY KEY,
      project_id uuid REFERENCES projects(id),
      canvas_project_id uuid REFERENCES creator_canvas_projects(id)
    );
    CREATE TABLE project_upload_records (
      id uuid PRIMARY KEY,
      project_id uuid REFERENCES projects(id),
      canvas_project_id uuid REFERENCES creator_canvas_projects(id),
      storage_object_id uuid REFERENCES storage_objects(id)
    );
  `);
}

async function seedCanvasDocumentStorageReference(db: PGlite) {
  await db.exec(`
    INSERT INTO projects (id) VALUES ('70000000-0000-4000-8000-000000000001');
    INSERT INTO creator_canvas_projects (id) VALUES ('71000000-0000-4000-8000-000000000001');
    INSERT INTO storage_objects (id, project_id)
    VALUES ('72000000-0000-4000-8000-000000000001', '70000000-0000-4000-8000-000000000001');
    INSERT INTO project_upload_records (id, project_id, storage_object_id)
    VALUES (
      '72000000-0000-4000-8000-000000000002',
      '70000000-0000-4000-8000-000000000001',
      '72000000-0000-4000-8000-000000000001'
    );
    INSERT INTO creator_canvas_documents (id, canvas_project_id, document_json)
    VALUES (
      '73000000-0000-4000-8000-000000000001',
      '71000000-0000-4000-8000-000000000001',
      '{"nodes":[{"data":{"storageObjectId":"72000000-0000-4000-8000-000000000001"}},{"data":{"storageObjectId":"not-a-uuid"}}]}'::jsonb
    );
    INSERT INTO creator_canvas_revisions (id, canvas_project_id, document_json)
    VALUES (
      '74000000-0000-4000-8000-000000000001',
      '71000000-0000-4000-8000-000000000001',
      '{"history":{"storageObjectId":"72000000-0000-4000-8000-000000000001"}}'::jsonb
    );
  `);
}

function extractDocumentStorageScopeSql(scopeSql: string) {
  const start = scopeSql.indexOf("DO $document_storage_scope$");
  const end = scopeSql.indexOf("\nWITH asset_scope AS", start);
  assert.ok(start >= 0);
  assert.ok(end > start);
  return scopeSql.slice(start, end);
}

function extractNestedScriptLinkCleanupSql(migrationSql: string) {
  const marker = migrationSql.indexOf("'canvas_document_script_links'");
  const start = migrationSql.lastIndexOf("INSERT INTO resource_decoupling_audit", marker);
  const end = migrationSql.indexOf(
    "\nUPDATE creator_canvas_documents document\nSET document_json = jsonb_set(\n  COALESCE",
    marker,
  );
  assert.ok(marker >= 0);
  assert.ok(start >= 0);
  assert.ok(end > start);
  return migrationSql.slice(start, end);
}

function removeNestedScriptLinks(document: Record<string, unknown>) {
  return {
    ...document,
    nodes: (document.nodes as Array<Record<string, unknown>>).map((node) => {
      const data = { ...node.data as Record<string, unknown> };
      delete data.sourceScriptId;
      delete data.sourceEpisodeId;
      if (data.source === "project_script" || data.source === "project_script_episode") {
        data.source = "manual_copy";
      }
      return { ...node, data };
    }),
  };
}

function semanticHash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(sortJson(value))).digest("hex");
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortJson);
  }
  if (!value || typeof value !== "object") {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => [key, sortJson(nested)]),
  );
}

async function seedImportedScriptShell(db: PGlite) {
  await db.exec(`
    INSERT INTO users (id) VALUES ('65000000-0000-4000-8000-000000000001');
    INSERT INTO projects (id, name, phase, owner_user_id)
    VALUES (
      '60000000-0000-4000-8000-000000000001',
      '保留的独立剧本',
      'script_input',
      '65000000-0000-4000-8000-000000000001'
    );
    INSERT INTO scripts (
      id, project_id, status, input_text, created_by_user_id,
      created_at, updated_at, title, cover_image_url, cover_storage_object_id
    ) VALUES (
      '61000000-0000-4000-8000-000000000001',
      '60000000-0000-4000-8000-000000000001',
      'ready',
      '完整剧本文本',
      '65000000-0000-4000-8000-000000000001',
      '2026-07-22T00:00:00Z',
      '2026-07-22T00:00:00Z',
      '保留的独立剧本',
      'https://cdn.example.test/script-cover.png',
      md5('script-storage-1')::uuid
    );
    INSERT INTO script_reader_sections (
      id, project_id, script_id, title, body, sequence, status, created_at, updated_at
    ) VALUES
      (
        '62000000-0000-4000-8000-000000000001',
        '60000000-0000-4000-8000-000000000001',
        '61000000-0000-4000-8000-000000000001',
        '第一章', '第一章内容', 1, 'draft',
        '2026-07-22T00:00:00Z', '2026-07-22T00:00:00Z'
      ),
      (
        '62000000-0000-4000-8000-000000000002',
        '60000000-0000-4000-8000-000000000001',
        '61000000-0000-4000-8000-000000000001',
        '第二章', '第二章内容', 2, 'ready',
        '2026-07-22T00:00:00Z', '2026-07-22T00:00:00Z'
      );
    INSERT INTO storage_objects (id, project_id, object_key)
    SELECT
      md5(('script-storage-' || sequence)::text)::uuid,
      '60000000-0000-4000-8000-000000000001',
      'scripts/object-' || sequence
    FROM generate_series(1, 7) sequence;
    INSERT INTO storage_upload_sessions (id, project_id, storage_object_id, status)
    SELECT
      md5(('script-session-' || sequence)::text)::uuid,
      '60000000-0000-4000-8000-000000000001',
      md5(('script-storage-' || sequence)::text)::uuid,
      'completed'
    FROM generate_series(1, 7) sequence;
    INSERT INTO project_upload_records (id, project_id, storage_object_id, page_key, file_name)
    SELECT
      md5(('script-upload-' || sequence)::text)::uuid,
      '60000000-0000-4000-8000-000000000001',
      md5(('script-storage-' || sequence)::text)::uuid,
      CASE WHEN sequence <= 3 THEN 'script-covers' ELSE 'script-documents' END,
      'script-file-' || sequence
    FROM generate_series(1, 7) sequence;
    INSERT INTO team_member_projects (id, member_id, user_id, project_id, created_at)
    SELECT
      md5(('script-project-assignment-' || sequence)::text)::uuid,
      md5(('script-member-' || sequence)::text)::uuid,
      '65000000-0000-4000-8000-000000000001',
      '60000000-0000-4000-8000-000000000001',
      '2026-07-22T00:00:00Z'
    FROM generate_series(1, 8) sequence;
    INSERT INTO team_member_scripts (id, member_id, user_id, project_id, script_id, created_at)
    SELECT
      md5(('script-direct-assignment-' || sequence)::text)::uuid,
      md5(('script-member-' || sequence)::text)::uuid,
      '65000000-0000-4000-8000-000000000001',
      '60000000-0000-4000-8000-000000000001',
      '61000000-0000-4000-8000-000000000001',
      '2026-07-22T00:00:00Z'
    FROM generate_series(1, 7) sequence;
  `);
}

async function captureImportedScriptShellBeforeCanvasDecoupling(db: PGlite) {
  const cleanupSql = await readFile(
    new URL("20260722-cleanup-standalone-canvas-project-shells.sql", migrationDirectoryUrl),
    "utf8",
  );
  const start = cleanupSql.indexOf("CREATE TABLE IF NOT EXISTS resource_decoupling_audit");
  const end = cleanupSql.indexOf("\nDO $cleanup$", start);
  assert.ok(start >= 0);
  assert.ok(end > start);
  await db.exec(cleanupSql.slice(start, end));
  await db.exec(`
    ALTER TABLE creator_canvas_projects
      DROP CONSTRAINT IF EXISTS creator_canvas_projects_project_id_fkey;
    ALTER TABLE creator_canvas_projects DROP COLUMN project_id;
  `);
}

async function readScriptContent(db: PGlite) {
  const scripts = await db.query(
    "SELECT id, status, input_text, created_by_user_id, created_at, updated_at, title, cover_image_url, cover_storage_object_id, deleted_at FROM scripts ORDER BY id",
  );
  const sections = await db.query(
    "SELECT id, script_id, title, body, sequence, status, created_by_user_id, created_at, updated_at FROM script_reader_sections ORDER BY sequence, id",
  );
  return { scripts: scripts.rows, sections: sections.rows };
}

async function readImportedScriptUploadContent(db: PGlite) {
  const [objects, sessions, uploads] = await Promise.all([
    db.query("SELECT id, object_key FROM storage_objects ORDER BY id"),
    db.query("SELECT id, storage_object_id, status FROM storage_upload_sessions ORDER BY id"),
    db.query("SELECT id, storage_object_id, page_key, file_name FROM project_upload_records ORDER BY id"),
  ]);
  return { objects: objects.rows, sessions: sessions.rows, uploads: uploads.rows };
}
