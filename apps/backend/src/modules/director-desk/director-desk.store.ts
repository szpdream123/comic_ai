import { randomUUID } from "node:crypto";

import type { SqlDatabase } from "../shared/db/sql.ts";
import { queryOne } from "../shared/db/sql.ts";
import type {
  DirectorDeskRecord,
  DirectorDeskStatus,
  DirectorDeskStore,
} from "./director-desk.service.ts";

interface DirectorDeskRow {
  desk_key: string;
  name: string;
  created_at: Date | string;
  updated_at: Date | string;
  last_opened_at: Date | string | null;
}

export class SqlDirectorDeskStore implements DirectorDeskStore {
  constructor(private readonly db: SqlDatabase) {}

  async list(input: { userId: string; teamMemberId?: string | null }) {
    const result = await this.db.query<DirectorDeskRow>(
      `
        SELECT desk_key, name, created_at, updated_at, last_opened_at
        FROM director_desks
        WHERE user_id = $1
          AND status = 'active'
          AND ($2::uuid IS NULL OR EXISTS (
            SELECT 1
            FROM team_member_director_desks assignment
            WHERE assignment.user_id = director_desks.user_id
              AND assignment.member_id = $2
              AND assignment.director_desk_id = director_desks.id
          ))
        ORDER BY sort_order, created_at, desk_key
      `,
      [input.userId, input.teamMemberId ?? null],
    );
    return result.rows.map(directorDeskFromRow);
  }

  async create(input: {
    userId: string;
    createdByMemberId: string | null;
    deskKey: string | null;
    name: string | null;
    now: Date;
  }) {
    if (input.deskKey) {
      const defaultName = defaultNameForDeskKey(input.deskKey);
      const row = await queryOne<DirectorDeskRow>(
        this.db,
        `
          WITH owner AS MATERIALIZED (
            SELECT id
            FROM users
            WHERE id = $1
            FOR UPDATE
          ), next_order AS MATERIALIZED (
            SELECT COALESCE(MAX(desk.sort_order), 0) + 1 AS number
            FROM owner
            LEFT JOIN director_desks desk ON desk.user_id = owner.id
          )
          INSERT INTO director_desks (
            id, user_id, created_by_member_id, desk_key, name, scene_json,
            status, sort_order, created_at, updated_at
          )
          SELECT
            $2, owner.id, $3, $4, COALESCE($5, $6), '{}'::jsonb,
            'active', next_order.number, $7, $7
          FROM owner
          CROSS JOIN next_order
          ON CONFLICT (user_id, desk_key) DO UPDATE
          SET name = COALESCE($5, director_desks.name),
              status = 'active',
              updated_at = CASE
                WHEN director_desks.status <> 'active'
                  OR ($5::text IS NOT NULL AND director_desks.name <> $5)
                THEN $7
                ELSE director_desks.updated_at
              END
          RETURNING desk_key, name, created_at, updated_at, last_opened_at
        `,
        [
          input.userId,
          randomUUID(),
          input.createdByMemberId,
          input.deskKey,
          input.name,
          defaultName,
          input.now,
        ],
      );
      if (!row) throw new Error("director_desk_owner_not_found");
      return directorDeskFromRow(row);
    }

    const row = await queryOne<DirectorDeskRow>(
      this.db,
      `
        WITH owner AS MATERIALIZED (
          SELECT id
          FROM users
          WHERE id = $1
          FOR UPDATE
        ), next_desk AS MATERIALIZED (
          SELECT COALESCE(MAX(
            CASE
              WHEN desk.desk_key ~ '^desk_[0-9]+$'
                THEN substring(desk.desk_key FROM 6)::integer
              ELSE 0
            END
          ), 0) + 1 AS number
          FROM owner
          LEFT JOIN director_desks desk ON desk.user_id = owner.id
        )
        INSERT INTO director_desks (
          id, user_id, created_by_member_id, desk_key, name, scene_json,
          status, sort_order, created_at, updated_at
        )
        SELECT
          $2, owner.id, $3, 'desk_' || next_desk.number,
          COALESCE($4, '导演台 ' || next_desk.number || ' 号'),
          '{}'::jsonb, 'active', next_desk.number, $5, $5
        FROM owner
        CROSS JOIN next_desk
        RETURNING desk_key, name, created_at, updated_at, last_opened_at
      `,
      [input.userId, randomUUID(), input.createdByMemberId, input.name, input.now],
    );
    if (!row) throw new Error("director_desk_owner_not_found");
    return directorDeskFromRow(row);
  }

  async update(input: {
    userId: string;
    deskKey: string;
    name?: string;
    status?: DirectorDeskStatus;
    sortOrder?: number;
    teamMemberId?: string | null;
    now: Date;
  }) {
    const row = await queryOne<DirectorDeskRow>(
      this.db,
      `
        UPDATE director_desks
        SET name = COALESCE($3, name),
            status = COALESCE($4, status),
            sort_order = COALESCE($5, sort_order),
            updated_at = $6
        WHERE user_id = $1
          AND desk_key = $2
          AND ($7::uuid IS NULL OR EXISTS (
            SELECT 1 FROM team_member_director_desks assignment
            WHERE assignment.user_id = director_desks.user_id
              AND assignment.member_id = $7
              AND assignment.director_desk_id = director_desks.id
          ))
        RETURNING desk_key, name, created_at, updated_at, last_opened_at
      `,
      [
        input.userId,
        input.deskKey,
        input.name ?? null,
        input.status ?? null,
        input.sortOrder ?? null,
        input.now,
        input.teamMemberId ?? null,
      ],
    );
    return row ? directorDeskFromRow(row) : undefined;
  }

  async delete(input: { userId: string; deskKey: string }) {
    const row = await queryOne<{ desk_key: string }>(
      this.db,
      `
        DELETE FROM director_desks
        WHERE user_id = $1
          AND desk_key = $2
        RETURNING desk_key
      `,
      [input.userId, input.deskKey],
    );
    return Boolean(row);
  }

  async readScene(input: { userId: string; deskKey: string; teamMemberId?: string | null }) {
    const row = await queryOne<{ scene_json: Record<string, unknown> }>(
      this.db,
      `
        SELECT scene_json
        FROM director_desks
        WHERE user_id = $1
          AND desk_key = $2
          AND ($3::uuid IS NULL OR EXISTS (
            SELECT 1 FROM team_member_director_desks assignment
            WHERE assignment.user_id = director_desks.user_id
              AND assignment.member_id = $3
              AND assignment.director_desk_id = director_desks.id
          ))
      `,
      [input.userId, input.deskKey, input.teamMemberId ?? null],
    );
    return row?.scene_json;
  }

  async writeScene(input: {
    userId: string;
    deskKey: string;
    scene: Record<string, unknown>;
    teamMemberId?: string | null;
    now: Date;
  }) {
    const row = await queryOne<{ desk_key: string }>(
      this.db,
      `
        UPDATE director_desks
        SET scene_json = $3::jsonb,
            updated_at = $4
        WHERE user_id = $1
          AND desk_key = $2
          AND ($5::uuid IS NULL OR EXISTS (
            SELECT 1 FROM team_member_director_desks assignment
            WHERE assignment.user_id = director_desks.user_id
              AND assignment.member_id = $5
              AND assignment.director_desk_id = director_desks.id
          ))
        RETURNING desk_key
      `,
      [input.userId, input.deskKey, JSON.stringify(input.scene), input.now, input.teamMemberId ?? null],
    );
    return Boolean(row);
  }

  async writeSceneIfEmpty(input: {
    userId: string;
    deskKey: string;
    scene: Record<string, unknown>;
    teamMemberId?: string | null;
    now: Date;
  }) {
    const row = await queryOne<{ desk_key: string }>(
      this.db,
      `
        UPDATE director_desks
        SET scene_json = $3::jsonb,
            updated_at = $4
        WHERE user_id = $1
          AND desk_key = $2
          AND scene_json = '{}'::jsonb
          AND ($5::uuid IS NULL OR EXISTS (
            SELECT 1 FROM team_member_director_desks assignment
            WHERE assignment.user_id = director_desks.user_id
              AND assignment.member_id = $5
              AND assignment.director_desk_id = director_desks.id
          ))
        RETURNING desk_key
      `,
      [input.userId, input.deskKey, JSON.stringify(input.scene), input.now, input.teamMemberId ?? null],
    );
    if (row) return true;

    const existing = await queryOne<{ desk_key: string }>(
      this.db,
      `
        SELECT desk_key
        FROM director_desks
        WHERE user_id = $1
          AND desk_key = $2
          AND ($3::uuid IS NULL OR EXISTS (
            SELECT 1 FROM team_member_director_desks assignment
            WHERE assignment.user_id = director_desks.user_id
              AND assignment.member_id = $3
              AND assignment.director_desk_id = director_desks.id
          ))
      `,
      [input.userId, input.deskKey, input.teamMemberId ?? null],
    );
    return existing ? false : undefined;
  }

  async markOpened(input: { userId: string; deskKey: string; teamMemberId?: string | null; now: Date }) {
    const row = await queryOne<DirectorDeskRow>(
      this.db,
      `
        UPDATE director_desks
        SET last_opened_at = $3
        WHERE user_id = $1
          AND desk_key = $2
          AND ($4::uuid IS NULL OR EXISTS (
            SELECT 1 FROM team_member_director_desks assignment
            WHERE assignment.user_id = director_desks.user_id
              AND assignment.member_id = $4
              AND assignment.director_desk_id = director_desks.id
          ))
        RETURNING desk_key, name, created_at, updated_at, last_opened_at
      `,
      [input.userId, input.deskKey, input.now, input.teamMemberId ?? null],
    );
    return row ? directorDeskFromRow(row) : undefined;
  }
}

function directorDeskFromRow(row: DirectorDeskRow): DirectorDeskRecord {
  return {
    id: row.desk_key,
    name: row.name,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
    lastOpenedAt: row.last_opened_at ? new Date(row.last_opened_at).toISOString() : null,
  };
}

function defaultNameForDeskKey(deskKey: string) {
  const match = deskKey.match(/^desk_(\d+)$/);
  return match ? `导演台 ${Number(match[1])} 号` : deskKey;
}
