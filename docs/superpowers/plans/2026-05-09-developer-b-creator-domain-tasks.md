# Developer B Task Pack: Creator Domain

> Date: 2026-05-09  
> Owner: Developer B  
> Role: Creator Domain Owner  
> Mission: 把创作主链路的业务事实做扎实：Project、Script、Asset、Shot、Calibration、Generation、Export。

## 1. Can B Start Now?

Yes, but with a strict boundary.

B can start immediately on:

- Project/Script/Asset/Shot/Export schema review.
- Command contract review and test skeletons.
- Fixtures for CreateProject and ParseScript.
- Domain state machine drafts that do not bypass A's ActorContext, Audit, Workflow/Task, or idempotency.

B must not start real Project write commands until A2/A3 exist. B must not implement Script Parse workflow until A4 exists.

## 2. Non-Negotiable Rules

- Do not bypass ActorContext, capability checks, tenant scope, or audit.
- Do not create local/fake task state. Long work must use A4 Workflow/Task.
- Do not call real providers directly. Use ModelGateway boundary.
- Do not overwrite generated assets. Always create immutable AssetVersion.
- Do not silently export incomplete work. Missing assets must be explicit.

## 3. Outputs B Owes Other Developers

| Consumer | B must provide | Blocks |
| --- | --- | --- |
| C | Project create/parse/status APIs and stable errors | C2/C3 UI |
| C | Asset review blockers and readiness flags | C4 |
| C | Shot/calibration/generation/export APIs | C5-C7 |
| A | Command integration points for idempotency and workflow | A5 hardening |
| A/C | ModelGateway mock behavior and fixture outputs | A6/C8 |

## 4. Task B0: Creator Domain Contract and Fixture Prep

| Field | Content |
| --- | --- |
| Background | B can work in parallel before A's platform foundation is complete, but only on artifacts that do not fake platform behavior. |
| Capability | Creator-domain test fixtures, command contract review, schema alignment notes, failing tests for B1/B2. |
| Prerequisites | M0.1 contracts and current task split. |
| Verification | Failing test files exist and reference TC/IDEMP IDs; no production command bypasses A2/A3/A4. |
| Failure Handling | If a missing platform dependency appears, record it as a blocker rather than implementing a shortcut. |
| Main Loop | Yes. It shortens B1/B2 once A unblocks the platform boundary. |

## 5. Task B1: Project/CreateProject and Script Storage

| Field | Content |
| --- | --- |
| Background | The creator loop starts with a real project and real script. Frontend-only temporary state would make downstream parse/generation impossible to trust. |
| Capability | Create a project in a workspace and persist script input under tenant scope. |
| Prerequisites | A2 ActorContext, A3 Audit, M0.1 idempotency helper, project/script migration. |
| Verification | `npm test -- apps/backend/src/modules/project`; create-project success, invalid input, forbidden, replay, 409 conflict. |
| Failure Handling | 403 for missing capability; validation errors return stable field errors; duplicate replay returns the same project. |
| Main Loop | Yes. It starts login -> create project -> parse script. |

Implementation notes:

- Create project and script in one transaction.
- Use `project.create` operation name.
- Write audit where required.
- Initial project phase should be `script_input`.

## 6. Task B2: Script Parse Workflow with Mock Output

| Field | Content |
| --- | --- |
| Background | This is the first long task. It must prove durable workflow/task status, not a frontend loading flag. |
| Capability | ParseScript command creates workflow/task; mock provider produces episodes, candidate assets, and draft/ready shots. |
| Prerequisites | A4 Workflow/Task, B1, M0.1 idempotency helper. Before A4, only tests/contracts/fixtures are allowed. |
| Verification | TC-P0-001, TC-P0-010, TC-P0-011, IDEMP-003. |
| Failure Handling | Parse failure leaves repairable state; duplicate parse returns existing workflow; worker failure writes no partial business facts. |
| Main Loop | Yes. It turns script input into creator workspace state. |

Implementation notes:

- Status query must read PostgreSQL/domain state.
- Mock output must be deterministic for E2E fixtures.
- Finalization writes domain facts transactionally.

## 7. Task B3: Asset and Immutable AssetVersion

| Field | Content |
| --- | --- |
| Background | Generated output must be historical and reproducible. Overwriting current assets destroys auditability and regeneration safety. |
| Capability | Asset represents business object; AssetVersion represents immutable binary/output version. |
| Prerequisites | B2 candidate assets, A-S1 storage adapter. |
| Verification | `npm test -- apps/backend/src/modules/asset`; version number monotonic, old versions retained, metadata enrichment safe. |
| Failure Handling | Version write failure rolls back finalization; missing storage metadata is retryable failure. |
| Main Loop | Yes. It makes generation/export trustworthy. |

## 8. Task B4: Shot State and Current Pointer Safety

| Field | Content |
| --- | --- |
| Background | Shot edits and generation can complete out of order. Current pointer must reflect current user intent, not whichever task finishes last. |
| Capability | Shot content/image/video state machine plus current pointer guard. |
| Prerequisites | B3, A4. |
| Verification | R-011, R-012; stale completion and out-of-order regeneration tests. |
| Failure Handling | Late success writes historical AssetVersion only; abnormal state enters repair/admin visibility. |
| Main Loop | Yes. It protects generated storyboard state. |

Implementation notes:

- Use content revision and active task ID.
- Never update current pointer from stale task completion.

## 9. Task B5: Public Asset Confirm

| Field | Content |
| --- | --- |
| Background | Asset confirmation is the business gate between script parse and reliable shot/calibration generation. |
| Capability | Confirm/edit key roles, major scenes, important props, and compute blockers/readiness flags. |
| Prerequisites | B2, B3, A2. |
| Verification | TC-P0-002; key roles/scenes block progress until confirmed; key props may warn without blocking. |
| Failure Handling | Single-card save failure does not affect other cards; unauthorized edit is 403. |
| Main Loop | Yes. It moves parsed candidates toward generation readiness. |

## 10. Task B6: Calibration Session and Gate

| Field | Content |
| --- | --- |
| Background | Calibration must be a durable business fact. A UI checkbox is not a generation gate. |
| Capability | Three-shot calibration session, pass/skip/override decision, backend gate for batch generation. |
| Prerequisites | B4, B5, A3 Audit. |
| Verification | TC-P0-003, TC-P0-009, R-016, R-024. |
| Failure Handling | Wrong shot count rejected; failed quality cannot pass; skip requires reason and audit. |
| Main Loop | Yes. It gates batch image generation. |

## 11. Task B7: GenerateShotImage with Mock ModelGateway

| Field | Content |
| --- | --- |
| Background | This is the P0-A core AI capability. It must be driven by durable tasks and produce immutable versions. |
| Capability | Single/batch shot image generation, partial success, retry, AssetVersion finalization. |
| Prerequisites | A4/A5, B3/B4/B6. |
| Verification | TC-P0-004, TC-P0-012, R-002, R-016. |
| Failure Handling | One shot failure does not block successful shots; repeated click replays existing task; retry is reachable within 3 user steps. |
| Main Loop | Yes. It creates the core generated output. |

Implementation notes:

- Use mock ModelGateway first.
- Write success to AssetVersion and guarded current pointer.
- Failed items must be visible and retryable.

## 12. Task B8: GenerateShotVideo Minimum

| Field | Content |
| --- | --- |
| Background | P0 includes single-shot image-to-video, but it should not delay the image-generation loop. |
| Capability | Start video task when current image exists; complete/fail/stale states are correct. |
| Prerequisites | B7. |
| Verification | TC-P0-006. |
| Failure Handling | Missing current image is rejected; old video not overwritten; failure can retry. |
| Main Loop | Yes. It completes P0 media capability, after image path is stable. |

## 13. Task B9: Export Manifest

| Field | Content |
| --- | --- |
| Background | Export is the endpoint of script -> assets. Missing assets must be visible, not silently ignored. |
| Capability | Create export record and manifest; identify missing assets; support incomplete export confirmation. |
| Prerequisites | B3, B7, A-S1, at least one completed image. |
| Verification | TC-P0-007, TC-P0-014, R-017. |
| Failure Handling | Missing assets block by default; export failure retryable; signed download link can refresh. |
| Main Loop | Yes. It closes the P0-A creator loop. |

## 14. First Week Plan

| Day | Focus | Expected Evidence |
| --- | --- | --- |
| Day 1 | B0 contract/schema/test review | blocker list, fixture plan, failing B1 tests drafted |
| Day 2 | B1 CreateProject test skeleton | tests reference A2/A3 dependencies rather than bypassing them |
| Day 3 | B2 ParseScript fixture/mock output draft | deterministic mock output shape documented |
| Day 4 | Asset/Shot state review | versioning and pointer safety tests drafted |
| Day 5 | Ready-for-A-unblock package | B can begin B1 implementation as soon as A2/A3 land |

## 15. Confidence Check

I am 100% confident B can start now if B treats early work as test/contract/fixture preparation and does not fake platform boundaries. B's true implementation path is deliberately gated by A2/A3/A4 because that is what protects the product long term.
