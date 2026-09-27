// node --test scripts/refine-lingxi-shot-template-quality.test.mjs
// Execute the actual publisher with a transactional database and filesystem in
// memory. The fixture contains only synthetic content and required old anchors;
// no .env, .local snapshots, PostgreSQL connection, or model call is needed.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import vm from 'node:vm';
import { test } from 'node:test';

const source = readFileSync(new URL('./refine-lingxi-shot-template-quality.mjs', import.meta.url), 'utf8')
  .replace(/^import .*;\r?\n/gm, '');
assert.doesNotMatch(source, /^import\s/m, 'Unexpected imports must not reach the test VM');
const pathFor = name => resolve('.local/run/lingxi-shot-quality-20260927-v2', name);
const ids = ['bbefb9a0-8bfa-4e3c-a46b-c6639ea3fb80', '26caeb11-2c9f-4a8d-b08d-158cf2084aef', '96bff848-7652-4238-bc65-890b73f510d0'];
const main = `# Synthetic entry
## 分镜源头精简规则（2026-09-26）
Old revision placeholder.
# Unrelated entry section
Keep this entry content.
`;
// Fixed anchors, not a copy of any complete official or private document.
const reference = `${main}
## 核心基础约束（最高优先级，禁止大模型篡改）
{必须写入柔光漫反射，光比2:1，绝对禁止硬光}
2. **防崩避坑红线** placeholder
3. **正面替换词** placeholder
**🔧 接口调用建议**：必须让AI强行 placeholder
2. **打破面瘫正反打的两大武器 placeholder
**⚠️【特殊镜头防滥用与跨段去重锁】 placeholder
⚠️【文戏对峙特权】 placeholder
4. **Z轴深度构图** placeholder
4. **30度机位平移法则** placeholder
- **空间线** placeholder
- **画面线** placeholder
8. **空间是否跳轴？** placeholder
- **⚠️长镜头复杂度红线** placeholder
*(⚠️慎用提醒与【跨段去重锁】 placeholder
1. **景别跳跃法则 placeholder
3. **动静交替公式 placeholder
2. **轨道二 placeholder
3. **精准代偿替换法** placeholder
1. **180度轴线死锁 placeholder
5. **视线与重心锁定** placeholder
**物理语速限制与长台词跨镜拆解法则** placeholder
建议每镜 2-3 秒不等 placeholder
- **光线线** placeholder
- **运镜线** placeholder
- **表演线** placeholder
- **台词线** placeholder
2. **运镜节奏与防PPT检查** placeholder
3. **时间码与长镜头去重** placeholder
6. **台词与物理语速限制** placeholder
7. **情绪防崩机制** placeholder
- **风格自适应微调 placeholder
- **最高视觉纲领建立 placeholder
- **禁止擅自续写 placeholder
系统会检测你是否处于“继承段落”。如果是，你必须执行：
- **场记继承铁律 placeholder
- **顺接起跳 placeholder
【@角色B】: 必要发型/服装/声音音色
1. **格式与长度** placeholder
- **风格线** placeholder
只补充本镜语气变化
景别、机位与必要焦段光圈 placeholder
按本段公共设定，改变景别与运镜 placeholder
**👉 【高级视听镜头写法案例参考】
【镜头 2】【00:02.5 - 00:04.5】
近景稍俯拍，85mm 画外音男主沿用既定音色：“就算逃到天涯海角，我也能把你抓回来。”
【镜头 3】【00:04.5 - 00:06】
俯拍细节特写，100mm 倒影瞬间破碎。居中构图
中景过肩平拍，50mm placeholder
- **单镜时长建议与【长镜头特权】** placeholder
**物理状态遗留**: placeholder
**【空间坐标与专属背景锁】**: placeholder
`;
const fixture = ids.map((id, index) => ({
  id, name: `Synthetic workflow ${index}`, before: {
    introduction: main.trim(), untouchedMetadata: { keep: index },
    files: [
      { name: 'SKILL.md', kind: 'instruction', content: main },
      { name: 'references/shot.md', kind: 'instruction', content: reference },
      { name: 'references/分镜.md', kind: 'instruction', content: reference },
      { name: 'references/script.md', kind: 'instruction', content: 'Unchanged screenplay instructions.' },
    ],
  },
}));

async function setup() {
  let decodeRowsForVM;
  const state = {
    files: new Map(),
    rows: new Map(fixture.map(row => [row.id, {
      id: row.id, name: row.name, detail_json: structuredClone(row.before),
      owner_user_id: null, status: 'published',
    }])),
    events: [], logs: [], failAppliedSnapshot: false,
  };
  class MockClient {
    transaction = null;
    constructor(options) { assert.equal(options.connectionString, 'mock://no-service'); }
    async connect() { state.events.push('connect'); }
    async end() { state.events.push('end'); }
    async query(sql, params = []) {
      if (sql.startsWith('SELECT set_config(')) {
        assert.equal(sql, "SELECT set_config('search_path', format('%I, pg_catalog', $1::text), false)");
        assert.deepEqual(Array.from(params), ['qa schema']);
        state.events.push('schema');
        return { rows: [] };
      }
      if (sql.startsWith('SELECT id,name,detail_json FROM skills')) {
        assert.match(sql, /id=ANY\(\$1::uuid\[\]\) AND owner_user_id IS NULL AND status='published'/);
        assert.deepEqual(Array.from(params[0]), ids);
        state.events.push('select');
        return { rows: decodeRowsForVM(JSON.stringify([...state.rows.values()])) };
      }
      if (sql === 'BEGIN') {
        assert.equal(this.transaction, null);
        this.transaction = structuredClone(state.rows);
        state.events.push('BEGIN');
        return {};
      }
      if (sql.startsWith('UPDATE skills SET detail_json=')) {
        assert.match(sql, /WHERE id=\$1 AND owner_user_id IS NULL AND status='published' AND detail_json=\$3::jsonb/);
        assert.ok(this.transaction, 'Every UPDATE must be transactional');
        state.events.push('UPDATE');
        const row = this.transaction.get(params[0]);
        if (!row || row.owner_user_id !== null || row.status !== 'published'
          || !isDeepStrictEqual(row.detail_json, JSON.parse(params[2]))) return { rowCount: 0 };
        row.detail_json = JSON.parse(params[1]);
        return { rowCount: 1 };
      }
      if (sql === 'COMMIT') {
        assert.ok(this.transaction);
        state.rows = this.transaction;
        this.transaction = null;
        state.events.push('COMMIT');
        return {};
      }
      if (sql === 'ROLLBACK') {
        this.transaction = null;
        state.events.push('ROLLBACK');
        return {};
      }
      throw new Error(`Unexpected SQL in mock: ${sql}`);
    }
  }
  state.run = async (...args) => {
    const context = vm.createContext({
      assert, Client: MockClient, resolve, createHash,
      console: { log: text => state.logs.push(JSON.parse(text)) },
      process: { argv: ['node', 'publisher', ...args], env: {
        DATABASE_URL: 'mock://no-service', DATABASE_SCHEMA: ' qa schema ',
      } },
      mkdirSync: () => {},
      existsSync: path => state.files.has(path),
      readFileSync: path => {
        if (!state.files.has(path)) throw new Error(`ENOENT ${path}`);
        return state.files.get(path);
      },
      writeFileSync: (path, content) => {
        if (path === pathFor('applied.json') && state.failAppliedSnapshot) {
          throw new Error('injected applied.json write failure');
        }
        state.files.set(path, content);
      },
    });
    // Real pg rows and the publisher share one realm; preserve that property.
    decodeRowsForVM = vm.runInContext('(text) => JSON.parse(text)', context);
    await vm.runInContext(`(async () => {${source}\n})()`, context);
  };
  await state.run();
  assert.equal(state.events.includes('UPDATE'), false, 'Drafting must not update the database');
  assert.equal(state.logs.at(-1).changedFiles, 9);
  state.changes = JSON.parse(state.files.get(pathFor('proposed.json')));
  for (const row of state.changes) {
    assert.deepEqual(row.before, fixture.find(original => original.id === row.id).before);
    assert.deepEqual(row.after.untouchedMetadata, row.before.untouchedMetadata);
    assert.deepEqual(row.after.files.filter((file, index) => !isDeepStrictEqual(file, row.before.files[index])).map(file => file.name),
      ['SKILL.md', 'references/shot.md', 'references/分镜.md']);
    assert.equal(row.after.introduction, row.after.files[0].content.trim());
    assert.match(row.after.files[1].content, /初始场记状态/);
  }
  state.files.set(pathFor('validation.json'), JSON.stringify({
    status: 'passed',
    proposalSha256: createHash('sha256').update(JSON.stringify(state.changes)).digest('hex'),
  }));
  state.events = [];
  return state;
}

function expectDetails(state, field) {
  for (const row of state.changes) assert.deepEqual(state.rows.get(row.id).detail_json, row[field]);
}

test('post-COMMIT snapshot failure recovers all workflows from the durable backup', async () => {
  const state = await setup();
  state.failAppliedSnapshot = true;
  await assert.rejects(state.run('--apply'), /injected applied.json write failure/);
  assert.ok(state.events.includes('COMMIT'), 'Failure must happen after the database commit');
  expectDetails(state, 'after');
  assert.equal(state.files.has(pathFor('applied.json')), false);
  assert.ok(state.files.has(pathFor('rollback-backup.json')));
  await state.run('--rollback');
  expectDetails(state, 'before');
  assert.deepEqual(state.logs.at(-1), { operation: 'rollback', workflows: 3, changedFiles: 9 });
  assert.ok(state.files.has(pathFor('rolled-back.json')));
});

test('backup recovery preserves concurrent edits and rolls back earlier updates atomically', async () => {
  const state = await setup();
  state.failAppliedSnapshot = true;
  await assert.rejects(state.run('--apply'), /injected applied.json write failure/);
  state.rows.get(state.changes.at(-1).id).detail_json.concurrentEdit = 'must survive';
  const beforeAttempt = structuredClone(state.rows);
  state.events = [];
  await assert.rejects(state.run('--rollback'), /Concurrent edit or ownership\/status change/);
  assert.equal(state.events.filter(event => event === 'UPDATE').length, 3);
  assert.equal(state.events.includes('COMMIT'), false);
  assert.deepEqual(state.rows, beforeAttempt);
});

test('backup recovery rejects ownership/status changes without partial restoration', async () => {
  for (const changedField of ['owner_user_id', 'status']) {
    const state = await setup();
    state.failAppliedSnapshot = true;
    await assert.rejects(state.run('--apply'), /injected applied.json write failure/);
    state.rows.get(state.changes.at(-1).id)[changedField] = changedField === 'status' ? 'disabled' : 'another-user';
    const beforeAttempt = structuredClone(state.rows);
    await assert.rejects(state.run('--rollback'), /Concurrent edit or ownership\/status change/);
    assert.deepEqual(state.rows, beforeAttempt);
  }
});

test('backup recovery checks that the snapshot matches the current bounded patch', async () => {
  const state = await setup();
  state.failAppliedSnapshot = true;
  await assert.rejects(state.run('--apply'), /injected applied.json write failure/);
  const backup = JSON.parse(state.files.get(pathFor('rollback-backup.json')));
  backup[0].after.introduction += '\nunreviewed change';
  state.files.set(pathFor('rollback-backup.json'), JSON.stringify(backup));
  const beforeAttempt = structuredClone(state.rows);
  state.events = [];
  await assert.rejects(state.run('--rollback'), { code: 'ERR_ASSERTION' });
  assert.equal(state.events.includes('BEGIN'), false);
  assert.deepEqual(state.rows, beforeAttempt);
});

test('normal rollback prefers the committed applied snapshot and restores the exact originals', async () => {
  const state = await setup();
  await state.run('--apply');
  expectDetails(state, 'after');
  state.files.set(pathFor('rollback-backup.json'), 'invalid backup must not be selected');
  await state.run('--rollback');
  expectDetails(state, 'before');
});

test('unapproved or stale validation cannot begin a publishing transaction', async () => {
  for (const validation of [{ status: 'pending' }, { status: 'passed', proposalSha256: 'wrong-draft' }]) {
    const state = await setup();
    state.files.set(pathFor('validation.json'), JSON.stringify(validation));
    await assert.rejects(state.run('--apply'), { code: 'ERR_ASSERTION' });
    assert.equal(state.events.includes('BEGIN'), false);
    expectDetails(state, 'before');
  }
});
