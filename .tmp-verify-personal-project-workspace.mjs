import { createMigratedTestDb } from './apps/backend/src/modules/shared/db/test-db.ts';
import { createPhoneAuthDevServer } from './apps/backend/src/entrypoints/phone-auth-dev-server.ts';
import assert from 'node:assert/strict';

async function login(origin, phone) {
  const requestResponse = await fetch(`${origin}/api/auth/code/request`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ phone }) });
  const requested = await requestResponse.json();
  const debugResponse = await fetch(`${origin}/api/auth/dev/challenges/${requested.challengeId}`);
  const debug = await debugResponse.json();
  const verifyResponse = await fetch(`${origin}/api/auth/code/verify`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ challengeId: requested.challengeId, phone, code: debug.code }) });
  assert.equal(verifyResponse.status, 200);
  return verifyResponse.headers.get('set-cookie') ?? '';
}

const db = await createMigratedTestDb();
const server = createPhoneAuthDevServer({ db });
try {
  await server.listen(0);
  const cookie = await login(server.origin, '13800138000');
  const createResponse = await fetch(`${server.origin}/api/creator/project/create`, { method: 'POST', headers: { 'content-type': 'application/json', 'idempotency-key': 'verify-personal-project-workspace', cookie }, body: JSON.stringify({ name: 'Personal workspace project', scriptInput: 'Episode 1', aspectRatio: '9:16', resolution: '1080p' }) });
  const created = await createResponse.json();
  const projectsResponse = await fetch(`${server.origin}/api/creator/projects`, { headers: { cookie } });
  const projects = await projectsResponse.json();
  const counts = await db.query(`select (select count(*)::int from projects where workspace_id = '20000000-0000-4000-8000-000000000001') as team_count, (select workspace_id from projects where id=$1) as project_workspace_id`, [created.project.id]);
  console.log(JSON.stringify({ createStatus: createResponse.status, projectCount: projects.projects?.length, createdProjectListed: projects.projects?.some(p => p.id === created.project.id), counts: counts.rows[0] }, null, 2));
} finally {
  await server.close();
}
