# Developer C Task Pack: Experience / QA / Ops

> Date: 2026-05-09  
> Owner: Developer C  
> Role: Experience / QA / Ops Owner  
> Mission: 让 P0 的真实用户路径可用、可验收、可诊断、可回滚、可人工介入。

## 1. Can C Start Now?

Yes, but with a strict boundary.

C can start immediately on:

- Phone-code login UI shell and E2E harness.
- API client contracts that call real endpoints once available.
- Project/create/parse E2E skeletons.
- Error-state design and fixture strategy.
- Runbook skeletons and release checklist skeletons.

C must not claim a closed loop using fake sessions, fake project state, or local-only task status.

## 2. Non-Negotiable Rules

- UI state is presentation only. Backend durable state is truth.
- Hidden buttons are not authorization. Backend 401/403 behavior must be tested.
- E2E may use deterministic fixtures, but not fake production code paths.
- Every user-visible failure should expose a stable message and traceId where appropriate.
- Flaky E2E is a blocking problem, not something to ignore.

## 3. Outputs C Owes Other Developers

| Consumer | C must provide | Blocks |
| --- | --- | --- |
| A | Auth/session UX feedback, E2E expectations, error message mapping | A1/A2 polish |
| B | UI/API contract pressure for Project, Assets, Shots, Export | B1-B9 validation |
| Team | P0-A E2E regression gate | M2 exit |
| Ops | Runbooks, release/rollback checklists, Admin/Ops Lite expectations | M4-M6 exit |

## 4. Task C0: E2E Harness and Fixture Strategy

| Field | Content |
| --- | --- |
| Background | C can parallelize immediately, but only if the harness later drives real APIs and durable state. |
| Capability | E2E folder, deterministic fixture plan, trace/log capture pattern, auth helper placeholder. |
| Prerequisites | Current repo test command and planned API contracts. |
| Verification | `npm test -- apps/web/e2e/p0` once tests exist; skeleton tests fail for missing real endpoints, not for harness wiring. |
| Failure Handling | If backend endpoint is missing, mark dependency instead of mocking success. |
| Main Loop | Yes. It becomes the weekly acceptance backbone. |

## 5. Task C1: Phone Auth Flow UI

| Field | Content |
| --- | --- |
| Background | The user path starts with phone-code login. Auth must be real enough to test permissions and session recovery. |
| Capability | China phone input, code request, code verify, session restore, unauthenticated redirect. |
| Prerequisites | A1/A2 auth/session API. UI shell can start before APIs, but success path must use real APIs before Done. |
| Verification | Auth-flow E2E: unauthenticated redirect, valid login enters project entry, invalid/expired code messages. |
| Failure Handling | Network failure retry; `invalid_phone`, `code_invalid`, `code_expired`, `phone_mismatch` map to stable user messages; no token/code leakage. |
| Main Loop | Yes. It opens login -> create project. |

Implementation notes:

- Display masked phone after challenge request.
- Do not show dev debug code in production mode.
- Session restore must call backend current-session endpoint.

## 6. Task C2: Project Create and Script Input UI

| Field | Content |
| --- | --- |
| Background | This is the first creator action. It must call CreateProject/ParseScript, not create local-only project state. |
| Capability | Project creation form, script input, parse start, queued/loading state. |
| Prerequisites | B1/B2 APIs, C1 auth. Skeleton can start earlier; Done requires real APIs. |
| Verification | TC-P0-001; fill form, submit, queued/loading within 1 second, refresh restores status. |
| Failure Handling | Field validation stays on form; duplicate replay shows same workflow; 409 gives recovery hint. |
| Main Loop | Yes. It moves login -> create project -> parse script. |

## 7. Task C3: Project Workspace Phase Navigation

| Field | Content |
| --- | --- |
| Background | Users need to know where the project is blocked. Main CTA must follow backend state and readiness flags. |
| Capability | Phase router for `script_input`, `asset_review`, `shot_generation`, `exportable`, error/recovery states. |
| Prerequisites | B2 status query and readiness fields. |
| Verification | Workspace routing E2E for major phases. |
| Failure Handling | Unknown state shows recoverable error and traceId; UI does not guess next command. |
| Main Loop | Yes. It keeps users moving through the creator loop. |

## 8. Task C4: Public Asset Review UI

| Field | Content |
| --- | --- |
| Background | Asset confirmation is the first high-volume human decision point. It must make blockers obvious. |
| Capability | Roles/scenes/props tabs, asset cards, edit/confirm, blockers display. |
| Prerequisites | B5 APIs. |
| Verification | TC-P0-002; key assets block progress until confirmed. |
| Failure Handling | Single-card save failure does not affect other cards; permission failure disables editing and shows stable message. |
| Main Loop | Yes. It moves parsed assets toward calibration/generation. |

## 9. Task C5: Shot List and Calibration UI

| Field | Content |
| --- | --- |
| Background | Calibration is a quality gate. Users must not bypass backend gate through UI affordances. |
| Capability | Shot list, three calibration slots, generate calibration, pass/skip operation, gate reason display. |
| Prerequisites | B4/B6 APIs. |
| Verification | TC-P0-003, TC-P0-009. |
| Failure Handling | Backend rejection displays gate reason; calibration failure shows failed items and retry path; skip requires confirmation/reason. |
| Main Loop | Yes. It unlocks generation only after durable calibration. |

## 10. Task C6: Generation Status and Retry UX

| Field | Content |
| --- | --- |
| Background | Long-running task experience is central to the product. Users need per-shot status and repair paths. |
| Capability | Generating/completed/failed/stale display, failed edit/retry panel, refresh recovery. |
| Prerequisites | B7/B8 APIs, A4 task status. |
| Verification | TC-P0-004, TC-P0-005, TC-P0-006, TC-P0-011, TC-P0-012. |
| Failure Handling | Single shot failure does not block other shots; stale output remains visible as history; duplicate click does not create duplicate task. |
| Main Loop | Yes. It makes generation usable and recoverable. |

## 11. Task C7: Export UI

| Field | Content |
| --- | --- |
| Background | Export is the material delivery endpoint. Missing assets must be explicit and actionable. |
| Capability | Export panel, completeness check, missing item list, incomplete confirmation, manifest/download state. |
| Prerequisites | B9 Export API, A-S1 signed URL. |
| Verification | TC-P0-007, TC-P0-014. |
| Failure Handling | Missing assets block by default; export failure shows retry and traceId; expired download link can refresh. |
| Main Loop | Yes. It closes P0-A from script to asset package. |

## 12. Task C8: P0-A E2E Regression Harness

| Field | Content |
| --- | --- |
| Background | Weekly acceptance must be automated. Manual demos are not enough to protect the loop. |
| Capability | Full creator-loop E2E from phone login to export, plus key abnormal regressions. |
| Prerequisites | C1-C7, A/B fixtures and real APIs. |
| Verification | `npm test -- apps/web/e2e/p0`; TC-P0-001 through TC-P0-014 P0-A subset. |
| Failure Handling | Flaky tests are blocking; failures must capture traceId and point to API/worker logs. |
| Main Loop | Yes. It is the M2 exit evidence. |

## 13. Task C9: Observability, Runbook, Release

| Field | Content |
| --- | --- |
| Background | A loop that runs but cannot be diagnosed or rolled back is not beta-ready. |
| Capability | Log field checklist, basic dashboard metrics, stuck-task/provider/export runbooks, staging smoke, rollback checklist. |
| Prerequisites | A/B emit trace/log/metric IDs. Skeleton can start now. |
| Verification | Ops drill: locate failure layer within 5 minutes; release and rollback checklist review. |
| Failure Handling | Each runbook includes signal, query entry, repair command/manual path, rollback condition. |
| Main Loop | No direct. It serves M6 release gate. |

## 14. Task C10: Admin/Ops Lite Manual Intervention

| Field | Content |
| --- | --- |
| Background | `manual_review` and `result_unknown` are not operationally useful unless Ops can see and act on them safely. |
| Capability | Admin/Ops Lite view for stuck tasks, `result_unknown`, paid-without-credit, payment risk; retry/settle/mark-reviewed commands. |
| Prerequisites | A3 Audit, A7 Repair, A8 Credit, A9 Payment, C9 runbooks. |
| Verification | Ordinary user 403; Ops action requires reason; operation writes audit; runbooks link to the item. |
| Failure Handling | Failed operation shows traceId; duplicate settle/retry no-op or stable conflict; high-risk payment/credit action requires confirmation. |
| Main Loop | No direct. It serves M4-M6 reliability/commercial gate. |

## 15. First Week Plan

| Day | Focus | Expected Evidence |
| --- | --- | --- |
| Day 1 | C0 E2E harness and fixture strategy | harness exists; missing backend is explicit blocker |
| Day 2 | C1 phone auth UI shell | phone form, code step, error states, no fake Done |
| Day 3 | Auth-flow E2E skeleton | test fails only on missing/real API behavior |
| Day 4 | C2/C3 project UI skeleton | CreateProject/ParseScript clients call planned API surface |
| Day 5 | Runbook/release skeleton | stuck task/export failed/provider unknown runbook shells |

## 16. Confidence Check

I am 100% confident C can start now if C treats early work as harness, shell, error mapping, and acceptance design. C must not claim the creator loop complete until it uses real backend auth, project, workflow, task, generation, and export state.
