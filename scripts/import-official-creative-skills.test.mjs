import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { createSkillPlazaService } from '../apps/backend/src/modules/skill-plaza/skill-plaza.service.ts';
import { __canvasAgentExecutorTestUtils } from '../apps/backend/src/modules/canvas-agent/canvas-agent-executor.ts';
import { createCanvasAgentController, renderCanvasAgentPanel } from '../apps/web/src/features/new-canvas/canvas-agent-panel.js';
import { loadCreativeSkills, importCreativeSkills, publishCreativeSkills } from './import-official-creative-skills.mjs';

// Isolated PostgreSQL engine: these tests never load .env or connect to runtime services.
async function fixture() {
  const db = new PGlite();
  await db.exec('CREATE TABLE users (id uuid PRIMARY KEY); CREATE TABLE storage_objects (id uuid PRIMARY KEY);');
  await db.exec(await readFile(new URL('../packages/db/migrations/20260904-create-skill-plaza.sql', import.meta.url), 'utf8'));
  await db.exec(`
    ALTER TABLE skills ADD COLUMN is_recommended boolean NOT NULL DEFAULT false;
    ALTER TABLE skills ADD COLUMN review_comment text NOT NULL DEFAULT '';
    ALTER TABLE skills ADD COLUMN reviewed_at timestamptz;
    CREATE TABLE skill_favorites (skill_id uuid, user_id uuid);
    CREATE TABLE skill_categories (id uuid, code text, name text, short_name text,
      sort_order integer, is_visible boolean, is_system boolean, is_skill_category boolean,
      allow_user_create boolean, created_at timestamptz, updated_at timestamptz);
  `);
  return db;
}

test('dry run validates three complete packages without database configuration', async () => {
  const skills = await loadCreativeSkills();
  assert.deepEqual(skills.map(s => s.name), ['剧本医生', '镜头优化师', '短剧预告导演']);
  for (const skill of skills) {
    assert.deepEqual(skill.files.map(f => f.name), ['SKILL.md', 'output-template.md', 'examples.md']);
    assert.ok(skill.files.every(f => f.content.trim()));
    assert.ok(skill.files.reduce((sum, f) => sum + f.content.length, 0) < 10000);
  }
  const result = spawnSync(process.execPath, ['--import', 'tsx', fileURLToPath(new URL('./import-official-creative-skills.mjs', import.meta.url)), '--dry-run'], {
    encoding: 'utf8', env: { ...process.env, DATABASE_URL: 'invalid://must-not-connect' },
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /剧本医生/);
});

test('official drafts become searchable and resolve full instructions through existing service after publishing', async () => {
  const db = await fixture();
  try {
    const skills = await loadCreativeSkills();
    const rows = await importCreativeSkills(db, skills);
    assert.equal(rows.length, 3);
    assert.ok(rows.every(r => r.action === 'created' && r.status === 'draft'));
    const service = createSkillPlazaService({ db });
    assert.equal((await service.listCatalog({})).items.length, 0);
    const userId = randomUUID();
    for (const [index, row] of rows.entries()) {
      await assert.rejects(service.resolveWorkflowSkill({ skillId: row.id, userId }), /不可用/);
      await service.updateStatus({ skillId: row.id, status: 'published', reviewComment: 'Integration fixture approval' });
      const catalog = await service.listCatalog({ query: skills[index].name, category: 'recommended' });
      assert.equal(catalog.items[0]?.id, row.id);
      const resolved = await service.resolveWorkflowSkill({ skillId: row.id, userId });
      assert.equal(resolved.official, true);
      for (const file of skills[index].files) assert.ok(resolved.content.includes(file.content.trim()));
      const messages = await __canvasAgentExecutorTestUtils.buildCanvasAgentModelMessages({
        modelInput: { protocol: {}, context: {} }, modelCapabilities: {},
        canvasId: 'canvas-1', conversationId: 'conversation-1',
        actor: { ownerUserId: userId, actorTeamMemberId: null, capabilities: new Set() },
        capabilityProfile: 'media_generation_only',
        context: { messages: [{ role: 'user', content: { text: '优化这段创作', plazaSkillIds: [row.id] } }] },
        resolvePlazaSkill: request => service.resolveWorkflowSkill(request),
      });
      const system = String(messages[0].content);
      assert.ok(system.includes(`Plaza skill ${skills[index].name}:`));
      for (const file of skills[index].files) assert.ok(system.includes(file.content.trim()));
    }
  } finally { await db.close(); }
});

test('reimport preserves published edits, usage and identity; does not alter user-owned same-name skills', async () => {
  const db = await fixture();
  try {
    const skills = await loadCreativeSkills();
    const userId = randomUUID();
    await db.query('INSERT INTO users (id) VALUES ($1)', [userId]);
    await db.query('INSERT INTO skills (id, owner_user_id, name) VALUES ($1, $2, $3)', [randomUUID(), userId, skills[0].name]);
    const rows = await importCreativeSkills(db, skills);
    const service = createSkillPlazaService({ db });
    await service.updateOfficial({ skillId: rows[0].id, name: '已编辑的剧本医生', status: 'published', files: [{ name: 'SKILL.md', content: '后台定制内容' }] });
    await db.query('UPDATE skills SET usage_count = 9 WHERE id = $1', [rows[0].id]);
    const before = (await db.query('SELECT * FROM skills ORDER BY id')).rows;
    const repeated = await importCreativeSkills(db, skills);
    assert.ok(repeated.every(r => r.action === 'skipped'));
    assert.deepEqual((await db.query('SELECT * FROM skills ORDER BY id')).rows, before);
    assert.deepEqual(repeated.map(r => r.id), rows.map(r => r.id));
  } finally { await db.close(); }
});

test('same-name official conflict rolls back the entire batch', async () => {
  const db = await fixture();
  try {
    const skills = await loadCreativeSkills();
    await createSkillPlazaService({ db }).createOfficial({ name: skills[1].name });
    await assert.rejects(importCreativeSkills(db, skills), /conflict/);
    assert.equal((await db.query('SELECT count(*)::int AS count FROM skills')).rows[0].count, 1);
  } finally { await db.close(); }
});

test('a service failure rolls back earlier creations', async () => {
  const db = await fixture();
  try {
    const skills = await loadCreativeSkills();
    skills[1].detail.effectImageUrl = 'image';
    skills[1].detail.effectVideoUrl = 'video';
    await assert.rejects(importCreativeSkills(db, skills), /只能选择一个/);
    assert.equal((await db.query('SELECT count(*)::int AS count FROM skills')).rows[0].count, 0);
  } finally { await db.close(); }
});

test('ambiguous package identities fail without creating or updating records', async () => {
  const db = await fixture();
  try {
    const skills = await loadCreativeSkills();
    const service = createSkillPlazaService({ db });
    await service.createOfficial(skills[0]);
    await service.createOfficial({ ...skills[0], name: '另一个带相同导入标记的技能' });
    await assert.rejects(importCreativeSkills(db, skills), /conflict/);
    assert.equal((await db.query('SELECT count(*)::int AS count FROM skills')).rows[0].count, 2);
  } finally { await db.close(); }
});

test('CLI rejects unknown switches and writes without DATABASE_URL', () => {
  for (const args of [['--unknown'], ['--dry-run', '--apply'], ['--apply'], ['--publish']]) {
    const result = spawnSync(process.execPath, ['--import', 'tsx', fileURLToPath(new URL('./import-official-creative-skills.mjs', import.meta.url)), ...args], {
      encoding: 'utf8', env: { ...process.env, DATABASE_URL: '' },
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, args.length === 1 && ['--apply', '--publish'].includes(args[0]) ? /DATABASE_URL is required/ : /Usage:/);
    assert.equal(result.stdout, '');
  }
});

test('publish exposes all three imported official packages and is safe to repeat', async () => {
  const db = await fixture();
  try {
    const skills = await loadCreativeSkills();
    await importCreativeSkills(db, skills);
    const published = await publishCreativeSkills(db, skills);
    assert.equal(published.length, 3);
    assert.ok(published.every(row => row.action === 'published' && row.status === 'published'));
    const service = createSkillPlazaService({ db });
    const catalog = await service.listCatalog({ category: 'recommended' });
    assert.equal(catalog.items.length, 3);
    const ui = { canvasAgentCapabilityProfile: 'media_generation_only', canvasAgent: {
      promptDraft: '请检查我提供的创作内容，只交付文字方案', modelCode: 'text-pro', modelsStatus: 'ready',
      models: [{ modelCode: 'text-pro', modelLabel: '创作助手' }], generationModelsStatus: 'ready',
    } };
    const sent = [];
    const controller = createCanvasAgentController({ surface: { querySelector: () => null }, workbench: { ui, api: {
      getSkills: input => service.listCatalog(input),
      async getMySkills() { return { items: [] }; },
      async getSkillFavorites() { return { items: [] }; },
      async createFreeGenerationConversation() { return { conversation: { id: 'conversation-1' } }; },
      async sendFreeGenerationMessage(id, input) { sent.push(input.message); return { task: { id: 'task-1', status: 'queued' } }; },
    } } });
    try {
      const action = (agentAction, data = {}) => controller.handleAction({ dataset: { agentAction, ...data } });
      await action('toggle-skill-library');
      for (const item of published) {
        if (!ui.canvasAgent.skillLibraryOpen) await action('toggle-skill-library');
        controller.handleInput({ dataset: { agentField: 'skillQuery' }, value: `/${item.name}` });
        assert.ok(renderCanvasAgentPanel(ui).includes(`data-skill-id="${item.id}"`));
        await action('select-free-plaza-skill', { skillId: item.id });
      }
      await action('send');
      assert.deepEqual(sent[0].plazaSkillIds, published.map(item => item.id));
      assert.equal(sent[0].text, '请检查我提供的创作内容，只交付文字方案');
      const messages = await __canvasAgentExecutorTestUtils.buildCanvasAgentModelMessages({
        modelInput: { protocol: {}, context: {} }, modelCapabilities: {},
        canvasId: 'canvas-1', conversationId: 'conversation-1',
        actor: { ownerUserId: randomUUID(), actorTeamMemberId: null, capabilities: new Set() },
        capabilityProfile: 'media_generation_only', context: { messages: [{ role: 'user', content: sent[0] }] },
        resolvePlazaSkill: request => service.resolveWorkflowSkill(request),
      });
      for (const item of skills) for (const file of item.files) assert.ok(String(messages[0].content).includes(file.content));
      ui.canvasAgent.status = 'succeeded';
      await action('remove-free-plaza-skill', { skillId: published[1].id });
      ui.canvasAgent.promptDraft = '继续，暂时不优化镜头';
      await action('send');
      assert.deepEqual(sent[1].plazaSkillIds, [published[0].id, published[2].id]);
    } finally { controller.dispose(); }
    const before = (await db.query('SELECT * FROM skills ORDER BY id')).rows;
    assert.ok((await publishCreativeSkills(db, skills)).every(row => row.action === 'skipped'));
    assert.deepEqual((await db.query('SELECT * FROM skills ORDER BY id')).rows, before);
  } finally { await db.close(); }
});

test('publish refuses missing, edited, or disabled packages and rolls back earlier publication', async () => {
  for (const mutation of ['missing', 'edited', 'disabled']) {
    const db = await fixture();
    try {
      const skills = await loadCreativeSkills();
      const imported = await importCreativeSkills(db, skills);
      const id = imported[1].id;
      if (mutation === 'missing') await db.query('DELETE FROM skills WHERE id = $1', [id]);
      if (mutation === 'edited') await db.query("UPDATE skills SET detail_json = jsonb_set(detail_json, '{files,0,content}', '\"后台新内容\"'::jsonb) WHERE id = $1", [id]);
      if (mutation === 'disabled') await db.query("UPDATE skills SET status = 'disabled' WHERE id = $1", [id]);
      const before = (await db.query('SELECT * FROM skills ORDER BY id')).rows;
      await assert.rejects(publishCreativeSkills(db, skills), /Official Skill publish conflict/);
      assert.deepEqual((await db.query('SELECT * FROM skills ORDER BY id')).rows, before);
    } finally { await db.close(); }
  }
});

test('retry after a lost commit acknowledgement does not duplicate committed records', async () => {
  const db = await fixture();
  try {
    const skills = await loadCreativeSkills();
    const uncertainConnection = { async query(sql, params) {
      const result = await db.query(sql, params);
      if (sql === 'COMMIT') throw new Error('simulated lost commit acknowledgement');
      return result;
    } };
    await assert.rejects(importCreativeSkills(uncertainConnection, skills), /lost commit acknowledgement/);
    assert.equal((await db.query('SELECT count(*)::int AS count FROM skills')).rows[0].count, 3);
    const retry = await importCreativeSkills(db, skills);
    assert.ok(retry.every(row => row.action === 'skipped'));
    assert.equal((await db.query('SELECT count(*)::int AS count FROM skills')).rows[0].count, 3);
  } finally { await db.close(); }
});
