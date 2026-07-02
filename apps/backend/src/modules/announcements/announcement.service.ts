import { randomUUID } from "node:crypto";

import type { SqlDatabase } from "../shared/db/sql.ts";
import { queryOne } from "../shared/db/sql.ts";

const allowedStatuses = new Set(["active", "inactive", "archived"]);

export function createAnnouncementService(deps: { db: SqlDatabase }) {
  async function listAnnouncements(input: { includeArchived?: boolean } = {}) {
    const result = await deps.db.query<AnnouncementRow>(
      `
        SELECT *
        FROM announcements
        WHERE ($1::boolean = true OR status <> 'archived')
        ORDER BY
          CASE status WHEN 'active' THEN 0 WHEN 'inactive' THEN 1 ELSE 2 END,
          sort_order ASC,
          updated_at DESC
      `,
      [input.includeArchived === true],
    );

    return { data: { announcements: result.rows.map(announcementFromRow) } };
  }

  async function listActiveAnnouncements(input: { now: Date }) {
    const result = await deps.db.query<AnnouncementRow>(
      `
        SELECT *
        FROM announcements
        WHERE status = 'active'
          AND (starts_at IS NULL OR starts_at <= $1)
          AND (ends_at IS NULL OR ends_at > $1)
        ORDER BY sort_order ASC, updated_at DESC, created_at DESC
      `,
      [input.now],
    );
    const announcements = result.rows.map(announcementFromRow);
    const version = announcements.reduce(
      (latest, announcement) => announcement.updatedAt > latest ? announcement.updatedAt : latest,
      "",
    );

    return { data: { announcements, version } };
  }

  async function saveAnnouncement(input: SaveAnnouncementInput): Promise<AnnouncementMutationResponse> {
    const parsed = parseSaveInput(input);
    if ("error" in parsed) {
      return parsed.error;
    }

    const announcementId = parsed.value.id ?? randomUUID();
    const row = await queryOne<AnnouncementRow>(
      deps.db,
      `
        INSERT INTO announcements (
          id,
          title,
          body,
          action_label,
          action_url,
          status,
          sort_order,
          starts_at,
          ends_at,
          created_by_admin_id,
          updated_by_admin_id,
          created_at,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10, $11, $11)
        ON CONFLICT (id)
        DO UPDATE SET
          title = EXCLUDED.title,
          body = EXCLUDED.body,
          action_label = EXCLUDED.action_label,
          action_url = EXCLUDED.action_url,
          status = EXCLUDED.status,
          sort_order = EXCLUDED.sort_order,
          starts_at = EXCLUDED.starts_at,
          ends_at = EXCLUDED.ends_at,
          updated_by_admin_id = EXCLUDED.updated_by_admin_id,
          updated_at = EXCLUDED.updated_at
        RETURNING *
      `,
      [
        announcementId,
        parsed.value.title,
        parsed.value.body,
        parsed.value.actionLabel,
        parsed.value.actionUrl,
        parsed.value.status,
        parsed.value.sortOrder,
        parsed.value.startsAt,
        parsed.value.endsAt,
        parsed.value.actorAdminAccountId,
        parsed.value.now,
      ],
    );

    return { status: 200, body: { announcement: announcementFromRow(row!) } };
  }

  async function deleteAnnouncement(input: {
    id: string;
    actorAdminAccountId?: string | null;
    now: Date;
  }): Promise<AnnouncementMutationResponse> {
    const row = await queryOne<AnnouncementRow>(
      deps.db,
      `
        UPDATE announcements
        SET status = 'archived',
            updated_by_admin_id = $2,
            updated_at = $3
        WHERE id = $1
        RETURNING *
      `,
      [String(input.id ?? "").trim(), input.actorAdminAccountId ?? null, input.now],
    );
    if (!row) {
      return error(404, "announcement_not_found", "announcement not found");
    }
    return { status: 200, body: { announcement: announcementFromRow(row) } };
  }

  return {
    listAnnouncements,
    listActiveAnnouncements,
    saveAnnouncement,
    deleteAnnouncement,
  };
}

function parseSaveInput(input: SaveAnnouncementInput) {
  const title = String(input.title ?? "").trim();
  if (!title) {
    return { error: error(400, "announcement_title_required", "announcement title is required") };
  }

  const status = String(input.status ?? "active").trim().toLowerCase();
  if (!allowedStatuses.has(status)) {
    return { error: error(400, "announcement_status_invalid", "announcement status is invalid") };
  }

  const startsAt = parseNullableDate(input.startsAt);
  if (startsAt === "invalid") {
    return { error: error(400, "announcement_starts_at_invalid", "announcement start time is invalid") };
  }

  const endsAt = parseNullableDate(input.endsAt);
  if (endsAt === "invalid") {
    return { error: error(400, "announcement_ends_at_invalid", "announcement end time is invalid") };
  }

  if (startsAt && endsAt && endsAt.getTime() <= startsAt.getTime()) {
    return { error: error(400, "announcement_time_window_invalid", "announcement end time must be after start time") };
  }

  const actionUrl = String(input.actionUrl ?? "").trim();
  if (actionUrl && !isSafeActionUrl(actionUrl)) {
    return { error: error(400, "announcement_action_url_invalid", "announcement action url is invalid") };
  }

  const sortOrder = Number(input.sortOrder ?? 100);

  return {
    value: {
      id: normalizeNullableId(input.id),
      title,
      body: String(input.body ?? ""),
      actionLabel: String(input.actionLabel ?? "").trim(),
      actionUrl,
      status: status as AnnouncementStatus,
      sortOrder: Number.isFinite(sortOrder) ? Math.round(sortOrder) : 100,
      startsAt,
      endsAt,
      actorAdminAccountId: normalizeNullableId(input.actorAdminAccountId),
      now: input.now instanceof Date && !Number.isNaN(input.now.getTime()) ? input.now : new Date(),
    },
  };
}

function parseNullableDate(value: unknown): Date | null | "invalid" {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? "invalid" : date;
}

function normalizeNullableId(value: unknown) {
  const id = String(value ?? "").trim();
  return id || null;
}

function isSafeActionUrl(value: string) {
  return (value.startsWith("/") && !value.startsWith("//")) || /^https?:\/\//i.test(value);
}

function announcementFromRow(row: AnnouncementRow): Announcement {
  return {
    id: row.id,
    title: row.title,
    body: row.body ?? "",
    actionLabel: row.action_label ?? "",
    actionUrl: row.action_url ?? "",
    status: row.status,
    sortOrder: Number(row.sort_order ?? 100),
    startsAt: isoOrNull(row.starts_at),
    endsAt: isoOrNull(row.ends_at),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

function iso(value: Date | string) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function isoOrNull(value: Date | string | null) {
  return value ? iso(value) : null;
}

function error(status: number, code: string, message: string): AnnouncementMutationResponse {
  return { status, body: { error: { code, message } } };
}

export type AnnouncementStatus = "active" | "inactive" | "archived";

export interface Announcement {
  id: string;
  title: string;
  body: string;
  actionLabel: string;
  actionUrl: string;
  status: AnnouncementStatus;
  sortOrder: number;
  startsAt: string | null;
  endsAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface AnnouncementRow {
  id: string;
  title: string;
  body: string;
  action_label: string;
  action_url: string;
  status: AnnouncementStatus;
  sort_order: number;
  starts_at: Date | string | null;
  ends_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

interface SaveAnnouncementInput {
  id?: string | null;
  title?: string | null;
  body?: string | null;
  actionLabel?: string | null;
  actionUrl?: string | null;
  status?: string | null;
  sortOrder?: number | string | null;
  startsAt?: string | Date | null;
  endsAt?: string | Date | null;
  actorAdminAccountId?: string | null;
  now?: Date;
}

type AnnouncementMutationResponse =
  | { status: number; body: { announcement: Announcement } }
  | { status: number; body: { error: { code: string; message: string } } };
