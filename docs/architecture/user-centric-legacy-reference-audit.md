# 用户中心化历史引用审计

**状态：** Clean baseline 切换后审计
**现行规范：** [`../superpowers/specs/2026-07-12-user-centric-scope-removal-design.md`](../superpowers/specs/2026-07-12-user-centric-scope-removal-design.md)

项目当前业务模型只以用户、项目和团队成员分配关系表达归属。旧增量迁移链与旧库升级测试已经 EOL 并从主仓库删除，当前有效证据为：

- `packages/db/baseline/user-centric-schema.sql`：用户中心化完整 schema，不包含业务数据。
- `packages/db/baseline/model-reference-seed.sql`：模型目录 reference seed，不包含秘密或用户数据。
- `scripts/check-user-scope-zero-refs.mjs`：扫描源码、测试、脚本、文档与生成物的全仓零引用门禁。
- `scripts/verify-user-centric-baseline.mjs`：在隔离 schema 回放 baseline，并与正式数据库 catalog 逐项比较。
- `scripts/verify-user-centric-data.mjs`：只读核验旧表、用户/项目/团队成员归属、actor 约束、未验证约束和数据库 JSON/text 旧键。
- `scripts/cleanup-user-scope-data.mjs`：在事务和主键 CAS 保护下清理已退役旧键；`--dry-run` 与 `--apply` 必须先后通过。
- 2026-07-12 之前的设计稿、实施计划和故障复盘只保留历史背景；其中的字段与示例已经改为用户/项目语义，不能作为新实现入口。

本次作用域验收只对用户/项目归属和已退役字段负责。正式库仍有一份独立的历史财务对账清单：313 个用户缓存与账本不一致、16 个子账户没有可重建账本、2 个 paid 订单没有可验证支付事实。由于不能猜测支付渠道或补造开账流水，这些 warning 不得通过修改归属字段掩盖，也不构成旧组织/工作空间概念的运行时依赖。

任何新增实现都必须遵循现行用户中心化设计，并同时通过全仓零引用门禁、数据库系统目录验收和 baseline fingerprint 校验。
