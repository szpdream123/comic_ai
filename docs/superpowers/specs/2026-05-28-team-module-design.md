# Team Module Design

## Goal

Build a team collaboration module for this AI comic production workspace. The module should use ReelMate's team pages as a product reference, but it must follow this project's own account, project, asset, credit, and entitlement model.

The first implementation should make team management real and enforceable:

- Member account creation is a paid membership entitlement.
- Team roles are enforced by backend capabilities, not only by frontend visibility.
- Team assets created by subaccounts belong to the parent team organization.
- Member groups define management and reporting boundaries.
- Credits are purchased by the main account and allocated to subaccounts.
- Team dashboard data only shows metrics that can be traced to real project data.

## Product Positioning

The team module is the operations center for a production team. It is not a marketing page and should not copy ReelMate's brand, banner, pricing copy, or visual identity.

The UI should keep the current creator-workbench style:

- dark production-console surface
- compact management controls
- restrained purple accents for paid actions
- clear locked, empty, loading, and error states
- no fake analytics or decorative business metrics

## Paid Entitlements

Use separate backend entitlements even if one paid plan grants all of them.

| Entitlement | Purpose |
| --- | --- |
| `team_member_management` | Create member accounts, manage member groups, assign projects, allocate or recover member credits |
| `team_asset_library` | Use the shared team asset library |
| `team_dashboard` | View the detailed team data center |

Recommended package behavior:

- Professional plan grants `team_member_management`, `team_asset_library`, and basic `team_dashboard`.
- Professional plan includes a fixed seat limit and account concurrency limit.
- Enterprise plan increases seats, concurrency, export/reporting depth, and business support.

Create-member entry behavior:

- No paid team entitlement: show the paid-plan modal.
- Paid entitlement but no remaining seat: show seat expansion or business contact flow.
- Paid entitlement and seats available but actor lacks permission: hide or disable the action with a permission message.
- Paid entitlement, seats available, and actor has permission: open the create-member dialog.

The create-member API must repeat the same checks server-side.

## Account Model

Use a main-account plus subaccount model adapted to this project.

- The registered user remains the main account and organization owner.
- A subaccount is created by the main account or an authorized administrator.
- Subaccounts do not own independent team assets.
- Subaccounts log in with a team account ID and temporary password.
- The visible account may look like `creator001@team.local`, but it is an internal team account, not a real external email identity.

Password handling:

- The initial temporary password is shown only once after account creation.
- Existing passwords cannot be viewed or exported.
- Administrators can force-reset a subaccount password and receive a new temporary password.
- Password creation, reset, and one-time credential download actions must be audited.

Subaccounts cannot be permanently deleted. They can only be disabled.

## Team Roles

The project should support eight business roles inspired by the reference rules, but implemented as this project's own capability templates.

| Role key | Display name | Scope |
| --- | --- | --- |
| `admin` | 管理员 | Full team management and production access |
| `group_admin` | 组管理员 | Manage members, projects, assets, and credits inside the assigned member group |
| `director_plus` | 导演（可下载删除） | Full production on assigned projects, including allowed download and delete actions |
| `animator_plus` | 动画师（可下载删除） | Episode production on assigned projects, including allowed episode download and delete actions |
| `director` | 导演 | Full production on assigned projects without destructive/download privileges unless explicitly granted |
| `animator` | 动画师 | Episode production on assigned projects |
| `screenwriter` | 编剧 | Script creation and script download on assigned projects |
| `editor` | 剪辑师 | Episode download/editing handoff on assigned projects |

The existing system-level role `owner_admin` remains the organization owner role. Subaccounts should use a system membership role such as `sub_account`, with the business role stored in the team member profile.

## Capability Model

Expand the current coarse capabilities into team and production capability points. The backend should calculate access from:

1. authenticated user
2. organization/workspace membership
3. team member profile
4. business role template
5. member group boundary
6. assigned project boundary
7. paid entitlement

Representative capabilities:

- `team:member:read`
- `team:member:manage_all`
- `team:member:manage_group`
- `team:group:create`
- `team:group:update`
- `team:group:delete`
- `team:credit:allocate_all`
- `team:credit:allocate_group`
- `team:dashboard:view_all`
- `team:dashboard:view_group`
- `project:view`
- `project:edit_info`
- `project:assign_member`
- `novel:adapt_script`
- `script_asset:create`
- `script_asset:download`
- `script_asset:delete`
- `character_scene_prop:create`
- `character_scene_prop:edit`
- `character_scene_prop:download`
- `character_scene_prop:delete`
- `episode_asset:create`
- `episode_asset:edit`
- `episode_asset:download`
- `episode_asset:delete`
- `toolbox:use`
- `team_knowledge_template:create`
- `team_knowledge_template:edit`
- `team_knowledge_template:use`
- `team_knowledge_template:delete`

The current `viewer` gap should be corrected when project read permissions are expanded. Read-only project access should not imply team dashboard access.

## Member Groups

Member groups model studios, departments, or production squads.

Rules:

- One team can create at most 20 member groups in the first version.
- A member can belong to one member group or be team-direct.
- A project can belong to one member group or be team-direct.
- An admin can manage all groups and team-direct resources.
- A group admin can manage only their own group members and group projects.
- A group admin's newly created projects default to their member group.
- An admin's newly created projects default to team-direct unless a group is selected.

Changing a member's group:

- Preserve role and credit balance.
- Clear assigned projects.
- Require project reassignment before project-scoped production work continues.
- Write an audit event.

Deleting a group:

- Do not delete members, projects, or assets.
- Move affected members and projects to team-direct.
- Preserve member roles and credit balances.
- Clear assigned projects for affected members.
- Write an audit event.

## Credits

Credits remain organization-owned and should integrate with the existing credit ledger instead of creating a separate financial truth.

Behavior:

- The main account purchases credits into the organization balance.
- Admins can allocate credits to any active subaccount.
- Group admins can allocate credits only to active members in their group.
- Allocated credits become the subaccount's available working budget.
- Subaccount generation consumes from its allocated credits.
- Unused allocated credits can be recovered to the team pool.
- Disabled accounts cannot consume credits and cannot receive new allocations.

Record credit allocation and recovery in a team credit adjustment table and connect consumption to `credit_ledger_entries` whenever possible.

Expiry behavior:

- Keep schema support for credit expiry and member activity ordering.
- Full automatic expiry recovery by half-year activity is second phase work.
- First phase must not invent expiry recovery data.

## Team Dashboard

The dashboard should reference ReelMate's three-view structure but use this project's real data.

Use three tabs:

1. 成员产能与积分
2. 项目成本与资产
3. 成本排行

### Members And Credits

Purpose: show who is active, who produced output, and who consumed credits.

First-phase summary metrics:

- member count
- active member count
- total member credit consumption
- average member credit consumption
- generation task count
- successful output count
- recently active member count

Table columns:

- team account
- member name
- business role
- member group
- assigned project count
- generation task count
- successful output count
- consumed credits
- last active time
- status

### Project Cost And Assets

Purpose: show which projects consume credits and which assets were produced.

First-phase summary metrics:

- project count
- active project count
- total project credit consumption
- average project credit consumption
- team asset count
- generation task count

Table columns:

- project name
- ownership scope: team-direct or member group
- owner or creator
- participating member count
- generation task count
- successful output count
- team asset count
- consumed credits
- last updated time

Asset categories should follow this project first: character, scene, prop, image, and video. Episode-level averages can be added after the project has stable episode and storyboard attribution.

### Rankings

Purpose: expose cost outliers without pretending to have unavailable attribution.

First-phase ranking cards:

- member group credit consumption ranking
- member credit consumption ranking
- project credit consumption ranking

Each ranking supports:

- today
- yesterday
- this week
- this month
- last month
- this year
- custom date range

Consumption that cannot be attributed to a member or project must be shown as unattributed consumption, not silently assigned.

## Create Member Flow

The create-member flow is central to the module.

Fields:

- team account ID, generated by default and editable if unique
- member name
- business role
- member group, optional
- assigned projects
- initial credit allocation, optional and can be zero
- remark

Submit behavior:

1. Validate paid entitlement.
2. Validate seat availability.
3. Validate actor team capability.
4. Validate member group boundary.
5. Validate assigned project boundary.
6. Create or link the internal user record.
7. Create membership and team member profile.
8. Create project assignments.
9. Create initial credit adjustment if requested.
10. Generate a temporary password.
11. Write audit events.
12. Return the account ID and temporary password once.

Error states:

- membership not opened
- seat limit reached
- duplicate team account
- invalid role
- actor cannot grant this role
- actor cannot manage the selected group
- actor cannot assign one or more projects
- insufficient allocatable credits

## Backend Architecture

Add a team service under the organization boundary because team membership and group management belong to organization/workspace ownership.

Suggested service:

- `apps/backend/src/modules/organization/team.service.ts`

Primary methods:

- `getTeamOverview`
- `listTeamMembers`
- `createTeamMember`
- `updateTeamMember`
- `disableTeamMember`
- `resetTeamMemberPassword`
- `listMemberGroups`
- `createMemberGroup`
- `updateMemberGroup`
- `deleteMemberGroup`
- `assignMemberProjects`
- `adjustMemberCredits`
- `listCreditAdjustments`
- `getTeamDashboard`

Suggested API routes:

- `GET /api/creator/team/overview`
- `GET /api/creator/team/members`
- `POST /api/creator/team/members`
- `PATCH /api/creator/team/members/:membershipId`
- `POST /api/creator/team/members/:membershipId/disable`
- `POST /api/creator/team/members/:membershipId/reset-password`
- `GET /api/creator/team/groups`
- `POST /api/creator/team/groups`
- `PATCH /api/creator/team/groups/:groupId`
- `DELETE /api/creator/team/groups/:groupId`
- `POST /api/creator/team/members/:membershipId/projects`
- `POST /api/creator/team/members/:membershipId/credits/adjust`
- `GET /api/creator/team/credit-adjustments`
- `GET /api/creator/team/dashboard`

Write routes should use idempotency where duplicate submission would create records or move credits.

## Database Shape

Recommended additions:

- `team_member_profiles`
- `team_member_groups`
- `team_project_assignments`
- `team_credit_adjustments`
- `team_plan_limits`

Recommended project extension:

- project group ownership, either as `projects.member_group_id` or a separate project ownership table

Recommended membership change:

- add a system membership role for subaccounts, or keep existing roles and store business role only in `team_member_profiles`

The migration should avoid breaking existing owner/admin sessions and should include constraints for tenant boundaries, unique team account IDs, active seat counting, and group limits.

## Frontend Architecture

Keep the existing `library-team` module but split the large team page into focused renderers.

Suggested files:

- `team-page.js`
- `team-dashboard-page.js`
- `team-member-dialog.js`
- `team-group-dialog.js`
- `team-credit-dialog.js`
- `team-permission-rules.js`
- `team-formatters.js`

Extend the creator API client with team calls, following the existing `getLibraryAssets` style.

The existing pricing modal can remain the paid-plan entry, but the create-member button should no longer always open pricing. It must branch by entitlement, seat, and actor permission.

The current permission rules fixture should be replaced with UTF-8-safe role metadata derived from the new capability templates.

## Security And Audit

The backend is the source of truth for all access decisions.

Required audit events:

- team member created
- team member disabled
- team member password reset
- team member role changed
- member group changed
- member group created
- member group deleted
- project assignments changed
- credits allocated
- credits recovered
- entitlement or seat failure that reaches a write API

Sensitive data:

- never store plaintext passwords
- never return an existing password
- temporary password appears only in the create/reset response
- avoid logging temporary passwords

## Testing

Backend tests:

- create member succeeds for an entitled admin with available seats
- create member fails without `team_member_management`
- create member fails when seat limit is reached
- group admin cannot create or modify members outside their group
- actor cannot grant a role beyond their authority
- member group change clears project assignments and preserves credits
- member group deletion moves resources to team-direct and clears assignments
- disabled member cannot log in or consume credits
- credit allocation and recovery write adjustment records
- dashboard hides or filters data outside the actor boundary

Frontend tests:

- create-member button opens pricing when the entitlement is missing
- create-member button opens expansion/contact flow when seats are full
- create-member button opens the dialog when entitlement, seats, and permission are valid
- create-member dialog validates role, group, project, and credit fields
- success state shows the temporary password once
- dashboard tabs render member, project, and ranking views
- group admin dashboard only shows group-scoped data
- locked dashboard shows a paid-plan message, not empty fake data

## Phasing

Phase 1A: member-management vertical slice

- paid entitlement and seat gates for member creation
- team role capability templates
- backend-enforced create-member permission checks
- salted temporary-password creation with one-time response display
- subaccount list and overview metrics
- member group and project scope validation for creation
- initial credit allocation with organization balance protection
- creator workbench team page, paid gate, seat-full gate, permission gate, and basic dashboard shell

Phase 1B: complete management and credit loop

- update, disable, and reset password
- member groups
- project assignment
- credit allocation and recovery
- basic dashboard metrics
- audit-event coverage for every management mutation

Phase 2: analytics depth

- project asset cost detail
- richer role/scene/prop/video attribution
- ranking drilldowns
- report export
- expiry recovery automation

Phase 3: enterprise controls

- advanced seat packages
- custom role templates
- bulk member import
- SSO or external identity integration
- richer audit export

## Open Decisions

The following decisions are resolved for this design:

- use the safer temporary-password model instead of viewing existing passwords
- use internal team account IDs instead of real virtual email login
- professional plan includes team member management, team asset library, and basic dashboard
- enterprise plan expands seats, concurrency, reporting, and support
- first phase prioritizes management, permissions, seats, and credit correctness over deep analytics
