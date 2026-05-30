# Team Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first real team-management vertical slice: paid member creation, team roles, member groups, project assignments, credit adjustments, overview metrics, and a polished workbench UI.

**Architecture:** Keep team ownership inside the backend organization module, expose creator-facing team API routes, and let the existing `library-team` frontend consume server state. The backend remains the source of truth for entitlements, seats, role capabilities, member-group boundaries, project assignment, and credit adjustments.

**Tech Stack:** TypeScript, Node test runner, PGlite migrations, plain ESM frontend modules, current workbench CSS.

---

## File Structure

- Create `apps/backend/src/modules/organization/team-roles.ts`: team business role keys, display metadata, and capability templates.
- Create `apps/backend/src/modules/organization/team.service.ts`: team overview, member CRUD, group CRUD, project assignment, credit adjustment, and dashboard read methods.
- Create `apps/backend/src/modules/organization/tests/team-roles.spec.ts`: role capability matrix unit tests.
- Create `apps/backend/src/modules/organization/tests/team.service.spec.ts`: service tests for entitlement, seats, boundaries, and credit records.
- Create `apps/backend/src/modules/identity/team-account-credentials.service.ts`: temporary-password generation, salted password hashing, and reset helpers for team subaccounts.
- Create `apps/backend/src/modules/identity/tests/team-account-credentials.spec.ts`: credential hashing and one-time password safety tests.
- Modify `packages/contracts/domain/capabilities.ts`: add team and production capability strings while preserving existing P0 exports.
- Modify `apps/backend/src/modules/organization/actor-context.service.ts`: support `sub_account`, attach team profile metadata, and calculate team capabilities.
- Modify `packages/db/migrations/0001_foundation.sql`: add team tables and project group ownership.
- Modify `apps/backend/src/modules/shared/db/tests/foundation-schema.spec.ts`: assert new schema and constraints.
- Modify `apps/backend/src/modules/project/creator-application.service.ts`: delegate team application calls to `team.service.ts`.
- Modify `apps/backend/src/entrypoints/phone-auth-dev-server.ts`: add `/api/creator/team/*` routes.
- Modify `apps/backend/src/entrypoints/tests/phone-auth-dev-server.spec.ts`: cover API entitlement gate, create-member success, and no credential leakage outside the create/reset response.
- Create `apps/web/src/features/library-team/team-member-dialog.js`: create-member form and one-time credential success state.
- Create `apps/web/src/features/library-team/team-dashboard-page.js`: member/project/ranking dashboard renderer.
- Create `apps/web/src/features/library-team/team-formatters.js`: role, status, date, credit, and entitlement formatting helpers.
- Modify `apps/web/src/features/library-team/team-page.js`: replace fixture-only member section with server-backed overview, table, gates, and dialog mounting.
- Modify `apps/web/src/features/library-team/member-rules-modal.js`: render UTF-8-safe role matrix from role metadata.
- Modify `apps/web/src/features/library-team/team-fixtures.js`: keep only fallback empty states and date shortcuts.
- Modify `apps/web/src/features/library-team/library-team.css`: refined product UI for team management, create-member form, table states, and dashboard.
- Modify `apps/web/src/features/production-workbench/index.js`: fetch team state, branch create-member action by entitlement/seat/permission, submit forms.
- Modify `apps/web/src/features/production-workbench/project-detail.js`: pass team state and dialog state into `renderLibraryTeam`.
- Modify `apps/web/src/shared/creator-api.js`: add team API client methods.
- Modify `apps/web/tests/assets-team-commercial-qa.spec.ts` or add `apps/web/tests/team-module.spec.ts`: frontend render and interaction coverage.

## Task 1: Backend Role And Capability Contract

**Files:**
- Modify: `packages/contracts/domain/capabilities.ts`
- Create: `apps/backend/src/modules/organization/team-roles.ts`
- Create: `apps/backend/src/modules/organization/tests/team-roles.spec.ts`

- [ ] **Step 1: Write the failing role matrix test**

Add `apps/backend/src/modules/organization/tests/team-roles.spec.ts`:

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { capabilities } from "../../../../../../packages/contracts/domain/capabilities.ts";
import {
  getTeamRoleCapabilities,
  teamBusinessRoles,
} from "../team-roles.ts";

describe("team roles", () => {
  it("gives admins full team management capabilities", () => {
    const adminCapabilities = getTeamRoleCapabilities("admin");

    assert.ok(adminCapabilities.includes(capabilities.teamMemberManageAll));
    assert.ok(adminCapabilities.includes(capabilities.teamGroupCreate));
    assert.ok(adminCapabilities.includes(capabilities.teamCreditAllocateAll));
    assert.ok(adminCapabilities.includes(capabilities.teamDashboardViewAll));
    assert.ok(adminCapabilities.includes(capabilities.episodeAssetDelete));
  });

  it("keeps group admins inside group-scoped management", () => {
    const groupAdminCapabilities = getTeamRoleCapabilities("group_admin");

    assert.ok(groupAdminCapabilities.includes(capabilities.teamMemberManageGroup));
    assert.ok(groupAdminCapabilities.includes(capabilities.teamCreditAllocateGroup));
    assert.ok(groupAdminCapabilities.includes(capabilities.teamDashboardViewGroup));
    assert.equal(groupAdminCapabilities.includes(capabilities.teamGroupCreate), false);
    assert.equal(groupAdminCapabilities.includes(capabilities.teamMemberManageAll), false);
  });

  it("keeps production roles away from team management", () => {
    const directorCapabilities = getTeamRoleCapabilities("director");

    assert.ok(directorCapabilities.includes(capabilities.projectView));
    assert.ok(directorCapabilities.includes(capabilities.scriptAssetCreate));
    assert.ok(directorCapabilities.includes(capabilities.episodeAssetCreate));
    assert.equal(directorCapabilities.includes(capabilities.teamMemberManageAll), false);
    assert.equal(directorCapabilities.includes(capabilities.teamCreditAllocateGroup), false);
  });

  it("defines all eight first-phase business roles", () => {
    assert.deepEqual(
      teamBusinessRoles.map((role) => role.key),
      [
        "admin",
        "group_admin",
        "director_plus",
        "animator_plus",
        "director",
        "animator",
        "screenwriter",
        "editor",
      ],
    );
  });
});
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```bash
npm test -- apps/backend/src/modules/organization/tests/team-roles.spec.ts
```

Expected: FAIL because `team-roles.ts` and the new capability keys do not exist.

- [ ] **Step 3: Add capability keys**

In `packages/contracts/domain/capabilities.ts`, extend `capabilities` with these keys:

```ts
  projectView: "project:view",
  projectEditInfo: "project:edit_info",
  projectAssignMember: "project:assign_member",
  teamMemberRead: "team:member:read",
  teamMemberManageAll: "team:member:manage_all",
  teamMemberManageGroup: "team:member:manage_group",
  teamGroupCreate: "team:group:create",
  teamGroupUpdate: "team:group:update",
  teamGroupDelete: "team:group:delete",
  teamCreditAllocateAll: "team:credit:allocate_all",
  teamCreditAllocateGroup: "team:credit:allocate_group",
  teamDashboardViewAll: "team:dashboard:view_all",
  teamDashboardViewGroup: "team:dashboard:view_group",
  novelAdaptScript: "novel:adapt_script",
  scriptAssetCreate: "script_asset:create",
  scriptAssetDownload: "script_asset:download",
  scriptAssetDelete: "script_asset:delete",
  characterScenePropCreate: "character_scene_prop:create",
  characterScenePropEdit: "character_scene_prop:edit",
  characterScenePropDownload: "character_scene_prop:download",
  characterScenePropDelete: "character_scene_prop:delete",
  episodeAssetCreate: "episode_asset:create",
  episodeAssetEdit: "episode_asset:edit",
  episodeAssetDownload: "episode_asset:download",
  episodeAssetDelete: "episode_asset:delete",
  toolboxUse: "toolbox:use",
  teamKnowledgeTemplateCreate: "team_knowledge_template:create",
  teamKnowledgeTemplateEdit: "team_knowledge_template:edit",
  teamKnowledgeTemplateUse: "team_knowledge_template:use",
  teamKnowledgeTemplateDelete: "team_knowledge_template:delete",
```

Keep `p0Capabilities = Object.values(capabilities)` for now so existing owner/admin behavior remains broad and backwards-compatible.

- [ ] **Step 4: Add role metadata and templates**

Create `apps/backend/src/modules/organization/team-roles.ts` with role keys, labels, and `getTeamRoleCapabilities(role)`.

- [ ] **Step 5: Run the role test and verify GREEN**

Run:

```bash
npm test -- apps/backend/src/modules/organization/tests/team-roles.spec.ts
```

Expected: PASS.

## Task 2: Schema For Team Members, Groups, Seats, And Credit Adjustments

**Files:**
- Modify: `packages/db/migrations/0001_foundation.sql`
- Modify: `apps/backend/src/modules/shared/db/tests/foundation-schema.spec.ts`

- [ ] **Step 1: Write failing schema assertions**

In `foundation-schema.spec.ts`, extend the table list assertion with:

```ts
"team_member_groups",
"team_member_profiles",
"team_project_assignments",
"team_credit_adjustments",
"team_plan_limits",
```

Add a new test:

```ts
it("models team member management and paid plan limits", async () => {
  const db = await createMigratedTestDb();
  try {
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
      "business_role",
      "member_group_id",
      "credit_balance_cached",
      "credit_used_cached",
      "last_credit_consumed_at",
      "remark",
      "created_by_user_id",
      "created_at",
      "updated_at",
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
```

- [ ] **Step 2: Run schema tests and verify RED**

Run:

```bash
npm test -- apps/backend/src/modules/shared/db/tests/foundation-schema.spec.ts
```

Expected: FAIL because the new tables do not exist.

- [ ] **Step 3: Add migration tables**

In `0001_foundation.sql`, add the five tables after `organization_entitlements` so the team feature stays near entitlements and before asset/project-heavy tables.

- [ ] **Step 4: Add project group ownership column**

Add `member_group_id uuid NULL REFERENCES team_member_groups(id)` to `projects` if the migration order permits. If project creation appears before groups in this migration, use a separate `team_project_ownerships` table instead:

```sql
CREATE TABLE team_project_ownerships (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  project_id uuid NOT NULL REFERENCES projects(id),
  member_group_id uuid NULL REFERENCES team_member_groups(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, workspace_id, project_id),
  FOREIGN KEY (organization_id, workspace_id)
    REFERENCES workspaces (organization_id, id)
);
```

- [ ] **Step 5: Run schema tests and verify GREEN**

Run:

```bash
npm test -- apps/backend/src/modules/shared/db/tests/foundation-schema.spec.ts
```

Expected: PASS.

## Task 3: Actor Context Team Profiles And Capability Resolution

**Files:**
- Modify: `apps/backend/src/modules/organization/actor-context.service.ts`
- Modify: `apps/backend/src/modules/organization/tests/actor-context.spec.ts`
- Modify: `apps/backend/src/modules/organization/tests/tenant-permission.spec.ts`

- [ ] **Step 1: Write failing subaccount actor test**

Add an `actor-context.spec.ts` case that seeds a `sub_account` membership with `team_member_profiles.business_role = 'group_admin'` and expects `teamMemberManageGroup`, not `teamMemberManageAll`.

- [ ] **Step 2: Run actor tests and verify RED**

Run:

```bash
npm test -- apps/backend/src/modules/organization/tests/actor-context.spec.ts
```

Expected: FAIL because `sub_account` is not a valid membership role and team profiles are not read.

- [ ] **Step 3: Extend actor context**

Update `MembershipRole` to include `sub_account`. Add optional actor fields:

```ts
teamProfile?: {
  membershipId: string;
  businessRole: TeamBusinessRole;
  memberGroupId: string | null;
  teamAccount: string;
};
```

When membership role is `sub_account`, join `team_member_profiles` and merge `getTeamRoleCapabilities(profile.business_role)`.

- [ ] **Step 4: Preserve existing role behavior**

Keep existing owner/admin, producer, creator, viewer tests passing. Add `projectView` to viewer if project read is introduced.

- [ ] **Step 5: Run actor and tenant permission tests**

Run:

```bash
npm test -- apps/backend/src/modules/organization/tests/actor-context.spec.ts apps/backend/src/modules/organization/tests/tenant-permission.spec.ts
```

Expected: PASS.

## Task 4: Team Service Entitlement And Seat Gates

**Files:**
- Create: `apps/backend/src/modules/organization/team.service.ts`
- Create: `apps/backend/src/modules/organization/tests/team.service.spec.ts`
- Create: `apps/backend/src/modules/identity/team-account-credentials.service.ts`
- Create: `apps/backend/src/modules/identity/tests/team-account-credentials.spec.ts`

- [ ] **Step 1: Write failing credential safety tests**

Create `apps/backend/src/modules/identity/tests/team-account-credentials.spec.ts`:

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  createTeamTemporaryCredential,
  verifyTeamCredential,
} from "../team-account-credentials.service.ts";

describe("team account credentials", () => {
  it("returns a temporary password once and stores only a salted hash", async () => {
    const credential = await createTeamTemporaryCredential();

    assert.match(credential.temporaryPassword, /^[A-Za-z0-9_-]{18,}$/);
    assert.match(credential.passwordHash, /^scrypt:v1:/);
    assert.notEqual(credential.passwordHash, credential.temporaryPassword);
    assert.equal(
      await verifyTeamCredential({
        password: credential.temporaryPassword,
        passwordHash: credential.passwordHash,
      }),
      true,
    );
    assert.equal(
      await verifyTeamCredential({
        password: `${credential.temporaryPassword}x`,
        passwordHash: credential.passwordHash,
      }),
      false,
    );
  });
});
```

- [ ] **Step 2: Run credential tests and verify RED**

Run:

```bash
npm test -- apps/backend/src/modules/identity/tests/team-account-credentials.spec.ts
```

Expected: FAIL because `team-account-credentials.service.ts` does not exist.

- [ ] **Step 3: Implement salted temporary credentials**

Create `apps/backend/src/modules/identity/team-account-credentials.service.ts`.

Use `node:crypto` `randomBytes` for temporary password generation and `scrypt` with a per-password salt for hashing. Store hashes as `scrypt:v1:<saltBase64url>:<hashBase64url>`. Do not log or persist the plaintext temporary password outside the create/reset return object.

- [ ] **Step 4: Run credential tests and verify GREEN**

Run:

```bash
npm test -- apps/backend/src/modules/identity/tests/team-account-credentials.spec.ts
```

Expected: PASS.

- [ ] **Step 5: Write failing entitlement and seat tests**

Create tests for:

- missing `team_member_management` rejects create member with `team_member_management_required`
- active entitlement and available seat creates a member profile
- active entitlement and full seat limit rejects with `team_seat_limit_reached`
- created member stores a `users.password_hash` that does not equal the returned temporary password

- [ ] **Step 6: Run service tests and verify RED**

Run:

```bash
npm test -- apps/backend/src/modules/organization/tests/team.service.spec.ts
```

Expected: FAIL because service does not exist.

- [ ] **Step 7: Implement service errors and helpers**

In `team.service.ts`, define `TeamServiceError` with codes:

```ts
"team_member_management_required"
"team_seat_limit_reached"
"team_permission_missing"
"team_account_duplicate"
"team_group_limit_reached"
"team_group_scope_violation"
"team_project_scope_violation"
"team_credit_insufficient"
"team_member_disabled"
```

Add helper functions:

- `resolveActiveEntitlement`
- `resolvePlanLimits`
- `countActiveSubaccounts`
- `assertCanManageAllOrGroup`
- `createTeamTemporaryCredential`

- [ ] **Step 8: Implement `createTeamMember`**

The method should:

1. require `team_member_management`
2. require `teamMemberManageAll` or group-scoped equivalent
3. check `team_plan_limits.seat_limit`
4. create a user row with `phone_e164 = NULL`, `email = NULL`, `display_name`, and a salted `password_hash` from `createTeamTemporaryCredential`
5. store the unique team login identifier only in `team_member_profiles.team_account`
6. create `memberships.role = 'sub_account'`
7. create `team_member_profiles`
8. insert project assignments
9. insert initial credit adjustment if amount > 0, after validating available allocatable credits
10. return temporary password once

Do not create fake phone numbers or fake external emails for subaccounts.

Wrap user creation, membership creation, profile creation, project assignment, credit adjustment, and audit writes in one database transaction. A failure after credential generation must not leave a partial active subaccount.

- [ ] **Step 9: Run service tests and verify GREEN**

Run:

```bash
npm test -- apps/backend/src/modules/organization/tests/team.service.spec.ts
```

Expected: PASS.

## Task 5: Groups, Project Assignments, Credit Adjustments, And Overview

**Files:**
- Modify: `apps/backend/src/modules/organization/team.service.ts`
- Modify: `apps/backend/src/modules/organization/tests/team.service.spec.ts`

- [ ] **Step 1: Add failing service tests**

Add tests for:

- group admin cannot manage a member outside their group
- changing member group clears project assignments and preserves credits
- deleting a group moves members to team-direct and clears assignments
- credit allocation writes a `team_credit_adjustments` row
- disabled members cannot receive credits
- overview returns entitlement, seats used, seats limit, remaining allocatable credits, and member counts

- [ ] **Step 2: Run service tests and verify RED**

Run:

```bash
npm test -- apps/backend/src/modules/organization/tests/team.service.spec.ts
```

Expected: FAIL on the newly added behaviors.

- [ ] **Step 3: Implement group and credit methods**

Implement:

- `createMemberGroup`
- `updateMemberGroup`
- `deleteMemberGroup`
- `assignMemberProjects`
- `adjustMemberCredits`
- `getTeamOverview`

Credit changes must run in a transaction. Allocation must verify organization available credits before increasing a member balance. Recovery must verify the target member has enough unused allocated credits before moving credits back to the team pool. Every successful allocation or recovery must write `team_credit_adjustments`; if a corresponding `credit_ledger_entries` fact is created, keep it idempotent with a stable `source_type` and `source_id`.

- [ ] **Step 4: Run service tests and verify GREEN**

Run:

```bash
npm test -- apps/backend/src/modules/organization/tests/team.service.spec.ts
```

Expected: PASS.

## Task 6: Creator API Routes

**Files:**
- Modify: `apps/backend/src/modules/project/creator-application.service.ts`
- Modify: `apps/backend/src/entrypoints/phone-auth-dev-server.ts`
- Modify: `apps/backend/src/entrypoints/tests/phone-auth-dev-server.spec.ts`

- [ ] **Step 1: Write failing route tests**

Add route tests for:

- `GET /api/creator/team/overview` returns entitlement and seat status
- `POST /api/creator/team/members` without entitlement returns a structured error
- `POST /api/creator/team/members` with entitlement returns member and one-time credential
- follow-up `GET /api/creator/team/members` does not return the temporary password or password hash

- [ ] **Step 2: Run route tests and verify RED**

Run:

```bash
npm test -- apps/backend/src/entrypoints/tests/phone-auth-dev-server.spec.ts
```

Expected: FAIL because routes do not exist.

- [ ] **Step 3: Add application methods**

In `creator-application.service.ts`, add methods that delegate to team service with the current session token and workspace ID.

- [ ] **Step 4: Add HTTP routes**

In `phone-auth-dev-server.ts`, add JSON routes under `/api/creator/team`.

Route handlers must never log temporary passwords, include `password_hash` in responses, or return a temporary password from read endpoints. Only create/reset responses may include the one-time temporary password.

- [ ] **Step 5: Run route tests and verify GREEN**

Run:

```bash
npm test -- apps/backend/src/entrypoints/tests/phone-auth-dev-server.spec.ts
```

Expected: PASS.

## Task 7: Frontend API Client And Team State

**Files:**
- Modify: `apps/web/src/shared/creator-api.js`
- Modify: `apps/web/src/features/production-workbench/index.js`
- Modify: `apps/web/src/features/production-workbench/project-detail.js`
- Add or modify: `apps/web/tests/team-module.spec.ts`

- [ ] **Step 1: Write failing frontend tests**

Add tests that render workbench/team state and assert:

- missing entitlement shows open-plan CTA for create-member
- valid entitlement and seats opens create-member dialog
- seat full opens expansion/contact state

- [ ] **Step 2: Run frontend tests and verify RED**

Run:

```bash
npm test -- apps/web/tests/team-module.spec.ts
```

Expected: FAIL because client methods and UI state are not implemented.

- [ ] **Step 3: Add team API methods**

Add to `creator-api.js`:

- `getTeamOverview`
- `listTeamMembers`
- `createTeamMember`
- `listTeamGroups`
- `getTeamDashboard`
- `adjustTeamMemberCredits`

- [ ] **Step 4: Add workbench state and actions**

Add UI state:

- `teamOverview`
- `teamMembers`
- `teamGroups`
- `teamDashboard`
- `teamLoading`
- `teamError`
- `teamCreateMemberOpen`
- `teamCreatedCredential`
- `teamCreateMemberDraft`

Add actions:

- `open-create-member`
- `close-create-member`
- `submit-create-member`
- `reset-created-credential`
- `refresh-team`
- `set-team-dashboard-tab`

- [ ] **Step 5: Run frontend tests and verify GREEN**

Run:

```bash
npm test -- apps/web/tests/team-module.spec.ts
```

Expected: PASS.

## Task 8: Polished Team Page, Dialogs, And Dashboard

**Files:**
- Modify: `apps/web/src/features/library-team/team-page.js`
- Create: `apps/web/src/features/library-team/team-member-dialog.js`
- Create: `apps/web/src/features/library-team/team-dashboard-page.js`
- Create: `apps/web/src/features/library-team/team-formatters.js`
- Modify: `apps/web/src/features/library-team/member-rules-modal.js`
- Modify: `apps/web/src/features/library-team/library-team.css`

- [ ] **Step 1: Write failing render tests**

Cover:

- team page shows paid gate and no fake member data
- member dialog renders role, group, project, credit, and remark fields
- created credential success state shows temporary password once
- dashboard renders member/project/ranking tabs without copying ReelMate branding

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
npm test -- apps/web/tests/team-module.spec.ts
```

Expected: FAIL on new UI expectations.

- [ ] **Step 3: Implement renderers**

Build the UI with product-register rules:

- compact dark workbench layout
- stable table dimensions
- no decorative gradients or glass panels
- primary action only for valid paid/member states
- clear empty, loading, disabled, and error states
- accessible labels for every form control

- [ ] **Step 4: Update CSS**

Use existing `library-team.css` tokens where possible. Keep radii at 8px or less, use restrained accent, and ensure mobile wrapping.

- [ ] **Step 5: Run tests and verify GREEN**

Run:

```bash
npm test -- apps/web/tests/team-module.spec.ts
```

Expected: PASS.

## Task 9: Targeted Verification And Browser QA

**Files:**
- No planned production changes. Fix only defects found by verification.

- [ ] **Step 1: Run backend tests**

Run:

```bash
npm test -- apps/backend/src/modules/identity/tests/team-account-credentials.spec.ts apps/backend/src/modules/organization/tests/team-roles.spec.ts apps/backend/src/modules/organization/tests/team.service.spec.ts apps/backend/src/modules/organization/tests/actor-context.spec.ts apps/backend/src/modules/shared/db/tests/foundation-schema.spec.ts apps/backend/src/entrypoints/tests/phone-auth-dev-server.spec.ts
```

Expected: PASS.

- [ ] **Step 2: Run frontend tests**

Run:

```bash
npm test -- apps/web/tests/team-module.spec.ts
```

Expected: PASS.

- [ ] **Step 3: Note unrelated known failure**

If `apps/web/tests/assets-team-commercial-qa.spec.ts` still fails on image asset dimensions, record it as pre-existing and unrelated to the team module.

- [ ] **Step 4: Start the dev server**

Run:

```bash
npm run dev:phone-auth
```

Expected: server starts and prints the local URL.

- [ ] **Step 5: Browser QA**

Open the team page in the in-app browser and verify:

- missing membership opens pricing
- valid membership opens create-member dialog
- dialog fields fit on desktop and mobile
- dashboard tabs do not overlap
- console has no runtime errors

## Self-Review

- Spec coverage: Phase 1 covers paid entitlement, member creation, salted temporary credentials, team roles, member groups, project assignment, transactional credit adjustment, basic dashboard, password safety, and audit-oriented service behavior. Deep analytics, expiry recovery, custom roles, bulk import, and SSO remain Phase 2 or Phase 3 by design.
- Placeholder scan: no TODO/TBD steps are left; each task has concrete files, tests, commands, and expected results.
- Type consistency: role keys, capability names, service method names, route names, and frontend action names are consistent across tasks.
