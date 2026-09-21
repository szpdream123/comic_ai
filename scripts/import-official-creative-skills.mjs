import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { createSkillPlazaService } from '../apps/backend/src/modules/skill-plaza/skill-plaza.service.ts';

const catalogRoot = new URL('../packages/skills/official-creative/', import.meta.url);
const fileKinds = { 'SKILL.md': 'instruction', 'output-template.md': 'template', 'examples.md': 'example' };

export async function loadCreativeSkills() {
  const catalog = JSON.parse(await readFile(new URL('catalog.json', catalogRoot), 'utf8'));
  if (!Array.isArray(catalog) || catalog.length !== 3) throw new Error('Expected three creative Skill packages');
  const keys = new Set();
  const names = new Set();
  const packages = [];
  for (const entry of catalog) {
    if (!/^[a-z]+(?:-[a-z]+)*$/.test(entry.key) || keys.has(entry.key) || names.has(entry.name)) {
      throw new Error('Invalid or duplicate creative Skill key/name');
    }
    for (const field of ['name', 'summary', 'version', 'usageScene', 'howToUse', 'outputContent']) {
      if (typeof entry[field] !== 'string' || !entry[field].trim()) throw new Error(`Missing ${field}: ${entry.key}`);
    }
    if (entry.name.length > 80 || entry.summary.length > 30 || entry.category !== 'short-drama') {
      throw new Error(`Invalid catalog metadata: ${entry.key}`);
    }
    keys.add(entry.key);
    names.add(entry.name);
    const files = [];
    for (const [name, kind] of Object.entries(fileKinds)) {
      const content = (await readFile(new URL(`${entry.key}/${name}`, catalogRoot), 'utf8')).trim();
      if (!content) throw new Error(`Empty Skill file: ${entry.key}/${name}`);
      files.push({ name, kind, content });
    }
    // All markdown files are injected by the existing Skill resolver; keep the full bundle compact.
    if (files.reduce((sum, file) => sum + file.content.length, 0) > 10000) {
      throw new Error(`Skill instruction budget exceeded: ${entry.key}`);
    }
    packages.push({
      name: entry.name, summary: entry.summary, category: entry.category,
      isRecommended: true, files,
      detail: {
        bundledSkillKey: `official-creative/${entry.key}`, bundledSkillVersion: entry.version,
        introduction: files[0].content, usageScene: entry.usageScene,
        howToUse: entry.howToUse, outputContent: entry.outputContent, fileListPublic: true,
      },
    });
  }
  return packages;
}

// db must be one dedicated connection: every read/create participates in the same transaction.
export async function importCreativeSkills(db, packages) {
  await db.query('BEGIN');
  try {
    await db.query("SET LOCAL lock_timeout = '5s'");
    // Serializes this short batch with other imports and admin writes, without a schema change.
    await db.query('LOCK TABLE skills IN SHARE ROW EXCLUSIVE MODE');
    const service = createSkillPlazaService({ db });
    const results = [];
    for (const item of packages) {
      const existing = await db.query(
        `SELECT id, name, status, detail_json FROM skills WHERE owner_user_id IS NULL
         AND (detail_json->>'bundledSkillKey' = $1 OR name = $2)`,
        [item.detail.bundledSkillKey, item.name],
      );
      if (existing.rows.length) {
        const match = existing.rows[0];
        if (existing.rows.length !== 1 || match.detail_json.bundledSkillKey !== item.detail.bundledSkillKey) {
          throw new Error(`Official Skill conflict: ${item.name}; resolve in admin before retrying`);
        }
        results.push({ id: match.id, name: match.name, status: match.status, action: 'skipped',
          installedVersion: match.detail_json.bundledSkillVersion, packageVersion: item.detail.bundledSkillVersion });
        continue;
      }
      const created = await service.createOfficial({ ...item, status: 'draft' });
      results.push({ id: created.id, name: created.name, status: created.status, action: 'created' });
    }
    await db.query('COMMIT');
    return results;
  } catch (error) {
    await db.query('ROLLBACK').catch(() => undefined);
    throw error;
  }
}

// Publish only the reviewed, unchanged drafts from this bundle. Never revive disabled Skills.
export async function publishCreativeSkills(db, packages) {
  await db.query('BEGIN');
  try {
    await db.query("SET LOCAL lock_timeout = '5s'");
    await db.query('LOCK TABLE skills, skill_files IN SHARE ROW EXCLUSIVE MODE');
    const service = createSkillPlazaService({ db });
    const results = [];
    for (const item of packages) {
      const existing = await db.query(
        `SELECT skill.*, (SELECT count(*) FROM skill_files WHERE skill_id = skill.id) AS attached_files
         FROM skills skill WHERE owner_user_id IS NULL
         AND (detail_json->>'bundledSkillKey' = $1 OR name = $2)`,
        [item.detail.bundledSkillKey, item.name],
      );
      const match = existing.rows[0];
      if (existing.rows.length !== 1 || match.detail_json.bundledSkillKey !== item.detail.bundledSkillKey) {
        throw new Error(`Official Skill publish conflict: ${item.name}; import and check its identity first`);
      }
      if (match.status === 'published' && match.visibility === 'public') {
        results.push({ id: match.id, name: match.name, status: match.status, action: 'skipped' });
        continue;
      }
      const expectedDetail = { ...item.detail, files: item.files, effectImageUrl: '', effectVideoUrl: '' };
      if (match.status !== 'draft' || match.name !== item.name || match.summary !== item.summary
        || match.category !== item.category || match.is_recommended !== item.isRecommended
        || Number(match.attached_files) !== 0 || !isDeepStrictEqual(match.detail_json, expectedDetail)) {
        throw new Error(`Official Skill publish conflict: ${item.name}; content or status changed, review in admin`);
      }
      const published = await service.updateStatus({ skillId: match.id, status: 'published',
        reviewComment: `官方创作 Skill ${item.detail.bundledSkillVersion}：自由会话接入审核通过` });
      results.push({ id: published.id, name: published.name, status: published.status, action: 'published' });
    }
    await db.query('COMMIT');
    return results;
  } catch (error) {
    await db.query('ROLLBACK').catch(() => undefined);
    throw error;
  }
}

async function main(args) {
  if (args.length > 1 || (args.length === 1 && !['--apply', '--publish', '--dry-run'].includes(args[0]))) {
    throw new Error('Usage: node --import tsx scripts/import-official-creative-skills.mjs [--dry-run|--apply|--publish]');
  }
  const packages = await loadCreativeSkills();
  if (!['--apply', '--publish'].includes(args[0])) {
    console.log(JSON.stringify({ mode: 'dry-run', skills: packages.map(p => ({ name: p.name, category: p.category,
      status: 'draft', files: p.files.map(f => f.name), characters: p.files.reduce((sum, f) => sum + f.content.length, 0) })) }, null, 2));
    return;
  }
  if (!process.env.DATABASE_URL?.trim()) throw new Error('DATABASE_URL is required; run with --env-file=.env');
  const { Pool } = await import('pg');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10000 });
  let client;
  try {
    client = await pool.connect();
    const schema = process.env.DATABASE_SCHEMA?.trim();
    if (schema) await client.query("SELECT set_config('search_path', $1, false)", [`"${schema.replaceAll('"', '""')}"`]);
    const results = await (args[0] === '--publish' ? publishCreativeSkills : importCreativeSkills)(client, packages);
    console.log(JSON.stringify({ mode: args[0].slice(2), skills: results }, null, 2));
  } catch (error) {
    // Database errors can contain credentials, connection strings or stored content.
    const conflict = error instanceof Error && /^Official Skill (?:publish )?conflict:/.test(error.message);
    const code = /^[A-Z0-9_]{2,40}$/.test(String(error?.code ?? '')) ? ` [${error.code}]` : '';
    throw new Error(conflict ? error.message : `Official Skill import could not be confirmed${code} (PostgreSQL: DATABASE_URL / DATABASE_SCHEMA). Check the database before retrying.`);
  } finally {
    client?.release();
    await pool.end();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch(error => { console.error(error.message); process.exitCode = 1; });
}
