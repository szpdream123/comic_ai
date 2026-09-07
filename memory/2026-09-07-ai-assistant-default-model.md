# AI Assistant Default Model Debug Report

- Symptom: On a fresh AI Canvas session, the assistant showed a model name but sending a message returned `未选择可用的对话文本模型`.
- Root cause: The catalog bridge populated `config.generalModels` for display but left `config.assistantModelId` empty. The chat executor resolves only the project default text model or global assistant model, so the displayed first option was not executable.
- Fix: When no assistant model is already configured, seed `assistantModelId` with the first backend text model as `general/<model-id>`. Existing user/project selections remain unchanged.
- Regression test: `apps/web/tests/new-canvas-runtime-adapter.spec.mjs` asserts the default-selection seed logic.
- Evidence: `new-canvas-host.spec.mjs` 66/66 passed; `new-canvas-agent.spec.mjs` 106/106 passed.
- Status: DONE_WITH_CONCERNS (the broader runtime-adapter file contains one pre-existing stale build-output assertion unrelated to this change).
