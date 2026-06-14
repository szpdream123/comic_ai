# GPT Image Reference Model Config Debug Report

## Symptom

Image generation failed with `getaddrinfo ENOTFOUND relay.example.test`.

## Root Cause

The local `ai_model_configs` row for `gpt-image-2-cn` had drifted to a placeholder provider route:

- `provider_config_json.baseURL = https://relay.example.test`

This is unrelated to ordinary projects, canvas projects, or scripts. It is an AI model provider configuration issue.

## Fix

- Added migration `0027_gpt_image_reference_model_config.sql`.
- Repaired `gpt-image-2-cn` to use the TravelToken OpenAI Images-compatible gateway:
  - `baseURL = https://code.shoestravel.xin`
  - `endpoint = /v1/images/generations`
  - `editEndpoint = /v1/images/edits`
  - `apiKeyEnv = GPT_IMAGE2_API_KEY`
- Added `gpt-image-2-reference-cn` for reference image generation.
- Added a dispatch policy for `gpt-image-2-reference-cn` using `generation-submit-image`.
- Added dev DB startup repair so existing local DBs with the placeholder URL or missing reference model are corrected automatically.
- Made the canvas migration latest-document FK idempotent so replaying later migrations during DB repair does not fail on an existing constraint.

## Evidence

Ran:

```powershell
node --import tsx --test apps/backend/src/modules/shared/db/tests/ai-model-config-schema.spec.ts apps/backend/src/modules/shared/db/tests/dev-db.spec.ts
```

Result:

- 16 tests passed.
- 0 tests failed.

Local dev DB query after repair showed:

- `gpt-image-2-cn` active, base URL `https://code.shoestravel.xin`, edit endpoint `/v1/images/edits`.
- `gpt-image-2-reference-cn` active, base URL `https://code.shoestravel.xin`, edit endpoint `/v1/images/edits`.
- Both route through `generation-submit-image`.

## Regression Tests

- `apps/backend/src/modules/shared/db/tests/ai-model-config-schema.spec.ts`
  - Verifies the new reference generation model is seeded correctly.
  - Verifies the base GPT Image config includes the TravelToken base URL and edit endpoint.
- `apps/backend/src/modules/shared/db/tests/dev-db.spec.ts`
  - Simulates the `relay.example.test` drift and missing reference model, then verifies `createDevDb()` repairs both.

## Status

DONE
