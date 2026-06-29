import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  createMigratedTestDb,
  listColumnNames,
  listIndexNames,
  listTableNames,
} from "../test-db.ts";
import { createDevDb } from "../dev-db.ts";

describe("foundation schema", () => {
  it("executes the foundation migration in the integration test database", async () => {
    const db = await createMigratedTestDb();
    try {
      const tables = await listTableNames(db);

      for (const table of [
        "users",
        "login_challenges",
        "auth_sessions",
        "memberships",
        "audit_events",
        "workflows",
        "tasks",
        "task_attempts",
        "provider_requests",
        "export_records",
        "credit_reservations",
        "credit_reservation_allocations",
        "credit_ledger_entries",
        "credit_packages",
        "billing_orders",
        "payment_intents",
        "payment_provider_events",
        "payment_risk_events",
        "payment_reconciliation_runs",
        "payment_reconciliation_items",
        "credit_wallet_transfers",
        "storage_objects",
        "organization_entitlements",
        "library_assets",
        "library_asset_versions",
        "team_member_groups",
        "team_member_profiles",
        "team_project_assignments",
        "team_project_ownerships",
        "team_credit_adjustments",
        "team_plan_limits",
        "team_members",
        "team_member_projects",
        "team_member_auth_sessions",
        "team_member_project_records",
      ]) {
        assert.ok(tables.includes(table), `expected ${table} table`);
      }
      assert.equal(tables.includes("library_asset_project_imports"), false);
    } finally {
      await db.close();
    }
  });

  it("models reusable asset libraries separately from project assets", async () => {
    const db = await createMigratedTestDb();
    try {
      assert.deepEqual(await listColumnNames(db, "library_assets"), [
        "id",
        "scope",
        "organization_id",
        "workspace_id",
        "created_by_user_id",
        "asset_type",
        "category",
        "folder",
        "name",
        "description",
        "tags_json",
        "status",
        "requires_pro_entitlement",
        "created_at",
        "updated_at",
      ]);

      assert.deepEqual(await listColumnNames(db, "library_asset_versions"), [
        "id",
        "library_asset_id",
        "version_number",
        "storage_object_key",
        "preview_url",
        "mime_type",
        "width",
        "height",
        "metadata_json",
        "created_at",
      ]);
    } finally {
      await db.close();
    }
  });

  it("adds unique invite codes to users", async () => {
    const db = await createMigratedTestDb();
    try {
      const userColumns = await listColumnNames(db, "users");
      const userIndexes = await listIndexNames(db, "users");
      const generator = await db.query<{ definition: string }>(
        `
          SELECT pg_get_functiondef(proc.oid) AS definition
          FROM pg_proc proc
          JOIN pg_namespace namespace ON namespace.oid = proc.pronamespace
          WHERE namespace.nspname = current_schema()
            AND proc.proname = 'generate_user_invite_code'
          LIMIT 1
        `,
      );

      assert.ok(userColumns.includes("invite_code"));
      assert.ok(userIndexes.includes("users_invite_code_key"));
      assert.equal(generator.rows[0]?.definition.includes("nextval('user_invite_code_seq'"), false);
    } finally {
      await db.close();
    }
  });

  it("adds unique team account suffixes to users", async () => {
    const db = await createMigratedTestDb();
    try {
      const userColumns = await listColumnNames(db, "users");
      const userIndexes = await listIndexNames(db, "users");

      assert.ok(userColumns.includes("team_account_suffix"));
      assert.ok(userIndexes.includes("users_team_account_suffix_key"));
      await db.query(
        `
          INSERT INTO users (id, phone_e164, team_account_suffix, status)
          VALUES ('00000000-0000-4000-8000-000000000901', '13800138901', 'a7k9x2', 'active')
        `,
      );
      await assert.rejects(
        db.query(
          `
            INSERT INTO users (id, phone_e164, team_account_suffix, status)
            VALUES ('00000000-0000-4000-8000-000000000902', '13800138902', 'a7k9x2', 'active')
          `,
        ),
      );
    } finally {
      await db.close();
    }
  });

  it("models organization entitlements for server-side team asset gates", async () => {
    const db = await createMigratedTestDb();
    try {
      assert.deepEqual(await listColumnNames(db, "organization_entitlements"), [
        "id",
        "organization_id",
        "entitlement_key",
        "status",
        "source",
        "expires_at",
        "created_at",
        "updated_at",
      ]);
    } finally {
      await db.close();
    }
  });

  it("models organization entitlements and team member management", async () => {
    const db = await createMigratedTestDb();
    try {
      assert.deepEqual(await listColumnNames(db, "organization_entitlements"), [
        "id",
        "organization_id",
        "entitlement_key",
        "status",
        "source",
        "expires_at",
        "created_at",
        "updated_at",
      ]);

      assert.deepEqual(await listColumnNames(db, "team_member_groups"), [
        "id",
        "organization_id",
        "workspace_id",
        "name",
        "status",
        "created_by_user_id",
        "created_at",
        "updated_at",
      ]);

      assert.deepEqual(await listColumnNames(db, "team_member_profiles"), [
        "id",
        "organization_id",
        "workspace_id",
        "membership_id",
        "team_account",
        "display_name",
        "member_group_id",
        "credit_balance_cached",
        "credit_used_cached",
        "last_credit_consumed_at",
        "remark",
        "created_by_user_id",
        "created_at",
        "updated_at",
        "script_ids",
        "canvas_ids",
      ]);

      assert.deepEqual(await listColumnNames(db, "team_project_assignments"), [
        "id",
        "organization_id",
        "workspace_id",
        "membership_id",
        "project_id",
        "assigned_by_user_id",
        "created_at",
      ]);

      assert.deepEqual(await listColumnNames(db, "team_project_ownerships"), [
        "id",
        "organization_id",
        "workspace_id",
        "project_id",
        "member_group_id",
        "created_at",
        "updated_at",
      ]);

      assert.deepEqual(await listColumnNames(db, "team_credit_adjustments"), [
        "id",
        "organization_id",
        "workspace_id",
        "operator_user_id",
        "target_membership_id",
        "adjustment_type",
        "amount",
        "reason",
        "created_at",
      ]);

      assert.deepEqual(await listColumnNames(db, "team_plan_limits"), [
        "id",
        "organization_id",
        "seat_limit",
        "single_account_concurrency_limit",
        "created_at",
        "updated_at",
      ]);
    } finally {
      await db.close();
    }
  });

  it("models simple user-owned team members and project visibility", async () => {
    const db = await createMigratedTestDb();
    try {
      assert.deepEqual(await listColumnNames(db, "team_members"), [
        "id",
        "user_id",
        "member_account",
        "member_account_suffix",
        "member_login_account",
        "member_name",
        "member_password_hash",
        "member_credits",
        "status",
        "disabled_at",
        "deleted_at",
        "created_at",
        "updated_at",
      ]);
      assert.deepEqual(await listColumnNames(db, "team_member_projects"), [
        "id",
        "member_id",
        "user_id",
        "project_id",
        "created_at",
      ]);

      await db.query(
        `
          INSERT INTO users (id, phone_e164, status)
          VALUES
            ('00000000-0000-4000-8000-000000000001', '13800138000', 'active'),
            ('00000000-0000-4000-8000-000000000002', '13800138001', 'active')
        `,
      );
      await db.query(
        `
          INSERT INTO organizations (id, name, status)
          VALUES ('10000000-0000-4000-8000-000000000001', 'Simple Team Org', 'active')
        `,
      );
      await db.query(
        `
          INSERT INTO workspaces (id, organization_id, name, status)
          VALUES (
            '20000000-0000-4000-8000-000000000001',
            '10000000-0000-4000-8000-000000000001',
            'Simple Team Workspace',
            'active'
          )
        `,
      );
      await db.query(
        `
          INSERT INTO projects (
            id,
            organization_id,
            workspace_id,
            name,
            aspect_ratio,
            resolution,
            phase,
            created_by_user_id
          )
          VALUES (
            '40000000-0000-4000-8000-000000000001',
            '10000000-0000-4000-8000-000000000001',
            '20000000-0000-4000-8000-000000000001',
            'Assigned Project',
            '9:16',
            '1080p',
            'script_input',
            '00000000-0000-4000-8000-000000000001'
          )
        `,
      );
      await db.query(
        `
          INSERT INTO team_members (
            id,
            user_id,
            member_account,
            member_account_suffix,
            member_login_account,
            member_name,
            member_password_hash,
            member_credits
          )
          VALUES (
            '50000000-0000-4000-8000-000000000001',
            '00000000-0000-4000-8000-000000000001',
            'director001',
            'u185715',
            'director001@u185715',
            'Director One',
            'scrypt:v1:member:safe-hash',
            100
          )
        `,
      );
      await db.query(
        `
          INSERT INTO team_member_projects (id, member_id, user_id, project_id)
          VALUES (
            '51000000-0000-4000-8000-000000000001',
            '50000000-0000-4000-8000-000000000001',
            '00000000-0000-4000-8000-000000000001',
            '40000000-0000-4000-8000-000000000001'
          )
        `,
      );

      await assert.rejects(
        db.query(
          `
            INSERT INTO team_member_projects (id, member_id, user_id, project_id)
            VALUES (
              '51000000-0000-4000-8000-000000000002',
              '50000000-0000-4000-8000-000000000001',
              '00000000-0000-4000-8000-000000000002',
              '40000000-0000-4000-8000-000000000001'
            )
          `,
        ),
      );
      await assert.rejects(
        db.query(
          `
            UPDATE team_members
            SET status = 'archived'
            WHERE id = '50000000-0000-4000-8000-000000000001'
          `,
        ),
      );

      await db.query(
        `
          UPDATE team_members
          SET status = 'deleted',
              deleted_at = '2026-06-27T00:00:00.000Z'
          WHERE id = '50000000-0000-4000-8000-000000000001'
        `,
      );
      const assignmentCount = await db.query<{ count: number }>(
        `
          SELECT count(*)::int AS count
          FROM team_member_projects
          WHERE member_id = '50000000-0000-4000-8000-000000000001'
        `,
      );
      assert.equal(assignmentCount.rows[0]?.count, 1);
    } finally {
      await db.close();
    }
  });

  it("models simple team member login sessions and project records", async () => {
    const db = await createMigratedTestDb();
    try {
      assert.deepEqual(await listColumnNames(db, "team_member_auth_sessions"), [
        "id",
        "auth_session_id",
        "user_id",
        "member_id",
        "status",
        "expires_at",
        "last_seen_at",
        "revoked_at",
        "created_at",
      ]);
      assert.deepEqual(await listColumnNames(db, "team_member_project_records"), [
        "id",
        "user_id",
        "member_id",
        "project_id",
        "record_type",
        "record_status",
        "record_title",
        "record_detail_json",
        "source_table",
        "source_id",
        "created_at",
      ]);

      await db.query(
        `
          INSERT INTO users (id, phone_e164, status)
          VALUES
            ('00000000-0000-4000-8000-000000000001', '13800138000', 'active'),
            ('00000000-0000-4000-8000-000000000002', '13800138001', 'active')
        `,
      );
      await db.query(
        `
          INSERT INTO organizations (id, name, status)
          VALUES ('10000000-0000-4000-8000-000000000001', 'Simple Team Org', 'active')
        `,
      );
      await db.query(
        `
          INSERT INTO workspaces (id, organization_id, name, status)
          VALUES (
            '20000000-0000-4000-8000-000000000001',
            '10000000-0000-4000-8000-000000000001',
            'Simple Team Workspace',
            'active'
          )
        `,
      );
      await db.query(
        `
          INSERT INTO projects (
            id,
            organization_id,
            workspace_id,
            name,
            aspect_ratio,
            resolution,
            phase,
            created_by_user_id
          )
          VALUES
            (
              '40000000-0000-4000-8000-000000000001',
              '10000000-0000-4000-8000-000000000001',
              '20000000-0000-4000-8000-000000000001',
              'Assigned Project',
              '9:16',
              '1080p',
              'script_input',
              '00000000-0000-4000-8000-000000000001'
            ),
            (
              '40000000-0000-4000-8000-000000000002',
              '10000000-0000-4000-8000-000000000001',
              '20000000-0000-4000-8000-000000000001',
              'Unassigned Project',
              '9:16',
              '1080p',
              'script_input',
              '00000000-0000-4000-8000-000000000001'
            )
        `,
      );
      await db.query(
        `
          INSERT INTO auth_sessions (
            id,
            user_id,
            status,
            session_token_hash,
            session_token_hash_version,
            expires_at
          )
          VALUES (
            '60000000-0000-4000-8000-000000000001',
            '00000000-0000-4000-8000-000000000001',
            'active',
            'hashed-session-token',
            1,
            '2026-07-01T00:00:00.000Z'
          )
        `,
      );
      await db.query(
        `
          INSERT INTO team_members (
            id,
            user_id,
            member_account,
            member_account_suffix,
            member_login_account,
            member_name,
            member_password_hash,
            member_credits
          )
          VALUES (
            '50000000-0000-4000-8000-000000000001',
            '00000000-0000-4000-8000-000000000001',
            'director001',
            'u185715',
            'director001@u185715',
            'Director One',
            'scrypt:v1:member:safe-hash',
            100
          )
        `,
      );
      await db.query(
        `
          INSERT INTO team_member_projects (id, member_id, user_id, project_id)
          VALUES (
            '51000000-0000-4000-8000-000000000001',
            '50000000-0000-4000-8000-000000000001',
            '00000000-0000-4000-8000-000000000001',
            '40000000-0000-4000-8000-000000000001'
          )
        `,
      );
      await db.query(
        `
          INSERT INTO team_member_auth_sessions (
            id,
            auth_session_id,
            user_id,
            member_id,
            status,
            expires_at
          )
          VALUES (
            '61000000-0000-4000-8000-000000000001',
            '60000000-0000-4000-8000-000000000001',
            '00000000-0000-4000-8000-000000000001',
            '50000000-0000-4000-8000-000000000001',
            'active',
            '2026-07-01T00:00:00.000Z'
          )
        `,
      );
      await db.query(
        `
          INSERT INTO team_member_project_records (
            id,
            user_id,
            member_id,
            project_id,
            record_type,
            record_status,
            record_title
          )
          VALUES (
            '62000000-0000-4000-8000-000000000001',
            '00000000-0000-4000-8000-000000000001',
            '50000000-0000-4000-8000-000000000001',
            '40000000-0000-4000-8000-000000000001',
            'project_view',
            'recorded',
            'Viewed assigned project'
          )
        `,
      );

      await assert.rejects(
        db.query(
          `
            INSERT INTO team_member_auth_sessions (
              id,
              auth_session_id,
              user_id,
              member_id,
              status,
              expires_at
            )
            VALUES (
              '61000000-0000-4000-8000-000000000002',
              '60000000-0000-4000-8000-000000000001',
              '00000000-0000-4000-8000-000000000002',
              '50000000-0000-4000-8000-000000000001',
              'active',
              '2026-07-01T00:00:00.000Z'
            )
          `,
        ),
      );
      await assert.rejects(
        db.query(
          `
            INSERT INTO team_member_project_records (
              id,
              user_id,
              member_id,
              project_id,
              record_type,
              record_status,
              record_title
            )
            VALUES (
              '62000000-0000-4000-8000-000000000002',
              '00000000-0000-4000-8000-000000000001',
              '50000000-0000-4000-8000-000000000001',
              '40000000-0000-4000-8000-000000000002',
              'project_view',
              'recorded',
              'Viewed unassigned project'
            )
          `,
        ),
      );
    } finally {
      await db.close();
    }
  });

  it("models configurable credit packages and team pool transfers", async () => {
    const db = await createMigratedTestDb();
    try {
      assert.deepEqual(new Set(await listColumnNames(db, "credit_packages")), new Set([
        "id",
        "code",
        "display_name",
        "subtitle",
        "credits",
        "gift_credits",
        "amount_minor",
        "currency",
        "badge",
        "sort_order",
        "metadata_json",
        "status",
        "valid_from",
        "valid_until",
        "created_at",
        "updated_at",
      ]));

      assert.deepEqual(await listColumnNames(db, "credit_wallet_transfers"), [
        "id",
        "source_organization_id",
        "target_organization_id",
        "operator_user_id",
        "amount",
        "status",
        "source_ledger_entry_id",
        "target_ledger_entry_id",
        "idempotency_key",
        "failure_code",
        "metadata_json",
        "created_at",
        "updated_at",
      ]);

      assert.deepEqual((await listColumnNames(db, "organizations")).filter((column) => column.startsWith("credit_")), [
        "credit_balance_cached",
        "credit_reserved_cached",
        "credit_frozen_cached",
        "credit_frozen_at",
        "credit_frozen_until",
      ]);

      assert.deepEqual((await listColumnNames(db, "credit_lots")).filter((column) => column.includes("frozen") || column === "status"), [
        "status",
        "frozen_at",
        "frozen_until",
      ]);

      await db.query(`
        INSERT INTO users (id, phone_e164, status)
        VALUES ('00000000-0000-4000-8000-000000000301', '13800138301', 'active')
      `);
      await db.query(`
        INSERT INTO organizations (id, name, status)
        VALUES ('10000000-0000-4000-8000-000000000301', 'Transfer Out Org', 'active')
      `);
      await db.query(`
        INSERT INTO organizations (id, name, status)
        VALUES ('10000000-0000-4000-8000-000000000302', 'Transfer In Org', 'active')
      `);
      await db.query(`
        INSERT INTO credit_ledger_entries (
          id,
          organization_id,
          entry_type,
          amount,
          available_delta,
          reserved_delta,
          consumed_delta,
          source_type,
          source_id,
          reason,
          metadata_json
        )
        VALUES
          (
            '93000000-0000-4000-8000-000000000301',
            '10000000-0000-4000-8000-000000000301',
            'transfer_out',
            50,
            -50,
            0,
            0,
            'credit_wallet_transfer',
            '94000000-0000-4000-8000-000000000301',
            'transfer to team pool',
            '{}'::jsonb
          ),
          (
            '93000000-0000-4000-8000-000000000302',
            '10000000-0000-4000-8000-000000000302',
            'transfer_in',
            50,
            50,
            0,
            0,
            'credit_wallet_transfer',
            '94000000-0000-4000-8000-000000000301',
            'transfer from personal wallet',
            '{}'::jsonb
          )
      `);
      await db.query(`
        INSERT INTO credit_wallet_transfers (
          id,
          source_organization_id,
          target_organization_id,
          operator_user_id,
          amount,
          status,
          source_ledger_entry_id,
          target_ledger_entry_id,
          idempotency_key,
          metadata_json
        )
        VALUES (
          '94000000-0000-4000-8000-000000000301',
          '10000000-0000-4000-8000-000000000301',
          '10000000-0000-4000-8000-000000000302',
          '00000000-0000-4000-8000-000000000301',
          50,
          'succeeded',
          '93000000-0000-4000-8000-000000000301',
          '93000000-0000-4000-8000-000000000302',
          'transfer-key-1',
          '{}'::jsonb
        )
      `);

      await assert.rejects(
        db.query(`
          INSERT INTO credit_packages (
            id,
            code,
            display_name,
            credits,
            gift_credits,
            amount_minor,
            currency,
            status
          )
          VALUES (
            '90000000-0000-4000-8000-000000000301',
            'negative_gift',
            'Negative Gift',
            100,
            -1,
            1000,
            'CNY',
            'active'
          )
        `),
      );
    } finally {
      await db.close();
    }
  });

  it("models auth secrets as hashes rather than plaintext tokens", async () => {
    const db = await createMigratedTestDb();
    try {
      assert.deepEqual(await listColumnNames(db, "login_challenges"), [
        "id",
        "phone_e164",
        "code_hash",
        "code_hash_version",
        "status",
        "attempt_count",
        "max_attempts",
        "expires_at",
        "last_sent_at",
        "consumed_at",
        "revoked_at",
        "created_ip_hash",
        "created_user_agent_hash",
        "created_at",
        "updated_at",
      ]);

      assert.deepEqual(await listColumnNames(db, "auth_sessions"), [
        "id",
        "user_id",
        "status",
        "session_token_hash",
        "session_token_hash_version",
        "expires_at",
        "last_seen_at",
        "revoked_at",
        "created_at",
      ]);
    } finally {
      await db.close();
    }
  });

  it("enforces key platform uniqueness constraints", async () => {
    const db = await createMigratedTestDb();
    try {
      await db.query(
        `
          INSERT INTO users (id, phone_e164, status)
          VALUES
            ('00000000-0000-4000-8000-000000000001', '13800138000', 'active'),
            ('00000000-0000-4000-8000-000000000002', '13800138001', 'active')
        `,
      );
      await db.query(
        `
          INSERT INTO organizations (id, name, status)
          VALUES ('10000000-0000-4000-8000-000000000001', 'Org', 'active')
        `,
      );
      await db.query(
        `
          INSERT INTO workspaces (id, organization_id, name, status)
          VALUES (
            '20000000-0000-4000-8000-000000000001',
            '10000000-0000-4000-8000-000000000001',
            'Workspace',
            'active'
          )
        `,
      );
      await db.query(
        `
          INSERT INTO memberships (
            id,
            organization_id,
            workspace_id,
            user_id,
            role,
            status
          )
          VALUES (
            '30000000-0000-4000-8000-000000000001',
            '10000000-0000-4000-8000-000000000001',
            '20000000-0000-4000-8000-000000000001',
            '00000000-0000-4000-8000-000000000001',
            'creator',
            'active'
          )
        `,
      );

      await assert.rejects(
        db.query(
          `
            INSERT INTO memberships (
              id,
              organization_id,
              workspace_id,
              user_id,
              role,
              status
            )
            VALUES (
              '30000000-0000-4000-8000-000000000002',
              '10000000-0000-4000-8000-000000000001',
              '20000000-0000-4000-8000-000000000001',
              '00000000-0000-4000-8000-000000000001',
              'producer',
              'active'
            )
          `,
        ),
      );
      await assert.rejects(
        db.query(
          `
            INSERT INTO users (id, phone_e164, status)
            VALUES ('00000000-0000-4000-8000-000000000099', '13b6040b3ef', 'active')
          `,
        ),
      );
    } finally {
      await db.close();
    }
  });

  it("rejects cross-organization workspace and project relationships", async () => {
    const db = await createMigratedTestDb();
    try {
      await db.query(
        `
          INSERT INTO organizations (id, name, status)
          VALUES
            ('10000000-0000-4000-8000-000000000001', 'Org One', 'active'),
            ('10000000-0000-4000-8000-000000000002', 'Org Two', 'active')
        `,
      );
      await db.query(
        `
          INSERT INTO workspaces (id, organization_id, name, status)
          VALUES (
            '20000000-0000-4000-8000-000000000001',
            '10000000-0000-4000-8000-000000000001',
            'Workspace One',
            'active'
          )
        `,
      );

      await assert.rejects(
        db.query(
          `
            INSERT INTO projects (
              id,
              organization_id,
              workspace_id,
              name,
              aspect_ratio,
              resolution,
              phase
            )
            VALUES (
              '40000000-0000-4000-8000-000000000001',
              '10000000-0000-4000-8000-000000000002',
              '20000000-0000-4000-8000-000000000001',
              'Cross Org Project',
              '9:16',
              '1080p',
              'script_input'
            )
          `,
        ),
      );
    } finally {
      await db.close();
    }
  });

  it("rejects cross-workspace team member group relationships", async () => {
    const db = await createMigratedTestDb();
    try {
      await db.query(
        `
          INSERT INTO users (id, phone_e164, status)
          VALUES ('00000000-0000-4000-8000-000000000001', '13800138000', 'active')
        `,
      );
      await db.query(
        `
          INSERT INTO organizations (id, name, status)
          VALUES
            ('10000000-0000-4000-8000-000000000001', 'Org One', 'active'),
            ('10000000-0000-4000-8000-000000000002', 'Org Two', 'active')
        `,
      );
      await db.query(
        `
          INSERT INTO workspaces (id, organization_id, name, status)
          VALUES
            (
              '20000000-0000-4000-8000-000000000001',
              '10000000-0000-4000-8000-000000000001',
              'Workspace One',
              'active'
            ),
            (
              '20000000-0000-4000-8000-000000000002',
              '10000000-0000-4000-8000-000000000002',
              'Workspace Two',
              'active'
            )
        `,
      );
      await db.query(
        `
          INSERT INTO memberships (
            id,
            organization_id,
            workspace_id,
            user_id,
            role,
            status
          )
          VALUES (
            '30000000-0000-4000-8000-000000000001',
            '10000000-0000-4000-8000-000000000001',
            '20000000-0000-4000-8000-000000000001',
            '00000000-0000-4000-8000-000000000001',
            'owner_admin',
            'active'
          )
        `,
      );
      await db.query(
        `
          INSERT INTO projects (
            id,
            organization_id,
            workspace_id,
            name,
            aspect_ratio,
            resolution,
            phase,
            created_by_user_id
          )
          VALUES (
            '40000000-0000-4000-8000-000000000001',
            '10000000-0000-4000-8000-000000000001',
            '20000000-0000-4000-8000-000000000001',
            'Org One Project',
            '9:16',
            '1080p',
            'script_input',
            '00000000-0000-4000-8000-000000000001'
          )
        `,
      );
      await db.query(
        `
          INSERT INTO team_member_groups (
            id,
            organization_id,
            workspace_id,
            name,
            status,
            created_by_user_id
          )
          VALUES (
            '35000000-0000-4000-8000-000000000002',
            '10000000-0000-4000-8000-000000000002',
            '20000000-0000-4000-8000-000000000002',
            'External Group',
            'active',
            '00000000-0000-4000-8000-000000000001'
          )
        `,
      );

      await assert.rejects(
        db.query(
          `
            INSERT INTO team_member_profiles (
              id,
              organization_id,
              workspace_id,
              membership_id,
              team_account,
              display_name,
              member_group_id,
              created_by_user_id
            )
            VALUES (
              '32000000-0000-4000-8000-000000000001',
              '10000000-0000-4000-8000-000000000001',
              '20000000-0000-4000-8000-000000000001',
              '30000000-0000-4000-8000-000000000001',
              'director001',
              'Director One',
              '35000000-0000-4000-8000-000000000002',
              '00000000-0000-4000-8000-000000000001'
            )
          `,
        ),
      );
      await assert.rejects(
        db.query(
          `
            INSERT INTO team_project_ownerships (
              id,
              organization_id,
              workspace_id,
              project_id,
              member_group_id
            )
            VALUES (
              '37000000-0000-4000-8000-000000000001',
              '10000000-0000-4000-8000-000000000001',
              '20000000-0000-4000-8000-000000000001',
              '40000000-0000-4000-8000-000000000001',
              '35000000-0000-4000-8000-000000000002'
            )
          `,
        ),
      );
    } finally {
      await db.close();
    }
  });

  it("creates membership subscription payment tables and product-aware orders", async () => {
    const db = await createDevDb();
    try {
      const tables = await db.query<{ table_name: string }>(`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name IN (
            'membership_plans',
            'membership_plan_revisions',
            'organization_membership_subscriptions',
            'membership_periods',
            'credit_lots',
            'credit_reservation_lot_allocations',
            'membership_reminders'
          )
        ORDER BY table_name
      `);
      assert.deepEqual(tables.rows.map((row) => row.table_name), [
        "credit_lots",
        "credit_reservation_lot_allocations",
        "membership_periods",
        "membership_plan_revisions",
        "membership_plans",
        "membership_reminders",
        "organization_membership_subscriptions",
      ]);

      const orderColumnNames = await listColumnNames(db, "billing_orders");
      for (const columnName of ["membership_plan_id", "product_snapshot_json", "product_type"]) {
        assert.ok(orderColumnNames.includes(columnName), `expected billing_orders.${columnName}`);
      }
    } finally {
      await db.close();
    }
  });

  it("enforces product-aware billing order credit shapes", async () => {
    const db = await createMigratedTestDb();
    try {
      await db.query(`
        INSERT INTO users (id, phone_e164, status)
        VALUES ('00000000-0000-4000-8000-000000000101', '13800138101', 'active')
      `);
      await db.query(`
        INSERT INTO organizations (id, name, status)
        VALUES ('10000000-0000-4000-8000-000000000101', 'Product Orders Org', 'active')
      `);
      await db.query(`
        INSERT INTO credit_packages (
          id,
          code,
          display_name,
          credits,
          amount_minor,
          currency,
          status
        )
        VALUES (
          '90000000-0000-4000-8000-000000000101',
          'product_order_credits',
          'Product Order Credits',
          100,
          9900,
          'CNY',
          'active'
        )
      `);
      await db.query(`
        INSERT INTO membership_plans (
          id,
          code,
          display_name,
          tier,
          period_unit,
          period_count,
          amount_minor,
          gift_credits,
          seat_limit,
          status
        )
        VALUES (
          '91000000-0000-4000-8000-000000000101',
          'experience_zero_gift',
          'Experience Zero Gift',
          'experience',
          'month',
          1,
          19900,
          0,
          1,
          'active'
        )
      `);

      await db.query(`
        INSERT INTO billing_orders (
          id,
          organization_id,
          created_by_user_id,
          order_no,
          product_type,
          credit_package_id,
          package_snapshot_json,
          product_snapshot_json,
          credits,
          amount_minor,
          currency,
          status,
          expires_at
        )
        VALUES (
          '92000000-0000-4000-8000-000000000101',
          '10000000-0000-4000-8000-000000000101',
          '00000000-0000-4000-8000-000000000101',
          'ORD-PRODUCT-CREDIT-OK',
          'credit_package',
          '90000000-0000-4000-8000-000000000101',
          '{"code":"product_order_credits","credits":100}'::jsonb,
          '{"code":"product_order_credits","credits":100}'::jsonb,
          100,
          9900,
          'CNY',
          'pending_payment',
          '2026-06-09T00:00:00.000Z'
        )
      `);
      await db.query(`
        INSERT INTO billing_orders (
          id,
          organization_id,
          created_by_user_id,
          order_no,
          product_type,
          membership_plan_id,
          package_snapshot_json,
          product_snapshot_json,
          credits,
          amount_minor,
          currency,
          status,
          expires_at
        )
        VALUES (
          '92000000-0000-4000-8000-000000000102',
          '10000000-0000-4000-8000-000000000101',
          '00000000-0000-4000-8000-000000000101',
          'ORD-PRODUCT-MEMBERSHIP-ZERO',
          'membership_plan',
          '91000000-0000-4000-8000-000000000101',
          '{}'::jsonb,
          '{"code":"experience_zero_gift","giftCredits":0}'::jsonb,
          0,
          19900,
          'CNY',
          'pending_payment',
          '2026-06-09T00:00:00.000Z'
        )
      `);

      await assert.rejects(
        db.query(`
          INSERT INTO billing_orders (
            id,
            organization_id,
            created_by_user_id,
            order_no,
            product_type,
            credit_package_id,
            package_snapshot_json,
            product_snapshot_json,
            credits,
            amount_minor,
            currency,
            status,
            expires_at
          )
          VALUES (
            '92000000-0000-4000-8000-000000000103',
            '10000000-0000-4000-8000-000000000101',
            '00000000-0000-4000-8000-000000000101',
            'ORD-PRODUCT-CREDIT-ZERO',
            'credit_package',
            '90000000-0000-4000-8000-000000000101',
            '{"code":"product_order_credits","credits":100}'::jsonb,
            '{"code":"product_order_credits","credits":100}'::jsonb,
            0,
            9900,
            'CNY',
            'pending_payment',
            '2026-06-09T00:00:00.000Z'
          )
        `),
      );
      await assert.rejects(
        db.query(`
          INSERT INTO billing_orders (
            id,
            organization_id,
            created_by_user_id,
            order_no,
            product_type,
            membership_plan_id,
            package_snapshot_json,
            product_snapshot_json,
            credits,
            amount_minor,
            currency,
            status,
            expires_at
          )
          VALUES (
            '92000000-0000-4000-8000-000000000104',
            '10000000-0000-4000-8000-000000000101',
            '00000000-0000-4000-8000-000000000101',
            'ORD-PRODUCT-MEMBERSHIP-NEGATIVE',
            'membership_plan',
            '91000000-0000-4000-8000-000000000101',
            '{}'::jsonb,
            '{"code":"experience_zero_gift","giftCredits":0}'::jsonb,
            -1,
            19900,
            'CNY',
            'pending_payment',
            '2026-06-09T00:00:00.000Z'
          )
        `),
      );
    } finally {
      await db.close();
    }
  });

  it("rejects cross-organization membership subscription payment references", async () => {
    const db = await createMigratedTestDb();
    try {
      await db.query(`
        INSERT INTO users (id, phone_e164, status)
        VALUES ('00000000-0000-4000-8000-000000000201', '13800138201', 'active')
      `);
      await db.query(`
        INSERT INTO organizations (id, name, status)
        VALUES
          ('10000000-0000-4000-8000-000000000201', 'Membership Org One', 'active'),
          ('10000000-0000-4000-8000-000000000202', 'Membership Org Two', 'active')
      `);
      await db.query(`
        INSERT INTO credit_packages (
          id,
          code,
          display_name,
          credits,
          amount_minor,
          currency,
          status
        )
        VALUES (
          '90000000-0000-4000-8000-000000000201',
          'cross_org_credits',
          'Cross Org Credits',
          10,
          1000,
          'CNY',
          'active'
        )
      `);
      await db.query(`
        INSERT INTO membership_plans (
          id,
          code,
          display_name,
          tier,
          period_unit,
          period_count,
          amount_minor,
          gift_credits,
          seat_limit,
          status
        )
        VALUES (
          '91000000-0000-4000-8000-000000000201',
          'cross_org_plan',
          'Cross Org Plan',
          'professional',
          'month',
          1,
          29900,
          0,
          5,
          'active'
        )
      `);
      await db.query(`
        INSERT INTO billing_orders (
          id,
          organization_id,
          created_by_user_id,
          order_no,
          credit_package_id,
          package_snapshot_json,
          credits,
          amount_minor,
          currency,
          status,
          expires_at
        )
        VALUES (
          '92000000-0000-4000-8000-000000000201',
          '10000000-0000-4000-8000-000000000201',
          '00000000-0000-4000-8000-000000000201',
          'ORD-CROSS-ORG-1',
          '90000000-0000-4000-8000-000000000201',
          '{"code":"cross_org_credits","credits":10}'::jsonb,
          10,
          1000,
          'CNY',
          'pending_payment',
          '2026-06-09T00:00:00.000Z'
        )
      `);
      await db.query(`
        INSERT INTO credit_ledger_entries (
          id,
          organization_id,
          entry_type,
          amount,
          available_delta,
          reserved_delta,
          consumed_delta,
          source_type,
          source_id,
          reason,
          metadata_json
        )
        VALUES (
          '93000000-0000-4000-8000-000000000201',
          '10000000-0000-4000-8000-000000000201',
          'grant',
          10,
          10,
          0,
          0,
          'test',
          '94000000-0000-4000-8000-000000000201',
          'cross org source',
          '{}'::jsonb
        )
      `);

      await assert.rejects(
        db.query(`
          INSERT INTO organization_membership_subscriptions (
            id,
            organization_id,
            status,
            latest_order_id
          )
          VALUES (
            '95000000-0000-4000-8000-000000000201',
            '10000000-0000-4000-8000-000000000202',
            'expired',
            '92000000-0000-4000-8000-000000000201'
          )
        `),
      );
      await assert.rejects(
        db.query(`
          INSERT INTO membership_periods (
            id,
            organization_id,
            order_id,
            plan_id,
            tier,
            period_start_at,
            period_end_at,
            gift_credits,
            plan_snapshot_json,
            status
          )
          VALUES (
            '95000000-0000-4000-8000-000000000202',
            '10000000-0000-4000-8000-000000000202',
            '92000000-0000-4000-8000-000000000201',
            '91000000-0000-4000-8000-000000000201',
            'professional',
            '2026-06-08T00:00:00.000Z',
            '2026-07-08T00:00:00.000Z',
            0,
            '{"code":"cross_org_plan"}'::jsonb,
            'active'
          )
        `),
      );
      await assert.rejects(
        db.query(`
          INSERT INTO credit_lots (
            id,
            organization_id,
            source_type,
            source_id,
            grant_ledger_entry_id,
            total_amount,
            available_amount
          )
          VALUES (
            '95000000-0000-4000-8000-000000000203',
            '10000000-0000-4000-8000-000000000202',
            'membership_period',
            '95000000-0000-4000-8000-000000000202',
            '93000000-0000-4000-8000-000000000201',
            10,
            10
          )
        `),
      );
    } finally {
      await db.close();
    }
  });
});
