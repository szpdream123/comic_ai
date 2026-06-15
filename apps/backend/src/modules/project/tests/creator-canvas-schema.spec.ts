import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

describe("creator canvas schema", () => {
  const sql = readFileSync(
    new URL("../../../../../../packages/db/migrations/0026_creator_canvas_projects.sql", import.meta.url),
    "utf8",
  );

  it("locks canvas projects to one active canvas per business project", () => {
    assert.match(sql, /project_id uuid NOT NULL/);
    assert.match(sql, /server_revision integer NOT NULL DEFAULT 1/);
    assert.match(sql, /latest_document_id uuid NULL/);
    assert.match(sql, /creator_canvas_projects_project_uidx/);
    assert.match(sql, /ON creator_canvas_projects \(organization_id, project_id\)/);
    assert.match(sql, /WHERE deleted_at IS NULL/);
  });

  it("stores full documents plus structured nodes, edges, runs, and artifacts", () => {
    assert.match(sql, /CREATE TABLE IF NOT EXISTS creator_canvas_documents/);
    assert.match(sql, /document_json jsonb NOT NULL/);
    assert.match(sql, /CREATE TABLE IF NOT EXISTS creator_canvas_nodes/);
    assert.match(sql, /position_x numeric NOT NULL DEFAULT 0/);
    assert.match(sql, /CREATE TABLE IF NOT EXISTS creator_canvas_edges/);
    assert.match(sql, /source_node_key text NOT NULL/);
    assert.match(sql, /CREATE TABLE IF NOT EXISTS creator_canvas_node_runs/);
    assert.match(sql, /target_id text NULL/);
    assert.match(sql, /input_snapshot_json jsonb NOT NULL DEFAULT '\{\}'::jsonb/);
    assert.match(sql, /output_snapshot_json jsonb NOT NULL DEFAULT '\{\}'::jsonb/);
    assert.match(sql, /CREATE TABLE IF NOT EXISTS creator_canvas_node_artifacts/);
    assert.match(sql, /selected boolean NOT NULL DEFAULT false/);
  });

  it("keeps generated image and video history selectable per node", () => {
    assert.match(sql, /artifact_kind text NOT NULL CHECK \(artifact_kind IN \('image', 'video', 'audio', 'text', 'asset', 'unknown'\)\)/);
    assert.match(sql, /asset_version_id uuid NULL REFERENCES asset_versions\(id\)/);
    assert.match(sql, /storage_object_id uuid NULL REFERENCES storage_objects\(id\)/);
    assert.match(sql, /selection_role text NOT NULL DEFAULT 'current'/);
    assert.match(sql, /creator_canvas_node_artifacts_selected_role_uidx/);
    assert.match(sql, /ON creator_canvas_node_artifacts \(organization_id, canvas_project_id, node_key, selection_role\)/);
  });
});
