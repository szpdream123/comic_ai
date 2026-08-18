import type { MarketingSourceAdapter, MarketingSourceManifest } from "../ports/marketing-source.ts";
import type { SqlDatabase } from "../../shared/db/sql.ts";

export type ComicMarketingSourceReader = {
  readMarketingSnapshot(input: { projectId: string; version: string }): Promise<Record<string, unknown>>;
};

/** The only marketing boundary intended to read Comic project data. */
export class ComicMarketingSourceAdapter implements MarketingSourceAdapter {
  constructor(private readonly reader: ComicMarketingSourceReader) {}

  async toManifest(input: unknown): Promise<MarketingSourceManifest> {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      throw new Error("marketing_comic_source_invalid");
    }
    const source = input as Record<string, unknown>;
    const projectId = typeof source.projectId === "string" ? source.projectId.trim() : "";
    const version = typeof source.version === "string" ? source.version.trim() : "";
    if (!projectId || !version) throw new Error("marketing_comic_source_identity_required");
    const snapshot = await this.reader.readMarketingSnapshot({ projectId, version });
    return {
      namespace: "comic_internal",
      recordId: projectId,
      version,
      snapshot: structuredClone(snapshot),
      authorizationStatus: "owned",
    };
  }
}

type ComicBrandAssetRow = {
  id: string;
  asset_type: string;
  display_name: string;
  role: string | null;
  text_content: string | null;
  storage_object_id: string | null;
  metadata_json: Record<string, unknown>;
};

/** Comic-specific reader kept behind the adapter boundary; marketing tables receive only its snapshot. */
export class SqlComicMarketingSourceReader implements ComicMarketingSourceReader {
  constructor(private readonly db: SqlDatabase) {}

  async readMarketingSnapshot(input: { projectId: string; version: string }): Promise<Record<string, unknown>> {
    const project = await this.db.query<{
      id: string;
      owner_user_id: string;
      name: string;
      aspect_ratio: string;
      resolution: string;
      project_style_code: string;
      phase: string;
      brand_kit_id: string | null;
      updated_at: Date;
    }>(
      `SELECT id, owner_user_id, name, aspect_ratio, resolution, project_style_code, phase, brand_kit_id, updated_at
       FROM projects WHERE id = $1`,
      [input.projectId],
    );
    const row = project.rows[0];
    if (!row) throw new Error("marketing_comic_project_not_found");
    const documents = await this.db.query<{ id: string; status: string; input_text: string; updated_at: Date }>(
      `SELECT id, status, input_text, updated_at
       FROM project_source_documents
       WHERE project_id = $1 AND status IN ('ready', 'parsed')
       ORDER BY updated_at DESC, id DESC LIMIT 5`,
      [input.projectId],
    );
    const brandKits = row.brand_kit_id
      ? await this.db.query<{ id: string; name: string; guidance_text: string | null; updated_at: Date }>(
          `SELECT id, name, guidance_text, updated_at
           FROM creator_brand_kits WHERE id = $1 AND admin_user_id = $2`,
          [row.brand_kit_id, row.owner_user_id],
        )
      : { rows: [] };
    const brandKit = brandKits.rows[0];
    const assets = brandKit
      ? await this.db.query<ComicBrandAssetRow>(
          `SELECT id, asset_type, display_name, role, text_content, storage_object_id, metadata_json
           FROM creator_brand_kit_assets WHERE kit_id = $1
           ORDER BY asset_type, sort_order, created_at, id`,
          [brandKit.id],
        )
      : { rows: [] as ComicBrandAssetRow[] };
    return {
      project: {
        id: row.id,
        ownerUserId: row.owner_user_id,
        name: row.name,
        aspectRatio: row.aspect_ratio,
        resolution: row.resolution,
        styleCode: row.project_style_code,
        phase: row.phase,
        updatedAt: new Date(row.updated_at).toISOString(),
      },
      sourceDocuments: documents.rows.map((document) => ({
        id: document.id,
        status: document.status,
        content: document.input_text,
        updatedAt: new Date(document.updated_at).toISOString(),
      })),
      brandProfile: brandKit ? {
        brandKitId: brandKit.id,
        name: brandKit.name,
        guidance: brandKit.guidance_text,
        updatedAt: new Date(brandKit.updated_at).toISOString(),
        assets: assets.rows.map((asset) => ({
          id: asset.id,
          type: asset.asset_type,
          name: asset.display_name,
          role: asset.role,
          text: asset.text_content,
          storageObjectId: asset.storage_object_id,
          metadata: asset.metadata_json,
        })),
      } : null,
      requestedVersion: input.version,
    };
  }
}
