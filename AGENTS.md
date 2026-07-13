# Project Agent Notes

## Runtime Connections

- Always read connection settings from the project's `.env` before connecting to runtime services such as PostgreSQL, Redis, object storage, SMS, model providers, or local dev servers.
- Treat `.env` as the source of truth for host, port, database name, credentials, and feature flags. Do not substitute guessed defaults when a configured value is present.
- PostgreSQL connections must use the formal `.env` `DATABASE_URL` directly. Do not prefer or substitute `TEST_DATABASE_URL` for local startup, debugging, QA, or verification runs.
- When starting the project, do not run separate preflight checks for `.env` connection values. Start directly with the configured `.env` values to keep startup fast.
- If the runtime connection fails during startup or use, stop and report the exact service and `.env` key involved instead of silently falling back to another endpoint.
- Do not print secrets from `.env`; redact credentials and tokens in logs or user-facing output.

## Global Code Modification Constraints

- 最小改动原则：仅修复当前问题，无关代码零改动。
- 存量逻辑禁止脑补：不猜测业务，不自行删减历史兼容边界代码。
- 不重写完整函数/文件，仅输出变更 diff。
- 方法签名、对外接口、数据结构、全局配置一律保持原样。
- 原有参数校验、异常捕获、边界兜底代码只增不减，绝不删除。
- 禁止顺手优化、重构、简化代码，只解决指定 Bug。

## Product Ownership Rule

- 项目、团队、子账户的业务归属一律以当前主用户与其子用户为准。历史迁移中的旧归属字段只作为升级审计记录，不得存在于当前表结构、运行时代码、接口契约或产品概念中。

## Test Auth Rule

- 严重警告：测试代码禁止使用短信验证码登录链路做登录态准备。
- 测试中如需登录，统一只允许走密码登录接口 `/api/auth/password/login`。
- 测试账号密码固定为“手机号后六位”。
- 只有在“专门验证短信验证码能力本身”的测试里，才允许直接调用 `/api/auth/code/request`、`/api/auth/dev/challenges/*`、`/api/auth/code/verify`。
