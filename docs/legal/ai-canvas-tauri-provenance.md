# AI Canvas upstream provenance

## Source

- Upstream: `https://github.com/Tenney95/AI-Canvas-tauri`
- Reviewed baseline: `87731295a121be601b1d4fa8616b0f2d1a38a3bb` (v0.6.7, 2026-07-26)
- Previous reviewed baselines: `0f3ca1c`, `bded37f` (v0.6.6), `d7f3a3d`
- Integration design: `docs/architecture/ai-canvas-integration-design.md`
- Authorization: the product owner reports that the upstream author approved this use. The signed or otherwise durable authorization record must remain in the company's legal archive; this file does not replace that record or add terms to it.

## Adaptation boundary

The product integrates AI Canvas as an in-page Web feature. It does not ship the upstream Tauri window lifecycle, desktop filesystem access, local process launch, shell execution, or operating-system application bridges.

The current implementation uses project-owned modules for:

- the Shadow DOM host and X6 canvas lifecycle under `apps/web/src/features/new-canvas`;
- Canvas document, revision, run, artifact, actor-scope, and storage contracts;
- the project-owned model adapters and generation workflow;
- the Canvas Agent server runtime, policy, billing, and durable worker;
- the existing project model catalog, secret store, authentication, billing, BullMQ, and object storage paths.

Generated bundles formerly stored under `apps/web/new-canvas` are not an integration source and must not be restored. Any future direct source copy from upstream must be recorded below with the upstream path, baseline commit, local destination, and material modifications.

## Direct source copies

No direct upstream source file is currently declared as copied verbatim. The implementation follows the authorized product behavior and contracts while using this repository's existing Web and backend architecture.

## Baseline delta through `87731295a121be601b1d4fa8616b0f2d1a38a3bb`

- multi-reference character mentions and the merge-all selector are adapted to stable Canvas character/reference IDs;
- character reference gallery layout improvements are adapted to the in-project character library;
- upstream mascot dragging, normalized position persistence, fur shader, drag-force response and status glow are adapted to Canvas settings revision persistence; responsive resize/orientation handling and WebGL disposal are Web-specific additions;
- animation, Director, group, Markdown, media toolbar, Agent memory/task controls, and selectable background behaviors are independently adapted to the existing Web, X6, Storage, Artifact and Canvas Agent contracts; no upstream source file or Tauri bridge is bundled;
- upstream AssetsPanel behavior is adapted as in-page asset source tabs, including independent project selection, a shared desktop 2-6 column waterfall layout, constrained global image/audio uploads, stable Canvas drag references, a primary-user global-asset soft-delete, persisted team-global asset tags with chip filtering, and explicit project-image-to-team-global copies. A local style-image upload is materialized through the existing Storage session, and an authorized project image version, including a short-drama image's existing project version, or a Storage-bound team-global image is copied into a Canvas-scoped object before it becomes a current Canvas artifact's stable asset/version pair under actor scope; a project role/scene/prop image saved to global instead materializes a new team-global Storage object and leaves the source project object unchanged. Historical URL-only team assets still require a stable server-side Storage association. Tauri filesystem, external-folder and local-process behavior is intentionally excluded;
- the in-page short-drama asset drawer now supports role/scene/prop create, image import, description edits, stable fixed-image replacement/unbinding, single deletion, and category clear through project-owned Web and server APIs; it does not use upstream filesystem paths or Tauri bridges;
- the Web global-asset source uses persisted virtual folder names for filtering and asset moves; it never records Tauri filesystem paths or scans user directories;
- no upstream Tauri build, updater, filesystem or process-launch code is included.

## Release checks

当前仓库内的 `npm run legal:check` 已通过，且 SBOM/Third-Party Notices 已生成。默认 npm 配置当前指向的镜像未实现 security advisories endpoint，依赖审计必须显式使用官方 registry；正式发布基于最终 lockfile 重新执行盘点。

- Confirm the archived authorization covers the releasing legal entity, commercial deployment, modification, distribution, duration, and attribution obligations.
- Re-run dependency license and vulnerability inventory from the committed lockfile, using `npm audit --registry=https://registry.npmjs.org --json` (or an approved equivalent with advisory provenance).
- Run `npm run legal:check` and archive `docs/legal/sbom.cdx.json` plus `docs/legal/THIRD_PARTY_NOTICES.md` with the release.
- Record any future upstream dependency or source copy in this file before release.
- Do not add Git URL dependencies or desktop-only packages without a pinned revision, integrity review, and license approval.
